const Redis = require("redis");

let redisClient;

async function initializeRedisPublisher() {
  if (!redisClient) {
    redisClient = Redis.createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });

    redisClient.on("error", (err) => console.error("[Redis Publisher Error]", err));

    try {
      await redisClient.connect();
      console.log("[Redis Publisher] Connected to Redis successfully!");
    } catch (err) {
      console.error("[Redis Publisher Error] Failed to connect to Redis:", err);
    }
  }
  return redisClient;
}

async function publishA2AMessage(channel, message) {
  if (!redisClient || !redisClient.isReady) {
    console.warn("[Redis Publisher Warning] Redis client not connected. Attempting to re-initialize.");
    await initializeRedisPublisher();
    if (!redisClient.isReady) {
        console.error("[Redis Publisher Error] Redis client still not ready, cannot publish message.");
        return;
    }
  }
  try {
    await redisClient.publish(channel, JSON.stringify(message));
    console.log(`[Redis Publisher] Published message to channel '${channel}'.`);
  } catch (error) {
    console.error(`[Redis Publisher Error] Failed to publish message to channel '${channel}':`, error);
  }
}

module.exports = { initializeRedisPublisher, publishA2AMessage };
