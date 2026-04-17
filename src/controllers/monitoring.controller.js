const monitoringModel = require('../models/monitoring.model');
const environmentModel = require('../models/environment.model');
const GeneratedTest = require('../models/generated_test.model');
const { monitoringQueue } = require('../config/bullmq');
const suitesService = require('../services/suitesService');

// ── Helper: parse interval string to BullMQ repeat options ──
function parseIntervalToRepeat(interval) {
  if (interval.endsWith('m')) {
    return { every: parseInt(interval) * 60 * 1000 };
  } else if (interval.endsWith('h')) {
    return { every: parseInt(interval) * 60 * 60 * 1000 };
  }
  // Assume cron expression
  return { pattern: interval };
}

const createJob = async (req, res) => {
  try {
    const { suite_id } = req.params;
    const user_id = req.user.id;
    const jobData = { ...req.body, user_id, suite_id };

    const job = await monitoringModel.createMonitoringJob(jobData);

    // Schedule in BullMQ
    const repeatOptions = parseIntervalToRepeat(job.schedule_interval);
    await monitoringQueue.add(
      `monitoring_job_${job.id}`,
      { jobId: job.id },
      { repeat: repeatOptions }
    );

    // Add an immediate run so the user doesn't have to wait for the first interval
    await monitoringQueue.add(
      `monitoring_job_manual_${job.id}`,
      { jobId: job.id },
      { jobId: `manual_${job.id}_${Date.now()}` }
    );

    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating monitoring job:', error);
    res.status(500).json({ error: 'Failed to create monitoring job' });
  }
};

const getJobs = async (req, res) => {
  try {
    const { suite_id } = req.params;
    const user_id = req.user.id;
    const jobs = await monitoringModel.getMonitoringJobs(user_id, suite_id);

    // Attach stats for each job
    const enrichedJobs = await Promise.all(jobs.map(async (job) => {
      const stats = await monitoringModel.getJobStats(job.id);
      return {
        ...job,
        total_runs: parseInt(stats?.total_runs || 0),
        pass_count: parseInt(stats?.pass_count || 0),
        fail_count: parseInt(stats?.fail_count || 0),
        avg_latency: parseInt(stats?.avg_latency || 0),
        p50_latency: parseInt(stats?.p50_latency || 0),
        p95_latency: parseInt(stats?.p95_latency || 0),
        p99_latency: parseInt(stats?.p99_latency || 0),
        pass_rate: stats?.total_runs > 0 ? ((stats.pass_count / stats.total_runs) * 100).toFixed(1) : '0',
        uptime: stats?.total_runs > 0 ? ((stats.pass_count / stats.total_runs) * 100).toFixed(2) : '0',
      };
    }));

    res.json(enrichedJobs);
  } catch (error) {
    console.error('Error fetching monitoring jobs:', error);
    res.status(500).json({ error: 'Failed to fetch monitoring jobs' });
  }
};

const getJobResults = async (req, res) => {
  try {
    const { job_id } = req.params;
    const results = await monitoringModel.getMonitoringResultsByJob(job_id);
    res.json(results);
  } catch (error) {
    console.error('Error fetching job results:', error);
    res.status(500).json({ error: 'Failed to fetch job results' });
  }
};

const getJobAlerts = async (req, res) => {
  try {
    const { job_id } = req.params;
    const alerts = await monitoringModel.getMonitoringAlertsByJob(job_id);
    res.json(alerts);
  } catch (error) {
    console.error('Error fetching job alerts:', error);
    res.status(500).json({ error: 'Failed to fetch job alerts' });
  }
};

// ── Suite-level aggregates (all jobs) ─────────────────────
const getSuiteResults = async (req, res) => {
  try {
    const { suite_id } = req.params;
    const results = await monitoringModel.getMonitoringResultsBySuite(suite_id);
    res.json(results);
  } catch (error) {
    console.error('Error fetching suite results:', error);
    res.status(500).json({ error: 'Failed to fetch suite results' });
  }
};

const getSuiteAlerts = async (req, res) => {
  try {
    const { suite_id } = req.params;
    const alerts = await monitoringModel.getMonitoringAlertsBySuite(suite_id);
    res.json(alerts);
  } catch (error) {
    console.error('Error fetching suite alerts:', error);
    res.status(500).json({ error: 'Failed to fetch suite alerts' });
  }
};

const acknowledgeAlert = async (req, res) => {
  try {
    const { alert_id } = req.params;
    const alert = await monitoringModel.resolveMonitoringAlert(alert_id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    res.json(alert);
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
};

const toggleJob = async (req, res) => {
  try {
    const { job_id } = req.params;
    const { is_active } = req.body;

    const job = await monitoringModel.updateMonitoringJob(job_id, { is_active });

    if (!is_active) {
      const repeatableJobs = await monitoringQueue.getRepeatableJobs();
      const bullJob = repeatableJobs.find(rj => rj.name === `monitoring_job_${job_id}`);
      if (bullJob) {
        await monitoringQueue.removeRepeatableByKey(bullJob.key);
      }
    } else {
      const repeatOptions = parseIntervalToRepeat(job.schedule_interval);
      await monitoringQueue.add(
        `monitoring_job_${job.id}`,
        { jobId: job.id },
        { repeat: repeatOptions }
      );
    }

    res.json(job);
  } catch (error) {
    console.error('Error toggling monitoring job:', error);
    res.status(500).json({ error: 'Failed to toggle monitoring job' });
  }
};

const deleteJob = async (req, res) => {
  try {
    const { job_id } = req.params;

    const repeatableJobs = await monitoringQueue.getRepeatableJobs();
    const bullJob = repeatableJobs.find(rj => rj.name === `monitoring_job_${job_id}`);
    if (bullJob) {
      await monitoringQueue.removeRepeatableByKey(bullJob.key);
    }

    await monitoringModel.deleteMonitoringJob(job_id);
    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting monitoring job:', error);
    res.status(500).json({ error: 'Failed to delete monitoring job' });
  }
};

const runJobNow = async (req, res) => {
  try {
    const { job_id } = req.params;
    await monitoringQueue.add(
      `monitoring_job_manual_${job_id}`,
      { jobId: job_id },
      { jobId: `manual_${job_id}_${Date.now()}` }
    );
    res.json({ message: 'Job queued for immediate execution' });
  } catch (error) {
    console.error('Error triggering manual run:', error);
    res.status(500).json({ error: 'Failed to trigger job' });
  }
};

// ── Auto-Sync from Generated Tests ─────────────────────────
const syncSuiteJobs = async (req, res) => {
  try {
    const { suite_id } = req.params;
    const user_id = req.user.id;
    const { status, target_environment_id } = req.body; // 'active' or 'paused', optional environment
    
    const existingJobs = await monitoringModel.getMonitoringJobs(user_id, suite_id);
    const repeatableJobs = await monitoringQueue.getRepeatableJobs();
    
    if (status === 'paused') {
       for (const job of existingJobs) {
          if (job.is_active) {
            await monitoringModel.updateMonitoringJob(job.id, { is_active: false });
            const bullJob = repeatableJobs.find(rj => rj.name === `monitoring_job_${job.id}`);
            if (bullJob) await monitoringQueue.removeRepeatableByKey(bullJob.key);
          }
       }
       return res.json({ message: 'Monitoring paused for all jobs in suite' });
    }
    
    for (const job of existingJobs) {
        const bullJob = repeatableJobs.find(rj => rj.name === `monitoring_job_${job.id}`);
        if (bullJob) await monitoringQueue.removeRepeatableByKey(bullJob.key);
        await monitoringModel.deleteMonitoringJob(job.id);
    }
    
    const generatedTests = await GeneratedTest.find({ suite_id, user_id });
    if (!generatedTests || generatedTests.length === 0) {
        return res.status(404).json({ error: 'No generated tests found for this suite to monitor.' });
    }

    let env = null;
    let finalEnvId = target_environment_id;

    if (!finalEnvId) {
        // Auto-resolve: priority is default environment for suite > any suite environment > first user environment
        const envs = await environmentModel.listEnvironmentsByUser(user_id, suite_id);
        const defaultEnv = envs.find(e => e.is_default) || envs[0];
        if (defaultEnv) {
            finalEnvId = defaultEnv.id;
            env = defaultEnv;
        }
    } else {
        env = await environmentModel.getEnvironmentById(finalEnvId);
    }

    // Fetch the suite's own base_url as ultimate fallback
    let suiteBaseUrl = '';
    try {
        const suite = await suitesService.getTestSuiteById(user_id, suite_id);
        if (suite && suite.base_url) {
            suiteBaseUrl = suite.base_url;
        }
    } catch (e) {
        console.warn('[monitoring] Could not fetch suite base_url:', e.message);
    }
    
    const createdJobs = [];
    const repeatOptions = parseIntervalToRepeat('5m');
    const createdKeys = new Set();
    
    for (const test of generatedTests) {
       let endpointsToMonitor = [];
       
       if (test.endpoint && test.endpoint.path) {
           endpointsToMonitor.push(test.endpoint);
       } else if (test.request_options && test.request_options.endpoints) {
           endpointsToMonitor = test.request_options.endpoints;
       }
       
       for (const ep of endpointsToMonitor) {
           if (!ep.path) continue;
           
           const method = ep.method || 'GET';
           const pathBase = ep.path.split('?')[0];
           const key = `${method} ${pathBase}`;
           
           if (createdKeys.has(key)) continue;
           createdKeys.add(key);
           
           // Priority: ep.base_url > env.base_url > suite.base_url > ''
           const baseUrl = ep.base_url || (env ? env.base_url : '') || suiteBaseUrl;
           const url = baseUrl + (ep.path.startsWith('/') ? ep.path : `/${ep.path}`);
           
           const jobData = {
              user_id,
              suite_id,
              name: `Monitor: ${method} ${pathBase}`,
              description: `Auto-synced from Generated Test ${test._id}`,
              schedule_interval: '5m',
              failure_threshold: 3,
              target_environment_id: finalEnvId || null,
              test_case_definitions: [{
                 name: 'Auto Endpoint Check',
                 method: method,
                 url: url,
                 assertions: [{ type: 'status', expected: '200' }],
                 headers: ep.headers || {},
                 body: test.request_options?.body || {}
              }]
           };
           
           const job = await monitoringModel.createMonitoringJob(jobData);
           await monitoringQueue.add(`monitoring_job_${job.id}`, { jobId: job.id }, { repeat: repeatOptions });
           await monitoringQueue.add(`monitoring_job_manual_${job.id}`, { jobId: job.id }, { jobId: `manual_${job.id}_${Date.now()}` });
           
           createdJobs.push(job);
       }
    }
    
    res.status(201).json({ message: 'Monitoring enabled and synced successfully', jobs: createdJobs });
  } catch (error) {
    console.error('Error syncing monitoring jobs:', error);
    res.status(500).json({ error: 'Failed to sync monitoring jobs' });
  }
};

// ── Monitoring Suites (job groups) ────────────────────────
const createMonitoringSuite = async (req, res) => {
  try {
    const { suite_id } = req.params;
    const user_id = req.user.id;
    const { name, description, job_ids } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const ms = await monitoringModel.createMonitoringSuite({ user_id, suite_id, name, description, job_ids: job_ids || [] });
    res.status(201).json(ms);
  } catch (error) {
    console.error('Error creating monitoring suite:', error);
    res.status(500).json({ error: 'Failed to create monitoring suite' });
  }
};

const getMonitoringSuites = async (req, res) => {
  try {
    const { suite_id } = req.params;
    const user_id = req.user.id;
    const suites = await monitoringModel.getMonitoringSuites(user_id, suite_id);
    res.json(suites);
  } catch (error) {
    console.error('Error fetching monitoring suites:', error);
    res.status(500).json({ error: 'Failed to fetch monitoring suites' });
  }
};

const updateMonitoringSuite = async (req, res) => {
  try {
    const { ms_id } = req.params;
    const { name, description, job_ids } = req.body;
    const fields = {};
    if (name !== undefined) fields.name = name;
    if (description !== undefined) fields.description = description;
    if (job_ids !== undefined) fields.job_ids = JSON.stringify(job_ids);
    const updated = await monitoringModel.updateMonitoringSuite(ms_id, fields);
    if (!updated) return res.status(404).json({ error: 'Monitoring suite not found' });
    res.json(updated);
  } catch (error) {
    console.error('Error updating monitoring suite:', error);
    res.status(500).json({ error: 'Failed to update monitoring suite' });
  }
};

const deleteMonitoringSuite = async (req, res) => {
  try {
    const { ms_id } = req.params;
    await monitoringModel.deleteMonitoringSuite(ms_id);
    res.json({ message: 'Monitoring suite deleted' });
  } catch (error) {
    console.error('Error deleting monitoring suite:', error);
    res.status(500).json({ error: 'Failed to delete monitoring suite' });
  }
};

module.exports = {
  createJob,
  getJobs,
  getJobResults,
  getJobAlerts,
  getSuiteResults,
  getSuiteAlerts,
  acknowledgeAlert,
  toggleJob,
  deleteJob,
  runJobNow,
  syncSuiteJobs,
  createMonitoringSuite,
  getMonitoringSuites,
  updateMonitoringSuite,
  deleteMonitoringSuite,
};
