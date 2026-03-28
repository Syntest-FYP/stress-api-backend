const express = require("express");
const router = express.Router();
const { verifyAuth } = require("../middleware/auth");
const ctrl = require("../controllers/loadtest.controller");

router.post("/generate-profile", verifyAuth, ctrl.generateProfile);
router.post("/execute", verifyAuth, ctrl.executeLoadTest);
router.post("/suggest-sla", verifyAuth, ctrl.suggestSla);
router.post("/save-result", verifyAuth, ctrl.saveLoadTestResult);
router.get("/history/:suiteId", verifyAuth, ctrl.getLoadTestHistory);

module.exports = router;
