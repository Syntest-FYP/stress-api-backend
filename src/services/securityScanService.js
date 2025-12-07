const axios = require("axios");
const redis = require("redis");
const {
  createSecurityScan,
  getSecurityScanById,
  getSecurityScansBySuite,
  updateSecurityScanStatus,
  updateScanProgress,
  createBulkFindings,
  getFindingsByScan,
  getFindingsCountBySeverity,
  getFindingsCountByCategory,
  createSecurityReport,
  getIdentityProfilesBySuite,
} = require("../models/securityScan.model");
const { getTestSuiteById } = require("./suitesService");
const EndpointCollection = require("../models/Endpoint");

const PYTHON_BACKEND_URL = process.env.AI_BACKEND_URL || "http://localhost:8000";

// Redis client for progress tracking
let redisClient = null;
let redisSubscriber = null;
const progressSubscribers = new Map(); // scanId -> subscriber instance

/**
 * Initialize Redis client for progress tracking
 */
async function initRedisClient() {
  if (!redisClient) {
    try {
      redisClient = redis.createClient({
        socket: {
          host: process.env.REDIS_HOST || "localhost",
          port: parseInt(process.env.REDIS_PORT || "6380"),  // Changed to 6380 to match docker-compose
        },
        password: process.env.REDIS_PASSWORD || "sllgVD@",  // Default password from docker-compose
      });

      redisClient.on("error", (err) => {
        console.error("[REDIS] Client error:", err);
      });

      await redisClient.connect();
      console.log("[REDIS] Connected for progress tracking");
    } catch (err) {
      console.error("[REDIS] Failed to connect:", err.message);
      redisClient = null;
    }
  }
  return redisClient;
}

/**
 * Subscribe to progress updates for a scan
 */
async function subscribeToProgress(scanId) {
  try {
    const client = await initRedisClient();
    if (!client) {
      console.log(`[PROGRESS] Redis not available, skipping subscription for ${scanId}`);
      return;
    }

    // Create a dedicated subscriber client
    const subscriber = client.duplicate();
    await subscriber.connect();

    let lastUpdateTime = Date.now();
    let lastProgress = -1; // Start at -1 to ensure first update is always sent
    const UPDATE_INTERVAL = 1000; // Update DB every 1 second max (reduced from 2)
    const PROGRESS_THRESHOLD = 2; // Update if progress changed by 2% (reduced from 5)

    await subscriber.subscribe(`scan:progress:${scanId}`, (message) => {
      try {
        const progressData = JSON.parse(message);
        const now = Date.now();
        const progressDelta = Math.abs(progressData.progress - lastProgress);

        // Always update on first message (lastProgress = -1) or if progress is 0% or 100%
        // Batch updates: Only update DB if:
        // 1. First update (lastProgress = -1), OR
        // 2. Progress is 0% or 100% (boundary values), OR
        // 3. Progress changed by threshold, OR
        // 4. Enough time has passed (1 second)
        const isBoundary = progressData.progress === 0 || progressData.progress === 100;
        const shouldUpdate =
          lastProgress === -1 ||
          isBoundary ||
          progressDelta >= PROGRESS_THRESHOLD ||
          (now - lastUpdateTime) >= UPDATE_INTERVAL;

        if (shouldUpdate) {
          updateScanProgress(
            scanId,
            progressData.scanned_endpoints,
            progressData.total_endpoints
          )
            .then(() => {
              console.log(
                `[PROGRESS] Updated scan ${scanId}: ${progressData.progress}% (${progressData.scanned_endpoints}/${progressData.total_endpoints} endpoints)`
              );
            })
            .catch((err) => {
              console.error(
                `[PROGRESS] Failed to update progress for ${scanId}:`,
                err.message
              );
            });

          lastUpdateTime = now;
          lastProgress = progressData.progress;
        }
      } catch (err) {
        console.error(`[PROGRESS] Error processing progress update:`, err);
      }
    });

    progressSubscribers.set(scanId, subscriber);
    console.log(
      `[PROGRESS] Subscribed to progress updates for scan ${scanId}`
    );

    // Cleanup after scan completes (timeout after 15 minutes)
    setTimeout(async () => {
      try {
        const sub = progressSubscribers.get(scanId);
        if (sub) {
          await sub.unsubscribe(`scan:progress:${scanId}`);
          await sub.quit();
          progressSubscribers.delete(scanId);
          console.log(`[PROGRESS] Unsubscribed from scan ${scanId}`);
        }
      } catch (err) {
        console.error(`[PROGRESS] Error unsubscribing:`, err);
      }
    }, 15 * 60 * 1000);
  } catch (err) {
    console.error(`[PROGRESS] Failed to subscribe to progress:`, err.message);
  }
}

/**
 * Unsubscribe from progress updates
 */
async function unsubscribeFromProgress(scanId) {
  try {
    const subscriber = progressSubscribers.get(scanId);
    if (subscriber) {
      await subscriber.unsubscribe(`scan:progress:${scanId}`);
      await subscriber.quit();
      progressSubscribers.delete(scanId);
      console.log(`[PROGRESS] Unsubscribed from scan ${scanId}`);
    }
  } catch (err) {
    console.error(`[PROGRESS] Error unsubscribing:`, err.message);
  }
}

// OWASP Top 10 2021 Categories
const OWASP_CATEGORIES = {
  "A01:2021": { name: "Broken Access Control", runtime: true },
  "A02:2021": { name: "Cryptographic Failures", runtime: false },
  "A03:2021": { name: "Injection", runtime: true },
  "A04:2021": { name: "Insecure Design", runtime: false },
  "A05:2021": { name: "Security Misconfiguration", runtime: false },
  "A06:2021": { name: "Vulnerable and Outdated Components", runtime: false },
  "A07:2021": { name: "Identification and Authentication Failures", runtime: true },
  "A08:2021": { name: "Software and Data Integrity Failures", runtime: false },
  "A09:2021": { name: "Security Logging and Monitoring Failures", runtime: false },
  "A10:2021": { name: "Server-Side Request Forgery", runtime: true },
};

/**
 * Start a full OWASP security scan for a test suite
 */
async function startFullSecurityScan(userId, suiteId, config = {}) {
  // Get suite details
  const suite = await getTestSuiteById(userId, suiteId);
  if (!suite) {
    throw new Error("Test suite not found");
  }

  // Get endpoints from MongoDB
  const endpointCollection = await EndpointCollection.findOne({
    user_id: userId.toString(),
    suite_id: suiteId,
  });

  if (!endpointCollection || !endpointCollection.endpoints.length) {
    throw new Error("No endpoints found for this suite. Please upload an OpenAPI spec first.");
  }

  const activeEndpoints = endpointCollection.endpoints.filter((ep) => ep.is_active);
  if (activeEndpoints.length === 0) {
    throw new Error("No active endpoints to scan");
  }

  // Get identity profiles if available
  const identityProfiles = await getIdentityProfilesBySuite(suiteId);

  // Create scan record
  const scanConfig = {
    categories: config.categories || Object.keys(OWASP_CATEGORIES),
    scan_mode: config.scan_mode || "full", // full, quick, custom
    timeout_seconds: config.timeout_seconds || 30,
    try_unauthenticated: config.try_unauthenticated !== false,
    auto_discover_ids: config.auto_discover_ids !== false,
    enable_mass_assignment: config.enable_mass_assignment !== false,
    enable_method_abuse: config.enable_method_abuse !== false,
    enable_injection_tests: config.enable_injection_tests !== false,
    max_concurrent_requests: config.max_concurrent_requests || 5,
    identity_profiles: identityProfiles.map((p) => ({
      id: p.id,
      label: p.label,
      role_type: p.role_type,
      auth_headers: p.auth_headers,
      path_params: p.path_params,
      query_params: p.query_params,
      body_overrides: p.body_overrides,
    })),
  };

  const scan = await createSecurityScan({
    user_id: userId,
    suite_id: suiteId,
    scan_type: config.scan_mode || "full_owasp",
    scan_config: scanConfig,
    total_endpoints: activeEndpoints.length,
  });

  // Start the scan asynchronously
  runSecurityScanAsync(scan.id, suite, activeEndpoints, scanConfig).catch((err) => {
    console.error(`[SECURITY_SCAN] Scan ${scan.id} failed:`, err);
    updateSecurityScanStatus(scan.id, "failed", {
      error_message: err.message || "Unknown error occurred",
    });
  });

  return {
    scan_id: scan.id,
    status: "pending",
    total_endpoints: activeEndpoints.length,
    message: "Security scan started. Poll the status endpoint for progress.",
  };
}

/**
 * Run the security scan asynchronously
 */
async function runSecurityScanAsync(scanId, suite, endpoints, config) {
  console.log(`[SECURITY_SCAN] Starting scan ${scanId} for suite ${suite.id}`);

  // Update status to running
  await updateSecurityScanStatus(scanId, "running");

  // Subscribe to progress updates BEFORE starting scan
  await subscribeToProgress(scanId);

  const allFindings = [];
  let scannedCount = 0;

  // Transform endpoints for the Python backend
  const transformedEndpoints = endpoints.map((ep) => ({
    endpoint_id: ep._id?.toString() || ep.id,
    name: ep.name || `${ep.method} ${ep.path}`,
    method: ep.method,
    path: ep.path,
    base_url: ep.base_url || suite.base_url,
    headers: ep.headers || {},
    query_params: ep.query_params || {},
    body: ep.body || null,
    auth_type: ep.auth_type || suite.auth_type,
  }));

  // Load the OpenAPI spec if available
  let spec = null;
  try {
    const specPath = `uploads/${suite.user_id}/${suite.id}`;
    const fs = require("fs");
    const path = require("path");
    const specDir = path.join(process.cwd(), specPath);
    
    if (fs.existsSync(specDir)) {
      const files = fs.readdirSync(specDir);
      const specFile = files.find(
        (f) => f.endsWith(".json") || f.endsWith(".yaml") || f.endsWith(".yml")
      );
      if (specFile) {
        const content = fs.readFileSync(path.join(specDir, specFile), "utf-8");
        spec = specFile.endsWith(".json")
          ? JSON.parse(content)
          : require("yaml").parse(content);
      }
    }
  } catch (err) {
    console.log(`[SECURITY_SCAN] Could not load spec file: ${err.message}`);
  }

  try {
    // Call Python backend for full OWASP scan
    const response = await axios.post(
      `${PYTHON_BACKEND_URL}/security/full-scan`,
      {
        scan_id: scanId,
        base_url: suite.base_url,
        endpoints: transformedEndpoints,
        spec: spec,
        config: config,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: config.timeout_seconds * endpoints.length * 1000 + 60000, // Dynamic timeout
      }
    );

    const scanResult = response.data;

    // Process findings
    if (scanResult.findings && scanResult.findings.length > 0) {
      const findingsToInsert = scanResult.findings.map((f) => ({
        scan_id: scanId,
        endpoint_id: f.endpoint_id,
        endpoint_path: f.endpoint_path,
        endpoint_method: f.endpoint_method,
        category: f.category,
        category_name: OWASP_CATEGORIES[f.category]?.name || f.category_name,
        severity: f.severity,
        title: f.title,
        description: f.description,
        evidence: f.evidence || {},
        recommendation: f.recommendation,
        cwe_id: f.cwe_id,
        cvss_score: f.cvss_score,
      }));

      await createBulkFindings(findingsToInsert);
      allFindings.push(...findingsToInsert);
    }

    // Count findings by severity
    const severityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    for (const finding of allFindings) {
      if (severityCounts[finding.severity] !== undefined) {
        severityCounts[finding.severity]++;
      }
    }

    // Update scan status to completed
    await updateSecurityScanStatus(scanId, "completed", {
      scanned_endpoints: scanResult.endpoints_scanned || endpoints.length,
      progress: 100,
      total_findings: allFindings.length,
      critical_count: severityCounts.critical,
      high_count: severityCounts.high,
      medium_count: severityCounts.medium,
      low_count: severityCounts.low,
      info_count: severityCounts.info,
    });

    // Unsubscribe from progress updates
    await unsubscribeFromProgress(scanId);

    console.log(
      `[SECURITY_SCAN] Scan ${scanId} completed. Found ${allFindings.length} vulnerabilities.`
    );

    // Auto-generate report
    await generateScanReport(scanId, suite.user_id);

    return {
      scan_id: scanId,
      status: "completed",
      findings_count: allFindings.length,
      severity_counts: severityCounts,
    };
  } catch (error) {
    console.error(`[SECURITY_SCAN] Error during scan ${scanId}:`, error.message);
    
    // Unsubscribe from progress updates on error
    await unsubscribeFromProgress(scanId);
    
    await updateSecurityScanStatus(scanId, "failed", {
      error_message: error.response?.data?.detail || error.message,
    });
    
    throw error;
  }
}

/**
 * Get scan status and progress
 */
async function getScanStatus(scanId) {
  const scan = await getSecurityScanById(scanId);
  if (!scan) {
    throw new Error("Scan not found");
  }

  const response = {
    scan_id: scan.id,
    status: scan.status,
    progress: scan.progress,
    total_endpoints: scan.total_endpoints,
    scanned_endpoints: scan.scanned_endpoints,
    total_findings: scan.total_findings,
    severity_counts: {
      critical: scan.critical_count,
      high: scan.high_count,
      medium: scan.medium_count,
      low: scan.low_count,
      info: scan.info_count,
    },
    started_at: scan.started_at,
    completed_at: scan.completed_at,
    error_message: scan.error_message,
  };

  return response;
}

/**
 * Get scan findings with optional filters
 */
async function getScanFindings(scanId, filters = {}) {
  const findings = await getFindingsByScan(scanId, filters);
  return findings;
}

/**
 * Get scan summary statistics
 */
async function getScanSummary(scanId) {
  const scan = await getSecurityScanById(scanId);
  if (!scan) {
    throw new Error("Scan not found");
  }

  const severityCounts = await getFindingsCountBySeverity(scanId);
  const categoryCounts = await getFindingsCountByCategory(scanId);

  return {
    scan_id: scanId,
    status: scan.status,
    total_endpoints: scan.total_endpoints,
    scanned_endpoints: scan.scanned_endpoints,
    total_findings: scan.total_findings,
    severity_breakdown: severityCounts.reduce((acc, row) => {
      acc[row.severity] = parseInt(row.count);
      return acc;
    }, {}),
    category_breakdown: categoryCounts.map((row) => ({
      category: row.category,
      name: row.category_name,
      count: parseInt(row.count),
    })),
    risk_score: calculateRiskScore(scan),
    started_at: scan.started_at,
    completed_at: scan.completed_at,
    duration_seconds: scan.completed_at && scan.started_at
      ? Math.round((new Date(scan.completed_at) - new Date(scan.started_at)) / 1000)
      : null,
  };
}

/**
 * Calculate overall risk score (0-100)
 */
function calculateRiskScore(scan) {
  const weights = {
    critical: 40,
    high: 25,
    medium: 10,
    low: 3,
    info: 1,
  };

  const maxScore = 100;
  let score =
    (scan.critical_count || 0) * weights.critical +
    (scan.high_count || 0) * weights.high +
    (scan.medium_count || 0) * weights.medium +
    (scan.low_count || 0) * weights.low +
    (scan.info_count || 0) * weights.info;

  // Normalize to 0-100
  score = Math.min(score, maxScore);
  return score;
}

/**
 * Generate a vulnerability report for a scan
 */
async function generateScanReport(scanId, userId, reportType = "full") {
  const scan = await getSecurityScanById(scanId);
  if (!scan) {
    throw new Error("Scan not found");
  }

  const findings = await getFindingsByScan(scanId);
  const summary = await getScanSummary(scanId);

  const reportContent = {
    report_metadata: {
      generated_at: new Date().toISOString(),
      scan_id: scanId,
      report_type: reportType,
      generator_version: "1.0.0",
    },
    executive_summary: {
      total_vulnerabilities: summary.total_findings,
      risk_score: summary.risk_score,
      risk_level: getRiskLevel(summary.risk_score),
      severity_breakdown: summary.severity_breakdown,
      top_categories: summary.category_breakdown.slice(0, 5),
      scan_duration: summary.duration_seconds,
      endpoints_tested: summary.scanned_endpoints,
    },
    findings_by_severity: {
      critical: findings.filter((f) => f.severity === "critical"),
      high: findings.filter((f) => f.severity === "high"),
      medium: findings.filter((f) => f.severity === "medium"),
      low: findings.filter((f) => f.severity === "low"),
      info: findings.filter((f) => f.severity === "info"),
    },
    findings_by_category: groupFindingsByCategory(findings),
    detailed_findings: findings.map((f) => ({
      id: f.id,
      severity: f.severity,
      category: f.category,
      category_name: f.category_name,
      title: f.title,
      description: f.description,
      endpoint: {
        method: f.endpoint_method,
        path: f.endpoint_path,
      },
      evidence: f.evidence,
      recommendation: f.recommendation,
      cwe_id: f.cwe_id,
      cvss_score: f.cvss_score,
      remediation_status: f.remediation_status,
    })),
    recommendations: generateRecommendations(findings),
    compliance_mapping: mapToCompliance(findings),
  };

  const report = await createSecurityReport({
    scan_id: scanId,
    user_id: userId,
    report_type: reportType,
    format: "json",
    title: `Security Scan Report - ${new Date().toISOString().split("T")[0]}`,
    content: reportContent,
  });

  return report;
}

function getRiskLevel(score) {
  if (score >= 70) return "Critical";
  if (score >= 40) return "High";
  if (score >= 20) return "Medium";
  if (score >= 5) return "Low";
  return "Minimal";
}

function groupFindingsByCategory(findings) {
  const grouped = {};
  for (const finding of findings) {
    if (!grouped[finding.category]) {
      grouped[finding.category] = {
        category: finding.category,
        name: finding.category_name,
        findings: [],
      };
    }
    grouped[finding.category].findings.push(finding);
  }
  return Object.values(grouped);
}

function generateRecommendations(findings) {
  const recommendations = [];
  const categories = new Set(findings.map((f) => f.category));

  if (categories.has("A01:2021")) {
    recommendations.push({
      priority: "critical",
      category: "A01:2021",
      title: "Implement Proper Access Controls",
      description:
        "Review and enforce authorization checks on all endpoints. Implement role-based access control (RBAC) and ensure users can only access their own resources.",
      actions: [
        "Audit all endpoints for proper ownership verification",
        "Implement middleware for consistent authorization checks",
        "Use indirect object references instead of direct database IDs",
        "Add comprehensive logging for access control decisions",
      ],
    });
  }

  if (categories.has("A03:2021")) {
    recommendations.push({
      priority: "high",
      category: "A03:2021",
      title: "Prevent Injection Attacks",
      description:
        "Sanitize and validate all user inputs. Use parameterized queries and prepared statements.",
      actions: [
        "Use ORM or parameterized queries for all database operations",
        "Implement input validation on both client and server side",
        "Encode outputs to prevent XSS",
        "Use allowlists for input validation where possible",
      ],
    });
  }

  if (categories.has("A07:2021")) {
    recommendations.push({
      priority: "high",
      category: "A07:2021",
      title: "Strengthen Authentication",
      description:
        "Implement strong authentication mechanisms and protect against credential attacks.",
      actions: [
        "Implement rate limiting on authentication endpoints",
        "Use strong password policies",
        "Implement multi-factor authentication",
        "Use secure session management",
      ],
    });
  }

  if (categories.has("A02:2021")) {
    recommendations.push({
      priority: "medium",
      category: "A02:2021",
      title: "Fix Cryptographic Issues",
      description:
        "Ensure proper encryption for data in transit and at rest.",
      actions: [
        "Enforce HTTPS for all endpoints",
        "Use strong TLS configurations",
        "Encrypt sensitive data at rest",
        "Never expose sensitive data in logs or responses",
      ],
    });
  }

  return recommendations;
}

function mapToCompliance(findings) {
  return {
    owasp_top_10: {
      standard: "OWASP Top 10 2021",
      coverage: Object.keys(OWASP_CATEGORIES).map((cat) => ({
        category: cat,
        name: OWASP_CATEGORIES[cat].name,
        findings_count: findings.filter((f) => f.category === cat).length,
        status: findings.filter((f) => f.category === cat).length > 0 ? "FAIL" : "PASS",
      })),
    },
    pci_dss: {
      standard: "PCI DSS v4.0",
      relevant_requirements: [
        { req: "6.2", description: "Secure coding practices", affected: findings.filter((f) => ["A03:2021", "A01:2021"].includes(f.category)).length > 0 },
        { req: "6.4", description: "Security testing", affected: false },
        { req: "8.3", description: "Strong authentication", affected: findings.filter((f) => f.category === "A07:2021").length > 0 },
      ],
    },
  };
}

/**
 * Get scan history for a suite
 */
async function getScanHistory(suiteId, limit = 20) {
  const scans = await getSecurityScansBySuite(suiteId, limit);
  return scans.map((scan) => ({
    scan_id: scan.id,
    status: scan.status,
    scan_type: scan.scan_type,
    total_endpoints: scan.total_endpoints,
    total_findings: scan.total_findings,
    severity_counts: {
      critical: scan.critical_count,
      high: scan.high_count,
      medium: scan.medium_count,
      low: scan.low_count,
      info: scan.info_count,
    },
    risk_score: calculateRiskScore(scan),
    started_at: scan.started_at,
    completed_at: scan.completed_at,
    created_at: scan.created_at,
  }));
}

module.exports = {
  startFullSecurityScan,
  getScanStatus,
  getScanFindings,
  getScanSummary,
  generateScanReport,
  getScanHistory,
  OWASP_CATEGORIES,
};

