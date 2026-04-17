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

// Fix: pass password explicitly so ioredis doesn't misparse URL-encoded '@' in password
const redisConfig = (() => {
  const url = process.env.REDIS_URL;
  if (url) {
    try {
      const parsed = new URL(url);
      return {
        host: parsed.hostname || 'localhost',
        port: parseInt(parsed.port) || 6379,
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        db: parseInt(parsed.pathname?.replace('/', '') || '0') || 0,
        maxRetriesPerRequest: null,
      };
    } catch (e) {
      // fallback if URL parse fails
    }
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
})();

const connection = new Redis(redisConfig);

async function runMonitoringJob(jobId) {
  const job = await monitoringModel.getMonitoringJobById(jobId);
  if (!job || !job.is_active) return;

  // Fix: test_case_definitions may come back as a string if double-serialized
  let testCases = job.test_case_definitions;
  if (typeof testCases === 'string') {
    try { testCases = JSON.parse(testCases); } catch (e) {
      console.error(`[monitoring-worker] Failed to parse test_case_definitions for job ${jobId}`);
      return;
    }
  }
  if (!Array.isArray(testCases) || testCases.length === 0) {
    console.warn(`[monitoring-worker] No test cases for job ${jobId}`);
    return;
  }

  const results = [];
  // Fix: 'error' is more severe than 'fail' — track separately
  let hasError = false;
  let hasFail = false;
  let jobTotalLatency = 0;
  let stepCount = 0;

  let executionContext = {}; // State propagation between steps

  for (const step of testCases) {
    const start = Date.now();
    let stepResult = { status: 'pass', latency: 0, assertions: [], response_details: null, error: null };

    try {
      // Resolve {{placeholders}} in url, headers, body using environment variables + executionContext
      const resolvedStep = await dataProviderService.resolveExecutionStep(
        step,
        job.target_environment_id,
        executionContext
      );

      let resolvedUrl = resolvedStep.url;

      // Handle relative URLs — resolve using target env or suite base_url
      if (resolvedUrl && !resolvedUrl.startsWith('http')) {
        let baseUrl = null;

        if (job.target_environment_id) {
          const env = await dataProviderService.getEnvironment(job.target_environment_id);
          if (env && env.base_url) baseUrl = env.base_url;
        }

        if (!baseUrl && job.user_id && job.suite_id) {
          const envs = await environmentModel.listEnvironmentsByUser(job.user_id, job.suite_id);
          const defaultEnv = envs.find(e => e.is_default) || envs[0];
          if (defaultEnv && defaultEnv.base_url) baseUrl = defaultEnv.base_url;
        }

        if (!baseUrl && job.suite_id && job.user_id) {
          try {
            const suite = await suitesService.getTestSuiteById(job.user_id, job.suite_id);
            if (suite && suite.base_url) baseUrl = suite.base_url;
          } catch (e) {
            console.warn(`[monitoring-worker] Could not fetch suite base_url:`, e.message);
          }
        }

        if (baseUrl) {
          const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
          const path = resolvedUrl.startsWith('/') ? resolvedUrl : `/${resolvedUrl}`;
          resolvedUrl = base + path;
        } else {
          console.warn(`[monitoring-worker] No base_url found for job ${jobId}, URL: ${resolvedUrl}`);
        }
      }

      const response = await axios({
        method: resolvedStep.method || 'GET',
        url: resolvedUrl,
        headers: resolvedStep.headers || {},
        data: ['POST', 'PUT', 'PATCH'].includes((resolvedStep.method || '').toUpperCase())
          ? (resolvedStep.body || {})
          : undefined,
        timeout: 10000,
        validateStatus: null,
      });

      const latency = Date.now() - start;
      stepResult.latency = latency;
      jobTotalLatency += latency;
      stepCount++;

      stepResult.response_details = {
        status: response.status,
        headers: response.headers,
        body: JSON.stringify(response.data).substring(0, 1000),
      };

      // Evaluate assertions
      if (step.assertions && step.assertions.length > 0) {
        for (const assertion of step.assertions) {
          let passed = false;
          if (assertion.type === 'status') {
            passed = response.status === parseInt(assertion.expected);
          } else if (assertion.type === 'body_contains') {
            passed = JSON.stringify(response.data).includes(assertion.expected);
          } else if (assertion.type === 'json_path') {
            try {
              const paths = assertion.query.split('.');
              let val = response.data;
              for (const p of paths) { if (val != null) val = val[p]; else break; }
              passed = val !== undefined && val !== null;
            } catch (e) { passed = false; }
          }

          stepResult.assertions.push({
            type: assertion.type,
            expected: assertion.expected,
            actual: assertion.type === 'status' ? response.status : 'checked',
            passed,
          });

          if (!passed) stepResult.status = 'fail';
        }
      } else {
        // No assertions — pass if 2xx
        if (response.status >= 300) stepResult.status = 'fail';
      }

      // State propagation: extract values from response for subsequent steps
      if (step.extracts && Array.isArray(step.extracts)) {
        for (const extract of step.extracts) {
          if (extract.type === 'json' && response.data) {
            try {
              const paths = extract.query.split('.');
              let val = response.data;
              for (const p of paths) { if (val != null) val = val[p]; else break; }
              if (val !== undefined && val !== null) {
                executionContext[extract.varName] = val;
              }
            } catch (e) { /* ignore extraction errors */ }
          }
        }
      }

      // Auto-extract common auth tokens for chaining
      if (response.data && typeof response.data === 'object') {
        const autoKeys = ['token', 'access_token', 'accessToken', 'jwt', 'auth_token'];
        for (const key of autoKeys) {
          if (response.data[key]) {
            executionContext[key] = response.data[key];
          }
        }
      }

    } catch (error) {
      stepResult.status = 'error';
      stepResult.error = error.message;
      stepResult.latency = Date.now() - start;
      hasError = true;
    }

    results.push(stepResult);

    // Fix: track fail/error separately so 'error' takes priority over 'fail'
    if (stepResult.status === 'error') hasError = true;
    if (stepResult.status === 'fail') hasFail = true;
  }

  // Fix: 'error' > 'fail' > 'pass'
  const jobOverallStatus = hasError ? 'error' : hasFail ? 'fail' : 'pass';

  // Fix: store average latency per step, not total sum
  const avgLatency = stepCount > 0 ? Math.round(jobTotalLatency / stepCount) : 0;

  // Write result to monitoring_results
  const result_record = await monitoringModel.createMonitoringResult({
    job_id: job.id,
    status: jobOverallStatus,
    latency_ms: avgLatency,
    response_details: results.map(r => r.response_details),
    assertion_results: results.map(r => r.assertions),
    error_message: (hasError || hasFail)
      ? results.find(r => r.error || r.status !== 'pass')?.error || null
      : null,
  });

  // Update consecutive failure counter
  if (jobOverallStatus !== 'pass') {
    const newCounter = (job.consecutive_failures || 0) + 1;
    await monitoringModel.updateMonitoringJob(job.id, {
      consecutive_failures: newCounter,
      last_run_at: new Date(),
    });

    // Fix: only alert when threshold is FIRST crossed, not on every subsequent failure
    if (newCounter === job.failure_threshold) {
      const alertRecord = await monitoringModel.createMonitoringAlert({
        job_id: job.id,
        result_id: result_record.id,
        severity: 'critical',
        message: `${job.name} failed ${newCounter} consecutive times. Status: ${jobOverallStatus}.`,
        dispatched_channels: ['email', 'slack'],
      });
      await dispatchAlert(alertRecord);
    }
  } else {
    // Reset counter on recovery
    await monitoringModel.updateMonitoringJob(job.id, {
      consecutive_failures: 0,
      last_run_at: new Date(),
    });
  }

  // Broadcast real-time result via Redis
  try {
    await publishA2AMessage('monitoring_updates', {
      event: 'JOB_COMPLETED',
      suite_id: job.suite_id,
      job_id: job.id,
      status: jobOverallStatus,
      latency: avgLatency,
      timestamp: new Date(),
      result_id: result_record.id,
    });
  } catch (e) {
    console.warn('[monitoring-worker] Failed to broadcast monitoring_updates:', e.message);
  }
}

const monitoringWorker = new Worker('monitoring_jobs', async job => {
  console.log(`Processing monitoring job: ${job.data.jobId}`);
  try {
    await runMonitoringJob(job.data.jobId);
  } catch (error) {
    console.error('[monitoring-worker] Error:', error);
  }
}, { connection });

monitoringWorker.on('completed', job => {
  console.log(`Job ${job.id} completed!`);
});

monitoringWorker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed: ${err.message}`);
});

module.exports = monitoringWorker;
