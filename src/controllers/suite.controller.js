const TestService = require("../services/suitesService");

async function createTestSuite(req, res) {
  try {
    const testSuite = await TestService.createTestSuite(req.user.id, req.body);
    res.status(201).json(testSuite);
  } catch (err) {
    console.error("Create test suite error:", err);
    res.status(500).json({ error: "Failed to create test suite" });
  }
}

async function getAllTestSuites(req, res) {
  try {
    const suites = await TestService.getAllTestSuites(req.user.id);
    res.json(suites);
  } catch (err) {
    console.error("Get all test suites error:", err);
    res.status(500).json({ error: "Failed to fetch test suites" });
  }
}

async function getTestSuiteById(req, res) {
  try {
    const suite = await TestService.getTestSuiteById(
      req.user.id,
      req.params.id
    );
    if (!suite) return res.status(404).json({ error: "Test suite not found" });
    res.json(suite);
  } catch (err) {
    console.error("Get test suite by ID error:", err);
    res.status(500).json({ error: "Failed to fetch test suite" });
  }
}

async function updateTestSuite(req, res) {
  try {
    const suite = await TestService.updateTestSuite(
      req.user.id,
      req.params.id,
      req.body
    );
    if (!suite) return res.status(404).json({ error: "Test suite not found" });
    res.json(suite);
  } catch (err) {
    console.error("Update test suite error:", err);
    res.status(500).json({ error: "Failed to update test suite" });
  }
}

async function deleteTestSuite(req, res) {
  try {
    const suite = await TestService.deleteTestSuite(req.user.id, req.params.id);
    if (!suite) return res.status(404).json({ error: "Test suite not found" });
    res.json({ message: "Test suite deleted successfully" });
  } catch (err) {
    console.error("Delete test suite error:", err);
    res.status(500).json({ error: "Failed to delete test suite" });
  }
}

module.exports = {
  createTestSuite,
  getAllTestSuites,
  getTestSuiteById,
  updateTestSuite,
  deleteTestSuite,
};
