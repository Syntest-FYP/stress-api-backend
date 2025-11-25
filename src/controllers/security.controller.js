const axios = require("axios");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const EndpointCollection = require("../models/Endpoint");
const { normalizeQueryParams } = require("../utils/queryParamNormalizer");

const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

const SPEC_FILE_CANDIDATES = ["spec.json", "spec.yaml", "spec.yml"];

function loadSuiteSpec(userId, suiteId) {
  if (!userId || !suiteId) {
    return null;
  }

  const suiteDir = path.join(process.cwd(), "uploads", userId, suiteId);
  if (!fs.existsSync(suiteDir)) {
    return null;
  }

  for (const fileName of SPEC_FILE_CANDIDATES) {
    const candidatePath = path.join(suiteDir, fileName);
    if (!fs.existsSync(candidatePath)) continue;

    try {
      const raw = fs.readFileSync(candidatePath, "utf8");
      const ext = path.extname(fileName).toLowerCase();
      if (ext === ".json") {
        return JSON.parse(raw);
      }
      return yaml.load(raw);
    } catch (err) {
      console.error("Failed to parse spec file:", err.message);
      return null;
    }
  }

  return null;
}

function serializeEndpoint(endpointDoc) {
  const endpoint = endpointDoc.toObject ? endpointDoc.toObject() : endpointDoc;
  const queryParams =
    normalizeQueryParams(endpoint.query_params || endpoint.parameters || {});

  return {
    endpoint_id: endpoint._id?.toString(),
    name: endpoint.name || `${endpoint.method} ${endpoint.path}`,
    method: endpoint.method,
    path: endpoint.path,
    base_url: endpoint.base_url || null,
    description: endpoint.description || null,
    headers: endpoint.headers || {},
    query_params: queryParams,
    body: endpoint.body || null,
    auth_type: endpoint.auth_type || null,
  };
}

exports.getOwaspCatalog = async (req, res) => {
  try {
    const response = await axios.get(
      `${PYTHON_BACKEND_URL}/security/owasp/top10`,
      { timeout: 15000 }
    );
    return res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    const status = error?.response?.status || 500;
    const message =
      error?.response?.data?.detail || "Failed to fetch OWASP catalog";
    return res.status(status).json({ success: false, message });
  }
};

exports.scanEndpointAgainstOwasp = async (req, res) => {
  try {
    const userId = (req.user && (req.user._id || req.user.id))?.toString();
    const {
      suiteId,
      endpointId,
      categories,
      ownerIdentity,
      attackerIdentity,
      adminIdentity,
      tryUnauthenticated = true,
      timeoutSeconds,
      autoDiscoverIds,
      enableMassAssignment,
      enableMethodAbuse,
    } = req.body || {};

    if (!suiteId || !endpointId || !Array.isArray(categories) || !categories.length) {
      return res.status(400).json({
        success: false,
        message: "suiteId, endpointId, and at least one OWASP category are required",
      });
    }

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const collection = await EndpointCollection.findOne({
      user_id: userId,
      suite_id: suiteId,
    });

    if (!collection) {
      return res
        .status(404)
        .json({ success: false, message: "No endpoints stored for this suite" });
    }

    const endpointDoc = collection.endpoints.id(endpointId);
    if (!endpointDoc) {
      return res
        .status(404)
        .json({ success: false, message: "Endpoint not found in this suite" });
    }

    const spec = loadSuiteSpec(userId, suiteId);
    if (!spec) {
      return res.status(404).json({
        success: false,
        message: "No OpenAPI spec stored for this suite. Upload a spec first.",
      });
    }

    const payload = {
      spec,
      endpoint: serializeEndpoint(endpointDoc),
      categories,
      try_unauthenticated: tryUnauthenticated,
    };

    if (ownerIdentity) payload.owner_identity = ownerIdentity;
    if (attackerIdentity) payload.attacker_identity = attackerIdentity;
    if (adminIdentity) payload.admin_identity = adminIdentity;
    if (typeof timeoutSeconds === "number") {
      payload.timeout_seconds = Math.max(1, Math.min(timeoutSeconds, 60));
    }
    if (typeof autoDiscoverIds === "boolean") {
      payload.auto_discover_ids = autoDiscoverIds;
    }
    if (typeof enableMassAssignment === "boolean") {
      payload.enable_mass_assignment = enableMassAssignment;
    }
    if (typeof enableMethodAbuse === "boolean") {
      payload.enable_method_abuse = enableMethodAbuse;
    }

    const response = await axios.post(
      `${PYTHON_BACKEND_URL}/security/owasp/scan`,
      payload,
      { timeout: 180000 }
    );

    return res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    if (error.response) {
      console.error("[OWASP_SCAN_ERROR]", {
        status: error.response.status,
        detail: error.response.data,
      });
      return res.status(error.response.status).json({
        success: false,
        message: "OWASP scan failed",
        error: error.response.data,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to run OWASP scan",
      error: error.message,
    });
  }
};


