const { pool } = require("../config");

const createSpecAnalysis = async ({
  user_id,
  suite_id,
  spec_file,
  analysis,
}) => {
  const result = await pool.query(
    `INSERT INTO spec_analyses (user_id, suite_id, spec_file, analysis, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     RETURNING *`,
    [user_id, suite_id, spec_file, analysis]
  );
  return result.rows[0];
};

const getSpecAnalysisBySuite = async (suite_id) => {
  const result = await pool.query(
    `SELECT * FROM spec_analyses WHERE suite_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [suite_id]
  );
  return result.rows[0];
};

module.exports = { createSpecAnalysis, getSpecAnalysisBySuite };
