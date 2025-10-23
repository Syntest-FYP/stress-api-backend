const express = require("express");
const router = express.Router();
const {
  analyzeSpec,
  getAnalysis,
  checkSpecExists,
} = require("../controllers/spec.controller");
const { verifyAuth } = require("../middleware/auth");

router.use(verifyAuth);

router.post("/analyze", analyzeSpec);

router.get("/analysis/:suiteId", getAnalysis);

router.get("/check/:suiteId", checkSpecExists);

module.exports = router;
