const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const PassiveLog = require('../models/passiveLog.model');

class MonitoringService {
  /**
   * Parse uploaded log file and save to database
   * @param {string} filePath - Path to the uploaded file
   * @param {string} format - Expected format (json, csv, ndjson)
   * @param {Object} fieldMapping - Optional mapping for non-standard formats
   * @param {string} source - Source of the logs (file_upload, webhook)
   */
  async ingestLogs(filePath, format, fieldMapping = null, source = 'file_upload') {
    const rawData = fs.readFileSync(filePath, 'utf8');
    let logs = [];

    switch (format.toLowerCase()) {
      case 'json':
        logs = this._parseJSON(rawData);
        break;
      case 'csv':
        logs = await this._parseCSV(rawData);
        break;
      case 'ndjson':
        logs = this._parseNDJSON(rawData);
        break;
      default:
        throw new Error(`Unsupported log format: ${format}`);
    }

    const normalizedLogs = logs.map(log => this._normalizeLog(log, fieldMapping, source));
    
    // Bulk insert for performance
    if (normalizedLogs.length > 0) {
      await PassiveLog.insertMany(normalizedLogs, { ordered: false });
    }

    return {
      count: normalizedLogs.length,
      status: 'success'
    };
  }

  _parseJSON(data) {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      throw new Error('Invalid JSON format');
    }
  }

  async _parseCSV(data) {
    return new Promise((resolve, reject) => {
      Papa.parse(data, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (error) => reject(new Error(`CSV parsing failed: ${error.message}`))
      });
    });
  }

  _parseNDJSON(data) {
    return data
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  }

  /**
   * Normalize log entry to PassiveLog schema
   */
  _normalizeLog(log, mapping, source) {
    const timestampKey = mapping?.timestamp || 'timestamp';
    const pathKey = mapping?.endpointPath || 'path';
    const methodKey = mapping?.method || 'method';
    const statusKey = mapping?.statusCode || 'status';
    const responseTimeKey = mapping?.responseTime || 'responseTime';
    const userIdKey = mapping?.userId || 'userId';
    const ipKey = mapping?.ipAddress || 'ip';
    const errorKey = mapping?.errorMessage || 'error';

    return {
      timestamp: log[timestampKey] ? new Date(log[timestampKey]) : new Date(),
      endpointPath: log[pathKey] || '/',
      method: (log[methodKey] || 'GET').toUpperCase(),
      statusCode: parseInt(log[statusKey]) || 200,
      responseTime: parseFloat(log[responseTimeKey]) || 0,
      userId: log[userIdKey] || null,
      ipAddress: log[ipKey] || null,
      errorMessage: log[errorKey] || null,
      rawLog: log,
      source: source,
      metadata: mapping ? new Map(Object.entries(mapping)) : new Map()
    };
  }
}

module.exports = new MonitoringService();
