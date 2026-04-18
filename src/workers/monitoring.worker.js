const { Worker } = require("bullmq");
const Redis = require("ioredis");
const axios = require("axios");
const monitoringModel = require("../models/monitoring.model");
const environmentModel = require("../models/environment.model");
const dataProviderService = require("../services/dataProvider.service");
const suitesService = require("../services/suitesService");
const { dispatchAlert } = require("../services/alertDispatcher.service");
const { publishA2AMessage } = require("../utils/redisPublisher");
require("dotenv").config();

const connection = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379",
  {
    maxRetriesPerRequest: null,
  },
);

async function runMonitoringJob(jobId) {
  console.log(`[JOB START] Running jobId=${jobId}`);

  const job = await monitoringModel.getMonitoringJobById(jobId);
  if (!job || !job.is_active) {
    console.warn(`[JOB SKIP] Job not found or inactive. jobId=${jobId}`);
    return;
  }

  console.log(
    `[JOB INFO] name=${job.name}, steps=${job.test_case_definitions?.length}`,
  );

  const testCases = job.test_case_definitions;
  const results = [];
  let jobOverallStatus = "pass";
  let jobTotalLatency = 0;
  let executionContext = {};

  for (let i = 0; i < testCases.length; i++) {
    const step = testCases[i];
    console.log(`\n[STEP ${i + 1}] Starting`, {
      url: step.url,
      method: step.method,
    });

    const start = Date.now();
    let stepResult = { status: "pass", latency: 0, assertions: [] };

    try {
      const resolvedStep = await dataProviderService.resolveExecutionStep(
        step,
        job.target_environment_id,
        executionContext,
      );

      console.log(`[STEP ${i + 1}] Resolved step`, resolvedStep);

      let resolvedUrl = resolvedStep.url;

      console.log(`[STEP ${i + 1}] URL before resolution:`, resolvedUrl);

      if (resolvedUrl && !resolvedUrl.startsWith("http")) {
        let env;

        try {
          if (job.target_environment_id) {
            console.log(`[STEP ${i + 1}] Fetching target environment`, {
              target_environment_id: job.target_environment_id,
            });

            env = await dataProviderService.getEnvironment(
              job.target_environment_id,
            );

            console.log(`[STEP ${i + 1}] Env fetched (target):`, env);
          } else if (job.user_id && job.suite_id) {
            console.log(`[STEP ${i + 1}] Fetching fallback environments`, {
              user_id: job.user_id,
              suite_id: job.suite_id,
            });

            const envs = await environmentModel.listEnvironmentsByUser(
              job.user_id,
              job.suite_id,
            );

            console.log(`[STEP ${i + 1}] Env list:`, envs?.length);

            env = envs.find((e) => e.is_default) || envs[0] || null;

            console.log(`[STEP ${i + 1}] Selected fallback env:`, env);
          } else {
            console.warn(
              `[STEP ${i + 1}] No env resolution path (no target_environment_id or suite fallback)`,
            );
          }

          // 👇 CRITICAL CHECK
          console.log(`[STEP ${i + 1}] Env before URL build:`, env);

          if (env && env.base_url) {
            const base = env.base_url.replace(/\/$/, "");
            const path = resolvedUrl.startsWith("/")
              ? resolvedUrl
              : `${resolvedUrl}`;

            resolvedUrl = base + path;

            console.log(`[STEP ${i + 1}] Final resolved URL:`, resolvedUrl);
          } else {
            console.warn(`[STEP ${i + 1}] Env missing or no base_url`, env);
          }
        } catch (envErr) {
          console.error(
            `[STEP ${i + 1}] ENV RESOLUTION ERROR:`,
            envErr.message,
            envErr.stack,
          );
          throw envErr; // rethrow so your outer catch logs it
        }
      } else {
        console.log(
          `[STEP ${i + 1}] URL is already absolute, skipping env resolution`,
        );
      }

      console.log(`[STEP ${i + 1}] Making request`, {
        method: resolvedStep.method,
        url: resolvedUrl,
      });

      const response = await axios({
        method: resolvedStep.method,
        url: resolvedUrl,
        headers: resolvedStep.headers || {},
        data: resolvedStep.body || {},
        timeout: 10000,
        validateStatus: null,
      });

      const latency = Date.now() - start;
      stepResult.latency = latency;
      jobTotalLatency += latency;

      console.log(`[STEP ${i + 1}] Response`, {
        status: response.status,
        latency,
      });

      // Assertions
      if (step.assertions) {
        console.log(`[STEP ${i + 1}] Running assertions`);

        for (const assertion of step.assertions) {
          let passed = false;

          if (assertion.type === "status") {
            passed = response.status === parseInt(assertion.expected);
          } else if (assertion.type === "body_contains") {
            const bodyStr = JSON.stringify(response.data);
            passed = bodyStr.includes(assertion.expected);
          }

          console.log(`[ASSERTION]`, {
            type: assertion.type,
            expected: assertion.expected,
            passed,
          });

          stepResult.assertions.push({
            type: assertion.type,
            expected: assertion.expected,
            actual:
              assertion.type === "status" ? response.status : "checked body",
            passed,
          });

          if (!passed) stepResult.status = "fail";
        }
      } else {
        if (response.status >= 300) {
          console.warn(
            `[STEP ${i + 1}] No assertions but bad status: ${response.status}`,
          );
          stepResult.status = "fail";
        }
      }

      // Extracts
      if (step.extracts && Array.isArray(step.extracts)) {
        console.log(`[STEP ${i + 1}] Extracting values`);

        for (const extract of step.extracts) {
          if (extract.type === "json" && response.data) {
            try {
              const paths = extract.query.split(".");
              let val = response.data;

              for (const p of paths) {
                val = val?.[p];
              }

              if (val !== undefined && val !== null) {
                executionContext[extract.varName] = val;
                console.log(`[EXTRACT] ${extract.varName} =`, val);
              }
            } catch (e) {
              console.warn(`[EXTRACT ERROR]`, e.message);
            }
          }
        }
      }
    } catch (error) {
      console.error(`[STEP ${i + 1}] ERROR`, error.message);
      stepResult.status = "error";
      stepResult.error = error.message;
      jobOverallStatus = "error";
    }

    results.push(stepResult);

    if (stepResult.status === "fail" || stepResult.status === "error") {
      console.warn(`[STEP ${i + 1}] FAILED`);
      jobOverallStatus = stepResult.status;
    }
  }

  console.log(
    `[JOB END] status=${jobOverallStatus}, totalLatency=${jobTotalLatency}`,
  );

  const result_record = await monitoringModel.createMonitoringResult({
    job_id: job.id,
    status: jobOverallStatus,
    latency_ms: jobTotalLatency,
    response_details: results.map((r) => r.response_details),
    assertion_results: results.map((r) => r.assertions),
    error_message:
      jobOverallStatus === "error" ? results.find((r) => r.error)?.error : null,
  });

  console.log(`[DB] Result stored result_id=${result_record.id}`);

  if (jobOverallStatus !== "pass") {
    const newCounter = (job.consecutive_failures || 0) + 1;

    console.warn(`[JOB FAIL] consecutive_failures=${newCounter}`);

    await monitoringModel.updateMonitoringJob(job.id, {
      consecutive_failures: newCounter,
      last_run_at: new Date(),
    });

    if (newCounter >= job.failure_threshold) {
      console.error(`[ALERT TRIGGERED] jobId=${job.id}`);

      const alertRecord = await monitoringModel.createMonitoringAlert({
        job_id: job.id,
        result_id: result_record.id,
        severity: "critical",
        message: `${job.name} failed ${newCounter} consecutive times.`,
        dispatched_channels: ["email", "slack"],
      });

      await dispatchAlert(alertRecord);
    }
  } else {
    console.log(`[JOB SUCCESS] Resetting failure counter if needed`);

    await monitoringModel.updateMonitoringJob(job.id, {
      consecutive_failures: 0,
      last_run_at: new Date(),
    });
  }

  try {
    console.log(`[REDIS] Publishing monitoring_updates`);

    await publishA2AMessage("monitoring_updates", {
      event: "JOB_COMPLETED",
      suite_id: job.suite_id,
      job_id: job.id,
      status: jobOverallStatus,
      latency: jobTotalLatency,
      timestamp: new Date(),
      result_id: result_record.id,
    });

    console.log(`[REDIS] Published successfully`);
  } catch (e) {
    console.error(`[REDIS ERROR]`, e.message);
  }
}
const monitoringWorker = new Worker(
  "monitoring_jobs",
  async (job) => {
    console.log(`Processing monitoring job: ${job.data.jobId}`);
    try {
      await runMonitoringJob(job.data.jobId);
    } catch (error) {
      console.error("Error in monitoring worker:", error);
    }
  },
  { connection },
);

monitoringWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed!`);
});

monitoringWorker.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed with error ${err.message}`);
});

module.exports = monitoringWorker;
