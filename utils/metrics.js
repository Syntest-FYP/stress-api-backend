function calculateMetrics(results, totalRequests) {
  const durations = results.map((r) => r.duration);
  const successResponses = results.filter((r) => !r.error);
  const errors = results.filter((r) => r.error);
  const statusCodes = {};

  results.forEach((r) => {
    const code = r.status || "ERR";
    statusCodes[code] = (statusCodes[code] || 0) + 1;
  });

  durations.sort((a, b) => a - b);
  const p = (percentile) =>
    durations[Math.floor((percentile / 100) * durations.length)] || 0;

  const totalDuration = durations.reduce((sum, d) => sum + d, 0);
  const average = totalDuration / durations.length;
  const throughput = (
    durations.length /
    (Math.max(...durations) / 1000)
  ).toFixed(2);

  return {
    totalRequests,
    successful: successResponses.length,
    failed: errors.length,
    averageResponseTime: average.toFixed(2),
    minResponseTime: Math.min(...durations).toFixed(2),
    maxResponseTime: Math.max(...durations).toFixed(2),
    p50: p(50).toFixed(2),
    p90: p(90).toFixed(2),
    p95: p(95).toFixed(2),
    throughput: `${throughput} req/sec`,
    statusCodes,
  };
}

module.exports = { calculateMetrics };
