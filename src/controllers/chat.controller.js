const axios = require("axios");
const EndpointCollection = require("../models/Endpoint");
const { getSpecAnalysisBySuite } = require("../models/spec.model");
const { analyzeSpecService } = require("../services/specService");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

function transformEndpoints(endpoints) {
  return endpoints
    .filter((ep) => ep.is_active)
    .map((ep) => ({
      name: ep.name || `${ep.method} ${ep.path}`,
      method: (ep.method || "").toUpperCase(),
      path: ep.path,
      description: ep.description || "",
      tags: ep.tags || [],
      // Include additional details for better context
      base_url: ep.base_url || null,
      headers: ep.headers || {},
      query_params: ep.query_params || {},
      auth_type: ep.auth_type || null,
    }));
}

exports.postChatMessage = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { message, suiteId, sessionId } = req.body;

    if (!message || !suiteId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: message and suiteId",
      });
    }

    // Detect analyze intent and trigger analysis via Python service
    const lowerMsg = String(message).toLowerCase();
    const wantsAnalyze =
      /analy(s|z)e/.test(lowerMsg) ||
      lowerMsg.includes("analyze schema") ||
      lowerMsg.includes("analyse schema");

    if (wantsAnalyze) {
      try {
        const result = await analyzeSpecService(userId, suiteId);
        return res.status(200).json({
          success: true,
          data: {
            action: "schema_analysis",
            message: "Specification analyzed successfully.",
            analysis: result.analysis,
            suite_id: suiteId,
          },
        });
      } catch (err) {
        return res.status(500).json({
          success: false,
          message: "Failed to analyze specification",
          error: err.message,
        });
      }
    }

    // Load endpoints for the suite
    const collection = await EndpointCollection.findOne({
      user_id: userId.toString(),
      suite_id: suiteId,
    });

    if (!collection) {
      return res.status(404).json({
        success: false,
        message: "No endpoints found for this suite",
      });
    }

    const endpoints = transformEndpoints(collection.endpoints);

    // Try to load actual schema file (not analysis)
    let schema = null;
    try {
      const suiteDir = path.join(
        process.cwd(),
        "uploads",
        userId.toString(),
        suiteId
      );
      const candidates = ["spec.json", "spec.yaml", "spec.yml"];

      for (const fileName of candidates) {
        const filePath = path.join(suiteDir, fileName);
        if (fs.existsSync(filePath)) {
          const fileContent = fs.readFileSync(filePath, "utf8");
          const fileExt = path.extname(fileName).toLowerCase();

          if (fileExt === ".json") {
            schema = JSON.parse(fileContent);
          } else {
            schema = yaml.load(fileContent);
          }

          // Check if schema is too large (limit to ~50KB to avoid context issues)
          const schemaSize = JSON.stringify(schema).length;
          if (schemaSize > 50000) {
            console.log(
              `[WARNING] Schema too large (${schemaSize} bytes), using endpoints only`
            );
            schema = null; // Use endpoints instead
          }
          break;
        }
      }
    } catch (err) {
      console.error("[ERROR] Failed to load schema file:", err.message);
      schema = null;
    }

    const url = `${PYTHON_BACKEND_URL}/chat/orchestrate`;

    const testCountMatch = message.match(/\b(\d+)\s*(?:test|case)/i);
    const testCount = testCountMatch ? parseInt(testCountMatch[1]) : 3;

    // Endpoints are already enriched from transformEndpoints
    const enrichedEndpoints = endpoints;

    const payload = {
      message,
      endpoints: enrichedEndpoints,
      // Only pass schema if it exists and is not too large
      // Endpoints contain the essential info anyway
      schema: schema,
      test_count: testCount,
    };

    // Add session_id to payload if available
    if (sessionId) {
      payload.session_id = sessionId;
    }

    const response = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 120000,
    });

    const chatData = response.data || {};
    // Check if actual schema file was attached (not analysis)
    const hasSchema = Boolean(
      schema && (schema.paths || schema.openapi || schema.swagger)
    );

    if (!sessionId && chatData.session_id) {
      chatData.session_id = chatData.session_id;
    }

    chatData.schema_attached = hasSchema;
    // Log for debugging
    console.log(
      `[CHAT] Schema attached: ${hasSchema}, Endpoints: ${enrichedEndpoints.length}`
    );

    if (!hasSchema && chatData && typeof chatData === "object") {
      chatData.suggestions = Array.isArray(chatData.suggestions)
        ? chatData.suggestions
        : [];
      if (!chatData.suggestions.find((s) => /schema/i.test(s))) {
        chatData.suggestions.unshift(
          "Upload/Analyze your OpenAPI schema for better tests"
        );
      }
    }

    return res.status(200).json({ success: true, data: chatData });
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: "Chat service error",
        error: error.response.data,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to process chat message",
      error: error.message,
    });
  }
};

exports.orchestrateChat = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const {
      message,
      suiteId,
      sessionId,
      test_count,
      auth_requirements,
      code_context,
      data_providers,
      entity_relationships,
    } = req.body;

    if (!message || !suiteId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: message and suiteId",
      });
    }

    const collection = await EndpointCollection.findOne({
      user_id: userId.toString(),
      suite_id: suiteId,
    });
    if (!collection) {
      return res
        .status(404)
        .json({ success: false, message: "No endpoints found for this suite" });
    }

    const endpoints = transformEndpoints(collection.endpoints);
    const analysis = await getSpecAnalysisBySuite(suiteId);
    const schema = analysis?.analysis?.insights || null;

    const url = `${PYTHON_BACKEND_URL}/chat/orchestrate`;
    const payload = {
      message,
      endpoints: endpoints.map((ep) => ({
        name: ep.name,
        method: ep.method,
        path: ep.path,
        tags: ep.tags,
      })),
      schema,
      auth_requirements: auth_requirements || null,
      code_context: code_context || null,
      data_providers: data_providers || null,
      entity_relationships: entity_relationships || null,
      test_count: test_count || 3,
    };

    const response = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 180000,
    });

    const data = response.data || {};
    if (!schema) {
      data.schema_attached = false;
      data.suggestions = Array.isArray(data.suggestions)
        ? data.suggestions
        : [];
      if (!data.suggestions.find((s) => /schema/i.test(s))) {
        data.suggestions.unshift(
          "Schema not attached. Upload or analyze your OpenAPI spec for richer tests."
        );
      }
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: "Orchestration error",
        error: error.response.data,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to orchestrate chat",
      error: error.message,
    });
  }
};

exports.getSessionContext = async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId)
      return res
        .status(400)
        .json({ success: false, message: "Missing sessionId" });

    const response = await axios.get(
      `${PYTHON_BACKEND_URL}/chat/session/${encodeURIComponent(
        sessionId
      )}/context`,
      { timeout: 15000 }
    );
    return res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: "Failed to fetch session context",
        error: error.response.data,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to fetch session context",
      error: error.message,
    });
  }
};

exports.clearSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId)
      return res
        .status(400)
        .json({ success: false, message: "Missing sessionId" });

    const response = await axios.delete(
      `${PYTHON_BACKEND_URL}/chat/session/${encodeURIComponent(sessionId)}`,
      { timeout: 15000 }
    );
    return res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: "Failed to clear session",
        error: error.response.data,
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to clear session",
      error: error.message,
    });
  }
};
