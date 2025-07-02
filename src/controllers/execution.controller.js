const { createExecution, getExecutionById, getExecutionsByTest, updateExecution, deleteExecution } = require('../models/execution.model');
const { getTestById } = require('../models/test.model');

exports.create = async (req, res) => {
  const { test_id, started_at, finished_at, status, triggered_by, execution_context, k6_config, error_message } = req.body;
  if (!test_id || !status) return res.status(400).json({ error: 'test_id and status are required' });
  try {
    const test = await getTestById(test_id);
    if (!test || test.user_id !== req.user.id) return res.status(404).json({ error: 'Test not found' });
    const execution = await createExecution({
      test_id,
      started_at,
      finished_at,
      status,
      triggered_by,
      execution_context,
      k6_config,
      error_message
    });
    res.status(201).json(execution);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

exports.getById = async (req, res) => {
  try {
    const execution = await getExecutionById(req.params.id);
    if (!execution) return res.status(404).json({ error: 'Not found' });
    const test = await getTestById(execution.test_id);
    if (!test || test.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    res.json(execution);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

exports.getByTest = async (req, res) => {
  try {
    const test = await getTestById(req.params.test_id);
    if (!test || test.user_id !== req.user.id) return res.status(404).json({ error: 'Test not found' });
    const executions = await getExecutionsByTest(req.params.test_id);
    res.json(executions);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

exports.update = async (req, res) => {
  const { finished_at, status, error_message } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required' });
  try {
    const execution = await getExecutionById(req.params.id);
    if (!execution) return res.status(404).json({ error: 'Not found' });
    const test = await getTestById(execution.test_id);
    if (!test || test.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const updated = await updateExecution(req.params.id, { finished_at, status, error_message });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

exports.delete = async (req, res) => {
  try {
    const execution = await getExecutionById(req.params.id);
    if (!execution) return res.status(404).json({ error: 'Not found' });
    const test = await getTestById(execution.test_id);
    if (!test || test.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    await deleteExecution(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
}; 