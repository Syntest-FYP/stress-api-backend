const {
  analyzeSpecService,
  getAnalysisService,
  checkSpecExistsService,
} = require("../services/specService");

// POST /api/spec/analyze
exports.analyzeSpec = async (req, res) => {
  try {
    const user_id = req.user.id;
    const suite_id = req.body.suiteId || req.body.suite_id;

    if (!suite_id) {
      return res.status(400).json({
        error: "Missing required parameter: suite_id",
      });
    }

    const result = await analyzeSpecService(user_id, suite_id);

    res.json({
      success: true,
      message: "Specification analyzed successfully",
      ...result,
    });
  } catch (error) {
    console.error("SpecAnalyst error:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        error: "SpecAnalyst service error",
        details: error.response.data,
      });
    } else if (error.request) {
      return res.status(503).json({
        error: "SpecAnalyst service unavailable",
        details:
          "Could not connect to analysis service. Make sure the Python service is running.",
      });
    }

    res.status(500).json({
      error: "Failed to analyze specification",
      details: error,
    });
  }
};

// GET /api/spec/analysis/:suiteId
exports.getAnalysis = async (req, res) => {
  try {
    const suite_id = req.params.suiteId;
    const user_id = req.user.id;

    const result = await getAnalysisService(user_id, suite_id);

    if (!result) {
      return res.status(404).json({
        error: "No analysis found for this suite",
        message: "Please run analysis first.",
      });
    }

    res.json(result);
  } catch (error) {
    console.error("getAnalysis error:", error);
    res.status(500).json({
      error: "Failed to retrieve analysis",
      details: error.message,
    });
  }
};

// GET /api/spec/check/:suiteId
exports.checkSpecExists = async (req, res) => {
  try {
    const suite_id = req.params.suiteId;
    const user_id = req.user.id;

    const result = await checkSpecExistsService(user_id, suite_id);
    res.json(result);
  } catch (error) {
    console.error("checkSpecExists error:", error.message);
    res.status(500).json({
      error: "Failed to check spec file",
      details: error.message,
    });
  }
};
