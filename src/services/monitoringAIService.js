/**
 * AI Service for Passive Monitoring
 * This service handles interactions with the AI backend for report and test generation.
 */

class MonitoringAIService {
  /**
   * STUB: Generate a natural language report from batch analytics and anomalies.
   * TODO: Replace with actual LLM call to Python AI backend.
   */
  async generateInsightsReport(context) {
    console.log("=== AI Insights Report Generation (STUB) ===");
    console.log("Context Data Received for AI Processing:");
    console.log(JSON.stringify(context, null, 2));
    console.log("============================================");

    // Hardcoded stub response as requested
    const report = `AI insights report generation is not yet implemented. Context received: Summary of ${context.analytics.length} analytics types and ${context.anomalies.length} detected anomalies for batch ${context.batch.filename}.`;
    
    return report;
  }

  /**
   * STUB: Trigger test generation from anomalies.
   * TODO: Replace with actual call to AI backend.
   */
  async triggerTestGeneration(batchId, anomalies) {
    console.log(`[AI_STUB] Triggering test generation for batch ${batchId} with ${anomalies.length} anomalies.`);
    console.log("Anomalies evidence for tests:", JSON.stringify(anomalies.map(a => ({ type: a.anomaly_type, path: a.endpoint_path })), null, 2));
    
    // Return a mock task ID
    return `task_mon_${Date.now()}`;
  }
}

module.exports = new MonitoringAIService();
