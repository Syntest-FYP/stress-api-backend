const express = require("express");
const router = express.Router();
const resultController = require("../controllers/result.controller");
const { verifyAuth } = require("../middleware/auth");

router.use(verifyAuth);

router.post("/", resultController.createGeneratedTestResult);
router.get("/suite/:suiteId", resultController.getGeneratedTestResultsBySuite);
router.get("/conversation/:conversationId", resultController.getGeneratedTestResultsByConversationId);

module.exports = router; 