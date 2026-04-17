const { Worker } = require('bullmq');
const Redis = require('ioredis');
const axios = require('axios');
const monitoringModel = require('../models/monitoring.model');
const environmentModel = require('../models/environment.model');
const dataProviderService = require('../services/dataProvider.service');
const suitesService = require('../services/suitesService');
const { dispatchAlert } = require('../services/alertDispatcher.service');
const { publishA2AMessage } = require('../utils/redisPublisher');
require('dotenv').config();

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

async function runMonitoringJob(jobId) {
    const job = await monitoringModel.getMonitoringJobById(jobId);
    if (!job || !job.is_active) return;
    
    // Resolve placeholders (data provider layer placeholder)
    // For now, simple implementation
    const testCases = job.test_case_definitions;
    const results = [];
    let jobOverallStatus = 'pass';
    let jobTotalLatency = 0;
    
    let executionContext = {}; // Context propagation
    
    for (const step of testCases) {
        const start = Date.now();
        let stepResult = { status: 'pass', latency: 0, assertions: [] };
        
        try {
            // resolve dynamic place holders with placeholder resolver
            const resolvedStep = await dataProviderService.resolveExecutionStep(step, job.target_environment_id, executionContext);
            let resolvedUrl = resolvedStep.url;
            
            // Handle relative URLs — resolve using target env or fallback to suite's default env, then suite base_url
            if (resolvedUrl && !resolvedUrl.startsWith('http')) {
                let env = null;
                if (job.target_environment_id) {
                    env = await dataProviderService.getEnvironment(job.target_environment_id);
                } else if (job.user_id && job.suite_id) {
                    // Fallback: look up suite's default environment
                    const envs = await environmentModel.listEnvironmentsByUser(job.user_id, job.suite_id);
                    env = envs.find(e => e.is_default) || envs[0] || null;
                }
                if (env && env.base_url) {
                    const base = env.base_url.endsWith('/') ? env.base_url.slice(0, -1) : env.base_url;
                    const path = resolvedUrl.startsWith('/') ? resolvedUrl : `/${resolvedUrl}`;
                    resolvedUrl = base + path;
                } else {
                    // Ultimate fallback: suite's own base_url
                    try {
                        if (job.suite_id && job.user_id) {
                            const suite = await suitesService.getTestSuiteById(job.user_id, job.suite_id);
                            if (suite && suite.base_url) {
                                const base = suite.base_url.endsWith('/') ? suite.base_url.slice(0, -1) : suite.base_url;
                                const path = resolvedUrl.startsWith('/') ? resolvedUrl : `/${resolvedUrl}`;
                                resolvedUrl = base + path;
                            } else {
                                console.warn(`[monitoring-worker] No base_url found for job ${jobId}. URL remains: ${resolvedUrl}`);
                            }
                        }
                    } catch (suiteErr) {
                        console.warn(`[monitoring-worker] Failed to fetch suite base_url for job ${jobId}:`, suiteErr.message);
                    }
                }
            }
            
            const response = await axios({
                method: resolvedStep.method,
                url: resolvedUrl,
                headers: resolvedStep.headers || {},
                data: resolvedStep.body || {},
                timeout: 10000,
                validateStatus: null // Handle status codes manually
            });
            
            const latency = Date.now() - start;
            stepResult.latency = latency;
            jobTotalLatency += latency;
            
            // Check assertions
            if (step.assertions) {
                for (const assertion of step.assertions) {
                    let passed = false;
                    if (assertion.type === 'status') {
                        passed = response.status === parseInt(assertion.expected);
                    } else if (assertion.type === 'body_contains') {
                        const bodyStr = JSON.stringify(response.data);
                        passed = bodyStr.includes(assertion.expected);
                    }
                    // add more assertion types as needed
                    
                    stepResult.assertions.push({
                        type: assertion.type,
                        expected: assertion.expected,
                        actual: assertion.type === 'status' ? response.status : 'checked body',
                        passed
                    });
                    
                    if (!passed) stepResult.status = 'fail';
                }
            } else {
                // If no assertions, check if status is 2xx
                if (response.status >= 300) stepResult.status = 'fail';
            }
            
            stepResult.response_details = {
                status: response.status,
                headers: response.headers,
                body: JSON.stringify(response.data).substring(0, 1000)
            };
            
            // Extract values for State Propagation
            if (step.extracts && Array.isArray(step.extracts)) {
                for (const extract of step.extracts) {
                    if (extract.type === 'json' && response.data) {
                        try {
                            const paths = extract.query.split('.');
                            let val = response.data;
                            for (const p of paths) { 
                                if (val) val = val[p]; else break; 
                            }
                            if (val !== undefined && val !== null) {
                                executionContext[extract.varName] = val;
                            }
                        } catch(e) {}
                    }
                }
            }
            
        } catch (error) {
            stepResult.status = 'error';
            stepResult.error = error.message;
            jobOverallStatus = 'error';
        }
        
        results.push(stepResult);
        if (stepResult.status === 'fail' || stepResult.status === 'error') jobOverallStatus = stepResult.status;
    }
    
    // Write result to monitoring_results
    const result_record = await monitoringModel.createMonitoringResult({
        job_id: job.id,
        status: jobOverallStatus,
        latency_ms: jobTotalLatency,
        response_details: results.map(r => r.response_details),
        assertion_results: results.map(r => r.assertions),
        error_message: jobOverallStatus === 'error' ? results.find(r => r.error)?.error : null
    });
    
    // Update job consecutive fail counter
    if (jobOverallStatus !== 'pass') {
        const newCounter = (job.consecutive_failures || 0) + 1;
        await monitoringModel.updateMonitoringJob(job.id, { 
            consecutive_failures: newCounter,
            last_run_at: new Date()
        });
        
        // Alert Dispatcher Logic
        if (newCounter >= job.failure_threshold) {
             // Create alert
             const alertRecord = await monitoringModel.createMonitoringAlert({
                job_id: job.id,
                result_id: result_record.id,
                severity: 'critical',
                message: `${job.name} failed ${newCounter} consecutive times. Status: ${jobOverallStatus}.`,
                dispatched_channels: ['email', 'slack'] // Default
             });
             // Trigger dispatcher to send notifications (Slack, Email)
             await dispatchAlert(alertRecord);
        }
    } else {
        // Reset counter if it was failing
        if (job.consecutive_failures > 0) {
            await monitoringModel.updateMonitoringJob(job.id, { 
                consecutive_failures: 0,
                last_run_at: new Date()
            });
            // TODO: Resolution alert?
        } else {
            await monitoringModel.updateMonitoringJob(job.id, { 
                last_run_at: new Date()
            });
        }
    }
    
    // Broadcast real-time execution result via Redis publisher
    try {
        await publishA2AMessage('monitoring_updates', {
            event: 'JOB_COMPLETED',
            suite_id: job.suite_id,
            job_id: job.id,
            status: jobOverallStatus,
            latency: jobTotalLatency,
            timestamp: new Date(),
            result_id: result_record.id
        });
    } catch (e) {
        console.warn('Failed broadcasting monitoring_updates event', e);
    }
}

const monitoringWorker = new Worker('monitoring_jobs', async job => {
    console.log(`Processing monitoring job: ${job.data.jobId}`);
    try {
        await runMonitoringJob(job.data.jobId);
    } catch (error) {
        console.error('Error in monitoring worker:', error);
    }
}, { connection });

monitoringWorker.on('completed', job => {
  console.log(`Job ${job.id} completed!`);
});

monitoringWorker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed with error ${err.message}`);
});

module.exports = monitoringWorker;
