const { Worker } = require("bullmq");
const { connection } = require("../config/queue");
const AnomalyDetector = require("../services/anomalyDetector");

const anomalyWorker = new Worker(
  "log-anomaly",
  async (job) => {
    const { batchId } = job.data;
    await AnomalyDetector.runDetection(batchId);
  },
  { connection }
);

anomalyWorker.on("completed", (job) => {
  console.log(`[AnomalyWorker] Job ${job.id} (Batch ${job.data.batchId}) completed`);
});

anomalyWorker.on("failed", (job, err) => {
  console.error(`[AnomalyWorker] Job ${job.id} (Batch ${job.data.batchId}) failed:`, err);
});

module.exports = anomalyWorker;
