const express = require("express");
const router = express.Router();
const { verifyAuth } = require("../middleware/auth");
const securityScanController = require("../controllers/securityScan.controller");

// All routes require authentication
router.use(verifyAuth);

// ============== SCAN OPERATIONS ==============

// Start a full OWASP security scan
router.post("/scan/start/:suiteId", securityScanController.startScan);

// Get scan status and progress
router.get("/scan/:scanId/status", securityScanController.getScanStatus);

// Progress update endpoint (for direct updates from Python backend)
router.post("/progress/:scanId", securityScanController.updateProgress);

// Get scan findings
router.get("/scan/:scanId/findings", securityScanController.getScanFindings);

// Get scan summary
router.get("/scan/:scanId/summary", securityScanController.getScanSummary);

// Get scan history for a suite
router.get("/scan/history/:suiteId", securityScanController.getScanHistory);

// ============== FINDINGS ==============

// Update finding status (remediation, false positive, etc.)
router.patch("/finding/:findingId", securityScanController.updateFinding);

// ============== REPORTS ==============

// Get or generate report
router.get("/report/:scanId", securityScanController.getReport);

// ============== OWASP CATEGORIES ==============

// Get OWASP categories catalog
router.get("/owasp/categories", securityScanController.getOwaspCategories);

// ============== IDENTITY PROFILES ==============

// Create identity profile for BOLA testing
router.post("/identities/:suiteId", securityScanController.createIdentity);

// Get identity profiles for a suite
router.get("/identities/:suiteId", securityScanController.getIdentities);

// Update identity profile
router.patch("/identity/:profileId", securityScanController.updateIdentity);

// Delete identity profile
router.delete("/identity/:profileId", securityScanController.deleteIdentity);

// ============== SCAN TEMPLATES ==============

// Create scan template
router.post("/templates", securityScanController.createTemplate);

// Get scan templates
router.get("/templates", securityScanController.getTemplates);

module.exports = router;

