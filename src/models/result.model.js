const { query } = require("../config/postgres");

async function createGeneratedTestResult(data) {
  const {
    user_id,
    suite_id,
    conversation_id,
    test_case_name,
    endpoint_id, // Add this
    method,
    path,
    status,
    response_status_code,
    response_body,
    error_message,
    execution_timestamp,
  } = data;

  // Handle response_body to ensure it's JSONB compatible or null
  const formatted_response_body = response_body ? (typeof response_body === 'object' ? JSON.stringify(response_body) : response_body) : null;
  // Handle error_message to ensure it's null if empty
  const formatted_error_message = error_message || null;

  const result = await query(
    `INSERT INTO generated_test_results
    (user_id, suite_id, conversation_id, test_case_name, endpoint_id, method, path, status, response_status_code, response_body, error_message, execution_timestamp)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      user_id,
      suite_id,
      conversation_id,
      test_case_name,
      endpoint_id || null, // Include endpoint_id
      method,
      path,
      status,
      response_status_code,
      formatted_response_body,
      formatted_error_message,
      execution_timestamp || new Date().toISOString(),
    ]
  );
  return result.rows[0];
}

async function getGeneratedTestResultsBySuite(suite_id, user_id) {
  const result = await query(
    `SELECT * FROM generated_test_results WHERE suite_id = $1 AND user_id = $2 ORDER BY execution_timestamp DESC`,
    [suite_id, user_id]
  );
  return result.rows;
}

async function getGeneratedTestResultsByConversationId(conversation_id, user_id) {
  const result = await query(
    `SELECT * FROM generated_test_results WHERE conversation_id = $1 AND user_id = $2 ORDER BY execution_timestamp DESC`,
    [conversation_id, user_id]
  );
  return result.rows;
}

async function deleteGeneratedTestResults(ids, user_id) {
  // Use ANY() for safe array matching in postgres
  const result = await query(
    `DELETE FROM generated_test_results WHERE id = ANY($1::uuid[]) AND user_id = $2 RETURNING id`,
    [ids, user_id]
  );
  return result.rows;
}

module.exports = {
  createGeneratedTestResult,
  getGeneratedTestResultsBySuite,
  getGeneratedTestResultsByConversationId,
  deleteGeneratedTestResults,
}; 