const express = require("express");
const router = express.Router();
const { verifyAuth } = require("../middleware/auth");
const { verifyApiKey } = require("../middleware/apiKeyAuth");
const { uploadLogs } = require("../middleware/logUpload");
const monitoringController = require("../controllers/monitoring.controller");

// Log Ingestion & Passive Monitoring (JWT Protected)
router.post("/upload", verifyAuth, uploadLogs, monitoringController.uploadAndIngest);
router.get("/batches", verifyAuth, monitoringController.listBatches);
router.get("/batches/:id", verifyAuth, monitoringController.getBatch);
router.get("/batches/:id/analytics", verifyAuth, monitoringController.getAnalytics);
router.get("/batches/:id/anomalies", verifyAuth, monitoringController.getAnomalies);
router.delete("/batches/:id", verifyAuth, monitoringController.deleteBatch);

// Webhook (API Key Protected)
router.post("/ingest", verifyApiKey, monitoringController.webhookIngest);

// AI Insights & Test Generation
router.get("/batches/:id/ai-report", verifyAuth, monitoringController.getAIReport);
router.post("/batches/:id/generate-tests", verifyAuth, monitoringController.generateTests);

module.exports = router;
