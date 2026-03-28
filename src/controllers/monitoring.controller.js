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
  updateBatchStatus
} = require("../models/monitoring.model");
const { ingestionQueue } = require("../config/queue");
const LogIngestionService = require("../services/logIngestionService");

const PYTHON_BACKEND_URL = process.env.AI_BACKEND_URL || "http://localhost:8000";

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

    const mapping = field_mapping ? (typeof field_mapping === 'string' ? JSON.parse(field_mapping) : field_mapping) : null;
    
    // Auto-detect format if not provided
    const detectedFormat = format || await LogIngestionService.detectFormat(req.file.path);
    
    if (detectedFormat === "unknown") {
        return res.status(400).json({ error: "Could not auto-detect log format. Please specify format (json, csv, ndjson, elk)." });
    }

    // Create batch record
    const batch = await createBatch({
      userId: req.user.id,
      suiteId: suite_id,
      filename: req.file.originalname,
      format: detectedFormat,
      fieldMapping: mapping
    });

    // Enqueue ingestion job
    await ingestionQueue.add("ingest", {
      batchId: batch.id,
      filePath: req.file.path,
      format: detectedFormat,
      fieldMapping: mapping
    });

    res.status(202).json({
      message: "Log ingestion started",
      batch
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
    const batches = await getBatchesByUser(req.user.id, parseInt(limit), parseInt(offset), suite_id);
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
    if (!batch) return res.status(404).json({ error: "Batch not found or unauthorized" });
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
    if (!batch) return res.status(404).json({ error: "Batch not found or unauthorized" });

    const analytics = await getAnalyticsByBatch(req.params.id);
    if (!analytics || analytics.length === 0) {
      return res.status(404).json({ error: "Analytics not yet computed for this batch" });
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
    if (!batch) return res.status(404).json({ error: "Batch not found or unauthorized" });

    const anomalies = await getAnomaliesByBatch(req.params.id);
    if (!anomalies) {
        return res.status(404).json({ error: "Anomaly detection not yet complete for this batch" });
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
    const { suite_id, statusCode, endpointPath, userId, ipAddress, startTime, endTime, limit = 100, offset = 0 } = req.query;
    
    const batch = await getBatchById(id, req.user.id, suite_id);
    if (!batch) return res.status(404).json({ error: "Batch not found or unauthorized" });

    const logs = await getLogsByBatch(id, {
      statusCode,
      endpointPath,
      userId,
      ipAddress,
      startTime,
      endTime,
      limit: parseInt(limit),
      offset: parseInt(offset)
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
        fieldMapping: null
    });
    
    await ingestionQueue.add("ingest_direct", {
        batchId: batch.id,
        logs,
        format: "json"
    });

    res.status(200).json({ message: "Webhook logs received", batchId: batch.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const MonitoringAIService = require("../services/monitoringAIService");

/**
 * AI Insights Report
 */
exports.getAIReport = async (req, res) => {
  try {
    const { suite_id } = req.query;
    const batch = await getBatchById(req.params.id, req.user.id, suite_id);
    if (!batch) return res.status(404).json({ error: "Batch not found or unauthorized" });
    
    if (batch.ai_report) {
      return res.status(200).json({ report: batch.ai_report });
    }

    const analytics = await getAnalyticsByBatch(req.params.id);
    const anomalies = await getAnomaliesByBatch(req.params.id);

    if (analytics.length === 0) {
      return res.status(400).json({ error: "Analytics must be computed before generating report" });
    }

    const context = {
      batch: {
        id: batch.id,
        filename: batch.filename,
        total_records: batch.total_records
      },
      analytics,
      anomalies
    };

    const reportText = await MonitoringAIService.generateInsightsReport(context);

    await updateBatchStatus(batch.id, batch.status, { ai_report: reportText });

    res.status(200).json({ report: reportText });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    if (!batch) return res.status(404).json({ error: "Batch not found or unauthorized" });

    const anomalies = await getAnomaliesByBatch(id);
    
    if (!anomalies || anomalies.length === 0) {
      return res.status(400).json({ error: "No anomalies found to generate tests from" });
    }

    const taskId = await MonitoringAIService.triggerTestGeneration(
      id, 
      anomalies, 
      suite_id || batch.suite_id,
      req.headers['authorization'] // Pass user auth for spec fetching in Python
    );
    
    res.status(202).json({
      message: "AI test generation triggered",
      task_id: taskId
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
    const { message, suite_id, endpoints = [] } = req.body;
    
    if (!message || !suite_id) {
        return res.status(400).json({ error: "message and suite_id are required" });
    }

    // Call Python Orchestrator
    const response = await axios.post(`${PYTHON_BACKEND_URL}/chat/`, {
      message,
      suite_id,
      endpoints,
      accessToken: req.headers['authorization'],
      userId: req.user.id
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error("[MONITORING_CHAT] Error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
};

/**
 * Delete batch
 */
exports.deleteBatch = async (req, res) => {
  try {
    const { suite_id } = req.query;
    const result = await deleteBatch(req.params.id, req.user.id, suite_id);
    if (!result) return res.status(404).json({ error: "Batch not found or unauthorized" });
    res.status(200).json({ message: "Batch deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
