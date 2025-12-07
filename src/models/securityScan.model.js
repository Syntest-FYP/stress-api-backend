const { pool } = require("../config");

// ============== SECURITY SCANS ==============

async function createSecurityScan(data) {
  const {
    user_id,
    suite_id,
    scan_type = "full_owasp",
    scan_config = {},
    total_endpoints = 0,
  } = data;

  const result = await pool.query(
    `INSERT INTO security_scans 
    (user_id, suite_id, scan_type, scan_config, total_endpoints, status)
    VALUES ($1, $2, $3, $4, $5, 'pending')
    RETURNING *`,
    [user_id, suite_id, scan_type, JSON.stringify(scan_config), total_endpoints]
  );
  return result.rows[0];
}

async function getSecurityScanById(scanId) {
  const result = await pool.query(
    `SELECT * FROM security_scans WHERE id = $1`,
    [scanId]
  );
  return result.rows[0];
}

async function getSecurityScansByUser(userId, limit = 50, offset = 0) {
  const result = await pool.query(
    `SELECT ss.*, ts.name as suite_name, ts.base_url
     FROM security_scans ss
     JOIN test_suites ts ON ss.suite_id = ts.id
     WHERE ss.user_id = $1
     ORDER BY ss.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
}

async function getSecurityScansBySuite(suiteId, limit = 20) {
  const result = await pool.query(
    `SELECT * FROM security_scans 
     WHERE suite_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [suiteId, limit]
  );
  return result.rows;
}

async function updateSecurityScanStatus(scanId, status, additionalData = {}) {
  const updates = ["status = $2", "updated_at = NOW()"];
  const values = [scanId, status];
  let paramIndex = 3;

  if (status === "running" && !additionalData.started_at) {
    updates.push(`started_at = NOW()`);
  }

  if (status === "completed" || status === "failed") {
    updates.push(`completed_at = NOW()`);
  }

  if (additionalData.progress !== undefined) {
    updates.push(`progress = $${paramIndex}`);
    values.push(additionalData.progress);
    paramIndex++;
  }

  if (additionalData.scanned_endpoints !== undefined) {
    updates.push(`scanned_endpoints = $${paramIndex}`);
    values.push(additionalData.scanned_endpoints);
    paramIndex++;
  }

  if (additionalData.error_message) {
    updates.push(`error_message = $${paramIndex}`);
    values.push(additionalData.error_message);
    paramIndex++;
  }

  if (additionalData.total_findings !== undefined) {
    updates.push(`total_findings = $${paramIndex}`);
    values.push(additionalData.total_findings);
    paramIndex++;
  }

  if (additionalData.critical_count !== undefined) {
    updates.push(`critical_count = $${paramIndex}`);
    values.push(additionalData.critical_count);
    paramIndex++;
  }

  if (additionalData.high_count !== undefined) {
    updates.push(`high_count = $${paramIndex}`);
    values.push(additionalData.high_count);
    paramIndex++;
  }

  if (additionalData.medium_count !== undefined) {
    updates.push(`medium_count = $${paramIndex}`);
    values.push(additionalData.medium_count);
    paramIndex++;
  }

  if (additionalData.low_count !== undefined) {
    updates.push(`low_count = $${paramIndex}`);
    values.push(additionalData.low_count);
    paramIndex++;
  }

  if (additionalData.info_count !== undefined) {
    updates.push(`info_count = $${paramIndex}`);
    values.push(additionalData.info_count);
    paramIndex++;
  }

  const result = await pool.query(
    `UPDATE security_scans SET ${updates.join(", ")} WHERE id = $1 RETURNING *`,
    values
  );
  return result.rows[0];
}

async function updateScanProgress(scanId, scannedEndpoints, totalEndpoints) {
  const progress = Math.round((scannedEndpoints / totalEndpoints) * 100);
  const result = await pool.query(
    `UPDATE security_scans 
     SET scanned_endpoints = $2, progress = $3, updated_at = NOW()
     WHERE id = $1 
     RETURNING *`,
    [scanId, scannedEndpoints, progress]
  );
  return result.rows[0];
}

async function deleteSecurityScan(scanId) {
  const result = await pool.query(
    `DELETE FROM security_scans WHERE id = $1 RETURNING *`,
    [scanId]
  );
  return result.rows[0];
}

// ============== SECURITY FINDINGS ==============

async function createSecurityFinding(data) {
  const {
    scan_id,
    endpoint_id,
    endpoint_path,
    endpoint_method,
    category,
    category_name,
    severity,
    title,
    description,
    evidence = {},
    recommendation,
    cwe_id,
    cvss_score,
  } = data;

  const result = await pool.query(
    `INSERT INTO security_findings 
    (scan_id, endpoint_id, endpoint_path, endpoint_method, category, category_name, 
     severity, title, description, evidence, recommendation, cwe_id, cvss_score)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      scan_id,
      endpoint_id,
      endpoint_path,
      endpoint_method,
      category,
      category_name,
      severity,
      title,
      description,
      JSON.stringify(evidence),
      recommendation,
      cwe_id,
      cvss_score,
    ]
  );
  return result.rows[0];
}

async function createBulkFindings(findings) {
  if (!findings || findings.length === 0) return [];

  const values = [];
  const placeholders = [];
  let paramIndex = 1;

  for (const finding of findings) {
    placeholders.push(
      `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 
        $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, 
        $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11}, $${paramIndex + 12})`
    );
    values.push(
      finding.scan_id,
      finding.endpoint_id || null,
      finding.endpoint_path || null,
      finding.endpoint_method || null,
      finding.category,
      finding.category_name || null,
      finding.severity,
      finding.title,
      finding.description || null,
      JSON.stringify(finding.evidence || {}),
      finding.recommendation || null,
      finding.cwe_id || null,
      finding.cvss_score || null
    );
    paramIndex += 13;
  }

  const result = await pool.query(
    `INSERT INTO security_findings 
    (scan_id, endpoint_id, endpoint_path, endpoint_method, category, category_name,
     severity, title, description, evidence, recommendation, cwe_id, cvss_score)
    VALUES ${placeholders.join(", ")}
    RETURNING *`,
    values
  );
  return result.rows;
}

async function getFindingsByScan(scanId, filters = {}) {
  let query = `SELECT * FROM security_findings WHERE scan_id = $1`;
  const values = [scanId];
  let paramIndex = 2;

  if (filters.severity) {
    query += ` AND severity = $${paramIndex}`;
    values.push(filters.severity);
    paramIndex++;
  }

  if (filters.category) {
    query += ` AND category = $${paramIndex}`;
    values.push(filters.category);
    paramIndex++;
  }

  if (filters.remediation_status) {
    query += ` AND remediation_status = $${paramIndex}`;
    values.push(filters.remediation_status);
    paramIndex++;
  }

  if (filters.is_false_positive !== undefined) {
    query += ` AND is_false_positive = $${paramIndex}`;
    values.push(filters.is_false_positive);
    paramIndex++;
  }

  query += ` ORDER BY 
    CASE severity 
      WHEN 'critical' THEN 1 
      WHEN 'high' THEN 2 
      WHEN 'medium' THEN 3 
      WHEN 'low' THEN 4 
      WHEN 'info' THEN 5 
    END, created_at DESC`;

  const result = await pool.query(query, values);
  return result.rows;
}

async function getFindingById(findingId) {
  const result = await pool.query(
    `SELECT * FROM security_findings WHERE id = $1`,
    [findingId]
  );
  return result.rows[0];
}

async function updateFindingStatus(findingId, data) {
  const updates = [];
  const values = [findingId];
  let paramIndex = 2;

  if (data.remediation_status) {
    updates.push(`remediation_status = $${paramIndex}`);
    values.push(data.remediation_status);
    paramIndex++;
  }

  if (data.remediation_notes !== undefined) {
    updates.push(`remediation_notes = $${paramIndex}`);
    values.push(data.remediation_notes);
    paramIndex++;
  }

  if (data.is_false_positive !== undefined) {
    updates.push(`is_false_positive = $${paramIndex}`);
    values.push(data.is_false_positive);
    paramIndex++;
  }

  if (data.false_positive_reason !== undefined) {
    updates.push(`false_positive_reason = $${paramIndex}`);
    values.push(data.false_positive_reason);
    paramIndex++;
  }

  if (data.verified_by) {
    updates.push(`verified_by = $${paramIndex}`);
    updates.push(`verified_at = NOW()`);
    values.push(data.verified_by);
    paramIndex++;
  }

  if (updates.length === 0) return null;

  const result = await pool.query(
    `UPDATE security_findings SET ${updates.join(", ")} WHERE id = $1 RETURNING *`,
    values
  );
  return result.rows[0];
}

async function getFindingsCountBySeverity(scanId) {
  const result = await pool.query(
    `SELECT severity, COUNT(*) as count 
     FROM security_findings 
     WHERE scan_id = $1 AND is_false_positive = false
     GROUP BY severity`,
    [scanId]
  );
  return result.rows;
}

async function getFindingsCountByCategory(scanId) {
  const result = await pool.query(
    `SELECT category, category_name, COUNT(*) as count 
     FROM security_findings 
     WHERE scan_id = $1 AND is_false_positive = false
     GROUP BY category, category_name
     ORDER BY count DESC`,
    [scanId]
  );
  return result.rows;
}

// ============== SECURITY REPORTS ==============

async function createSecurityReport(data) {
  const {
    scan_id,
    user_id,
    report_type = "full",
    format = "json",
    title,
    content,
    file_path,
    file_size,
    expires_at,
  } = data;

  const result = await pool.query(
    `INSERT INTO security_reports 
    (scan_id, user_id, report_type, format, title, content, file_path, file_size, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      scan_id,
      user_id,
      report_type,
      format,
      title,
      content ? JSON.stringify(content) : null,
      file_path,
      file_size,
      expires_at,
    ]
  );
  return result.rows[0];
}

async function getReportsByScan(scanId) {
  const result = await pool.query(
    `SELECT * FROM security_reports WHERE scan_id = $1 ORDER BY created_at DESC`,
    [scanId]
  );
  return result.rows;
}

async function getReportById(reportId) {
  const result = await pool.query(
    `SELECT * FROM security_reports WHERE id = $1`,
    [reportId]
  );
  return result.rows[0];
}

async function incrementReportDownload(reportId) {
  const result = await pool.query(
    `UPDATE security_reports 
     SET download_count = download_count + 1 
     WHERE id = $1 
     RETURNING *`,
    [reportId]
  );
  return result.rows[0];
}

// ============== IDENTITY PROFILES ==============

async function createIdentityProfile(data) {
  const {
    user_id,
    suite_id,
    name,
    label,
    role_type,
    auth_headers = {},
    path_params = {},
    query_params = {},
    body_overrides = {},
  } = data;

  const result = await pool.query(
    `INSERT INTO identity_profiles 
    (user_id, suite_id, name, label, role_type, auth_headers, path_params, query_params, body_overrides)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      user_id,
      suite_id,
      name,
      label,
      role_type,
      JSON.stringify(auth_headers),
      JSON.stringify(path_params),
      JSON.stringify(query_params),
      JSON.stringify(body_overrides),
    ]
  );
  return result.rows[0];
}

async function getIdentityProfilesBySuite(suiteId) {
  const result = await pool.query(
    `SELECT * FROM identity_profiles 
     WHERE suite_id = $1 AND is_active = true 
     ORDER BY role_type, name`,
    [suiteId]
  );
  return result.rows;
}

async function getIdentityProfileById(profileId) {
  const result = await pool.query(
    `SELECT * FROM identity_profiles WHERE id = $1`,
    [profileId]
  );
  return result.rows[0];
}

async function updateIdentityProfile(profileId, data) {
  const updates = [];
  const values = [profileId];
  let paramIndex = 2;

  const allowedFields = [
    "name",
    "label",
    "role_type",
    "auth_headers",
    "path_params",
    "query_params",
    "body_overrides",
    "is_active",
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${paramIndex}`);
      values.push(
        typeof data[field] === "object"
          ? JSON.stringify(data[field])
          : data[field]
      );
      paramIndex++;
    }
  }

  if (updates.length === 0) return null;

  const result = await pool.query(
    `UPDATE identity_profiles SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    values
  );
  return result.rows[0];
}

async function deleteIdentityProfile(profileId) {
  const result = await pool.query(
    `DELETE FROM identity_profiles WHERE id = $1 RETURNING *`,
    [profileId]
  );
  return result.rows[0];
}

// ============== SCAN TEMPLATES ==============

async function createScanTemplate(data) {
  const {
    user_id,
    name,
    description,
    scan_config,
    is_default = false,
    is_public = false,
  } = data;

  const result = await pool.query(
    `INSERT INTO scan_templates 
    (user_id, name, description, scan_config, is_default, is_public)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [user_id, name, description, JSON.stringify(scan_config), is_default, is_public]
  );
  return result.rows[0];
}

async function getScanTemplatesByUser(userId) {
  const result = await pool.query(
    `SELECT * FROM scan_templates 
     WHERE user_id = $1 OR is_public = true 
     ORDER BY is_default DESC, usage_count DESC, name`,
    [userId]
  );
  return result.rows;
}

async function getScanTemplateById(templateId) {
  const result = await pool.query(
    `SELECT * FROM scan_templates WHERE id = $1`,
    [templateId]
  );
  return result.rows[0];
}

async function incrementTemplateUsage(templateId) {
  const result = await pool.query(
    `UPDATE scan_templates 
     SET usage_count = usage_count + 1 
     WHERE id = $1 
     RETURNING *`,
    [templateId]
  );
  return result.rows[0];
}

module.exports = {
  // Scans
  createSecurityScan,
  getSecurityScanById,
  getSecurityScansByUser,
  getSecurityScansBySuite,
  updateSecurityScanStatus,
  updateScanProgress,
  deleteSecurityScan,
  // Findings
  createSecurityFinding,
  createBulkFindings,
  getFindingsByScan,
  getFindingById,
  updateFindingStatus,
  getFindingsCountBySeverity,
  getFindingsCountByCategory,
  // Reports
  createSecurityReport,
  getReportsByScan,
  getReportById,
  incrementReportDownload,
  // Identity Profiles
  createIdentityProfile,
  getIdentityProfilesBySuite,
  getIdentityProfileById,
  updateIdentityProfile,
  deleteIdentityProfile,
  // Scan Templates
  createScanTemplate,
  getScanTemplatesByUser,
  getScanTemplateById,
  incrementTemplateUsage,
};

