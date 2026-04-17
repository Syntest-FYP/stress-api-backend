const { Queue, Worker, QueueEvents } = require("bullmq");
const IORedis = require("ioredis");

const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6380"),
  password: process.env.REDIS_PASSWORD || "sllgVD@",
  maxRetriesPerRequest: null,
};

const connection = new IORedis(redisConfig);

const ingestionQueue = new Queue("log-ingestion", { connection });
const analyticsQueue = new Queue("log-analytics", { connection });
const anomalyQueue = new Queue("log-anomaly", { connection });

module.exports = {
  connection,
  ingestionQueue,
  analyticsQueue,
  anomalyQueue,
};
