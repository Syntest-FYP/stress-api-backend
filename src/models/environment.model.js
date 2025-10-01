const { query } = require('../config/postgres');

// Create a new environment
const createEnvironment = async ({ user_id, suite_id, name, base_url, auth_config, variables, environment_type, status, is_default, tags, created_by }) => {
  const result = await query(
    `INSERT INTO environments
      (user_id, suite_id, name, base_url, auth_config, variables, environment_type, status, is_default, tags, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'manual'), COALESCE($8, 'active'), COALESCE($9, false), $10, $11, NOW(), NOW())
     RETURNING *`,
    [
      user_id,
      suite_id || null,
      name,
      base_url,
      auth_config || null,
      variables || null,
      environment_type,
      status,
      is_default,
      tags || null,
      created_by || user_id
    ]
  );
  return result.rows[0];
};

// Get environment by ID
const getEnvironmentById = async (id) => {
  const result = await query('SELECT * FROM environments WHERE id = $1', [id]);
  return result.rows[0];
};

// List environments for a user, optionally filtered by suite
const listEnvironmentsByUser = async (user_id, suite_id = null) => {
  if (suite_id) {
    const result = await query(
      'SELECT * FROM environments WHERE user_id = $1 AND suite_id = $2 ORDER BY is_default DESC, updated_at DESC',
      [user_id, suite_id]
    );
    return result.rows;
  }
  const result = await query(
    'SELECT * FROM environments WHERE user_id = $1 ORDER BY is_default DESC, updated_at DESC',
    [user_id]
  );
  return result.rows;
};

// Update environment
const updateEnvironment = async (id, fields) => {
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  if (keys.length === 0) return getEnvironmentById(id);

  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const result = await query(
    `UPDATE environments SET ${setClause}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
    [...values, id]
  );
  return result.rows[0];
};

// Delete environment
const deleteEnvironment = async (id) => {
  await query('DELETE FROM environments WHERE id = $1', [id]);
};

// Clone environment
const cloneEnvironment = async (source_id, user_id) => {
  const srcRes = await query('SELECT * FROM environments WHERE id = $1', [source_id]);
  const src = srcRes.rows[0];
  if (!src || src.user_id !== user_id) return null;

  const name = `${src.name} (clone)`;
  const result = await query(
    `INSERT INTO environments
      (user_id, suite_id, name, base_url, auth_config, variables, environment_type, status, is_default, tags, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', false, $8, $9, NOW(), NOW())
     RETURNING *`,
    [user_id, src.suite_id || null, name, src.base_url, src.auth_config, src.variables, src.environment_type, src.tags, user_id]
  );
  return result.rows[0];
};

// Set default environment
const setDefaultEnvironment = async (user_id, environment_id) => {
  await query('BEGIN');
  try {
    await query('UPDATE environments SET is_default = false WHERE user_id = $1', [user_id]);
    await query('UPDATE environments SET is_default = true, status = \'active\', updated_at = NOW() WHERE id = $1 AND user_id = $2', [environment_id, user_id]);
    await query('COMMIT');
  } catch (err) {
    await query('ROLLBACK');
    throw err;
  }
  return getEnvironmentById(environment_id);
};

// Create environment log
const createEnvironmentLog = async ({ environment_id, user_id, action, details }) => {
  const result = await query(
    `INSERT INTO environment_logs (environment_id, user_id, action, details, created_at)
     VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
    [environment_id, user_id || null, action, details || null]
  );
  return result.rows[0];
};

module.exports = {
  createEnvironment,
  getEnvironmentById,
  listEnvironmentsByUser,
  updateEnvironment,
  deleteEnvironment,
  setDefaultEnvironment,
  createEnvironmentLog,
  cloneEnvironment,
};
