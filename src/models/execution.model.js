const { pool } = require('../config');

const createExecution = async ({ test_id, started_at, finished_at, status, triggered_by, execution_context, k6_config, error_message }) => {
  const result = await pool.query(
    `INSERT INTO executions (test_id, started_at, finished_at, status, triggered_by, execution_context, k6_config, error_message, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
    [test_id, started_at, finished_at, status, triggered_by, execution_context, k6_config, error_message]
  );
  return result.rows[0];
};

const getExecutionById = async (id) => {
  const result = await pool.query('SELECT * FROM executions WHERE id = $1', [id]);
  return result.rows[0];
};

const getExecutionsByTest = async (test_id) => {
  const result = await pool.query('SELECT * FROM executions WHERE test_id = $1', [test_id]);
  return result.rows;
};

const updateExecution = async (id, fields) => {
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  if (keys.length === 0) return getExecutionById(id);
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const result = await pool.query(
    `UPDATE executions SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
    [...values, id]
  );
  return result.rows[0];
};

const deleteExecution = async (id) => {
  await pool.query('DELETE FROM executions WHERE id = $1', [id]);
};

module.exports = { createExecution, getExecutionById, getExecutionsByTest, updateExecution, deleteExecution }; 