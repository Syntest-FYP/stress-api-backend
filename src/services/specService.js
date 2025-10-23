const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { getTestSuiteById } = require("../services/suitesService");
const {
  createSpecAnalysis,
  getSpecAnalysisBySuite,
} = require("../models/spec.model");

const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

// ===== Helper Functions =====
function extractHeaders(parameters) {
  if (!Array.isArray(parameters)) return null;
  const headers = {};
  parameters
    .filter((p) => p.location === "header")
    .forEach((p) => (headers[p.name] = p.example || p.type));
  return Object.keys(headers).length ? headers : null;
}

function extractQueryParams(parameters) {
  if (!Array.isArray(parameters)) return null;
  const query = {};
  parameters
    .filter((p) => p.location === "query")
    .forEach((p) => {
      query[p.name] = {
        type: p.type,
        required: p.required,
        example: p.example,
      };
    });
  return Object.keys(query).length ? query : null;
}

function extractPathParams(parameters) {
  if (!Array.isArray(parameters)) return null;
  const pathParams = {};
  parameters
    .filter((p) => p.location === "path")
    .forEach((p) => {
      pathParams[p.name] = {
        type: p.type,
        example: p.example,
      };
    });
  return Object.keys(pathParams).length ? pathParams : null;
}

// ===== Core Services =====
async function analyzeSpecService(user_id, suite_id) {
  if (!user_id || !suite_id)
    throw new Error("Missing required parameters: user_id and suite_id");

  const suite = await getTestSuiteById(user_id, suite_id);
  if (!suite) throw new Error("Suite not found or access denied");

  const specDir = path.join(
    process.cwd(),
    "uploads",
    String(user_id),
    String(suite_id)
  );
  const possibleFiles = ["spec.json", "spec.yaml", "spec.yml"];

  const specFilePath = possibleFiles
    .map((f) => path.join(specDir, f))
    .find((p) => fs.existsSync(p));

  if (!specFilePath) throw new Error("No spec file found in suite directory");

  const specContent = fs.readFileSync(specFilePath, "utf8");

  const analysisPayload = {
    specification: specContent,
    mode: "auto",
    context: { suite_id, user_id },
  };

  try {
    const response = await axios.post(
      `${PYTHON_BACKEND_URL}/analyze`,
      analysisPayload,
      { headers: { "Content-Type": "application/json" }, timeout: 60000 }
    );

    console.log("✅ Received analysis response from Python backend");

    const analysisData = response.data;

    console.log("storing");
    await createSpecAnalysis({
      user_id,
      suite_id,
      spec_file: path.basename(specFilePath),
      analysis: analysisData,
    });

    return {
      suite_id,
      spec_file: path.basename(specFilePath),
      analysis: analysisData,
      saved: true,
    };
  } catch (error) {
    console.error("❌ Error calling Python backend:", error.message);

    if (error.response) {
      throw new Error(
        `Python backend error (${error.response.status}): ${JSON.stringify(
          error.response.data
        )}`
      );
    }
    if (error.request) {
      throw new Error("No response received from Python backend");
    }
    throw error;
  }
}
async function getAnalysisService(user_id, suite_id) {
  const suite = await getTestSuiteById(user_id, suite_id);
  if (!suite) throw new Error("Suite not found or access denied");

  const analysis = await getSpecAnalysisBySuite(suite_id);
  if (!analysis) throw new Error("No stored analysis found for this suite");

  return analysis;
}

async function checkSpecExistsService(user_id, suite_id) {
  const specDir = path.join(
    process.cwd(),
    "uploads",
    String(user_id),
    String(suite_id)
  );

  if (!fs.existsSync(specDir)) {
    return { exists: false, message: "No spec directory found" };
  }

  const possibleFiles = ["spec.json", "spec.yaml", "spec.yml"];
  for (const filename of possibleFiles) {
    const filePath = path.join(specDir, filename);
    if (fs.existsSync(filePath)) {
      return {
        exists: true,
        file: {
          filename,
          path: `uploads/${user_id}/${suite_id}/${filename}`,
          size: fs.statSync(filePath).size,
        },
      };
    }
  }

  return {
    exists: false,
    message: "Spec directory exists but no spec file found",
  };
}

module.exports = {
  analyzeSpecService,
  getAnalysisService,
  checkSpecExistsService,
};
