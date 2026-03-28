const Redis = require("redis");

let redisClient;

function getRedisUrl() {
  if (process.env.REDIS_URL && process.env.REDIS_URL.trim()) {
    return process.env.REDIS_URL.trim();
  }
  const host = process.env.REDIS_HOST || "127.0.0.1";
  const port = process.env.REDIS_PORT || "6380";
  const password = process.env.REDIS_PASSWORD;
  const db = process.env.REDIS_DB != null ? String(process.env.REDIS_DB) : "0";
  if (password) {
    const encoded = encodeURIComponent(password);
    return `redis://:${encoded}@${host}:${port}/${db}`;
  }
  return `redis://${host}:${port}/${db}`;
}

async function initializeRedisPublisher() {
  if (!redisClient) {
    const url = getRedisUrl();
    redisClient = Redis.createClient({ url });

    redisClient.on("error", (err) =>
      console.error("[Redis Publisher Error]", err),
    );

    try {
      await redisClient.connect();
      console.log("[Redis Publisher] Connected to Redis successfully!");
    } catch (err) {
      console.error(
        "[Redis Publisher Error] Failed to connect to Redis:",
        err,
      );
    }
  }
  return redisClient;
}

async function publishA2AMessage(channel, message) {
  if (!redisClient || !redisClient.isReady) {
    console.warn(
      "[Redis Publisher Warning] Redis client not connected. Attempting to re-initialize.",
    );
    await initializeRedisPublisher();
    if (!redisClient.isReady) {
      console.error(
        "[Redis Publisher Error] Redis client still not ready, cannot publish message.",
      );
      return;
    }
  }
  try {
    await redisClient.publish(channel, JSON.stringify(message));
    console.log(`[Redis Publisher] Published message to channel '${channel}'.`);
  } catch (error) {
    console.error(
      `[Redis Publisher Error] Failed to publish message to channel '${channel}':`,
      error,
    );
  }
}

module.exports = { initializeRedisPublisher, publishA2AMessage };
