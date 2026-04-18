const { Queue } = require("bullmq");
const Redis = require("ioredis");
require("dotenv").config();

const connection = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379",
  {
    maxRetriesPerRequest: null,
  },
);

const MONITORING_QUEUE_NAME = "monitoring_jobs";

const monitoringQueue = new Queue(MONITORING_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: false,
  },
});

module.exports = {
  monitoringQueue,
  connection,
  MONITORING_QUEUE_NAME,
};
