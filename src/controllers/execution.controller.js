const { successResponse, errorResponse } = require('../utils/response');
const { createExecution, getExecutionById, getExecutionsByTest, updateExecution, deleteExecution } = require('../models/execution.model');
const { getTestById } = require('../models/test.model');
const { getEnvironmentById, updateEnvironment, createEnvironmentLog } = require('../models/environment.model');

exports.create = async (req, res) => {
  const { test_id, environment_id, started_at, finished_at, status, triggered_by, execution_context, k6_config, error_message } = req.body;
  if (!test_id || !status || !environment_id) return errorResponse(res, 'test_id, environment_id and status are required', 400);
  try {
    const test = await getTestById(test_id);
    if (!test || test.user_id !== req.user.id) return errorResponse(res, 'Test not found', 404);

    const env = await getEnvironmentById(environment_id);
    if (!env || env.user_id !== req.user.id) return errorResponse(res, 'Environment not found', 404);

    const envSnapshot = {
      name: env.name,
      base_url: env.base_url,
      auth_config: env.auth_config,
      variables: env.variables,
      type: env.environment_type,
    };
    const dataManagement = env.environment_type === 'automated' ? 'automated' : 'manual';

    const execution = await createExecution({
      test_id,
      started_at,
      finished_at,
      status,
      triggered_by,
      execution_context,
      k6_config,
      error_message,
      environment_id,
      environment_snapshot: envSnapshot,
      data_management: dataManagement,
    });

    await updateEnvironment(environment_id, { last_run_at: new Date(), last_used_at: new Date() });
    await createEnvironmentLog({ environment_id, user_id: req.user.id, action: 'executed', details: { test_id } });

    return successResponse(res, { ...execution, environment_details: envSnapshot });
  } catch (err) {
    return errorResponse(res, err.message || 'Database error', 500);
  }
};

exports.getById = async (req, res) => {
  try {
    const execution = await getExecutionById(req.params.id);
    if (!execution) return errorResponse(res, 'Not found', 404);
    const test = await getTestById(execution.test_id);
    if (!test || test.user_id !== req.user.id) return errorResponse(res, 'Forbidden', 403);
    return successResponse(res, execution);
  } catch (err) {
    return errorResponse(res, 'Database error', 500);
  }
};

exports.getByTest = async (req, res) => {
  try {
    const test = await getTestById(req.params.test_id);
    if (!test || test.user_id !== req.user.id) return errorResponse(res, 'Test not found', 404);
    const executions = await getExecutionsByTest(req.params.test_id);
    return successResponse(res, executions);
  } catch (err) {
    return errorResponse(res, 'Database error', 500);
  }
};

exports.update = async (req, res) => {
  const { finished_at, status, error_message } = req.body;
  if (!status) return errorResponse(res, 'Status is required', 400);
  try {
    const execution = await getExecutionById(req.params.id);
    if (!execution) return errorResponse(res, 'Not found', 404);
    const test = await getTestById(execution.test_id);
    if (!test || test.user_id !== req.user.id) return errorResponse(res, 'Forbidden', 403);
    const updated = await updateExecution(req.params.id, { finished_at, status, error_message });
    return successResponse(res, updated);
  } catch (err) {
    return errorResponse(res, 'Database error', 500);
  }
};

exports.delete = async (req, res) => {
  try {
    const execution = await getExecutionById(req.params.id);
    if (!execution) return errorResponse(res, 'Not found', 404);
    const test = await getTestById(execution.test_id);
    if (!test || test.user_id !== req.user.id) return errorResponse(res, 'Forbidden', 403);
    await deleteExecution(req.params.id);
    return successResponse(res, { deleted: true });
  } catch (err) {
    return errorResponse(res, 'Database error', 500);
  }
};


