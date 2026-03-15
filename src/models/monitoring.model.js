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

  // entries is an array of [timestamp, endpoint_path, http_method, status_code, response_time_ms, user_id, ip_address, error_message]
  const values = [];
  const valuePlaceholders = [];
  
  entries.forEach((entry, i) => {
    const offset = i * 10;
    valuePlaceholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`);
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
      new Date()
    );
  });

  const queryText = `
    INSERT INTO log_entries (batch_id, timestamp, endpoint_path, http_method, status_code, response_time_ms, user_id, ip_address, error_message, created_at)
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
const createAnomaly = async ({ batchId, anomalyType, severity, endpointPath, evidence }) => {
  const result = await query(
    `INSERT INTO log_anomalies (batch_id, anomaly_type, severity, endpoint_path, evidence) 
     VALUES ($1, $2, $3, $4, $5) 
     RETURNING *`,
    [batchId, anomalyType, severity, endpointPath, JSON.stringify(evidence)]
  );
  return result.rows[0];
};

const getAnomaliesByBatch = async (batchId) => {
  const result = await query(
    "SELECT * FROM log_anomalies WHERE batch_id = $1 ORDER BY severity",
    [batchId]
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
};
