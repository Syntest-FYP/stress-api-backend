const express = require("express");
const router = express.Router();
const { verifyAuth } = require("../middleware/auth");
const { verifyApiKey } = require("../middleware/apiKeyAuth");
const { uploadLogs } = require("../middleware/logUpload");
const monitoringController = require("../controllers/monitoring.controller");

// Log Ingestion & Passive Monitoring (JWT Protected)
router.post(
  "/upload",
  verifyAuth,
  uploadLogs,
  monitoringController.uploadAndIngest,
);
router.get("/batches", verifyAuth, monitoringController.listBatches);
router.get("/batches/:id", verifyAuth, monitoringController.getBatch);
router.get(
  "/batches/:id/analytics",
  verifyAuth,
  monitoringController.getAnalytics,
);
router.get(
  "/batches/:id/anomalies",
  verifyAuth,
  monitoringController.getAnomalies,
);
router.get("/batches/:id/logs", verifyAuth, monitoringController.getLogs);
router.delete("/batches/:id", verifyAuth, monitoringController.deleteBatch);

// Webhook (API Key Protected)
router.post("/ingest", verifyApiKey, monitoringController.webhookIngest);

// AI Insights & Test Generation
router.get(
  "/batches/:id/ai-report",
  verifyAuth,
  monitoringController.getAIReport,
);
router.post(
  "/batches/:id/generate-tests",
  verifyAuth,
  monitoringController.generateTests,
);
router.post("/chat", verifyAuth, monitoringController.chat);

// Suite-level routes (JWT Protected)
router.post(
  "/suites/:suite_id/sync",
  verifyAuth,
  monitoringController.syncSuiteJobs,
);
router.post(
  "/suites/:suite_id/jobs",
  verifyAuth,
  monitoringController.createJob,
);
router.get("/suites/:suite_id/jobs", verifyAuth, monitoringController.getJobs);
router.get(
  "/suites/:suite_id/results",
  verifyAuth,
  monitoringController.getSuiteResults,
);
router.get(
  "/suites/:suite_id/alerts",
  verifyAuth,
  monitoringController.getSuiteAlerts,
);

// Job-level routes (JWT Protected)
router.get(
  "/jobs/:job_id/results",
  verifyAuth,
  monitoringController.getJobResults,
);
router.get(
  "/jobs/:job_id/alerts",
  verifyAuth,
  monitoringController.getJobAlerts,
);
router.patch(
  "/jobs/:job_id/toggle",
  verifyAuth,
  monitoringController.toggleJob,
);
router.post("/jobs/:job_id/run", verifyAuth, monitoringController.runJobNow);
router.delete("/jobs/:job_id", verifyAuth, monitoringController.deleteJob);

// Alert actions (JWT Protected)
router.patch(
  "/alerts/:alert_id/acknowledge",
  verifyAuth,
  monitoringController.acknowledgeAlert,
);

module.exports = router;
