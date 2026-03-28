const axios = require("axios");

/**
 * AI Service for Passive Monitoring
 * This service handles interactions with the AI backend for report and test generation.
 */
class MonitoringAIService {
  constructor() {
    this.AI_URL = process.env.AI_BACKEND_URL || "http://localhost:8000";
  }

  /**
   * Generate a natural language report from batch analytics and anomalies.
   */
  async generateInsightsReport(context) {
    try {
      // Mapping the request to the Python MonitoringAgent's insights endpoint
      const response = await axios.post(`${this.AI_URL}/monitoring/insights`, context);
      return response.data;
    } catch (error) {
      console.error("[AI_SERVICE] Report generation failed:", error.response?.data || error.message);
      return `Failed to generate AI report: ${error.message}`;
    }
  }

  /**
   * Trigger test generation from anomalies.
   * Leverages the OrchestratorAgent to create regression tests.
   */
  async triggerTestGeneration(batchId, anomalies, suiteId, accessToken) {
    try {
      const anomalySummary = anomalies.map(a => `- ${a.anomaly_type} at ${a.endpoint_path}: ${JSON.stringify(a.evidence)}`).join("\n");
      const message = `I found ${anomalies.length} anomalies in my logs for suite ${suiteId}:\n${anomalySummary}\n\nPlease generate regression tests to replicate these failures.`;
      
      const response = await axios.post(`${this.AI_URL}/chat/`, {
        message,
        suite_id: suiteId,
        accessToken: accessToken,
        anomalies: anomalies, // We'll add this to the schema as well
        endpoints: [] // Orchestrator will load endpoints from DB
      });

      return response.data.session_id || `task_mon_${Date.now()}`;
    } catch (error) {
      console.error("[AI_SERVICE] Test generation trigger failed:", error.response?.data || error.message);
      throw new Error(`AI Service Error: ${error.message}`);
    }
  }
}

module.exports = new MonitoringAIService();
