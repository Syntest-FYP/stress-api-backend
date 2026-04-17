const { parseApiDoc } = require("../services/apiDocParser");
const EndpointService = require("../services/endpointService");
const { analyzeSpecService } = require("../services/specService");
const { createTestSuite } = require("../services/suitesService");
const EndpointCollection = require("../models/Endpoint");
const GeneratedTest = require("../models/generated_test.model");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// Configuration
const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

/**
 * Parse API doc from file path
 */
exports.parseApiDocFromFile = async (req, res) => {
  try {
    const filePath = path.resolve(process.cwd(), req.query.path);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: "File not found" });
    }
    const endpoints = await parseApiDoc(filePath);

    // Optional attach to suite if provided
    if (req.query.suite_id && req.user?.id) {
      try {
        const collection =
          await EndpointService.createOrUpdateEndpointCollection(
            req.user.id,
            req.query.suite_id,
            endpoints
          );

        // Automatically analyze the spec after successful import
        let analysisResult = null;
        try {
          console.log("Starting automatic spec analysis...");
          analysisResult = await analyzeSpecService(
            req.user.id,
            req.query.suite_id
          );
          console.log("Spec analysis completed successfully");
        } catch (analysisErr) {
          console.error("Analysis error:", analysisErr.message);
          // Don't fail the whole request if analysis fails
          console.log("Continuing without analysis results");
        }

        return res.json({
          parsed: endpoints.length,
          inserted: collection ? collection.total_endpoints : 0,
          endpoints: collection ? collection.endpoints : [],
          collection_id: collection ? collection._id : null,
          analysis: analysisResult
            ? {
                analyzed: true,
                suite_id: analysisResult.suite_id,
                spec_file: analysisResult.spec_file,
                analysis_summary: analysisResult.analysis,
              }
            : { analyzed: false },
        });
      } catch (e) {
        console.error("Import error:", e.message);
        return res.json({
          parsed: endpoints.length,
          inserted: 0,
          endpoints: endpoints,
          importError: e.message,
          analysis: { analyzed: false },
        });
      }
    }
    res.json(endpoints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getUploadedSpec = async (req, res) => {
  try {
    const userId = req.user.id;
    const suiteId = req.query.suite_id;

    if (!userId || !suiteId) {
      return res.status(400).json({ error: "Missing suite_id or user ID" });
    }

    const suiteDir = path.join(process.cwd(), "uploads", userId, suiteId);
    if (!fs.existsSync(suiteDir)) {
      return res
        .status(404)
        .json({ error: "No uploaded spec found for this suite" });
    }

    // Check for supported spec files
    const candidates = ["spec.json", "spec.yaml", "spec.yml"];
    const fileName = candidates.find((name) =>
      fs.existsSync(path.join(suiteDir, name))
    );

    if (!fileName) {
      return res.status(404).json({ error: "Spec file not found in uploads" });
    }

    const filePath = path.join(suiteDir, fileName);
    const fileExt = path.extname(fileName).toLowerCase();

    let spec;
    const fileContent = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");

    if (fileExt === ".json") {
      spec = JSON.parse(fileContent);
    } else {
      spec = yaml.load(fileContent);
    }

    return res.json(spec);
  } catch (err) {
    console.error("Error fetching uploaded spec:", err.message);
    res
      .status(500)
      .json({ error: "Failed to load spec file", details: err.message });
  }
};

/**
 * Upload and parse spec - stores in uploads/{userId}/{suiteId}/
 */
exports.uploadAndParseSpec = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const userId = req.user.id;
    const suiteId = req.body.suite_id;

    if (!userId || !suiteId) {
      // Clean up uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        error: "Missing required parameters: suite_id is required",
      });
    }

    // Create user/suite directory structure
    const userDir = path.join(process.cwd(), "uploads", userId);
    const suiteDir = path.join(userDir, suiteId);

    // Create directories if they don't exist
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    if (!fs.existsSync(suiteDir)) {
      fs.mkdirSync(suiteDir, { recursive: true });
    }

    // Determine file extension and create new path
    const fileExt = path.extname(req.file.originalname);
    const newFileName = `spec${fileExt}`;
    const destinationPath = path.join(suiteDir, newFileName);

    // Move file from temp location to structured location
    fs.renameSync(req.file.path, destinationPath);

    console.log(`Spec file stored at: ${destinationPath}`);

    // Parse the specification file
    const endpoints = await parseApiDoc(destinationPath);

    // If suite_id provided, import endpoints to database
    if (suiteId) {
      try {
        const collection =
          await EndpointService.createOrUpdateEndpointCollection(
            userId,
            suiteId,
            endpoints
          );

        // Automatically analyze the spec after successful import
        let analysisResult = null;
        try {
          console.log("Starting automatic spec analysis...");
          analysisResult = await analyzeSpecService(userId, suiteId);
          console.log("Spec analysis completed successfully");
        } catch (analysisErr) {
          console.error("Analysis error:", analysisErr.message);
          // Don't fail the whole request if analysis fails
          console.log("Continuing without analysis results");
        }

        return res.json({
          success: true,
          message:
            "File uploaded, endpoints imported, and spec analyzed successfully",
          file: {
            originalName: req.file.originalname,
            filename: newFileName,
            path: destinationPath,
            relativePath: `uploads/${userId}/${suiteId}/${newFileName}`,
            size: req.file.size,
          },
          parsed: endpoints.length,
          inserted: collection ? collection.total_endpoints : 0,
          endpoints: collection ? collection.endpoints : [],
          collection_id: collection ? collection._id : null,
          analysis: analysisResult
            ? {
                analyzed: true,
                suite_id: analysisResult.suite_id,
                spec_file: analysisResult.spec_file,
                analysis_summary: analysisResult.analysis,
              }
            : { analyzed: false },
        });
      } catch (importErr) {
        console.error("Import error:", importErr.message);
        console.error("Suite ID:", suiteId, "User ID:", userId);

        // If import fails, still return parsed endpoints
        return res.json({
          success: true,
          message:
            "File uploaded and parsed successfully, but import to suite failed",
          file: {
            originalName: req.file.originalname,
            filename: newFileName,
            path: destinationPath,
            relativePath: `uploads/${userId}/${suiteId}/${newFileName}`,
            size: req.file.size,
          },
          parsed: endpoints.length,
          inserted: 0,
          endpoints: endpoints,
          importError: importErr.message,
          analysis: { analyzed: false },
        });
      }
    }

    // Just return parsed endpoints if somehow suite_id is missing
    res.json({
      success: true,
      message: "File uploaded and parsed successfully",
      file: {
        originalName: req.file.originalname,
        filename: newFileName,
        path: destinationPath,
        relativePath: `uploads/${userId}/${suiteId}/${newFileName}`,
        size: req.file.size,
      },
      parsed: endpoints.length,
      endpoints: endpoints,
      analysis: { analyzed: false },
    });
  } catch (err) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: err.message });
  }
};

/**
 * Automated flow: Upload spec, create suite, parse endpoints, analyze schema, generate tests
 */
exports.autoUploadAndGenerateTests = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const userId = req.user.id;
    let suiteId = req.body.suite_id;
    const testCount = parseInt(req.body.test_count) || 3;

    // 1. Initial Parsing to get API Metadata
    const tempEndpoints = await parseApiDoc(req.file.path);
    if (!tempEndpoints || tempEndpoints.length === 0) {
      throw new Error("Could not parse any endpoints from the provided spec");
    }

    // Try to extract API name from the file content if possible
    let apiName =
      req.body.name || "Imported API " + new Date().toLocaleDateString();
    try {
      const fileContent = fs.readFileSync(req.file.path, "utf8").replace(/^\uFEFF/, "");
      const specData = req.file.originalname.endsWith(".json")
        ? JSON.parse(fileContent)
        : yaml.load(fileContent);

      if (specData.info && (specData.info.title || specData.info.name)) {
        apiName = specData.info.title || specData.info.name;
      }
    } catch (e) {
      console.log(
        "Could not extract API name from spec, using default or body name"
      );
    }

    // 2. Create Suite if not provided
    if (!suiteId) {
      const suiteData = {
        name: apiName,
        description: `Automatically created from ${req.file.originalname}`,
        version: "1.0.0",
        base_url: req.body.base_url || "",
        auth_type: req.body.auth_type || "none",
        visibility: "private",
      };
      const newSuite = await createTestSuite(userId, suiteData);
      suiteId = String(newSuite.id);
      console.log(`Created new suite: ${suiteId}`);
    }

    // 3. Store file structured
    const userDir = path.join(process.cwd(), "uploads", userId);
    const suiteDir = path.join(userDir, suiteId);
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    if (!fs.existsSync(suiteDir)) fs.mkdirSync(suiteDir, { recursive: true });

    const fileExt = path.extname(req.file.originalname);
    const destinationPath = path.join(suiteDir, `spec${fileExt}`);
    fs.renameSync(req.file.path, destinationPath);

    // 4. Import Endpoints to Database
    const collection = await EndpointService.createOrUpdateEndpointCollection(
      userId,
      suiteId,
      tempEndpoints
    );

    // 5. Run Spec Analysis
    let analysisResult = null;
    try {
      console.log("Starting automatic spec analysis...");
      analysisResult = await analyzeSpecService(userId, suiteId);
    } catch (analysisErr) {
      console.error("Analysis error:", analysisErr.message);
    }

    return res.json({
      success: true,
      suite_id: suiteId,
      api_name: apiName,
      endpoints_parsed: tempEndpoints.length,
      endpoints_inserted: collection ? collection.total_endpoints : 0,
      analysis: analysisResult
        ? { analyzed: true, summary: analysisResult.analysis }
        : { analyzed: false },
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error("Auto flow error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Trigger test generation for all endpoints in a suite
 */
exports.triggerTestGeneration = async (req, res) => {
  try {
    const userId = req.user.id;
    const { suite_id } = req.body;
    const testCount = parseInt(req.body.test_count) || 3;

    if (!suite_id) {
      return res.status(400).json({ error: "suite_id is required" });
    }

    // 1. Fetch endpoints from MongoDB
    const collection = await EndpointService.getEndpointCollection(
      userId,
      suite_id
    );
    if (
      !collection ||
      !collection.endpoints ||
      collection.endpoints.length === 0
    ) {
      return res
        .status(404)
        .json({ error: "No endpoints found for this suite" });
    }

    // 2. Get Analysis Results (needed for optimized schema)
    const analysis = await analyzeSpecService(userId, suite_id).catch(
      () => null
    );

    // 3. Generate Tests
    console.log(`Starting triggered test generation for suite: ${suite_id}`);

    const transformedEndpoints = collection.endpoints
      .filter((ep) => ep.is_active)
      .map((ep) => ({
        name: ep.name || `${ep.method} ${ep.path}`,
        method: ep.method,
        path: ep.path,
        base_url: ep.base_url,
        headers: ep.headers || {},
        query_params: ep.query_params || {},
        auth_type: ep.auth_type,
        tags: ep.tags || [],
      }));

    const optimizedSchema = analysis?.analysis?.insights
      ? {
          categories:
            analysis.analysis.insights.categories?.map((cat) => ({
              name: cat.name,
              count: cat.count,
            })) || [],
          patterns: analysis.analysis.insights.patterns || {},
        }
      : null;

    const genRequestBody = {
      endpoints: transformedEndpoints,
      test_count: testCount,
      schema: optimizedSchema,
      auth_requirements: null,
      code_context: null,
      data_providers: null,
      entity_relationships: null,
    };

    const genResponse = await axios.post(
      `${PYTHON_BACKEND_URL}/static/all-endpoints`,
      genRequestBody,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 180000,
      }
    );

    const testGenerationResult = genResponse.data;

    // Persist generated tests
    await GeneratedTest.create({
      user_id: userId,
      suite_id: suite_id,
      source: "all",
      request_options: { test_count: testCount },
      tests:
        testGenerationResult?.test_cases || testGenerationResult?.tests || null,
      raw_response: testGenerationResult || null,
    });

    return res.json({
      success: true,
      suite_id: suite_id,
      generated: true,
      count: (
        testGenerationResult.test_cases ||
        testGenerationResult.tests ||
        []
      ).length,
      data: testGenerationResult,
    });
  } catch (err) {
    console.error("Trigger test generation error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
