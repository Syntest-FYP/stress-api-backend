const { pool } = require('../config/postgres');

const createUser = async ({ username, email, password, api_key }) => {
  const result = await pool.query(
    'INSERT INTO users (username, email, password, api_key, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *',
    [username, email, password, api_key]
  );
  return result.rows[0];
};

const getUserByUsername = async (username) => {
  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  return result.rows[0];
};

const getUserById = async (id) => {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0];
};

const updateUser = async (id, fields) => {
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  if (keys.length === 0) return getUserById(id);
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const result = await pool.query(
    `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
    [...values, id]
  );
  return result.rows[0];
};

const listUsers = async () => {
  const result = await pool.query('SELECT * FROM users');
  return result.rows;
};

module.exports = { createUser, getUserByUsername, getUserById, updateUser, listUsers }; 