const express = require("express");
const router = express.Router();
const {
  listModules,
  generateTestsForModule,
  generateAllModules,
  quickGenerate,
  getModuleInfo,
  analyzeContextQuality,
} = require("../controllers/gentest.controller");
const { verifyAuth } = require("../middleware/auth");

router.use(verifyAuth);

router.post("/modules/:suiteId", listModules);

router.post("/modules/:suiteId/:moduleName/tests", generateTestsForModule);

router.post("/generate-all/:suiteId", generateAllModules);

router.post("/quick-generate/:suiteId", quickGenerate);

router.get("/modules/:suiteId/:moduleName/info", getModuleInfo);

router.post("/context/analyze/:suiteId", analyzeContextQuality);

module.exports = router;
