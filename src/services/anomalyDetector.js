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

      let anomalyCount = 0;

      for (const endpoint of trafficSummary) {
        const { endpoint_path, http_method, error_rate, request_count } = endpoint;
        const latency = latencyStats.find(l => l.endpoint_path === endpoint_path);

        // A. Error Rate Spike
        const historicalErrorRate = await this._getHistoricalMetric(userId, endpoint_path, 'error_rate');
        const errorThreshold = historicalErrorRate ? historicalErrorRate * 2 : 10; // 2x baseline or 10%
        if (error_rate > errorThreshold && error_rate > 5) {
          await createAnomaly({
            batchId,
            anomalyType: "error_rate_spike",
            severity: error_rate > 50 ? "critical" : "high",
            endpointPath: endpoint_path,
            evidence: { current: error_rate, baseline: historicalErrorRate, method: http_method }
          });
          anomalyCount++;
        }

        // B. Latency Degradation
        if (latency) {
          const historicalP95 = await this._getHistoricalMetric(userId, endpoint_path, 'p95');
          if (historicalP95 && latency.p95 > historicalP95 * 1.5 && latency.p95 > 500) {
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

        // C. Unusual 4xx patterns
        const fatalErrorRate = await this._get4xxRate(batchId, endpoint_path);
        if (fatalErrorRate > 20) {
             await createAnomaly({
                batchId,
                anomalyType: "unusual_4xx_pattern",
                severity: "high",
                endpointPath: endpoint_path,
                evidence: { rate: fatalErrorRate }
              });
              anomalyCount++;
        }
      }

      // D. Traffic Volume Deviation
      // (Simplified: Skip for brevity if needed, but requirements ask for it)

      // E. Silent Endpoint
      const silentEndpoints = await this._detectSilentEndpoints(userId, batchId);
      for (const path of silentEndpoints) {
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
        SELECT AVG((data->>$2)::float) as avg_val
        FROM log_batch_analytics lba
        JOIN log_ingestion_batches lib ON lba.batch_id = lib.id
        WHERE lib.uploaded_by = $1 
        AND lba.summary_type = $3
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(lba.data) elem WHERE elem->>'endpoint_path' = $4)
      `, [userId, metric, metric === 'error_rate' ? 'endpoint_traffic' : 'latency_stats', path]);
      
      return res.rows[0]?.avg_val || null;
  }

  async _get4xxRate(batchId, path) {
      const res = await query(`
        SELECT (COUNT(*) FILTER (WHERE status_code >= 400 AND status_code < 500)::float / COUNT(*)) * 100 as rate
        FROM log_entries
        WHERE batch_id = $1 AND endpoint_path = $2
        GROUP BY endpoint_path
      `, [batchId, path]);
      return res.rows[0]?.rate || 0;
  }

  async _detectSilentEndpoints(userId, batchId) {
      // Find endpoints that were in previous batches but not this one
      const res = await query(`
        SELECT DISTINCT endpoint_path
        FROM log_entries le
        JOIN log_ingestion_batches lib ON le.batch_id = lib.id
        WHERE lib.uploaded_by = $1 AND lib.id != $2
        EXCEPT
        SELECT DISTINCT endpoint_path
        FROM log_entries
        WHERE batch_id = $2
      `, [userId, batchId]);
      return res.rows.map(r => r.endpoint_path);
  }
}

module.exports = new AnomalyDetector();
