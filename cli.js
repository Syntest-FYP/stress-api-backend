#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const runLoadTestEngine = require("./services/loadTester");

const argv = yargs(hideBin(process.argv))
  .option("url", { type: "string", demandOption: true, describe: "Target URL" })
  .option("method", { type: "string", default: "GET", describe: "HTTP method" })
  .option("headers", { type: "string", describe: "JSON string of headers" })
  .option("body", { type: "string", describe: "JSON string of request body" })
  .option("concurrency", {
    type: "number",
    default: 10,
    describe: "Concurrent requests",
  })
  .option("requests", {
    type: "number",
    default: 100,
    describe: "Total number of requests",
  })
  .option("delay", {
    type: "number",
    default: 0,
    describe: "Delay between requests (ms)",
  })
  .option("timeout", {
    type: "number",
    default: 10000,
    describe: "Request timeout (ms)",
  })
  .option("save", {
    type: "boolean",
    default: false,
    describe: "Save output to JSON file",
  })
  .help().argv;

let config;

try {
  config = {
    url: argv.url,
    method: argv.method.toUpperCase(),
    headers: argv.headers ? JSON.parse(argv.headers) : {},
    body: argv.body ? JSON.parse(argv.body) : null,
    totalRequests: argv.requests,
    concurrency: argv.concurrency,
    delay: argv.delay,
    timeout: argv.timeout,
  };
} catch (e) {
  console.error("!! Failed to parse headers/body as JSON.");
  process.exit(1);
}

(async () => {
  console.log(
    `Running test on ${config.url} with ${config.totalRequests} requests...`
  );

  const result = await runLoadTestEngine(config);

  console.log("\n⇢ Test Report:\n", result);

  if (argv.save) {
    const filename = `report_${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;
    const outputPath = path.join(__dirname, "reports");

    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath);
    }

    const filePath = path.join(outputPath, filename);
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2));

    console.log(`\n⇢ Report saved to: ${filePath}`);
  }
})();
