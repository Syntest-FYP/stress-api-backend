const fs = require("fs");
const path = require("path");
const axios = require("axios");
const {
  createBatch,
  getBatchById,
  getBatchesByUser,
  getAnalyticsByBatch,
  getAnomaliesByBatch,
  getLogsByBatch,
  deleteBatch,
  updateBatchStatus,
} = require("../models/monitoring.model");
const { ingestionQueue } = require("../config/queue");
const LogIngestionService = require("../services/logIngestionService");
const monitoringModel = require("../models/monitoring.model");
const environmentModel = require("../models/environment.model");
const GeneratedTest = require("../models/generated_test.model");
const { monitoringQueue } = require("../config/bullmq");
const suitesService = require("../services/suitesService");
const PYTHON_BACKEND_URL =
  process.env.AI_BACKEND_URL || "http://localhost:8000";

const FAILED_REPORT_PREFIX = "Failed to generate AI report:";

function parseIntervalToRepeat(interval) {
  if (interval.endsWith("m")) {
    return { every: parseInt(interval) * 60 * 1000 };
  } else if (interval.endsWith("h")) {
    return { every: parseInt(interval) * 60 * 60 * 1000 };
  }
  // Assume cron expression
  return { pattern: interval };
}

function normalizeAIReport(reportValue) {
  if (reportValue === null || reportValue === undefined) {
    return { report: null, isValid: false, isFailurePlaceholder: false };
  }

  if (typeof reportValue === "object") {
    return { report: reportValue, isValid: true, isFailurePlaceholder: false };
  }

  if (typeof reportValue !== "string") {
    return {
      report: { raw_text: String(reportValue) },
      isValid: true,
      isFailurePlaceholder: false,
    };
  }

  const trimmed = reportValue.trim();
  if (!trimmed) {
    return { report: null, isValid: false, isFailurePlaceholder: false };
  }

  if (trimmed.startsWith(FAILED_REPORT_PREFIX)) {
    return { report: null, isValid: false, isFailurePlaceholder: true };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      return { report: parsed, isValid: true, isFailurePlaceholder: false };
    }
  } catch (_) {
    // Not JSON; return as displayable text payload.
  }

  return {
    report: { raw_text: trimmed },
    isValid: true,
    isFailurePlaceholder: false,
  };
}

/**
 * Upload a log file
 */
exports.uploadAndIngest = async (req, res) => {
  try {
    console.log(req.file);
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log(req.body);
    const { format, field_mapping, suite_id } = req.body;

    if (!suite_id) {
      // Clean up file if suite_id is missing
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "suite_id is required" });
    }

    const mapping = field_mapping
      ? typeof field_mapping === "string"
        ? JSON.parse(field_mapping)
        : field_mapping
      : null;

    // Auto-detect format if not provided
    const detectedFormat =
      format || (await LogIngestionService.detectFormat(req.file.path));

    if (detectedFormat === "unknown") {
      return res.status(400).json({
        error:
          "Could not auto-detect log format. Please specify format (json, csv, ndjson, elk).",
      });
    }

    // Create batch record
    const batch = await createBatch({
      userId: req.user.id,
      suiteId: suite_id,
      filename: req.file.originalname,
      format: detectedFormat,
      fieldMapping: mapping,
    });

    // Enqueue ingestion job
    await ingestionQueue.add("ingest", {
      batchId: batch.id,
      filePath: req.file.path,
      format: detectedFormat,
      fieldMapping: mapping,
    });

    res.status(202).json({
      message: "Log ingestion started",
      batch,
    });
  } catch (error) {
    console.error("[MONITORING] Upload error:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * List batches
 */
exports.listBatches = async (req, res) => {
  try {
    const { page = 1, limit = 10, suite_id } = req.query;
    const offset = (page - 1) * limit;
    const batches = await getBatchesByUser(
      req.user.id,
      parseInt(limit),
      parseInt(offset),
      suite_id,
    );
    res.status(200).json(batches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get batch status and metadata
 */
exports.getBatch = async (req, res) => {
  try {
    const { suite_id } = req.query;
    const batch = await getBatchById(req.params.id, req.user.id, suite_id);
    if (!batch)
      return res.status(404).json({ error: "Batch not found or unauthorized" });
    res.status(200).json(batch);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get computed analytics
 */
exports.getAnalytics = async (req, res) => {
  try {
    const { suite_id } = req.query;
    const batch = await getBatchById(req.params.id, req.user.id, suite_id);
    if (!batch)
      return res.status(404).json({ error: "Batch not found or unauthorized" });

    const analytics = await getAnalyticsByBatch(req.params.id);
    if (!analytics || analytics.length === 0) {
      return res
        .status(404)
        .json({ error: "Analytics not yet computed for this batch" });
    }

    // Format response
    const formatted = analytics.reduce((acc, curr) => {
      acc[curr.summary_type] = curr.data;
      return acc;
    }, {});

    res.status(200).json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get detected anomalies
 */
exports.getAnomalies = async (req, res) => {
  try {
    const { suite_id } = req.query;
    const batch = await getBatchById(req.params.id, req.user.id, suite_id);
    if (!batch)
      return res.status(404).json({ error: "Batch not found or unauthorized" });

    const anomalies = await getAnomaliesByBatch(req.params.id);
    if (!anomalies) {
      return res
        .status(404)
        .json({ error: "Anomaly detection not yet complete for this batch" });
    }
    res.status(200).json(anomalies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get raw log entries with filtering
 */
exports.getLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      suite_id,
      statusCode,
      endpointPath,
      userId,
      ipAddress,
      startTime,
      endTime,
      limit = 100,
      offset = 0,
    } = req.query;

    const batch = await getBatchById(id, req.user.id, suite_id);
    if (!batch)
      return res.status(404).json({ error: "Batch not found or unauthorized" });

    const logs = await getLogsByBatch(id, {
      statusCode,
      endpointPath,
      userId,
      ipAddress,
      startTime,
      endTime,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Webhook ingestion
 */
exports.webhookIngest = async (req, res) => {
  try {
    // Auth via API Key is handled by middleware
    const logs = Array.isArray(req.body) ? req.body : [req.body];
    const { project_id } = req.query; // Active session identification

    // For simplicity, we create a pseudo-batch or append to an active one
    // Here we'll just create a 'streaming' batch if it doesn't exist
    // Requirements say: "Append records to the active streaming batch for the project"
    // We'll just process it as a small batch for now.

    const batch = await createBatch({
      userId: req.user_id, // Settled by api key auth middleware
      suiteId: project_id,
      filename: "webhook_stream",
      format: "json",
      fieldMapping: null,
    });

    await ingestionQueue.add("ingest_direct", {
      batchId: batch.id,
      logs,
      format: "json",
    });

    res
      .status(200)
      .json({ message: "Webhook logs received", batchId: batch.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const MonitoringAIService = require("../services/monitoringAIService");

function parseWindowHours(message) {
  const text = String(message || "");
  // Common phrasings: "last 24 hours", "past 7 days", "last day", "last week"
  const hoursMatch = text.match(
    /\b(?:last|past)\s+(\d+)\s*(hour|hours|hr|hrs)\b/i,
  );
  if (hoursMatch) return Math.max(1, Number(hoursMatch[1]));

  const daysMatch = text.match(/\b(?:last|past)\s+(\d+)\s*(day|days)\b/i);
  if (daysMatch) return Math.max(1, Number(daysMatch[1]) * 24);

  if (/\blast\s+day\b/i.test(text)) return 24;
  if (/\blast\s+week\b/i.test(text)) return 24 * 7;

  return 24;
}

function isTopFailingEndpointsQuestion(message) {
  const text = String(message || "").toLowerCase();
  const mentionsEndpoints = /endpoint|route|path|api/.test(text);
  const mentionsFailing = /fail|failure|error|5xx|4xx|broken|down/.test(text);
  const mentionsTop = /most|top|worst|highest/.test(text);
  const mentionsWindow = /last|past|24\s*hour|day|week/.test(text);
  return (
    mentionsEndpoints && mentionsFailing && (mentionsTop || mentionsWindow)
  );
}

function inferFailureThreshold(message) {
  const text = String(message || "").toLowerCase();
  // If user explicitly says 4xx/5xx, honor it.
  if (/\b4xx\b/.test(text) || /\bclient\b/.test(text)) return 400;
  if (/\b5xx\b/.test(text) || /\bserver\b/.test(text)) return 500;

  // In natural language, "failing endpoints" usually means "non-2xx success".
  // We approximate this as HTTP >= 400 (includes 4xx + 5xx), which is what most users want.
  return 400;
}

function titleForWindow(hours) {
  if (hours === 24) return "last 24 hours";
  return `last ${hours} hours`;
}

function formatTopFailingMarkdown({ rows, hours, failureStatusMin }) {
  const titleWindow = titleForWindow(hours);
  if (!rows || rows.length === 0) {
    return `No failing endpoints found in the ${titleWindow} (failure threshold: HTTP >= ${failureStatusMin}).`;
  }

  const header =
    `### Top failing endpoints (${titleWindow})\n` +
    `Failure threshold: **HTTP >= ${failureStatusMin}**\n\n` +
    `| Rank | Endpoint | Failures | Total | Failure rate | Last seen |\n` +
    `|---:|---|---:|---:|---:|---|\n`;

  const lines = rows.map((r, idx) => {
    const endpoint =
      `\`${String(r.http_method || "").toUpperCase()} ${r.endpoint_path}\``.trim();
    const failures = Number(r.failures_selected || 0);
    const total = Number(r.total_requests || 0);
    const rate =
      r.selected_failure_rate_pct !== null &&
      r.selected_failure_rate_pct !== undefined
        ? `${Number(r.selected_failure_rate_pct).toFixed(2)}%`
        : "n/a";
    const lastSeen = r.last_seen
      ? new Date(r.last_seen).toLocaleString()
      : "n/a";
    return `| ${idx + 1} | ${endpoint} | ${failures} | ${total} | ${rate} | ${lastSeen} |`;
  });

  const footnote = `\n\nIf you want, ask: **"show me the last 20 failures for #1"** or **"break down failures by status code for /checkout"**.`;

  return header + lines.join("\n") + footnote;
}

function formatLatencyWorstMarkdown({ rows, hours }) {
  const titleWindow = titleForWindow(hours);
  if (!rows || rows.length === 0) {
    return `No latency data available in the ${titleWindow} (not enough requests per endpoint).`;
  }

  const header =
    `### Worst latency endpoints (${titleWindow})\n\n` +
    `| Rank | Endpoint | Requests | Avg | P95 | P99 | Max | Last seen |\n` +
    `|---:|---|---:|---:|---:|---:|---:|---|\n`;

  const lines = rows.map((r, idx) => {
    const endpoint =
      `\`${String(r.http_method || "").toUpperCase()} ${r.endpoint_path}\``.trim();
    const reqs = Number(r.total_requests || 0);
    const avg =
      r.avg_ms !== null && r.avg_ms !== undefined
        ? `${Number(r.avg_ms).toFixed(2)}ms`
        : "n/a";
    const p95 =
      r.p95_ms !== null && r.p95_ms !== undefined
        ? `${Number(r.p95_ms).toFixed(0)}ms`
        : "n/a";
    const p99 =
      r.p99_ms !== null && r.p99_ms !== undefined
        ? `${Number(r.p99_ms).toFixed(0)}ms`
        : "n/a";
    const max =
      r.max_ms !== null && r.max_ms !== undefined
        ? `${Number(r.max_ms)}ms`
        : "n/a";
    const lastSeen = r.last_seen
      ? new Date(r.last_seen).toLocaleString()
      : "n/a";
    return `| ${idx + 1} | ${endpoint} | ${reqs} | ${avg} | ${p95} | ${p99} | ${max} | ${lastSeen} |`;
  });

  return header + lines.join("\n");
}

function extractPathFromQuestion(message) {
  const text = String(message || "");
  const backtick = text.match(/`([^`]+)`/);
  if (backtick?.[1]) return backtick[1].trim();

  const quoted = text.match(/"([^"]+)"/);
  if (quoted?.[1]) return quoted[1].trim();

  const slash = text.match(/(\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]+)/);
  if (slash?.[1]) return slash[1].trim();

  if (/\bcheckout\b/i.test(text)) return "/checkout";

  return "";
}

function isLatencyWorstQuestion(message) {
  const text = String(message || "").toLowerCase();
  return (
    /latency|slow|slowest|p95|p99|response time/.test(text) &&
    /worst|highest|top|most/.test(text)
  );
}

function isStatusBreakdownQuestion(message) {
  const text = String(message || "").toLowerCase();
  return (
    /(status|status code|codes|breakdown|distribution)/.test(text) &&
    /(\/|endpoint|path|route|checkout)/.test(text)
  );
}

function isHealthQuestion(message) {
  const text = String(message || "").toLowerCase();
  return (
    /(healthy|health|ok|okay|down|broken|working)/.test(text) &&
    /(checkout|workflow|endpoint|path|route|api|\/)/.test(text)
  );
}

function isSpikeAtTimeQuestion(message) {
  const text = String(message || "").toLowerCase();
  return (
    /(spike|surge|jump)/.test(text) &&
    /(before|leading up|prior)/.test(text) &&
    /\b\d{1,2}\s*(am|pm)\b/.test(text)
  );
}

function parseTimeOfDayToLatestDate(message) {
  const text = String(message || "");
  const m = text.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const ampm = String(m[2] || "").toLowerCase();
  if (Number.isNaN(hour) || hour < 1 || hour > 12) return null;
  if (ampm === "pm" && hour !== 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;

  const now = new Date();
  const candidate = new Date(now);
  candidate.setMinutes(0, 0, 0);
  candidate.setHours(hour);
  if (candidate.getTime() > now.getTime()) {
    candidate.setDate(candidate.getDate() - 1);
  }
  return candidate;
}

function formatStatusBreakdownMarkdown({ rows, path, hours }) {
  const titleWindow = titleForWindow(hours);
  if (!rows || rows.length === 0) {
    return `No status-code data found for \`${path}\` in the ${titleWindow}.`;
  }

  const header =
    `### Status code breakdown for \`${path}\` (${titleWindow})\n\n` +
    `| Endpoint | Status | Count | Last seen |\n` +
    `|---|---:|---:|---|\n`;

  const lines = rows.map((r) => {
    const endpoint =
      `\`${String(r.http_method || "").toUpperCase()} ${r.endpoint_path}\``.trim();
    const status = Number(r.status_code);
    const count = Number(r.count || 0);
    const lastSeen = r.last_seen
      ? new Date(r.last_seen).toLocaleString()
      : "n/a";
    return `| ${endpoint} | ${status} | ${count} | ${lastSeen} |`;
  });

  return header + lines.join("\n");
}

function formatHealthMarkdown({ healthRow, path, minutes }) {
  if (!healthRow) {
    return `No recent traffic for \`${path}\` in the last ${minutes} minutes.`;
  }

  const endpoint =
    `\`${String(healthRow.http_method || "").toUpperCase()} ${healthRow.endpoint_path}\``.trim();
  const total = Number(healthRow.total_requests || 0);
  const errRate =
    healthRow.error_rate_pct !== null && healthRow.error_rate_pct !== undefined
      ? `${Number(healthRow.error_rate_pct).toFixed(2)}%`
      : "n/a";
  const p95 =
    healthRow.p95_ms !== null && healthRow.p95_ms !== undefined
      ? `${Number(healthRow.p95_ms).toFixed(0)}ms`
      : "n/a";
  const p99 =
    healthRow.p99_ms !== null && healthRow.p99_ms !== undefined
      ? `${Number(healthRow.p99_ms).toFixed(0)}ms`
      : "n/a";
  const avg =
    healthRow.avg_ms !== null && healthRow.avg_ms !== undefined
      ? `${Number(healthRow.avg_ms).toFixed(2)}ms`
      : "n/a";
  const lastSeen = healthRow.last_seen
    ? new Date(healthRow.last_seen).toLocaleString()
    : "n/a";

  const isHealthy = total > 0 && Number(healthRow.error_rate_pct || 0) < 5;

  return (
    `### Health for \`${path}\` (last ${minutes} minutes)\n\n` +
    `- Endpoint sampled: ${endpoint}\n` +
    `- Requests: **${total}**\n` +
    `- Error rate (4xx+5xx): **${errRate}** (4xx: ${Number(healthRow.errors_4xx || 0)}, 5xx: ${Number(
      healthRow.errors_5xx || 0,
    )})\n` +
    `- Latency: avg **${avg}**, p95 **${p95}**, p99 **${p99}**\n` +
    `- Last seen: ${lastSeen}\n\n` +
    `Overall: **${isHealthy ? "HEALTHY" : "DEGRADED"}**`
  );
}

function formatSpikeExplanationMarkdown({ spikeTime, beforeTop, afterTop }) {
  const ts = spikeTime ? spikeTime.toLocaleString() : "the spike time";
  const fmtTop = (rows) => {
    if (!rows || rows.length === 0)
      return "_No failing endpoints in this window._";
    return rows
      .map((r, i) => {
        const ep =
          `\`${String(r.http_method || "").toUpperCase()} ${r.endpoint_path}\``.trim();
        return `${i + 1}. ${ep} — **${r.errors}** errors (${Number(r.error_rate_pct).toFixed(2)}%), total ${r.total_requests}`;
      })
      .join("\n");
  };

  return (
    `### What changed before the spike at ${ts}\n\n` +
    `I compared the **2 hours before** vs **2 hours after** the spike time, and ranked endpoints by error count (HTTP >= 400).\n\n` +
    `**Before (2h window)**\n${fmtTop(beforeTop)}\n\n` +
    `**After (2h window)**\n${fmtTop(afterTop)}\n\n` +
    `If you tell me which endpoint you care about, I can drill down into status codes and latency just for that path.`
  );
}

async function buildMonitoringContextForAI({ userId, suiteId }) {
  const [topFailing, worstLatency, hourly] = await Promise.all([
    getTopFailingEndpoints({
      userId,
      suiteId,
      sinceHours: 24,
      limit: 5,
      failureStatusMin: 400,
    }),
    getWorstLatencyEndpoints({
      userId,
      suiteId,
      sinceHours: 24,
      limit: 5,
      minRequests: 20,
    }),
    getHourlyErrorRate({ userId, suiteId, sinceHours: 48 }),
  ]);

  return {
    window_hours: 24,
    top_failing_endpoints: topFailing,
    worst_latency_endpoints: worstLatency,
    hourly_error_rate_last_48h: hourly,
  };
}

function buildAIPromptContract({ userMessage, context }) {
  return `
You are a monitoring assistant. You MUST answer using the provided live monitoring context.

RESPONSE CONTRACT (follow strictly):
- Answer the user's question directly in 3-10 bullet points (no generic incident templates).
- Always include: timeframe, endpoint paths (with HTTP method if present), and numbers (counts/rates/latency).
- If the answer cannot be derived from the context, say exactly what data is missing and what query would answer it.
- Do NOT output "Recommended Actions" unless the user explicitly asks for actions.

LIVE MONITORING CONTEXT (JSON):
${JSON.stringify(context, null, 2)}

USER QUESTION:
${String(userMessage || "").trim()}
`.trim();
}

/**
 * AI Insights Report
 */
exports.getAIReport = async (req, res) => {
  try {
    const { suite_id } = req.query;
    const forceRefresh =
      String(req.query.refresh || "").toLowerCase() === "true";
    const batch = await getBatchById(req.params.id, req.user.id, suite_id);
    if (!batch)
      return res.status(404).json({ error: "Batch not found or unauthorized" });
    console.log("get ai report");
    const cachedReport = normalizeAIReport(batch.ai_report);
    const hasCachedReport =
      cachedReport.isValid && !cachedReport.isFailurePlaceholder;

    if (hasCachedReport && !forceRefresh) {
      return res.status(200).json({ report: cachedReport.report });
    }

    const analytics = await getAnalyticsByBatch(req.params.id);
    const anomalies = await getAnomaliesByBatch(req.params.id);

    if (analytics.length === 0) {
      return res
        .status(400)
        .json({ error: "Analytics must be computed before generating report" });
    }

    const context = {
      batch: {
        id: batch.id,
        filename: batch.filename,
        total_records: batch.total_records,
      },
      analytics,
      anomalies,
    };

    const reportText =
      await MonitoringAIService.generateInsightsReport(context);
    const normalizedGeneratedReport = normalizeAIReport(reportText);
    if (!normalizedGeneratedReport.isValid) {
      throw new Error("AI backend returned an empty report");
    }

    await updateBatchStatus(batch.id, batch.status, {
      ai_report: normalizedGeneratedReport.report,
    });

    res.status(200).json({ report: normalizedGeneratedReport.report });
  } catch (error) {
    console.error(
      "[MONITORING][getAIReport] Error:",
      error.response?.data || error.message,
    );
    res.status(error.response?.status || 500).json({
      error: error.message || "Failed to generate AI report",
    });
  }
};

/**
 * Generate Tests from anomalies
 */
exports.generateTests = async (req, res) => {
  try {
    const { id } = req.params;
    const { suite_id } = req.body; // usually expected in body for POST

    const batch = await getBatchById(id, req.user.id, suite_id);
    if (!batch)
      return res.status(404).json({ error: "Batch not found or unauthorized" });

    const anomalies = await getAnomaliesByBatch(id);

    if (!anomalies || anomalies.length === 0) {
      return res
        .status(400)
        .json({ error: "No anomalies found to generate tests from" });
    }

    const taskId = await MonitoringAIService.triggerTestGeneration(
      id,
      anomalies,
      suite_id || batch.suite_id,
      req.headers["authorization"], // Pass user auth for spec fetching in Python
    );

    res.status(202).json({
      message: "AI test generation triggered",
      task_id: taskId,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Chat with the Monitoring AI Orchestrator
 */
exports.chat = async (req, res) => {
  try {
    const { message, suite_id, session_id } = req.body;
    const userId = req.user._id || req.user.id;

    if (!message || !suite_id) {
      return res
        .status(400)
        .json({ error: "message and suite_id are required" });
    }

    // Thin proxy: delegate monitoring Q&A routing/tool-selection to stress-api-ai.
    // Node backend should not enforce local intent logic/time windows.
    const EndpointCollection = require("../models/Endpoint");
    const collection = await EndpointCollection.findOne({
      user_id: userId.toString(),
      suite_id: suite_id,
    });

    let endpoints = [];
    if (collection && collection.endpoints) {
      // Re-use transformEndpoints or similar logic to map correctly
      endpoints = collection.endpoints
        .filter((ep) => ep.is_active)
        .map((ep) => ({
          name: ep.name || `${ep.method} ${ep.path}`,
          method: (ep.method || "").toUpperCase(),
          path: ep.path,
          description: ep.description || "",
          tags: ep.tags || [],
          base_url: ep.base_url || null,
          is_active: true,
          auth_type: ep.auth_type || null,
        }));
    }

    // Call Python Orchestrator
    const pythonSessionId = session_id || suite_id;
    console.log(
      `[MONITORING_CHAT] Full Payload:`,
      JSON.stringify({
        message: message.substring(0, 50),
        suite_id,
        session_id,
        pythonSessionId,
      }),
    );

    // Some Python backends might expect session_id in the URL or under a different name (conv_id)
    const pythonUrl = `${PYTHON_BACKEND_URL}/chat/?session_id=${encodeURIComponent(pythonSessionId)}`;

    const response = await axios.post(pythonUrl, {
      message,
      suite_id,
      endpoints,
      session_id: pythonSessionId,
      conv_id: pythonSessionId,
      accessToken: req.headers["authorization"],
      userId: req.user.id,
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error(
      "[MONITORING_CHAT] Error:",
      error.response?.data || error.message,
    );
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: error.message });
  }
};

/**
 * Delete batch
 */
exports.deleteBatch = async (req, res) => {
  try {
    const { suite_id } = req.query;
    const result = await deleteBatch(req.params.id, req.user.id, suite_id);
    if (!result)
      return res.status(404).json({ error: "Batch not found or unauthorized" });
    res.status(200).json({ message: "Batch deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }

  // ── Helper: parse interval string to BullMQ repeat options ──
};

exports.createJob = async (req, res) => {
  try {
    const { suite_id } = req.params;
    const user_id = req.user.id;
    const jobData = { ...req.body, user_id, suite_id };

    const job = await monitoringModel.createMonitoringJob(jobData);

    // Schedule in BullMQ
    const repeatOptions = parseIntervalToRepeat(job.schedule_interval);
    await monitoringQueue.add(
      `monitoring_job_${job.id}`,
      { jobId: job.id },
      { repeat: repeatOptions },
    );

    // Add an immediate run so the user doesn't have to wait for the first interval
    await monitoringQueue.add(
      `monitoring_job_manual_${job.id}`,
      { jobId: job.id },
      { jobId: `manual_${job.id}_${Date.now()}` },
    );

    res.status(201).json(job);
  } catch (error) {
    console.error("Error creating monitoring job:", error);
    res.status(500).json({ error: "Failed to create monitoring job" });
  }
};

exports.getJobs = async (req, res) => {
  try {
    const { suite_id } = req.params;
    const user_id = req.user.id;
    const jobs = await monitoringModel.getMonitoringJobs(user_id, suite_id);

    // Attach stats for each job
    const enrichedJobs = await Promise.all(
      jobs.map(async (job) => {
        const stats = await monitoringModel.getJobStats(job.id);
        return {
          ...job,
          total_runs: parseInt(stats?.total_runs || 0),
          pass_count: parseInt(stats?.pass_count || 0),
          fail_count: parseInt(stats?.fail_count || 0),
          avg_latency: parseInt(stats?.avg_latency || 0),
          p50_latency: parseInt(stats?.p50_latency || 0),
          p95_latency: parseInt(stats?.p95_latency || 0),
          p99_latency: parseInt(stats?.p99_latency || 0),
          pass_rate:
            stats?.total_runs > 0
              ? ((stats.pass_count / stats.total_runs) * 100).toFixed(1)
              : "0",
          uptime:
            stats?.total_runs > 0
              ? ((stats.pass_count / stats.total_runs) * 100).toFixed(2)
              : "0",
        };
      }),
    );

    res.json(enrichedJobs);
  } catch (error) {
    console.error("Error fetching monitoring jobs:", error);
    res.status(500).json({ error: "Failed to fetch monitoring jobs" });
  }
};

exports.getJobResults = async (req, res) => {
  try {
    const { job_id } = req.params;
    const results = await monitoringModel.getMonitoringResultsByJob(job_id);
    res.json(results);
  } catch (error) {
    console.error("Error fetching job results:", error);
    res.status(500).json({ error: "Failed to fetch job results" });
  }
};

exports.getJobAlerts = async (req, res) => {
  try {
    const { job_id } = req.params;
    const alerts = await monitoringModel.getMonitoringAlertsByJob(job_id);
    res.json(alerts);
  } catch (error) {
    console.error("Error fetching job alerts:", error);
    res.status(500).json({ error: "Failed to fetch job alerts" });
  }
};

// ── Suite-level aggregates (all jobs) ─────────────────────
exports.getSuiteResults = async (req, res) => {
  try {
    const { suite_id } = req.params;
    const results = await monitoringModel.getMonitoringResultsBySuite(suite_id);
    res.json(results);
  } catch (error) {
    console.error("Error fetching suite results:", error);
    res.status(500).json({ error: "Failed to fetch suite results" });
  }
};

exports.getSuiteAlerts = async (req, res) => {
  try {
    const { suite_id } = req.params;
    const alerts = await monitoringModel.getMonitoringAlertsBySuite(suite_id);
    res.json(alerts);
  } catch (error) {
    console.error("Error fetching suite alerts:", error);
    res.status(500).json({ error: "Failed to fetch suite alerts" });
  }
};

exports.acknowledgeAlert = async (req, res) => {
  try {
    const { alert_id } = req.params;
    const alert = await monitoringModel.resolveMonitoringAlert(alert_id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    res.json(alert);
  } catch (error) {
    console.error("Error acknowledging alert:", error);
    res.status(500).json({ error: "Failed to acknowledge alert" });
  }
};

exports.toggleJob = async (req, res) => {
  try {
    const { job_id } = req.params;
    const { is_active } = req.body;

    const job = await monitoringModel.updateMonitoringJob(job_id, {
      is_active,
    });

    if (!is_active) {
      const repeatableJobs = await monitoringQueue.getRepeatableJobs();
      const bullJob = repeatableJobs.find(
        (rj) => rj.name === `monitoring_job_${job_id}`,
      );
      if (bullJob) {
        await monitoringQueue.removeRepeatableByKey(bullJob.key);
      }
    } else {
      const repeatOptions = parseIntervalToRepeat(job.schedule_interval);
      await monitoringQueue.add(
        `monitoring_job_${job.id}`,
        { jobId: job.id },
        { repeat: repeatOptions },
      );
    }

    res.json(job);
  } catch (error) {
    console.error("Error toggling monitoring job:", error);
    res.status(500).json({ error: "Failed to toggle monitoring job" });
  }
};

exports.deleteJob = async (req, res) => {
  try {
    const { job_id } = req.params;

    const repeatableJobs = await monitoringQueue.getRepeatableJobs();
    const bullJob = repeatableJobs.find(
      (rj) => rj.name === `monitoring_job_${job_id}`,
    );
    if (bullJob) {
      await monitoringQueue.removeRepeatableByKey(bullJob.key);
    }

    await monitoringModel.deleteMonitoringJob(job_id);
    res.json({ message: "Job deleted successfully" });
  } catch (error) {
    console.error("Error deleting monitoring job:", error);
    res.status(500).json({ error: "Failed to delete monitoring job" });
  }
};

exports.runJobNow = async (req, res) => {
  try {
    const { job_id } = req.params;
    await monitoringQueue.add(
      `monitoring_job_manual_${job_id}`,
      { jobId: job_id },
      { jobId: `manual_${job_id}_${Date.now()}` },
    );
    res.json({ message: "Job queued for immediate execution" });
  } catch (error) {
    console.error("Error triggering manual run:", error);
    res.status(500).json({ error: "Failed to trigger job" });
  }
};

// ── Auto-Sync from Generated Tests ─────────────────────────
exports.syncSuiteJobs = async (req, res) => {
  try {
    const { suite_id } = req.params;
    const user_id = req.user.id;
    const { status, target_environment_id } = req.body; // 'active' or 'paused', optional environment

    const existingJobs = await monitoringModel.getMonitoringJobs(
      user_id,
      suite_id,
    );
    const repeatableJobs = await monitoringQueue.getRepeatableJobs();

    if (status === "paused") {
      for (const job of existingJobs) {
        if (job.is_active) {
          await monitoringModel.updateMonitoringJob(job.id, {
            is_active: false,
          });
          const bullJob = repeatableJobs.find(
            (rj) => rj.name === `monitoring_job_${job.id}`,
          );
          if (bullJob) await monitoringQueue.removeRepeatableByKey(bullJob.key);
        }
      }
      return res.json({ message: "Monitoring paused for all jobs in suite" });
    }

    for (const job of existingJobs) {
      const bullJob = repeatableJobs.find(
        (rj) => rj.name === `monitoring_job_${job.id}`,
      );
      if (bullJob) await monitoringQueue.removeRepeatableByKey(bullJob.key);
      await monitoringModel.deleteMonitoringJob(job.id);
    }

    const generatedTests = await GeneratedTest.find({ suite_id, user_id });
    if (!generatedTests || generatedTests.length === 0) {
      return res.status(404).json({
        error: "No generated tests found for this suite to monitor.",
      });
    }

    let env = null;
    let finalEnvId = target_environment_id;

    if (!finalEnvId) {
      // Auto-resolve: priority is default environment for suite > any suite environment > first user environment
      const envs = await environmentModel.listEnvironmentsByUser(
        user_id,
        suite_id,
      );
      const defaultEnv = envs.find((e) => e.is_default) || envs[0];
      if (defaultEnv) {
        finalEnvId = defaultEnv.id;
        env = defaultEnv;
      }
    } else {
      env = await environmentModel.getEnvironmentById(finalEnvId);
    }

    // Fetch the suite's own base_url as ultimate fallback
    let suiteBaseUrl = "";
    try {
      const suite = await suitesService.getTestSuiteById(user_id, suite_id);
      if (suite && suite.base_url) {
        suiteBaseUrl = suite.base_url;
      }
    } catch (e) {
      console.warn("[monitoring] Could not fetch suite base_url:", e.message);
    }

    const createdJobs = [];
    const repeatOptions = parseIntervalToRepeat("5m");
    const createdKeys = new Set();

    for (const test of generatedTests) {
      let endpointsToMonitor = [];

      if (test.endpoint && test.endpoint.path) {
        endpointsToMonitor.push(test.endpoint);
      } else if (test.request_options && test.request_options.endpoints) {
        endpointsToMonitor = test.request_options.endpoints;
      }

      for (const ep of endpointsToMonitor) {
        if (!ep.path) continue;

        const method = ep.method || "GET";
        const pathBase = ep.path.split("?")[0];
        const key = `${method} ${pathBase}`;

        if (createdKeys.has(key)) continue;
        createdKeys.add(key);

        // Priority: ep.base_url > env.base_url > suite.base_url > ''
        const baseUrl =
          ep.base_url || (env ? env.base_url : "") || suiteBaseUrl;
        const url =
          baseUrl + (ep.path.startsWith("/") ? ep.path : `/${ep.path}`);

        const jobData = {
          user_id,
          suite_id,
          name: `Monitor: ${method} ${pathBase}`,
          description: `Auto-synced from Generated Test ${test._id}`,
          schedule_interval: "5m",
          failure_threshold: 3,
          target_environment_id: finalEnvId || null,
          test_case_definitions: [
            {
              name: "Auto Endpoint Check",
              method: method,
              url: url,
              assertions: [{ type: "status", expected: "200" }],
              headers: ep.headers || {},
              body: test.request_options?.body || {},
            },
          ],
        };

        const job = await monitoringModel.createMonitoringJob(jobData);
        await monitoringQueue.add(
          `monitoring_job_${job.id}`,
          { jobId: job.id },
          { repeat: repeatOptions },
        );
        await monitoringQueue.add(
          `monitoring_job_manual_${job.id}`,
          { jobId: job.id },
          { jobId: `manual_${job.id}_${Date.now()}` },
        );

        createdJobs.push(job);
      }
    }

    res.status(201).json({
      message: "Monitoring enabled and synced successfully",
      jobs: createdJobs,
    });
  } catch (error) {
    console.error("Error syncing monitoring jobs:", error);
    res.status(500).json({ error: "Failed to sync monitoring jobs" });
  }
};
