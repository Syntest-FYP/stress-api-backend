const { pool } = require('../config/postgres');

// ── Jobs ──────────────────────────────────────────────────
const createMonitoringJob = async (jobData) => {
  const { user_id, suite_id, name, description, schedule_interval, target_environment_id, test_case_definitions, failure_threshold } = jobData;
  const result = await pool.query(
    `INSERT INTO monitoring_jobs (user_id, suite_id, name, description, schedule_interval, target_environment_id, test_case_definitions, failure_threshold)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [user_id, suite_id, name, description || null, schedule_interval, target_environment_id || null, JSON.stringify(test_case_definitions), failure_threshold || 3]
  );
  return result.rows[0];
};

const getMonitoringJobs = async (user_id, suite_id) => {
  const result = await pool.query(
    'SELECT * FROM monitoring_jobs WHERE user_id = $1 AND suite_id = $2 ORDER BY created_at DESC',
    [user_id, suite_id]
  );
  return result.rows;
};

const getMonitoringJobById = async (id) => {
  const result = await pool.query('SELECT * FROM monitoring_jobs WHERE id = $1', [id]);
  return result.rows[0];
};

const getMonitoringJobsBySuite = async (suite_id) => {
  const result = await pool.query('SELECT * FROM monitoring_jobs WHERE suite_id = $1', [suite_id]);
  return result.rows;
};

const updateMonitoringJob = async (id, fields) => {
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  if (keys.length === 0) return getMonitoringJobById(id);
  
  const setClause = keys.map((k, i) => {
    return `${k} = $${i + 1}`;
  }).join(', ');

  const result = await pool.query(
    `UPDATE monitoring_jobs SET ${setClause}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
    [...values, id]
  );
  return result.rows[0];
};

const deleteMonitoringJob = async (id) => {
  await pool.query('DELETE FROM monitoring_jobs WHERE id = $1', [id]);
};

// ── Results ───────────────────────────────────────────────
const createMonitoringResult = async (resultData) => {
  const { job_id, status, latency_ms, response_details, assertion_results, error_message } = resultData;
  const result = await pool.query(
    `INSERT INTO monitoring_results (job_id, status, latency_ms, response_details, assertion_results, error_message)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [job_id, status, latency_ms, JSON.stringify(response_details), JSON.stringify(assertion_results), error_message]
  );
  return result.rows[0];
};

const getMonitoringResultsByJob = async (job_id, limit = 50) => {
  const result = await pool.query(
    'SELECT * FROM monitoring_results WHERE job_id = $1 ORDER BY triggered_at DESC LIMIT $2',
    [job_id, limit]
  );
  return result.rows;
};

const getMonitoringResultsBySuite = async (suite_id, limit = 100) => {
  const result = await pool.query(
    `SELECT mr.*, mj.name as job_name, mj.test_case_definitions
     FROM monitoring_results mr
     JOIN monitoring_jobs mj ON mr.job_id = mj.id
     WHERE mj.suite_id = $1
     ORDER BY mr.triggered_at DESC
     LIMIT $2`,
    [suite_id, limit]
  );
  return result.rows;
};

// ── Alerts ────────────────────────────────────────────────
const createMonitoringAlert = async (alertData) => {
  const { job_id, result_id, severity, message, dispatched_channels } = alertData;
  const result = await pool.query(
    `INSERT INTO monitoring_alerts (job_id, result_id, severity, message, dispatched_channels)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [job_id, result_id, severity, message, JSON.stringify(dispatched_channels)]
  );
  return result.rows[0];
};

const getMonitoringAlertsByJob = async (job_id) => {
  const result = await pool.query(
    'SELECT * FROM monitoring_alerts WHERE job_id = $1 ORDER BY created_at DESC',
    [job_id]
  );
  return result.rows;
};

const getMonitoringAlertsBySuite = async (suite_id) => {
  const result = await pool.query(
    `SELECT ma.*, mj.name as job_name
     FROM monitoring_alerts ma
     JOIN monitoring_jobs mj ON ma.job_id = mj.id
     WHERE mj.suite_id = $1
     ORDER BY ma.created_at DESC`,
    [suite_id]
  );
  return result.rows;
};

const resolveMonitoringAlert = async (alert_id) => {
  const result = await pool.query(
    `UPDATE monitoring_alerts SET resolved_at = NOW() WHERE id = $1 RETURNING *`,
    [alert_id]
  );
  return result.rows[0];
};

// ── Aggregation helpers ───────────────────────────────────
const getJobStats = async (job_id) => {
  const result = await pool.query(
    `SELECT
       COUNT(*) as total_runs,
       COUNT(*) FILTER (WHERE status = 'pass') as pass_count,
       COUNT(*) FILTER (WHERE status != 'pass') as fail_count,
       ROUND(AVG(latency_ms) FILTER (WHERE latency_ms > 0)) as avg_latency,
       ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms > 0)) as p50_latency,
       ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms > 0)) as p95_latency,
       ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms > 0)) as p99_latency
     FROM monitoring_results WHERE job_id = $1`,
    [job_id]
  );
  return result.rows[0];
};

module.exports = {
  createMonitoringJob,
  getMonitoringJobs,
  getMonitoringJobById,
  getMonitoringJobsBySuite,
  updateMonitoringJob,
  deleteMonitoringJob,
  createMonitoringResult,
  getMonitoringResultsByJob,
  getMonitoringResultsBySuite,
  createMonitoringAlert,
  getMonitoringAlertsByJob,
  getMonitoringAlertsBySuite,
  resolveMonitoringAlert,
  getJobStats
};
