const fs = require("fs");
const Papa = require("papaparse");
const JSONStream = require("JSONStream");
const { bulkInsertLogEntries, updateBatchStatus } = require("../models/monitoring.model");
const { analyticsQueue } = require("../config/queue");
const EndpointService = require("./endpointService");

class LogIngestionService {
  constructor() {
    this.CHUNK_SIZE = 1000; // Batch insert size
  }

  /**
   * Detect format from file content
   */
  async detectFormat(filePath) {
    const stream = fs.createReadStream(filePath, { start: 0, end: 1024 });
    return new Promise((resolve) => {
      stream.on("data", (chunk) => {
        const content = chunk.toString().trim();
        stream.destroy();

        if (content.startsWith("[") || (content.startsWith("{") && !content.includes("\n"))) {
          resolve("json");
        } else if (content.startsWith("{")) {
          resolve("ndjson");
        } else if (content.includes(",") || content.includes(";")) {
          // Heuristic for CSV
          resolve("csv");
        } else {
          resolve("unknown");
        }
      });
      stream.on("error", () => resolve("unknown"));
    });
  }

  /**
   * Process ingestion in background
   */
  async processIngestion(batchId, filePath, format, fieldMapping) {
    console.log(`[Ingestion] Starting batch ${batchId} (Format: ${format})`);
    
    try {
      await updateBatchStatus(batchId, "processing");
      
      let totalRecords = 0;
      let firstRecord = {};

      // Sample first record for auto-mapping
      if (format === "ndjson" || format === "elk") {
          const firstLine = fs.readFileSync(filePath, "utf8").split("\n")[0];
          if (firstLine) firstRecord = JSON.parse(firstLine);
      } else if (format === "json") {
          // Simplistic for now: read small chunk and find first object
          const content = fs.readFileSync(filePath, { start: 0, end: 5000 }).toString();
          const match = content.match(/\{[^}]+\}/);
          if (match) firstRecord = JSON.parse(match[0]);
      }
      
      const normalizedMapping = this._getEffectiveMapping(fieldMapping, firstRecord);

      // Fetch endpoints for this suite to link them
      const batchRes = await require("../config/postgres").query("SELECT suite_id, uploaded_by FROM log_ingestion_batches WHERE id = $1", [batchId]);
      const { suite_id: suiteId, uploaded_by: userId } = batchRes.rows[0] || {};
      
      let suiteEndpoints = [];
      if (suiteId) {
        console.log(`[Ingestion] Loading endpoints from MongoDB for suite ${suiteId}`);
        suiteEndpoints = await EndpointService.getEndpointsBySuite(userId, suiteId);
        console.log(`[Ingestion] Loaded ${suiteEndpoints.length} endpoints for matching`);
      }

      const context = { batchId, mapping: normalizedMapping, endpoints: suiteEndpoints };

      if (format === "csv") {
        totalRecords = await this._processCSV(context, filePath);
      } else if (format === "json") {
        totalRecords = await this._processJSON(context, filePath);
      } else if (format === "ndjson" || format === "elk") {
        totalRecords = await this._processNDJSON(context, filePath);
      } else {
        throw new Error(`Unsupported format: ${format}`);
      }

      await updateBatchStatus(batchId, "complete", {
        total_records: totalRecords,
        ingested_at: new Date(),
      });

      console.log(`[Ingestion] Batch ${batchId} complete. ${totalRecords} records ingested.`);
      
      // Trigger Analytics
      await analyticsQueue.add("analyze", { batchId });

    } catch (error) {
      console.error(`[Ingestion] Batch ${batchId} failed:`, error);
      await updateBatchStatus(batchId, "error", {
        error_detail: error.message,
      });
    }
  }

  _getEffectiveMapping(userMapping, firstRecord = {}) {
    const defaultMapping = {
      timestamp: "timestamp",
      endpoint_path: "path",
      http_method: "method",
      status_code: "status",
      response_time_ms: "responseTime",
      user_id: "userId",
      ip_address: "ip",
      error_message: "error",
    };

    const detectedMapping = this._autoDetectMapping(firstRecord);
    return { ...defaultMapping, ...detectedMapping, ...userMapping };
  }

  _autoDetectMapping(record) {
    if (!record || Object.keys(record).length === 0) return {};

    const synonyms = {
      timestamp: ["time", "ts", "@timestamp", "datetime"],
      endpoint_path: ["url", "uri", "path", "endpoint"],
      http_method: ["method", "verb", "request_method"],
      status_code: ["status", "code", "response_code"],
      response_time_ms: ["duration", "latency", "time_taken", "response_ms"],
      user_id: ["user", "sub", "account_id"],
      ip_address: ["ip", "client_ip", "remote_addr"],
      error_message: ["err", "exception", "msg", "message", "error"],
    };

    const mapping = {};
    const keys = Object.keys(record);

    for (const [field, hints] of Object.entries(synonyms)) {
      // Check if the record already has the exact field name
      if (keys.includes(field)) {
        mapping[field] = field;
        continue;
      }

      // Check synonyms
      const match = keys.find(k => hints.includes(k.toLowerCase()));
      if (match) {
        mapping[field] = match;
      }
    }

    return mapping;
  }

  _normalizeRecord(raw, context) {
    const { mapping, endpoints } = context;
    let path = raw[mapping.endpoint_path] || "/";
    const method = (raw[mapping.http_method] || "GET").toUpperCase();
    
    // Normalize path for matching
    const normalizedPath = this._normalizePath(path);

    // Try to find matching endpoint from suite
    let endpointId = null;
    if (endpoints && endpoints.length > 0) {
      const match = endpoints.find(ep => {
        if (ep.method.toUpperCase() !== method) return false;
        
        // Normalize stored path placeholder for comparison (just in case they vary)
        const storedNormalized = ep.path.replace(/:[a-zA-Z0-9_]+/g, ":id").replace(/\{[^}]+\}/g, ":id");
        
        const isMatch = (ep.path === path || ep.path === normalizedPath || storedNormalized === normalizedPath);
        
        if (isMatch) {
            // console.debug(`[Ingestion] Matched ${method} ${path} -> ${ep._id}`);
            return true;
        }
        return false;
      });
      
      if (match) {
          endpointId = match._id.toString();
      } else {
          // Log sampling of failures to avoid flood
          if (Math.random() < 0.01) {
              console.log(`[Ingestion] No match for ${method} ${path} (Normalized: ${normalizedPath})`);
          }
      }
    }

    return {
      timestamp: raw[mapping.timestamp] ? new Date(raw[mapping.timestamp]) : new Date(),
      endpoint_path: normalizedPath,
      http_method: method,
      status_code: parseInt(raw[mapping.status_code]) || 200,
      response_time_ms: parseInt(raw[mapping.response_time_ms]) || 0,
      user_id: raw[mapping.user_id] || null,
      ip_address: raw[mapping.ip_address] || null,
      error_message: raw[mapping.error_message] || null,
      endpoint_id: endpointId
    };
  }

  _normalizePath(path) {
    if (!path || path === "/" || path === "") return "/";

    // 0. Clean the URL
    // Strip query parameters and trailing slashes
    let cleanPath = path.split("?")[0].split("#")[0].replace(/\/+$/, "");
    if (!cleanPath || cleanPath === "") return "/";
    if (!cleanPath.startsWith("/")) cleanPath = "/" + cleanPath;

    // Split path into segments
    const segments = cleanPath.split("/");
    const normalizedSegments = segments.map(segment => {
      if (!segment) return segment;

      // 1. Detect UUIDs (standard 36-char or stripped 32-char)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const strippedUuidRegex = /^[0-9a-f]{32}$/i;
      
      // 2. Detect short hashes or partial IDs (as seen in user logs: 170ed52b-efd, or numbers)
      const shortHashRegex = /^[0-9a-f]{8}-[0-9a-f]{3,4}$/i;

      // 3. Detect numeric IDs (any length > 3)
      const numericIdRegex = /^\d{4,}$/;

      // 4. Detect mixed alpha-numeric "random" looking strings (length > 8)
      const alphaNumericIdRegex = /^(?=.*[0-9])(?=.*[a-zA-Z])[a-zA-Z0-9]{8,}$/;

      if (
        uuidRegex.test(segment) || 
        strippedUuidRegex.test(segment) || 
        shortHashRegex.test(segment) ||
        numericIdRegex.test(segment) ||
        alphaNumericIdRegex.test(segment)
      ) {
        return ":id";
      }

      return segment;
    });

    return normalizedSegments.join("/");
  }

  async _processCSV(context, filePath) {
    const { batchId } = context;
    let count = 0;
    
    return new Promise((resolve, reject) => {
      const fileStream = fs.createReadStream(filePath);
      Papa.parse(fileStream, {
        header: true,
        skipEmptyLines: true,
        chunk: async (results, parser) => {
            parser.pause();
            const normalized = results.data.map(row => this._normalizeRecord(row, context));
            await bulkInsertLogEntries(batchId, normalized);
            count += normalized.length;
            parser.resume();
        },
        complete: () => resolve(count),
        error: (err) => reject(err)
      });
    });
  }

  async _processJSON(context, filePath) {
    const { batchId } = context;
    let count = 0;
    let buffer = [];
    
    return new Promise((resolve, reject) => {
      const fileStream = fs.createReadStream(filePath);
      const jsonStream = fileStream.pipe(JSONStream.parse("*"));

      jsonStream.on("data", async (row) => {
        buffer.push(this._normalizeRecord(row, context));
        if (buffer.length >= this.CHUNK_SIZE) {
          jsonStream.pause();
          await bulkInsertLogEntries(batchId, buffer);
          count += buffer.length;
          buffer = [];
          jsonStream.resume();
        }
      });

      jsonStream.on("end", async () => {
        if (buffer.length > 0) {
          await bulkInsertLogEntries(batchId, buffer);
          count += buffer.length;
        }
        resolve(count);
      });

      jsonStream.on("error", (err) => reject(err));
    });
  }

  async _processNDJSON(context, filePath) {
    const { batchId } = context;
    let count = 0;
    let buffer = [];
    
    const fileContent = fs.readFileSync(filePath, "utf8");
    const lines = fileContent.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        buffer.push(this._normalizeRecord(row, context));
        
        if (buffer.length >= this.CHUNK_SIZE) {
          await bulkInsertLogEntries(batchId, buffer);
          count += buffer.length;
          buffer = [];
        }
      } catch (e) {
        console.warn("[Ingestion] Skipping invalid NDJSON line");
      }
    }

    if (buffer.length > 0) {
      await bulkInsertLogEntries(batchId, buffer);
      count += buffer.length;
    }
    
    return count;
  }
}

module.exports = new LogIngestionService();
