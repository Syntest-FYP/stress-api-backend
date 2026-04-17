const axios = require("axios");

/**
 * AI Service for Passive Monitoring
 * This service handles interactions with the AI backend for report and test generation.
 */
class MonitoringAIService {
  constructor() {
    // Keep compatibility with both env names used across the backend.
    this.AI_URL = (
      process.env.AI_BACKEND_URL ||
      process.env.PYTHON_BACKEND_URL ||
      "http://localhost:8000"
    ).replace(/\/+$/, "");
  }

  /**
   * Generate a natural language report from batch analytics and anomalies.
   */
  async generateInsightsReport(context) {
    const primaryUrl = `${this.AI_URL}/monitoring/insights`;
    const fallbackUrl = `${this.AI_URL}/api/monitoring/insights`;
    const requestConfig = { timeout: 30000 };

    try {
      console.log("[AI_SERVICE] Generating insights report");
      console.log("[AI_SERVICE] Primary URL:", primaryUrl);
      const response = await axios.post(primaryUrl, context, requestConfig);
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const payload = error.response?.data || error.message;
      console.error("[AI_SERVICE] Primary insights call failed:", payload);

      // Backward-compatible fallback for deployments mounted under /api
      if (status === 404) {
        try {
          console.log("[AI_SERVICE] Trying fallback URL:", fallbackUrl);
          const fallbackResponse = await axios.post(
            fallbackUrl,
            context,
            requestConfig,
          );
          return fallbackResponse.data;
        } catch (fallbackError) {
          console.error(
            "[AI_SERVICE] Fallback insights call failed:",
            fallbackError.response?.data || fallbackError.message,
          );
          throw new Error(
            `AI insights request failed on both primary and fallback URLs: ${fallbackError.message}`,
          );
        }
      }

      throw new Error(`AI insights request failed: ${error.message}`);
    }
  }

  /**
   * Trigger test generation from anomalies.
   * Leverages the OrchestratorAgent to create regression tests.
   */
  async triggerTestGeneration(batchId, anomalies, suiteId, accessToken) {
    try {
      const anomalySummary = anomalies
        .map(
          (a) =>
            `- ${a.anomaly_type} at ${a.endpoint_path}: ${JSON.stringify(a.evidence)}`,
        )
        .join("\n");
      const message = `I found ${anomalies.length} anomalies in my logs for suite ${suiteId}:\n${anomalySummary}\n\nPlease generate regression tests to replicate these failures.`;

      const response = await axios.post(`${this.AI_URL}/chat/`, {
        message,
        suite_id: suiteId,
        accessToken: accessToken,
        anomalies: anomalies, // We'll add this to the schema as well
        endpoints: [], // Orchestrator will load endpoints from DB
      });

      return response.data.session_id || `task_mon_${Date.now()}`;
    } catch (error) {
      console.error(
        "[AI_SERVICE] Test generation trigger failed:",
        error.response?.data || error.message,
      );
      throw new Error(`AI Service Error: ${error.message}`);
    }
  }
}

module.exports = new MonitoringAIService();
