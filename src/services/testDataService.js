
async function provisionAutomatedSandbox(userId, context) {
  const timestamp = Date.now();
  const base_url = `https://automated-sandbox.local/${userId}/${timestamp}`;
  const authToken = `tok-${timestamp}`;
  const auth_config = { headers: { 'x-mock-token': authToken } };
  const variables = {
    SANDBOX_USER_EMAIL: `test_${timestamp}@example.com`,
    SANDBOX_USER_ID: `u_${timestamp}`,
    SANDBOX_TOKEN: authToken,
  };
  const data = {
    usersCreated: 1,
    tokenIssued: true,
    sampleRecords: 3,
    context,
  };
  const cleanupToken = `cleanup-${userId}-${timestamp}`;
  return { base_url, auth_config, variables, data, cleanupToken };
}

module.exports = { provisionAutomatedSandbox };


