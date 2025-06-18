const axios = require("axios");
const { performance } = require("perf_hooks");

class LoadTester {
  constructor({
    url,
    method = "GET",
    headers = [],
    body = "",
    totalRequests = 100,
    concurrency = 10,
  }) {
    this.url = url;
    this.method = method.toUpperCase();
    this.headers = headers.reduce((acc, { key, value }) => {
      acc[key] = value;
      return acc;
    }, {});
    this.body = body;
    this.totalRequests = totalRequests;
    this.concurrency = concurrency;

    this.latencies = [];
    this.statusCodes = {};
    this.results = [];
    this.errors = 0;
  }

  async _sendRequest() {
    const start = performance.now();
    try {
      const response = await axios({
        method: this.method,
        url: this.url,
        headers: this.headers,
        data: this.body,
        timeout: 10000,
      });

      const latency = performance.now() - start;
      const status = response.status;

      this.latencies.push(latency);
      this.statusCodes[status] = (this.statusCodes[status] || 0) + 1;
      this.results.push({
        success: true,
        responseTime: latency,
        status,
        timestamp: Date.now(),
        error: null,
      });
    } catch (err) {
      const latency = performance.now() - start;
      this.errors++;
      this.latencies.push(latency);
      this.results.push({
        success: false,
        responseTime: latency,
        status: "ERR",
        timestamp: Date.now(),
        error: err.message,
      });
    }
  }

  async _worker(batchSize) {
    for (let i = 0; i < batchSize; i++) {
      await this._sendRequest();
    }
  }

  async runAndReturn() {
    const start = performance.now();
    const batchSize = Math.ceil(this.totalRequests / this.concurrency);
    const workers = [];

    for (let i = 0; i < this.concurrency; i++) {
      workers.push(this._worker(batchSize));
    }

    await Promise.all(workers);

    const totalTime = (performance.now() - start) / 1000;
    const avg =
      this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
    const min = Math.min(...this.latencies);
    const max = Math.max(...this.latencies);

    return {
      totalRequests: this.totalRequests,
      concurrency: this.concurrency,
      errors: this.errors,
      totalTime,
      averageResponseTime: avg,
      minResponseTime: min,
      maxResponseTime: max,
      requestsPerSecond: this.totalRequests / totalTime,
      statusCodes: this.statusCodes,
      results: this.results,
    };
  }
}

module.exports = LoadTester;
