const { Worker } = require("bullmq");
const { connection } = require("../config/queue");
const LogIngestionService = require("../services/logIngestionService");

const ingestionWorker = new Worker(
  "log-ingestion",
  async (job) => {
    const { batchId, filePath, format, fieldMapping } = job.data;
    await LogIngestionService.processIngestion(batchId, filePath, format, fieldMapping);
  },
  { connection }
);

ingestionWorker.on("completed", (job) => {
  console.log(`[IngestionWorker] Job ${job.id} (Batch ${job.data.batchId}) completed`);
});

ingestionWorker.on("failed", (job, err) => {
  console.error(`[IngestionWorker] Job ${job.id} (Batch ${job.data.batchId}) failed:`, err);
});

module.exports = ingestionWorker;
