const { createResult, getResultById, getResultsByExecution, deleteResult } = require('../models/result.model');
const { getExecutionById } = require('../models/execution.model');
const { getTestById } = require('../models/test.model');
const resultService = require("../services/result.service");

exports.create = async (req, res) => {
  const { execution_id, metric_type, metric_name, metric_value, metric_unit, tags, timestamp, raw_data } = req.body;
  if (!execution_id || !metric_type || !metric_name || !timestamp) return res.status(400).json({ error: 'Required fields missing' });
  try {
    const execution = await getExecutionById(execution_id);
    if (!execution) return res.status(404).json({ error: 'Execution not found' });
    const test = await getTestById(execution.test_id);
    if (!test || test.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const result = await createResult({ execution_id, metric_type, metric_name, metric_value, metric_unit, tags, timestamp, raw_data });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

exports.getByExecution = async (req, res) => {
  try {
    const execution = await getExecutionById(req.params.execution_id);
    if (!execution) return res.status(404).json({ error: 'Execution not found' });
    const test = await getTestById(execution.test_id);
    if (!test || test.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const results = await getResultsByExecution(req.params.execution_id);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

exports.getById = async (req, res) => {
  try {
    const result = await getResultById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    const execution = await getExecutionById(result.execution_id);
    const test = await getTestById(execution.test_id);
    if (!test || test.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

exports.delete = async (req, res) => {
  try {
    const result = await getResultById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    const execution = await getExecutionById(result.execution_id);
    const test = await getTestById(execution.test_id);
    if (!test || test.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    await deleteResult(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

// POST /api/test-results
exports.createGeneratedTestResult = async (req, res) => {
  try {
    const user_id = req.user.id;
    const resultData = { ...req.body, user_id };
    const newResult = await resultService.createGeneratedTestResult(resultData);
    res.status(201).json(newResult);
  } catch (error) {
    console.error("Error creating generated test result:", error);
    res.status(500).json({ error: "Failed to create generated test result" });
  }
};

// GET /api/test-results/suite/:suiteId
exports.getGeneratedTestResultsBySuite = async (req, res) => {
  try {
    const user_id = req.user.id;
    const suite_id = req.params.suiteId;
    const results = await resultService.getGeneratedTestResultsBySuite(suite_id, user_id);
    res.json(results);
  } catch (error) {
    console.error("Error fetching generated test results by suite:", error);
    res.status(500).json({ error: "Failed to fetch generated test results" });
  }
};

// GET /api/test-results/conversation/:conversationId
exports.getGeneratedTestResultsByConversationId = async (req, res) => {
    try {
      const user_id = req.user.id;
      const conversation_id = req.params.conversationId;
      const results = await resultService.getGeneratedTestResultsByConversationId(conversation_id, user_id);
      res.json(results);
    } catch (error) {
      console.error("Error fetching generated test results by conversation ID:", error);
      res.status(500).json({ error: "Failed to fetch generated test results" });
    }
  }; 