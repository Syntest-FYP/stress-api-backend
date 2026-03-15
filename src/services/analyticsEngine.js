const { query } = require("../config/postgres");
const { saveAnalytics } = require("../models/monitoring.model");
const { anomalyQueue } = require("../config/queue");

class AnalyticsEngine {
  /**
   * Run analytics for a batch
   */
  async runAnalytics(batchId) {
    console.log(`[Analytics] Running for batch ${batchId}`);
    
    try {
      // 1. Endpoint traffic summaries
      const trafficSummary = await this._computeTrafficSummary(batchId);
      await saveAnalytics(batchId, "endpoint_traffic", trafficSummary);

      // 2. Status code breakdown
      const statusCodes = await this._computeStatusCodeBreakdown(batchId);
      await saveAnalytics(batchId, "status_codes", statusCodes);

      // 3. Latency percentiles
      const latencyStats = await this._computeLatencyStats(batchId);
      await saveAnalytics(batchId, "latency_stats", latencyStats);

      // 4. Top error clusters
      const errorClusters = await this._computeErrorClusters(batchId);
      await saveAnalytics(batchId, "error_clusters", errorClusters);

      console.log(`[Analytics] Batch ${batchId} analytics complete.`);
      
      // Trigger Anomaly Detection
      await anomalyQueue.add("detect", { batchId });

    } catch (error) {
      console.error(`[Analytics] Batch ${batchId} failed:`, error);
      throw error;
    }
  }

  async _computeTrafficSummary(batchId) {
    const res = await query(`
      SELECT 
        endpoint_path, 
        http_method, 
        COUNT(*) as request_count,
        COUNT(*) FILTER (WHERE status_code >= 400) as error_count,
        (COUNT(*) FILTER (WHERE status_code >= 400)::float / COUNT(*)) * 100 as error_rate
      FROM log_entries
      WHERE batch_id = $1
      GROUP BY endpoint_path, http_method
      ORDER BY request_count DESC
    `, [batchId]);
    return res.rows;
  }

  async _computeStatusCodeBreakdown(batchId) {
    const res = await query(`
      SELECT status_code, COUNT(*) as count
      FROM log_entries
      WHERE batch_id = $1
      GROUP BY status_code
      ORDER BY status_code ASC
    `, [batchId]);
    return res.rows;
  }

  async _computeLatencyStats(batchId) {
    const res = await query(`
      SELECT 
        endpoint_path,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_ms) as p50,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY response_time_ms) as p90,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) as p99
      FROM log_entries
      WHERE batch_id = $1
      GROUP BY endpoint_path
    `, [batchId]);
    return res.rows;
  }

  async _computeErrorClusters(batchId, topN = 5) {
    const res = await query(`
      SELECT endpoint_path, status_code, COUNT(*) as error_count
      FROM log_entries
      WHERE batch_id = $1 AND status_code >= 400
      GROUP BY endpoint_path, status_code
      ORDER BY error_count DESC
      LIMIT $2
    `, [batchId, topN]);
    return res.rows;
  }
}

module.exports = new AnalyticsEngine();
