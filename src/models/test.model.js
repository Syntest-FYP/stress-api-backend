const { pool } = require('../config');

const createTest = async ({ user_id, name, description, natural_language_input, k6_script, target_url, test_type, configuration, tags }) => {
  const result = await pool.query(
    `INSERT INTO tests (user_id, name, description, natural_language_input, k6_script, target_url, test_type, configuration, tags, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW(), NOW()) RETURNING *`,
    [user_id, name, description, natural_language_input, k6_script, target_url, test_type, configuration, tags]
  );
  return result.rows[0];
};

const getTestById = async (id) => {
  const result = await pool.query('SELECT * FROM tests WHERE id = $1', [id]);
  return result.rows[0];
};

const getTestsByUser = async (user_id) => {
  const result = await pool.query('SELECT * FROM tests WHERE user_id = $1', [user_id]);
  return result.rows;
};

const updateTest = async (id, fields) => {
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  if (keys.length === 0) return getTestById(id);
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const result = await pool.query(
    `UPDATE tests SET ${setClause}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
    [...values, id]
  );
  return result.rows[0];
};

const deleteTest = async (id) => {
  await pool.query('UPDATE tests SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);
};

const filterTests = async (user_id, filters = {}) => {
  let query = 'SELECT * FROM tests WHERE user_id = $1';
  const values = [user_id];
  let idx = 2;
  for (const [key, value] of Object.entries(filters)) {
    query += ` AND ${key} = $${idx++}`;
    values.push(value);
  }
  const result = await pool.query(query, values);
  return result.rows;
};

module.exports = { createTest, getTestById, getTestsByUser, updateTest, deleteTest, filterTests }; 