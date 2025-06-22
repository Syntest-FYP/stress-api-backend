const axios = require("axios");
const { performance } = require("perf_hooks");
const { calculateMetrics } = require("../utils/metrics");

async function runLoadTest(config) {
  const {
    url,
    method = "GET",
    headers = {},
    body = null,
    totalRequests = 100,
    concurrency = 10,
    delay = 0,
    timeout = 10000,
  } = config;

  let activeRequests = 0;
  let completedRequests = 0;

  const results = [];

  const worker = async () => {
    while (completedRequests < totalRequests) {
      if (activeRequests >= concurrency) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        continue;
      }

      activeRequests++;
      completedRequests++;

      const start = performance.now();

      try {
        const response = await axios({
          method,
          url,
          headers,
          data: body,
          timeout,
        });

        const duration = performance.now() - start;

        results.push({
          status: response.status,
          duration,
        });
      } catch (error) {
        const duration = performance.now() - start;

        results.push({
          status: error.response?.status || 0,
          duration,
          error: true,
        });
      } finally {
        activeRequests--;
        if (delay > 0)
          await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };

  const threads = [];
  for (let i = 0; i < concurrency; i++) {
    threads.push(worker());
  }

  await Promise.all(threads);

  const report = calculateMetrics(results, totalRequests);
  return report;
}

module.exports = runLoadTest;
