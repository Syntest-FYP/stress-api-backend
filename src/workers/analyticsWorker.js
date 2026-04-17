const { Worker } = require("bullmq");
const { connection } = require("../config/queue");
const AnalyticsEngine = require("../services/analyticsEngine");

const analyticsWorker = new Worker(
  "log-analytics",
  async (job) => {
    const { batchId } = job.data;
    await AnalyticsEngine.runAnalytics(batchId);
  },
  { connection }
);

analyticsWorker.on("completed", (job) => {
  console.log(`[AnalyticsWorker] Job ${job.id} (Batch ${job.data.batchId}) completed`);
});

analyticsWorker.on("failed", (job, err) => {
  console.error(`[AnalyticsWorker] Job ${job.id} (Batch ${job.data.batchId}) failed:`, err);
});

module.exports = analyticsWorker;
