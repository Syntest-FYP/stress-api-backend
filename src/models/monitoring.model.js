const { query } = require("../config/postgres");

/**
 * Log Ingestion Batches
 */
const createBatch = async ({ userId, suiteId, filename, format, fieldMapping }) => {
  const result = await query(
    `INSERT INTO log_ingestion_batches (uploaded_by, suite_id, filename, format, field_mapping, status) 
     VALUES ($1, $2, $3, $4, $5, 'pending') 
     RETURNING *`,
    [userId, suiteId, filename, format, JSON.stringify(fieldMapping)]
  );
  return result.rows[0];
};

const updateBatchStatus = async (batchId, status, extraFields = {}) => {
  const keys = Object.keys(extraFields);
  const values = Object.values(extraFields);
  
  let setClause = `status = $2, updated_at = NOW()`;
  const params = [batchId, status];
  
  keys.forEach((key, index) => {
    setClause += `, ${key} = $${index + 3}`;
    params.push(values[index]);
  });
  
  const result = await query(
    `UPDATE log_ingestion_batches SET ${setClause} WHERE id = $1 RETURNING *`,
    params
  );
  return result.rows[0];
};

const getBatchById = async (batchId, userId, suiteId = null) => {
  let queryText = "SELECT * FROM log_ingestion_batches WHERE id = $1 AND uploaded_by = $2";
  const params = [batchId, userId];

  if (suiteId) {
    queryText += " AND suite_id = $3";
    params.push(suiteId);
  }
  
  const result = await query(queryText, params);
  return result.rows[0];
};

const getBatchesByUser = async (userId, limit = 10, offset = 0, suiteId = null) => {
  let queryText = "SELECT * FROM log_ingestion_batches WHERE uploaded_by = $1";
  const params = [userId];

  if (suiteId) {
    queryText += " AND suite_id = $2";
    params.push(suiteId);
  }

  queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await query(queryText, params);
  return result.rows;
};

const deleteBatch = async (batchId, userId, suiteId = null) => {
  let queryText = "DELETE FROM log_ingestion_batches WHERE id = $1 AND uploaded_by = $2";
  const params = [batchId, userId];

  if (suiteId) {
    queryText += " AND suite_id = $3";
    params.push(suiteId);
  }

  queryText += " RETURNING *";

  // Cascading deletes will handle log_entries, log_batch_analytics, log_anomalies
  const result = await query(queryText, params);
  return result.rows[0];
};

/**
 * Log Entries (Bulk Insert)
 */
const bulkInsertLogEntries = async (batchId, entries) => {
  if (entries.length === 0) return;

  // entries is an array of objects with [timestamp, endpoint_path, http_method, status_code, response_time_ms, user_id, ip_address, error_message, endpoint_id]
  const values = [];
  const valuePlaceholders = [];
  
  entries.forEach((entry, i) => {
    const offset = i * 11;
    valuePlaceholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`);
    values.push(
      batchId,
      entry.timestamp,
      entry.endpoint_path,
      entry.http_method,
      entry.status_code,
      entry.response_time_ms,
      entry.user_id || null,
      entry.ip_address || null,
      entry.error_message || null,
      entry.endpoint_id || null,
      new Date()
    );
  });

  const queryText = `
    INSERT INTO log_entries (batch_id, timestamp, endpoint_path, http_method, status_code, response_time_ms, user_id, ip_address, error_message, endpoint_id, created_at)
    VALUES ${valuePlaceholders.join(", ")}
  `;
  
  return query(queryText, values);
};

/**
 * Analytics
 */
const saveAnalytics = async (batchId, type, data) => {
  const result = await query(
    "INSERT INTO log_batch_analytics (batch_id, summary_type, data) VALUES ($1, $2, $3) RETURNING *",
    [batchId, type, JSON.stringify(data)]
  );
  return result.rows[0];
};

const getAnalyticsByBatch = async (batchId) => {
  const result = await query(
    "SELECT summary_type, data FROM log_batch_analytics WHERE batch_id = $1",
    [batchId]
  );
  return result.rows;
};

/**
 * Anomalies
 */
const createAnomaly = async ({ batchId, anomalyType, severity, endpointPath, evidence, endpointId }) => {
  const result = await query(
    `INSERT INTO log_anomalies (batch_id, anomaly_type, severity, endpoint_path, evidence, endpoint_id) 
     VALUES ($1, $2, $3, $4, $5, $6) 
     RETURNING *`,
    [batchId, anomalyType, severity, endpointPath, JSON.stringify(evidence), endpointId || null]
  );
  return result.rows[0];
};

const getAnomaliesByBatch = async (batchId) => {
  const result = await query(
    `SELECT * FROM log_anomalies 
     WHERE batch_id = $1 
     ORDER BY 
       CASE severity 
         WHEN 'critical' THEN 1 
         WHEN 'high' THEN 2 
         WHEN 'medium' THEN 3 
         WHEN 'low' THEN 4 
         ELSE 5 
       END ASC, 
       detected_at DESC`,
    [batchId]
  );
  return result.rows;
};

const getLogsByBatch = async (batchId, filters = {}) => {
  let queryText = "SELECT * FROM log_entries WHERE batch_id = $1";
  const params = [batchId];
  let paramCount = 2;

  if (filters.statusCode) {
    queryText += ` AND status_code = $${paramCount++}`;
    params.push(filters.statusCode);
  }
  if (filters.endpointPath) {
    queryText += ` AND endpoint_path LIKE $${paramCount++}`;
    params.push(`%${filters.endpointPath}%`);
  }
  if (filters.userId) {
    queryText += ` AND user_id = $${paramCount++}`;
    params.push(filters.userId);
  }
  if (filters.ipAddress) {
    queryText += ` AND ip_address = $${paramCount++}`;
    params.push(filters.ipAddress);
  }
  if (filters.startTime && filters.endTime) {
    queryText += ` AND timestamp BETWEEN $${paramCount++} AND $${paramCount++}`;
    params.push(filters.startTime, filters.endTime);
  }

  queryText += ` ORDER BY timestamp DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
  params.push(filters.limit || 100, filters.offset || 0);

  const result = await query(queryText, params);
  return result.rows;
};

/**
 * Cross-batch monitoring queries (suite-level)
 */
const getTopFailingEndpoints = async ({
  userId,
  suiteId,
  sinceHours = 24,
  limit = 10,
  failureStatusMin = 500,
}) => {
  const safeHours = Number.isFinite(Number(sinceHours)) ? Math.max(1, Number(sinceHours)) : 24;
  const safeLimit = Number.isFinite(Number(limit)) ? Math.min(50, Math.max(1, Number(limit))) : 10;
  const safeFailureMin = Number.isFinite(Number(failureStatusMin))
    ? Math.min(599, Math.max(400, Number(failureStatusMin)))
    : 500;

  // NOTE: We join batches to enforce suite + ownership.
  const result = await query(
    `
      SELECT
        le.endpoint_path,
        le.http_method,
        COUNT(*)::int AS total_requests,
        SUM(CASE WHEN le.status_code >= 500 THEN 1 ELSE 0 END)::int AS failures_5xx,
        SUM(CASE WHEN le.status_code BETWEEN 400 AND 499 THEN 1 ELSE 0 END)::int AS failures_4xx,
        SUM(CASE WHEN le.status_code >= $5 THEN 1 ELSE 0 END)::int AS failures_selected,
        ROUND(
          100.0 * (SUM(CASE WHEN le.status_code >= $5 THEN 1 ELSE 0 END)) / NULLIF(COUNT(*), 0),
          2
        ) AS selected_failure_rate_pct,
        MAX(le.timestamp) AS last_seen
      FROM log_entries le
      JOIN log_ingestion_batches b ON b.id = le.batch_id
      WHERE
        b.uploaded_by = $1
        AND b.suite_id = $2
        AND le.timestamp >= (NOW() - ($3 || ' hours')::interval)
      GROUP BY le.endpoint_path, le.http_method
      HAVING SUM(CASE WHEN le.status_code >= $5 THEN 1 ELSE 0 END) > 0
      ORDER BY failures_selected DESC, total_requests DESC, last_seen DESC
      LIMIT $4
    `,
    [userId, suiteId, String(safeHours), safeLimit, safeFailureMin],
  );

  return result.rows;
};

const getWorstLatencyEndpoints = async ({
  userId,
  suiteId,
  sinceHours = 24,
  limit = 10,
  minRequests = 20,
}) => {
  const safeHours = Number.isFinite(Number(sinceHours)) ? Math.max(1, Number(sinceHours)) : 24;
  const safeLimit = Number.isFinite(Number(limit)) ? Math.min(50, Math.max(1, Number(limit))) : 10;
  const safeMinReq = Number.isFinite(Number(minRequests)) ? Math.min(10000, Math.max(1, Number(minRequests))) : 20;

  const result = await query(
    `
      SELECT
        le.endpoint_path,
        le.http_method,
        COUNT(*)::int AS total_requests,
        ROUND(AVG(le.response_time_ms)::numeric, 2) AS avg_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY le.response_time_ms) AS p95_ms,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY le.response_time_ms) AS p99_ms,
        MAX(le.response_time_ms)::int AS max_ms,
        MAX(le.timestamp) AS last_seen
      FROM log_entries le
      JOIN log_ingestion_batches b ON b.id = le.batch_id
      WHERE
        b.uploaded_by = $1
        AND b.suite_id = $2
        AND le.timestamp >= (NOW() - ($3 || ' hours')::interval)
      GROUP BY le.endpoint_path, le.http_method
      HAVING COUNT(*) >= $5
      ORDER BY p99_ms DESC NULLS LAST, p95_ms DESC NULLS LAST, total_requests DESC
      LIMIT $4
    `,
    [userId, suiteId, String(safeHours), safeLimit, safeMinReq],
  );

  return result.rows;
};

const getStatusCodeBreakdownForPath = async ({
  userId,
  suiteId,
  endpointPathLike,
  sinceHours = 24,
  limit = 20,
}) => {
  const safeHours = Number.isFinite(Number(sinceHours)) ? Math.max(1, Number(sinceHours)) : 24;
  const safeLimit = Number.isFinite(Number(limit)) ? Math.min(50, Math.max(1, Number(limit))) : 20;
  const pathLike = String(endpointPathLike || "").trim();
  if (!pathLike) return [];

  const result = await query(
    `
      SELECT
        le.endpoint_path,
        le.http_method,
        le.status_code,
        COUNT(*)::int AS count,
        MAX(le.timestamp) AS last_seen
      FROM log_entries le
      JOIN log_ingestion_batches b ON b.id = le.batch_id
      WHERE
        b.uploaded_by = $1
        AND b.suite_id = $2
        AND le.timestamp >= (NOW() - ($4 || ' hours')::interval)
        AND le.endpoint_path ILIKE $3
      GROUP BY le.endpoint_path, le.http_method, le.status_code
      ORDER BY count DESC, last_seen DESC
      LIMIT $5
    `,
    [userId, suiteId, `%${pathLike}%`, String(safeHours), safeLimit],
  );

  return result.rows;
};

const getEndpointHealthNow = async ({
  userId,
  suiteId,
  endpointPathLike,
  sinceMinutes = 60,
}) => {
  const safeMinutes = Number.isFinite(Number(sinceMinutes))
    ? Math.min(60 * 24 * 7, Math.max(5, Number(sinceMinutes)))
    : 60;
  const pathLike = String(endpointPathLike || "").trim();
  if (!pathLike) return null;

  const result = await query(
    `
      SELECT
        le.endpoint_path,
        le.http_method,
        COUNT(*)::int AS total_requests,
        SUM(CASE WHEN le.status_code BETWEEN 200 AND 299 THEN 1 ELSE 0 END)::int AS ok_2xx,
        SUM(CASE WHEN le.status_code BETWEEN 400 AND 499 THEN 1 ELSE 0 END)::int AS errors_4xx,
        SUM(CASE WHEN le.status_code >= 500 THEN 1 ELSE 0 END)::int AS errors_5xx,
        ROUND(
          100.0 * (SUM(CASE WHEN le.status_code >= 400 THEN 1 ELSE 0 END)) / NULLIF(COUNT(*), 0),
          2
        ) AS error_rate_pct,
        ROUND(AVG(le.response_time_ms)::numeric, 2) AS avg_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY le.response_time_ms) AS p95_ms,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY le.response_time_ms) AS p99_ms,
        MAX(le.timestamp) AS last_seen
      FROM log_entries le
      JOIN log_ingestion_batches b ON b.id = le.batch_id
      WHERE
        b.uploaded_by = $1
        AND b.suite_id = $2
        AND le.timestamp >= (NOW() - ($4 || ' minutes')::interval)
        AND le.endpoint_path ILIKE $3
      GROUP BY le.endpoint_path, le.http_method
      ORDER BY total_requests DESC, last_seen DESC
      LIMIT 1
    `,
    [userId, suiteId, `%${pathLike}%`, String(safeMinutes)],
  );

  return result.rows[0] || null;
};

const getHourlyErrorRate = async ({ userId, suiteId, sinceHours = 48 }) => {
  const safeHours = Number.isFinite(Number(sinceHours)) ? Math.min(24 * 30, Math.max(6, Number(sinceHours))) : 48;
  const result = await query(
    `
      SELECT
        date_trunc('hour', le.timestamp) AS hour_bucket,
        COUNT(*)::int AS total_requests,
        SUM(CASE WHEN le.status_code >= 400 THEN 1 ELSE 0 END)::int AS errors,
        ROUND(
          100.0 * (SUM(CASE WHEN le.status_code >= 400 THEN 1 ELSE 0 END)) / NULLIF(COUNT(*), 0),
          2
        ) AS error_rate_pct
      FROM log_entries le
      JOIN log_ingestion_batches b ON b.id = le.batch_id
      WHERE
        b.uploaded_by = $1
        AND b.suite_id = $2
        AND le.timestamp >= (NOW() - ($3 || ' hours')::interval)
      GROUP BY hour_bucket
      ORDER BY hour_bucket ASC
    `,
    [userId, suiteId, String(safeHours)],
  );
  return result.rows;
};

const getTopFailingEndpointsInWindow = async ({
  userId,
  suiteId,
  windowStart,
  windowEnd,
  limit = 5,
}) => {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.min(20, Math.max(1, Number(limit))) : 5;
  if (!windowStart || !windowEnd) return [];

  const result = await query(
    `
      SELECT
        le.endpoint_path,
        le.http_method,
        COUNT(*)::int AS total_requests,
        SUM(CASE WHEN le.status_code >= 400 THEN 1 ELSE 0 END)::int AS errors,
        ROUND(
          100.0 * (SUM(CASE WHEN le.status_code >= 400 THEN 1 ELSE 0 END)) / NULLIF(COUNT(*), 0),
          2
        ) AS error_rate_pct,
        MAX(le.timestamp) AS last_seen
      FROM log_entries le
      JOIN log_ingestion_batches b ON b.id = le.batch_id
      WHERE
        b.uploaded_by = $1
        AND b.suite_id = $2
        AND le.timestamp BETWEEN $3 AND $4
      GROUP BY le.endpoint_path, le.http_method
      HAVING SUM(CASE WHEN le.status_code >= 400 THEN 1 ELSE 0 END) > 0
      ORDER BY errors DESC, error_rate_pct DESC, total_requests DESC
      LIMIT $5
    `,
    [userId, suiteId, windowStart, windowEnd, safeLimit],
  );

  return result.rows;
};

module.exports = {
  createBatch,
  updateBatchStatus,
  getBatchById,
  getBatchesByUser,
  deleteBatch,
  bulkInsertLogEntries,
  saveAnalytics,
  getAnalyticsByBatch,
  createAnomaly,
  getAnomaliesByBatch,
  getLogsByBatch,
  getTopFailingEndpoints,
  getWorstLatencyEndpoints,
  getStatusCodeBreakdownForPath,
  getEndpointHealthNow,
  getHourlyErrorRate,
  getTopFailingEndpointsInWindow,
};
