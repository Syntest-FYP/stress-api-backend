const loadTestService = require("../services/loadTestService");

exports.run = async (req, res) => {
  try {
    const report = await loadTestService.runLoadTest(req.body);
    res.json(report);
  } catch (error) {
    console.error("Error running load test:", error);
    res.status(500).json({ error: error.message });
  }
};
