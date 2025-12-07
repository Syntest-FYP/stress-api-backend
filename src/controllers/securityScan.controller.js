const {
  startFullSecurityScan,
  getScanStatus,
  getScanFindings,
  getScanSummary,
  generateScanReport,
  getScanHistory,
  OWASP_CATEGORIES,
} = require("../services/securityScanService");

const {
  getSecurityScanById,
  updateFindingStatus,
  getFindingById,
  getReportById,
  getReportsByScan,
  incrementReportDownload,
  createIdentityProfile,
  getIdentityProfilesBySuite,
  updateIdentityProfile,
  deleteIdentityProfile,
  createScanTemplate,
  getScanTemplatesByUser,
  getScanTemplateById,
  updateScanProgress,
} = require("../models/securityScan.model");

const { getTestSuiteById } = require("../services/suitesService");
const { sendResponse, sendError } = require("../utils/response");

/**
 * Start a full OWASP security scan
 * POST /api/security/scan/start/:suiteId
 */
exports.startScan = async (req, res) => {
  try {
    const { suiteId } = req.params;
    const userId = req.user._id || req.user.id;
    const config = req.body || {};

    // Verify suite ownership
    const suite = await getTestSuiteById(userId, suiteId);
    if (!suite) {
      return sendError(res, 404, "Test suite not found or access denied");
    }

    const result = await startFullSecurityScan(userId, suiteId, config);
    return sendResponse(res, 202, "Security scan started", result);
  } catch (error) {
    console.error("[SECURITY_SCAN] Start error:", error);
    return sendError(res, 400, error.message || "Failed to start security scan");
  }
};

/**
 * Get scan status and progress
 * GET /api/security/scan/:scanId/status
 */
exports.getScanStatus = async (req, res) => {
  try {
    const { scanId } = req.params;
    const userId = req.user._id || req.user.id;

    // Verify scan ownership
    const scan = await getSecurityScanById(scanId);
    if (!scan) {
      return sendError(res, 404, "Scan not found");
    }
    if (scan.user_id.toString() !== userId.toString()) {
      return sendError(res, 403, "Access denied");
    }

    const status = await getScanStatus(scanId);
    return sendResponse(res, 200, "Scan status retrieved", status);
  } catch (error) {
    console.error("[SECURITY_SCAN] Status error:", error);
    return sendError(res, 500, error.message || "Failed to get scan status");
  }
};

/**
 * Update scan progress (called by Python backend)
 * POST /api/security-scan/progress/:scanId
 */
exports.updateProgress = async (req, res) => {
  try {
    const { scanId } = req.params;
    const { progress, scanned_endpoints, total_endpoints, current_scanner } = req.body;

    if (progress === undefined || scanned_endpoints === undefined || total_endpoints === undefined) {
      return sendError(res, 400, "Missing required fields: progress, scanned_endpoints, total_endpoints");
    }

    // Verify scan exists
    const scan = await getSecurityScanById(scanId);
    if (!scan) {
      return sendError(res, 404, "Scan not found");
    }

    // Update progress
    await updateScanProgress(scanId, scanned_endpoints, total_endpoints);

    return sendResponse(res, 200, "Progress updated", {
      scan_id: scanId,
      progress,
      scanned_endpoints,
      total_endpoints,
      current_scanner,
    });
  } catch (error) {
    console.error("[SECURITY_SCAN] Progress update error:", error);
    return sendError(res, 500, error.message || "Failed to update progress");
  }
};

/**
 * Get scan findings
 * GET /api/security/scan/:scanId/findings
 */
exports.getScanFindings = async (req, res) => {
  try {
    const { scanId } = req.params;
    const userId = req.user._id || req.user.id;
    const { severity, category, status: remediationStatus } = req.query;

    // Verify scan ownership
    const scan = await getSecurityScanById(scanId);
    if (!scan) {
      return sendError(res, 404, "Scan not found");
    }
    if (scan.user_id.toString() !== userId.toString()) {
      return sendError(res, 403, "Access denied");
    }

    const filters = {};
    if (severity) filters.severity = severity;
    if (category) filters.category = category;
    if (remediationStatus) filters.remediation_status = remediationStatus;

    const findings = await getScanFindings(scanId, filters);
    return sendResponse(res, 200, "Findings retrieved", {
      scan_id: scanId,
      total: findings.length,
      findings,
    });
  } catch (error) {
    console.error("[SECURITY_SCAN] Findings error:", error);
    return sendError(res, 500, error.message || "Failed to get findings");
  }
};

/**
 * Get scan summary
 * GET /api/security/scan/:scanId/summary
 */
exports.getScanSummary = async (req, res) => {
  try {
    const { scanId } = req.params;
    const userId = req.user._id || req.user.id;

    // Verify scan ownership
    const scan = await getSecurityScanById(scanId);
    if (!scan) {
      return sendError(res, 404, "Scan not found");
    }
    if (scan.user_id.toString() !== userId.toString()) {
      return sendError(res, 403, "Access denied");
    }

    const summary = await getScanSummary(scanId);
    return sendResponse(res, 200, "Summary retrieved", summary);
  } catch (error) {
    console.error("[SECURITY_SCAN] Summary error:", error);
    return sendError(res, 500, error.message || "Failed to get summary");
  }
};

/**
 * Get scan history for a suite
 * GET /api/security/scan/history/:suiteId
 */
exports.getScanHistory = async (req, res) => {
  try {
    const { suiteId } = req.params;
    const userId = req.user._id || req.user.id;
    const { limit = 20 } = req.query;

    // Verify suite ownership
    const suite = await getTestSuiteById(userId, suiteId);
    if (!suite) {
      return sendError(res, 404, "Test suite not found or access denied");
    }

    const history = await getScanHistory(suiteId, parseInt(limit));
    return sendResponse(res, 200, "Scan history retrieved", {
      suite_id: suiteId,
      scans: history,
    });
  } catch (error) {
    console.error("[SECURITY_SCAN] History error:", error);
    return sendError(res, 500, error.message || "Failed to get scan history");
  }
};

/**
 * Update finding status
 * PATCH /api/security/finding/:findingId
 */
exports.updateFinding = async (req, res) => {
  try {
    const { findingId } = req.params;
    const userId = req.user._id || req.user.id;
    const { remediation_status, remediation_notes, is_false_positive, false_positive_reason } =
      req.body;

    // Verify finding ownership through scan
    const finding = await getFindingById(findingId);
    if (!finding) {
      return sendError(res, 404, "Finding not found");
    }

    const scan = await getSecurityScanById(finding.scan_id);
    if (!scan || scan.user_id.toString() !== userId.toString()) {
      return sendError(res, 403, "Access denied");
    }

    const updated = await updateFindingStatus(findingId, {
      remediation_status,
      remediation_notes,
      is_false_positive,
      false_positive_reason,
      verified_by: userId,
    });

    return sendResponse(res, 200, "Finding updated", updated);
  } catch (error) {
    console.error("[SECURITY_SCAN] Update finding error:", error);
    return sendError(res, 500, error.message || "Failed to update finding");
  }
};

/**
 * Generate or get report
 * GET /api/security/report/:scanId
 */
exports.getReport = async (req, res) => {
  try {
    const { scanId } = req.params;
    const userId = req.user._id || req.user.id;
    const { type = "full", regenerate = false } = req.query;

    // Verify scan ownership
    const scan = await getSecurityScanById(scanId);
    if (!scan) {
      return sendError(res, 404, "Scan not found");
    }
    if (scan.user_id.toString() !== userId.toString()) {
      return sendError(res, 403, "Access denied");
    }

    if (scan.status !== "completed") {
      return sendError(res, 400, "Scan is not completed yet");
    }

    // Check for existing report
    const existingReports = await getReportsByScan(scanId);
    const existingReport = existingReports.find((r) => r.report_type === type);

    if (existingReport && !regenerate) {
      await incrementReportDownload(existingReport.id);
      return sendResponse(res, 200, "Report retrieved", existingReport);
    }

    // Generate new report
    const report = await generateScanReport(scanId, userId, type);
    return sendResponse(res, 200, "Report generated", report);
  } catch (error) {
    console.error("[SECURITY_SCAN] Report error:", error);
    return sendError(res, 500, error.message || "Failed to get report");
  }
};

/**
 * Get OWASP categories catalog
 * GET /api/security/owasp/categories
 */
exports.getOwaspCategories = async (req, res) => {
  try {
    const categories = Object.entries(OWASP_CATEGORIES).map(([id, data]) => ({
      id,
      name: data.name,
      supports_runtime_checks: data.runtime,
    }));
    return sendResponse(res, 200, "OWASP categories retrieved", { categories });
  } catch (error) {
    return sendError(res, 500, "Failed to get categories");
  }
};

// ============== IDENTITY PROFILES ==============

/**
 * Create identity profile
 * POST /api/security/identities/:suiteId
 */
exports.createIdentity = async (req, res) => {
  try {
    const { suiteId } = req.params;
    const userId = req.user._id || req.user.id;
    const { name, label, role_type, auth_headers, path_params, query_params, body_overrides } =
      req.body;

    // Verify suite ownership
    const suite = await getTestSuiteById(userId, suiteId);
    if (!suite) {
      return sendError(res, 404, "Test suite not found or access denied");
    }

    if (!name || !label || !role_type) {
      return sendError(res, 400, "name, label, and role_type are required");
    }

    const profile = await createIdentityProfile({
      user_id: userId,
      suite_id: suiteId,
      name,
      label,
      role_type,
      auth_headers: auth_headers || {},
      path_params: path_params || {},
      query_params: query_params || {},
      body_overrides: body_overrides || {},
    });

    return sendResponse(res, 201, "Identity profile created", profile);
  } catch (error) {
    console.error("[SECURITY_SCAN] Create identity error:", error);
    return sendError(res, 500, error.message || "Failed to create identity");
  }
};

/**
 * Get identity profiles for a suite
 * GET /api/security/identities/:suiteId
 */
exports.getIdentities = async (req, res) => {
  try {
    const { suiteId } = req.params;
    const userId = req.user._id || req.user.id;

    // Verify suite ownership
    const suite = await getTestSuiteById(userId, suiteId);
    if (!suite) {
      return sendError(res, 404, "Test suite not found or access denied");
    }

    const profiles = await getIdentityProfilesBySuite(suiteId);
    return sendResponse(res, 200, "Identity profiles retrieved", { profiles });
  } catch (error) {
    console.error("[SECURITY_SCAN] Get identities error:", error);
    return sendError(res, 500, error.message || "Failed to get identities");
  }
};

/**
 * Update identity profile
 * PATCH /api/security/identity/:profileId
 */
exports.updateIdentity = async (req, res) => {
  try {
    const { profileId } = req.params;
    const userId = req.user._id || req.user.id;

    const profile = await require("../models/securityScan.model").getIdentityProfileById(profileId);
    if (!profile) {
      return sendError(res, 404, "Identity profile not found");
    }

    // Verify ownership through suite
    const suite = await getTestSuiteById(userId, profile.suite_id);
    if (!suite) {
      return sendError(res, 403, "Access denied");
    }

    const updated = await updateIdentityProfile(profileId, req.body);
    return sendResponse(res, 200, "Identity profile updated", updated);
  } catch (error) {
    console.error("[SECURITY_SCAN] Update identity error:", error);
    return sendError(res, 500, error.message || "Failed to update identity");
  }
};

/**
 * Delete identity profile
 * DELETE /api/security/identity/:profileId
 */
exports.deleteIdentity = async (req, res) => {
  try {
    const { profileId } = req.params;
    const userId = req.user._id || req.user.id;

    const profile = await require("../models/securityScan.model").getIdentityProfileById(profileId);
    if (!profile) {
      return sendError(res, 404, "Identity profile not found");
    }

    // Verify ownership through suite
    const suite = await getTestSuiteById(userId, profile.suite_id);
    if (!suite) {
      return sendError(res, 403, "Access denied");
    }

    await deleteIdentityProfile(profileId);
    return sendResponse(res, 200, "Identity profile deleted");
  } catch (error) {
    console.error("[SECURITY_SCAN] Delete identity error:", error);
    return sendError(res, 500, error.message || "Failed to delete identity");
  }
};

// ============== SCAN TEMPLATES ==============

/**
 * Create scan template
 * POST /api/security/templates
 */
exports.createTemplate = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { name, description, scan_config, is_default, is_public } = req.body;

    if (!name || !scan_config) {
      return sendError(res, 400, "name and scan_config are required");
    }

    const template = await createScanTemplate({
      user_id: userId,
      name,
      description,
      scan_config,
      is_default: is_default || false,
      is_public: is_public || false,
    });

    return sendResponse(res, 201, "Scan template created", template);
  } catch (error) {
    console.error("[SECURITY_SCAN] Create template error:", error);
    return sendError(res, 500, error.message || "Failed to create template");
  }
};

/**
 * Get scan templates
 * GET /api/security/templates
 */
exports.getTemplates = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const templates = await getScanTemplatesByUser(userId);
    return sendResponse(res, 200, "Templates retrieved", { templates });
  } catch (error) {
    console.error("[SECURITY_SCAN] Get templates error:", error);
    return sendError(res, 500, error.message || "Failed to get templates");
  }
};

