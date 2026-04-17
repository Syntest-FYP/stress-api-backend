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

      console.log(`[AnomalyDetector] Data: Traffic=${trafficSummary.length}, Latency=${latencyStats.length}, StatusCodes=${statusCodes.length}`);
      
      let anomalyCount = 0;

      // A. Specific Outage Detection (Wide Spread)
      const totalRequests = statusCodes.reduce((sum, s) => sum + parseInt(s.count), 0);
      const totalEndpoints = trafficSummary.length;

      // 1. Authentication Outage (401/403)
      const authCodes = statusCodes.filter(s => [401, 403].includes(parseInt(s.status_code)));
      const authCount = authCodes.reduce((sum, s) => sum + parseInt(s.count), 0);
      const authRate = totalRequests > 0 ? (authCount / totalRequests) * 100 : 0;
      const authAffectedEndpoints = authCodes.length > 0 ? Math.max(...authCodes.map(s => parseInt(s.unique_endpoints))) : 0;
      const authSpread = totalEndpoints > 0 ? (authAffectedEndpoints / totalEndpoints) * 100 : 0;

      if (authRate > 15 || (authRate > 2 && authSpread > 50)) {
        console.log(`[AnomalyDetector] Auth outage detected: ${authRate.toFixed(2)}% rate | ${authSpread.toFixed(2)}% endpoints affected`);
        await createAnomaly({
          batchId,
          anomalyType: "authentication_outage",
          severity: "critical",
          endpointPath: "*",
          evidence: { rate: authRate, spread: authSpread, codes: authCodes }
        });
        anomalyCount++;
      }

      // 2. Service Outage (500/502/503/504/422)
      // Including 422 as it often indicates systemic validation failures during deployments
      const svcCodes = statusCodes.filter(s => [500, 502, 503, 504, 422].includes(parseInt(s.status_code)));
      const svcCount = svcCodes.reduce((sum, s) => sum + parseInt(s.count), 0);
      const svcRate = totalRequests > 0 ? (svcCount / totalRequests) * 100 : 0;
      const svcAffectedEndpoints = svcCodes.length > 0 ? Math.max(...svcCodes.map(s => parseInt(s.unique_endpoints))) : 0;
      const svcSpread = totalEndpoints > 0 ? (svcAffectedEndpoints / totalEndpoints) * 100 : 0;

      if (svcRate > 15 || (svcRate > 2 && svcSpread > 50)) {
        // Elevate severity to critical if error rate is extremely high (e.g., > 70%)
        const isExtreme = svcRate > 70;
        console.log(`[AnomalyDetector] ${isExtreme ? 'SEVERE ' : ''}Service outage detected: ${svcRate.toFixed(2)}% rate | ${svcSpread.toFixed(2)}% endpoints affected`);
        
        await createAnomaly({
          batchId,
          anomalyType: "service_outage",
          severity: isExtreme ? "critical" : "high",
          endpointPath: "*",
          evidence: { rate: svcRate, spread: svcSpread, codes: svcCodes }
        });
        anomalyCount++;
      }

      // NEW: B. Scraping / Bot Detection (High volume, null user IDs, or 429s)
      const scrapingIps = await this._detectScraping(batchId);
      if (scrapingIps.length > 0) {
        console.log(`[AnomalyDetector] Found ${scrapingIps.length} potential scraping sources`);
      }
      
      for (const scrap of scrapingIps) {
        if (!scrap.endpoint_id) {
            console.log(`[AnomalyDetector] WARNING: Scraping detected on ${scrap.endpoint_path} but endpoint_id is NULL`);
        }
        await createAnomaly({
          batchId,
          anomalyType: "scraping_attack",
          severity: "high",
          endpointPath: scrap.endpoint_path || "*",
          evidence: { ip: scrap.ip_address, requests: scrap.count, user_id: "null" },
          endpointId: scrap.endpoint_id
        });
        anomalyCount++;
      }

      let affectedLatencyCount = 0;

      for (const endpoint of trafficSummary) {
        const { endpoint_path, http_method, error_rate, request_count } = endpoint;
        const latency = latencyStats.find(l => l.endpoint_path === endpoint_path);

        console.log(`[AnomalyDetector] Evaluation: ${http_method} ${endpoint_path} | Count: ${request_count} | Error: ${error_rate.toFixed(2)}%`);

        // C. Error Rate Spike
        const historicalErrorRate = await this._getHistoricalMetric(userId, batchId, endpoint_path, 'error_rate');
        const errorThreshold = historicalErrorRate !== null ? Math.max(historicalErrorRate * 2, 8) : 8;
        
        if (error_rate > errorThreshold && error_rate > 2) {
          console.log(`[AnomalyDetector] Anomaly: Error Spike on ${endpoint_path} (${error_rate.toFixed(2)}% vs baseline ${historicalErrorRate?.toFixed(2) || '0.00'}%)`);
          await createAnomaly({
            batchId,
            anomalyType: "error_rate_spike",
            severity: error_rate > 50 ? "critical" : "high",
            endpointPath: endpoint_path,
            evidence: { 
              current: error_rate.toFixed(1), 
              baseline: historicalErrorRate?.toFixed(1) || '0.0', 
              multiplier: historicalErrorRate > 0 ? (error_rate / historicalErrorRate).toFixed(1) : 'N/A'
            },
            endpointId: endpoint.endpoint_id
          });
          anomalyCount++;
        }

        // D. Latency Degradation (Improved)
        if (latency) {
          const historicalP95 = await this._getHistoricalMetric(userId, batchId, endpoint_path, 'p95');
          const baseline = historicalP95 || 1000; // Default 1s if no history
          const ratio = latency.p95 / baseline;
          
          // Condition: 1.5x increase AND at least 200ms jump AND > 300ms total
          if (latency.p95 > (baseline * 1.5) && (latency.p95 - baseline) > 200 && latency.p95 > 300) {
            let severity = "medium";
            
            // Critical: > 5x latency jump OR > 10s absolute latency
            if (ratio > 5 || latency.p95 > 10000) {
              severity = "critical";
            } 
            // High: > 3x latency jump OR > 5s absolute latency
            else if (ratio > 3 || latency.p95 > 5000) {
              severity = "high";
            }

            console.log(`[AnomalyDetector] Anomaly: Latency Spike on ${endpoint_path} (${latency.p95.toFixed(0)}ms vs baseline ${baseline.toFixed(0)}ms, severity: ${severity})`);
            
            await createAnomaly({
              batchId,
              anomalyType: "latency_degradation",
              severity,
              endpointPath: endpoint_path,
              evidence: { 
                current_p95: latency.p95, 
                baseline_p95: historicalP95, 
                ratio: ratio.toFixed(2) 
              },
              endpointId: latency.endpoint_id
            });
            anomalyCount++;
            affectedLatencyCount++;
          }
        }
      }

      // A3. Global Latency Degradation (Wide Spread)
      const latencySpread = totalEndpoints > 0 ? (affectedLatencyCount / totalEndpoints) * 100 : 0;
      if (latencySpread > 50) {
        console.log(`[AnomalyDetector] Global latency degradation detected: ${latencySpread.toFixed(2)}% of endpoints affected`);
        await createAnomaly({
          batchId,
          anomalyType: "global_latency_degradation",
          severity: "high",
          endpointPath: "*",
          evidence: { spread: latencySpread, affected_endpoints: affectedLatencyCount }
        });
        anomalyCount++;
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

  async _getHistoricalMetric(userId, batchId, path, metric) {
      // Get avg of last 5 batches for this endpoint to establish a moving baseline
      // CRITICAL: Exclude current batchId to avoid baseline pollution
      const res = await query(`
        SELECT AVG(val) as avg_val FROM (
          SELECT (elem->>$2)::float as val
          FROM log_batch_analytics lba
          JOIN log_ingestion_batches lib ON lba.batch_id = lib.id
          CROSS JOIN LATERAL jsonb_array_elements(lba.data) elem
          WHERE lib.uploaded_by = $1 
          AND lib.id != $5
          AND lba.summary_type = $3
          AND elem->>'endpoint_path' = $4
          AND lib.status = 'complete'
          ORDER BY lib.created_at DESC
          LIMIT 5
        ) last_5
      `, [userId, metric, metric === 'error_rate' ? 'endpoint_traffic' : 'latency_stats', path, batchId]);
      
      const val = res.rows[0]?.avg_val;
      return val !== null ? parseFloat(val) : null;
  }

  async _detectScraping(batchId) {
      // Detect IPs with moderate/high volume and null user IDs or 429s (Threshold lowered to 80)
      const res = await query(`
        SELECT ip_address, endpoint_path, endpoint_id, COUNT(*) as count
        FROM log_entries
        WHERE batch_id = $1 
        AND (user_id IS NULL OR user_id = 'null' OR status_code = 429)
        GROUP BY ip_address, endpoint_path, endpoint_id
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
