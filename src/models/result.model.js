const { pool } = require('../config/postgres');

const createResult = async ({ execution_id, metric_type, metric_name, metric_value, metric_unit, tags, timestamp, raw_data }) => {
  const result = await pool.query(
    `INSERT INTO results (execution_id, metric_type, metric_name, metric_value, metric_unit, tags, timestamp, raw_data, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
    [execution_id, metric_type, metric_name, metric_value, metric_unit, tags, timestamp, raw_data]
  );
  return result.rows[0];
};

const getResultById = async (id) => {
  const result = await pool.query('SELECT * FROM results WHERE id = $1', [id]);
  return result.rows[0];
};

const getResultsByExecution = async (execution_id) => {
  const result = await pool.query('SELECT * FROM results WHERE execution_id = $1', [execution_id]);
  return result.rows;
};

const deleteResult = async (id) => {
  await pool.query('DELETE FROM results WHERE id = $1', [id]);
};

module.exports = { createResult, getResultById, getResultsByExecution, deleteResult }; 