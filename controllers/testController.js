const runLoadTestEngine = require("../services/loadTester");

exports.runLoadTest = async (req, res) => {
  try {
    const config = req.body;

    if (
      !config.url ||
      !config.method ||
      !config.totalRequests ||
      !config.concurrency
    ) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const result = await runLoadTestEngine(config);
    res.status(200).json(result);
  } catch (error) {
    console.error("Test execution failed:", error);
    res.status(500).json({ error: "Internal server error during load test." });
  }
};
