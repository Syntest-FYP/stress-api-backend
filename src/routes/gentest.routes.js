const express = require("express");
const router = express.Router();
const {
  getCategories,
  generateTestsForModule,
  generateAllModules,
  generateSingleEndpointTests,
  analyzeContextQuality,
  getStoredGeneratedTests,
} = require("../controllers/gentest.controller");
const { verifyAuth } = require("../middleware/auth");

router.use(verifyAuth);

// Get categories from analyzed schema
router.get("/categories/:suiteId", getCategories);

// Generate tests for a specific category/module
router.post("/modules/:suiteId/:categoryName/tests", generateTestsForModule);

// Generate tests for all endpoints
router.post("/generate-all/:suiteId", generateAllModules);

// Generate tests for a single endpoint
router.post("/single-endpoint/:suiteId", generateSingleEndpointTests);

// Analyze context quality
router.post("/context/analyze/:suiteId", analyzeContextQuality);

// Get stored generated tests for a suite
router.get("/stored/:suiteId", getStoredGeneratedTests);

module.exports = router;
