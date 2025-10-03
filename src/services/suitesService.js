const { query } = require("../config/postgres");

// Create a new test suite
async function createTestSuite(user_id, data) {
  const {
    name,
    description,
    version,
    base_url,
    auth_type,
    tags,
    visibility,
    category,
  } = data;

  const result = await query(
    `INSERT INTO test_suites
    (user_id, name, description, version, base_url, auth_type, tags, visibility, category)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *`,
    [
      user_id,
      name,
      description,
      version,
      base_url,
      auth_type,
      tags,
      visibility,
      category,
    ]
  );

  return result.rows[0];
}

// Get all test suites for a user
async function getAllTestSuites(user_id) {
  const result = await query(
    `SELECT * FROM test_suites WHERE user_id = $1 ORDER BY created_at DESC`,
    [user_id]
  );
  return result.rows;
}

// Get a test suite by ID
async function getTestSuiteById(user_id, id) {
  console.log('Looking for suite:', { suite_id: id, user_id: user_id });
  const result = await query(
    `SELECT * FROM test_suites WHERE id = $1 AND user_id = $2`,
    [id, user_id]
  );
  console.log('Suite query result:', { rowCount: result.rowCount, found: result.rows[0] ? 'yes' : 'no' });
  return result.rows[0];
}

// Update a test suite
async function updateTestSuite(user_id, id, data) {
  const {
    name,
    description,
    version,
    base_url,
    auth_type,
    tags,
    visibility,
    status,
    category,
  } = data;

  const result = await query(
    `UPDATE test_suites
     SET name = COALESCE($1,name),
         description = COALESCE($2,description),
         version = COALESCE($3,version),
         base_url = COALESCE($4,base_url),
         auth_type = COALESCE($5,auth_type),
         tags = COALESCE($6,tags),
         visibility = COALESCE($7,visibility),
         status = COALESCE($8,status),
         category = COALESCE($9,category),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $10 AND user_id = $11
     RETURNING *`,
    [
      name,
      description,
      version,
      base_url,
      auth_type,
      tags,
      visibility,
      status,
      category,
      id,
      user_id,
    ]
  );

  return result.rows[0];
}

// Delete a test suite
async function deleteTestSuite(user_id, id) {
  const result = await query(
    `DELETE FROM test_suites WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, user_id]
  );
  return result.rows[0];
}

module.exports = {
  createTestSuite,
  getAllTestSuites,
  getTestSuiteById,
  updateTestSuite,
  deleteTestSuite,
};
