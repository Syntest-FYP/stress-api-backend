const { query } = require("../config/postgres");
const { createAnomaly, updateBatchStatus } = require("../models/monitoring.model");

class AnomalyDetector {
  /**
   * Run anomaly detection for a batch
   */
  async runDetection(batchId) {
    console.log(`[AnomalyDetector] Running for batch ${batchId}`);
    
    try {
      const batch = await this._getBatch(batchId);
      const userId = batch.uploaded_by;

      // 1. Fetch current analytics
      const analytics = await this._getAnalytics(batchId);
      const trafficSummary = analytics.find(a => a.summary_type === 'endpoint_traffic')?.data || [];
      const latencyStats = analytics.find(a => a.summary_type === 'latency_stats')?.data || [];
      const statusCodes = analytics.find(a => a.summary_type === 'status_codes')?.data || [];

      let anomalyCount = 0;

      // NEW: A. Global Auth/Service Outage Detection
      const totalRequests = statusCodes.reduce((sum, s) => sum + parseInt(s.count), 0);
      const outageCodes = statusCodes.filter(s => [401, 503].includes(parseInt(s.status_code)));
      const outageCount = outageCodes.reduce((sum, s) => sum + parseInt(s.count), 0);
      const outageRate = totalRequests > 0 ? (outageCount / totalRequests) * 100 : 0;

      if (outageRate > 10) {
        console.log(`[AnomalyDetector] Global outage detected: ${outageRate.toFixed(2)}% of traffic returned 401/503`);
        await createAnomaly({
          batchId,
          anomalyType: "global_outage",
          severity: "critical",
          endpointPath: "*",
          evidence: { rate: outageRate, codes: outageCodes }
        });
        anomalyCount++;
      }

      // NEW: B. Scraping / Bot Detection (High volume, null user IDs, or 429s)
      const scrapingIps = await this._detectScraping(batchId);
      for (const scrap of scrapingIps) {
        await createAnomaly({
          batchId,
          anomalyType: "scraping_attack",
          severity: "high",
          endpointPath: scrap.endpoint_path || "*",
          evidence: { ip: scrap.ip_address, requests: scrap.count, user_id: "null" }
        });
        anomalyCount++;
      }

      for (const endpoint of trafficSummary) {
        const { endpoint_path, http_method, error_rate, request_count } = endpoint;
        const latency = latencyStats.find(l => l.endpoint_path === endpoint_path);

        console.log(`[AnomalyDetector] Evaluation: ${http_method} ${endpoint_path} | Count: ${request_count} | Error: ${error_rate.toFixed(2)}%`);

        // C. Error Rate Spike
        const historicalErrorRate = await this._getHistoricalMetric(userId, endpoint_path, 'error_rate');
        const errorThreshold = historicalErrorRate !== null ? Math.max(historicalErrorRate * 2, 8) : 8;
        
        if (error_rate > errorThreshold && error_rate > 2) {
          console.log(`[AnomalyDetector] Anomaly: Error Spike on ${endpoint_path} (${error_rate.toFixed(2)}% vs baseline ${historicalErrorRate?.toFixed(2) || '0.00'}%)`);
          await createAnomaly({
            batchId,
            anomalyType: "error_rate_spike",
            severity: error_rate > 50 ? "critical" : "high",
            endpointPath: endpoint_path,
            evidence: { current: error_rate, baseline: historicalErrorRate, method: http_method }
          });
          anomalyCount++;
        }

        // D. Latency Degradation
        if (latency) {
          const historicalP95 = await this._getHistoricalMetric(userId, endpoint_path, 'p95');
          const latencyThreshold = historicalP95 !== null ? historicalP95 * 1.5 : 1000; // Default 1s if no history
          
          if (latency.p95 > latencyThreshold && latency.p95 > 300) {
            console.log(`[AnomalyDetector] Anomaly: Latency Spike on ${endpoint_path} (${latency.p95.toFixed(2)}ms vs baseline ${historicalP95?.toFixed(2) || 'N/A'}ms)`);
            await createAnomaly({
              batchId,
              anomalyType: "latency_degradation",
              severity: "medium",
              endpointPath: endpoint_path,
              evidence: { current: latency.p95, baseline: historicalP95 }
            });
            anomalyCount++;
          }
        }
      }

      // E. Silent Endpoint
      const silentEndpoints = await this._detectSilentEndpoints(userId, batchId);
      for (const path of silentEndpoints) {
          // Skip the root path and common noise
          if (path === "/" || path === "/health") continue;

          await createAnomaly({
            batchId,
            anomalyType: "silent_endpoint",
            severity: "low",
            endpointPath: path,
            evidence: { message: "Endpoint has no activity in this batch but had activity previously." }
          });
          anomalyCount++;
      }

      await updateBatchStatus(batchId, "complete", { anomalies_found: anomalyCount });
      console.log(`[AnomalyDetector] Batch ${batchId} complete. Found ${anomalyCount} anomalies.`);

    } catch (error) {
        console.error(`[AnomalyDetector] Batch ${batchId} failed:`, error);
        throw error;
    }
  }

  async _getBatch(batchId) {
    const res = await query("SELECT * FROM log_ingestion_batches WHERE id = $1", [batchId]);
    return res.rows[0];
  }

  async _getAnalytics(batchId) {
    const res = await query("SELECT summary_type, data FROM log_batch_analytics WHERE batch_id = $1", [batchId]);
    return res.rows;
  }

  async _getHistoricalMetric(userId, path, metric) {
      // Get avg of last 5 batches for this endpoint
      const res = await query(`
        SELECT AVG((elem->>$2)::float) as avg_val
        FROM log_batch_analytics lba
        JOIN log_ingestion_batches lib ON lba.batch_id = lib.id
        CROSS JOIN LATERAL jsonb_array_elements(lba.data) elem
        WHERE lib.uploaded_by = $1 
        AND lba.summary_type = $3
        AND elem->>'endpoint_path' = $4
        AND lib.status = 'complete'
      `, [userId, metric, metric === 'error_rate' ? 'endpoint_traffic' : 'latency_stats', path]);
      
      const val = res.rows[0]?.avg_val;
      return val !== null ? parseFloat(val) : null;
  }

  async _detectScraping(batchId) {
      // Detect IPs with moderate/high volume and null user IDs or 429s (Threshold lowered to 80)
      const res = await query(`
        SELECT ip_address, endpoint_path, COUNT(*) as count
        FROM log_entries
        WHERE batch_id = $1 
        AND (user_id IS NULL OR user_id = 'null' OR status_code = 429)
        GROUP BY ip_address, endpoint_path
        HAVING COUNT(*) > 80
      `, [batchId]);
      return res.rows;
  }

  async _detectSilentEndpoints(userId, batchId) {
      // Find endpoints that were in previous batches but not this one
      // Filter out 'legacy' unnormalized paths using regex
      const res = await query(`
        WITH previous_active_endpoints AS (
          SELECT endpoint_path, COUNT(*) as total_calls
          FROM log_entries le
          JOIN log_ingestion_batches lib ON le.batch_id = lib.id
          WHERE lib.uploaded_by = $1 AND lib.id != $2
          AND endpoint_path !~ '[0-9a-f]{8}-[0-9a-f]{4}'
          AND endpoint_path !~ '[0-9a-f]{32}'
          AND endpoint_path !~ '/[0-9]{4,}'
          GROUP BY endpoint_path
          HAVING COUNT(*) > 20
        )
        SELECT endpoint_path FROM previous_active_endpoints
        EXCEPT
        SELECT DISTINCT endpoint_path
        FROM log_entries
        WHERE batch_id = $2
      `, [userId, batchId]);
      return res.rows.map(r => r.endpoint_path);
  }
}

module.exports = new AnomalyDetector();
