const axios = require("axios");
const EndpointCollection = require("../models/Endpoint");
const { getSpecAnalysisBySuite } = require("../models/spec.model");
const GeneratedTest = require("../models/generated_test.model");
const { getGeneratedTestResultsBySuite, createGeneratedTestResult } = require("../models/result.model");
const { publishA2AMessage } = require("../utils/redisPublisher"); // Import Redis publisher

// Configuration
const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

// Schema optimization functions to reduce LLM context size
const getOptimizedSchemaForCategory = (fullSchema, categoryName) => {
  if (!fullSchema || !fullSchema.categories) {
    return null;
  }

  // Find the specific category
  const targetCategory = fullSchema.categories.find(
    (cat) => cat.name && cat.name.toLowerCase() === categoryName.toLowerCase()
  );

  if (!targetCategory) {
    return null;
  }

  // Return only relevant schema parts
  return {
    categories: [targetCategory], // Only the specific category
    patterns: fullSchema.patterns || {}, // Keep patterns (usually small)
  };
};

const getOptimizedSchemaForAllEndpoints = (fullSchema) => {
  if (!fullSchema) {
    return null;
  }

  // For all endpoints, return a more compact version
  return {
    categories: fullSchema.categories?.map((cat) => ({
      name: cat.name,
      count: cat.count,
      // Remove endpoint lists to save space
    })) || [],
    patterns: fullSchema.patterns || {},
    // Keep only essential metadata
    assessment: fullSchema.assessment
      ? fullSchema.assessment.substring(0, 200) + "..."
      : null,
  };
};

const getMinimalSchemaForSingleEndpoint = (fullSchema, endpoint) => {
  if (!fullSchema || !endpoint) {
    return null;
  }

  // For single endpoint, return minimal relevant info
  return {
    patterns: {
      authentication:
        fullSchema.patterns?.authentication || "unknown",
      naming_convention:
        fullSchema.patterns?.naming_convention || "unknown",
    },
    // Only include categories that might be relevant to this endpoint
    relevant_categories:
      fullSchema.categories
        ?.filter((cat) =>
          cat.endpoints?.some(
            (ep) =>
              endpoint.path.includes(ep) || ep.includes(endpoint.path)
          )
        )
        .map((cat) => ({ name: cat.name, count: cat.count })) || [],
  };
};

/**
 * Get categories from analyzed schema
 * GET /api/test-generation/categories/:suiteId
 */
const getCategories = async (req, res) => {
  try {
    const { suiteId } = req.params;
    const userId = req.user._id || req.user.id;

    // Get analyzed schema for this suite
    const analysis = await getSpecAnalysisBySuite(suiteId);

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message:
          "No analyzed schema found for this suite. Please analyze a schema first.",
      });
    }

    // Extract categories from the analysis
    const categories = analysis.analysis?.insights?.categories || [];

    if (!categories || categories.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No categories found in the analyzed schema.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        categories: categories,
        total_categories: categories.length,
        suite_id: suiteId,
        analysis_date: analysis.created_at,
      },
      metadata: {
        suite_id: suiteId,
        categories_available: categories.length,
      },
    });
  } catch (error) {
    console.error("[ERROR] getCategories:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to get categories",
      error: error.message,
    });
  }
};

/**
 * Generate tests for a specific module/category
 * POST /api/test-generation/modules/:suiteId/:categoryName/tests
 */
const generateTestsForModule = async (req, res) => {
  try {
    const { suiteId, categoryName } = req.params;
    const userId = req.user._id || req.user.id;
    const {
      test_count = 3,
      auth_requirements,
      code_context,
      data_providers,
      entity_relationships,
    } = req.body;

    // Validate test_count
    if (test_count < 1 || test_count > 10) {
      return res.status(400).json({
        success: false,
        message: "test_count must be between 1 and 10",
      });
    }

    // Get analyzed schema for this suite
    const analysis = await getSpecAnalysisBySuite(suiteId);

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message:
          "No analyzed schema found for this suite. Please analyze a schema first.",
      });
    }

    // Check if the category exists in the analyzed schema
    const categories = analysis.analysis?.insights?.categories || [];
    const categoryExists = categories.some(
      (cat) => cat.name && cat.name.toLowerCase() === categoryName.toLowerCase()
    );

    if (!categoryExists) {
      const availableCategories = categories
        .map((cat) => cat.name)
        .filter(Boolean);
      return res.status(404).json({
        success: false,
        message: `Category '${categoryName}' not found in analyzed schema.`,
        available_categories: availableCategories,
      });
    }

    // Fetch endpoints from MongoDB
    const endpointCollection = await EndpointCollection.findOne({
      user_id: userId.toString(),
      suite_id: suiteId,
    });

    if (!endpointCollection) {
      return res.status(404).json({
        success: false,
        message: "No endpoints found for this suite",
      });
    }

    // Transform endpoints
    const transformedEndpoints = endpointCollection.endpoints
      .filter((ep) => ep.is_active)
      .map((ep) => ({
        name: ep.name || `${ep.method} ${ep.path}`,
        method: ep.method,
        path: ep.path,
        base_url: ep.base_url,
        endpoint_id: ep._id || ep.id,
        headers: ep.headers || {},
        query_params: ep.query_params || {},
        auth_type: ep.auth_type,
        tags: ep.tags || [],
      }));

    // Prepare optimized schema for this specific category
    const optimizedSchema = getOptimizedSchemaForCategory(
      analysis.analysis?.insights,
      categoryName
    );

    // Prepare request body for module-from-analyst endpoint
    const requestBody = {
      endpoints: transformedEndpoints,
      module_name: categoryName,
      test_count: test_count,
      schema: optimizedSchema,
      auth_requirements: auth_requirements || null,
      code_context: code_context || null,
      data_providers: data_providers || null,
      entity_relationships: entity_relationships || null,
    };

    // Call Python backend module-from-analyst endpoint
    const response = await axios.post(
      `${PYTHON_BACKEND_URL}/static/module-from-analyst`,
      requestBody,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 120000, // 2 minute timeout
      }
    );

    // Persist generated tests
    try {
      const generatedTestsDoc = await GeneratedTest.create({
        user_id: userId.toString(),
        suite_id: suiteId,
        source: "module",
        category_name: categoryName,
        request_options: {
          test_count,
          auth_requirements: auth_requirements || null,
          code_context: code_context || null,
          data_providers: data_providers || null,
          entity_relationships: entity_relationships || null,
          endpoints: transformedEndpoints,
        },
        tests: response.data?.test_cases || response.data?.tests || null,
        raw_response: response.data || null,
      });
      // Publish A2A message for generated tests
      await publishA2AMessage(
        `a2a:generated_tests:${suiteId}`,
        {
          message_type: "generated_tests",
          conversation_id: suiteId, // Use suiteId as conversation_id for simplicity, or generate a new one if appropriate
          payload: {
            suite_id: suiteId,
            test_cases: generatedTestsDoc.tests || [],
          },
        }
      );
    } catch (persistErr) {
      console.error(
        "[WARN] Failed to persist generated module tests or publish A2A message:",
        persistErr.message
      );
    }

    return res.status(200).json({
      success: true,
      data: response.data,
      metadata: {
        suite_id: suiteId,
        category_name: categoryName,
        test_count: test_count,
        from_analyzed_schema: true,
      },
    });
  } catch (error) {
    console.error("[ERROR] generateTestsForModule:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: "Error from test generation service",
        error: error.response.data,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to generate tests",
      error: error.message,
    });
  }
};

/**
 * Generate tests for all endpoints
 * POST /api/test-generation/generate-all/:suiteId
 */
const generateAllModules = async (req, res) => {
  try {
    const { suiteId } = req.params;
    const userId = req.user._id || req.user.id;
    const {
      test_count = 3,
      auth_requirements,
      code_context,
      data_providers,
      entity_relationships,
    } = req.body;

    // Validate test_count
    if (test_count < 1 || test_count > 10) {
      return res.status(400).json({
        success: false,
        message: "test_count must be between 1 and 10",
      });
    }

    // Get analyzed schema for this suite
    const analysis = await getSpecAnalysisBySuite(suiteId);

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message:
          "No analyzed schema found for this suite. Please analyze a schema first.",
      });
    }

    // Fetch endpoints from MongoDB
    const endpointCollection = await EndpointCollection.findOne({
      user_id: userId.toString(),
      suite_id: suiteId,
    });

    if (!endpointCollection) {
      return res.status(404).json({
        success: false,
        message: "No endpoints found for this suite",
      });
    }

    // Transform endpoints
    const transformedEndpoints = endpointCollection.endpoints
      .filter((ep) => ep.is_active)
      .map((ep) => ({
        name: ep.name || `${ep.method} ${ep.path}`,
        method: ep.method,
        path: ep.path,
        base_url: ep.base_url,
        endpoint_id: ep._id || ep.id,
        headers: ep.headers || {},
        query_params: ep.query_params || {},
        auth_type: ep.auth_type,
        tags: ep.tags || [],
      }));

    // Prepare optimized schema for all endpoints
    const optimizedSchema = getOptimizedSchemaForAllEndpoints(
      analysis.analysis?.insights
    );

    // Prepare request body for all-endpoints endpoint
    const requestBody = {
      endpoints: transformedEndpoints,
      test_count: test_count,
      schema: optimizedSchema,
      auth_requirements: auth_requirements || null,
      code_context: code_context || null,
      data_providers: data_providers || null,
      entity_relationships: entity_relationships || null,
    };

    // Call Python backend generate-all endpoint which preserves dependencies by grouping
    const response = await axios.post(
      `${PYTHON_BACKEND_URL}/static/generate-all?tests_per_module=${test_count}`,
      requestBody,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 600000, // 10 minute timeout for LLM generation across all modules
      }
    );

    // Persist generated tests
    // Debug: log what Python returned
    const pyResponseKeys = Object.keys(response.data || {});
    const moduleTests = response.data?.test_cases_by_module;
    const flattenedTests = moduleTests ? Object.values(moduleTests).flat() : [];
    console.log(`[DEBUG] Python response keys: ${pyResponseKeys.join(', ')}`);
    console.log(`[DEBUG] test_cases_by_module has ${moduleTests ? Object.keys(moduleTests).length : 0} modules, ${flattenedTests.length} total tests`);

    try {
      const testsToSave = response.data?.test_cases 
          || response.data?.tests 
          || (flattenedTests.length > 0 ? flattenedTests : null)
          || null;
      console.log(`[DEBUG] Saving ${testsToSave ? testsToSave.length : 0} tests to MongoDB`);

      const generatedTestsDoc = await GeneratedTest.create({
        user_id: userId.toString(),
        suite_id: suiteId,
        source: "all",
        request_options: {
          test_count,
          auth_requirements: auth_requirements || null,
          code_context: code_context || null,
          data_providers: data_providers || null,
          entity_relationships: entity_relationships || null,
          endpoints: transformedEndpoints,
        },
        tests: testsToSave,
        raw_response: response.data || null,
      });
      // Publish A2A message for generated tests
      await publishA2AMessage(
        `a2a:generated_tests:${suiteId}`,
        {
          message_type: "generated_tests",
          conversation_id: suiteId, // Use suiteId as conversation_id for simplicity
          payload: {
            suite_id: suiteId,
            test_cases: generatedTestsDoc.tests || [],
          },
        }
      );
    } catch (persistErr) {
      console.error(
        "[WARN] Failed to persist generated all-endpoints tests to MongoDB or publish A2A message:",
        persistErr.message
      );
    }

    // Also persist each test case into PostgreSQL (this is what the frontend reads)
    const allTestCases = response.data?.test_cases
      || response.data?.tests
      || (response.data?.test_cases_by_module ? Object.values(response.data.test_cases_by_module).flat() : [])
      || [];

    let pgInsertCount = 0;
    for (const tc of allTestCases) {
      try {
        await createGeneratedTestResult({
          user_id: userId.toString(),
          suite_id: suiteId,
          conversation_id: suiteId, // Use suiteId as conversation_id
          test_case_name: tc.name || `${(tc.request?.method || 'TEST').toUpperCase()} ${tc.request?.path || '/'}`,
          endpoint_id: tc.endpoint_id || null,
          method: tc.request?.method || tc.method || '',
          path: tc.request?.path || tc.path || '',
          status: 'pending',
          response_status_code: null,
          response_body: null,
          error_message: null,
          execution_timestamp: new Date().toISOString(),
        });
        pgInsertCount++;
      } catch (pgErr) {
        console.error(`[WARN] Failed to insert test "${tc.name}" into PostgreSQL:`, pgErr.message);
      }
    }
    console.log(`[INFO] Inserted ${pgInsertCount}/${allTestCases.length} test cases into PostgreSQL`);

    return res.status(200).json({
      success: true,
      data: response.data,
      metadata: {
        suite_id: suiteId,
        test_count: test_count,
        from_analyzed_schema: true,
      },
    });
  } catch (error) {
    console.error("[ERROR] generateAllModules:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: "Error from test generation service",
        error: error.response.data,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to generate all tests",
      error: error.message,
    });
  }
};

/**
 * Generate tests for a single endpoint
 * POST /api/test-generation/single-endpoint/:suiteId
 */
const generateSingleEndpointTests = async (req, res) => {
  try {
    const { suiteId } = req.params;
    const userId = req.user._id || req.user.id;
    const {
      endpoint,
      test_count = 3,
      auth_requirements,
      code_context,
      data_providers,
      entity_relationships,
    } = req.body;

    // Validate test_count
    if (test_count < 1 || test_count > 10) {
      return res.status(400).json({
        success: false,
        message: "test_count must be between 1 and 10",
      });
    }

    // Validate endpoint
    if (!endpoint || !endpoint.method || !endpoint.path) {
      return res.status(400).json({
        success: false,
        message: "endpoint with method and path is required",
      });
    }

    // Get analyzed schema for this suite
    const analysis = await getSpecAnalysisBySuite(suiteId);

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message:
          "No analyzed schema found for this suite. Please analyze a schema first.",
      });
    }

    // Prepare minimal schema for single endpoint
    const optimizedSchema = getMinimalSchemaForSingleEndpoint(
      analysis.analysis?.insights,
      endpoint
    );

    // Prepare request body for single-endpoint endpoint
    const requestBody = {
      endpoint: endpoint,
      test_count: test_count,
      schema: optimizedSchema,
      auth_requirements: auth_requirements || null,
      code_context: code_context || null,
      data_providers: data_providers || null,
      entity_relationships: entity_relationships || null,
    };

    // Call Python backend single-endpoint endpoint
    const response = await axios.post(
      `${PYTHON_BACKEND_URL}/static/single-endpoint`,
      requestBody,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 120000, // 2 minute timeout
      }
    );

    // Persist generated tests
    try {
      const generatedTestsDoc = await GeneratedTest.create({
        user_id: userId.toString(),
        suite_id: suiteId,
        source: "single",
        endpoint: {
          name: endpoint.name,
          method: endpoint.method,
          path: endpoint.path,
          base_url: endpoint.base_url || null,
          headers: endpoint.headers || {},
          query_params: endpoint.query_params || {},
        },
        request_options: {
          test_count,
          auth_requirements: auth_requirements || null,
          code_context: code_context || null,
          data_providers: data_providers || null,
          entity_relationships: entity_relationships || null,
        },
        tests: response.data?.test_cases || response.data?.tests || null,
        raw_response: response.data || null,
      });
      // Publish A2A message for generated tests
      await publishA2AMessage(
        `a2a:generated_tests:${suiteId}`,
        {
          message_type: "generated_tests",
          conversation_id: suiteId, // Use suiteId as conversation_id for simplicity
          payload: {
            suite_id: suiteId,
            test_cases: generatedTestsDoc.tests || [],
          },
        }
      );
    } catch (persistErr) {
      console.error(
        "[WARN] Failed to persist generated single-endpoint tests or publish A2A message:",
        persistErr.message
      );
    }

    return res.status(200).json({
      success: true,
      data: response.data,
      metadata: {
        suite_id: suiteId,
        endpoint: endpoint,
        test_count: test_count,
        from_analyzed_schema: true,
      },
    });
  } catch (error) {
    console.error("[ERROR] generateSingleEndpointTests:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: "Error from test generation service",
        error: error.response.data,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to generate single endpoint tests",
      error: error.message,
    });
  }
};

/**
 * Analyze context quality
 * POST /api/test-generation/context/analyze/:suiteId
 */
const analyzeContextQuality = async (req, res) => {
  try {
    const { suiteId } = req.params;
    const userId = req.user._id || req.user.id;
    const {
      auth_requirements,
      code_context,
      data_providers,
      entity_relationships,
    } = req.body;

    // Get analyzed schema for this suite
    const analysis = await getSpecAnalysisBySuite(suiteId);

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message:
          "No analyzed schema found for this suite. Please analyze a schema first.",
      });
    }

    // Fetch endpoints from MongoDB
    const endpointCollection = await EndpointCollection.findOne({
      user_id: userId.toString(),
      suite_id: suiteId,
    });

    if (!endpointCollection) {
      return res.status(404).json({
        success: false,
        message: "No endpoints found for this suite",
      });
    }

    // Transform endpoints
    const transformedEndpoints = endpointCollection.endpoints
      .filter((ep) => ep.is_active)
      .map((ep) => ({
        name: ep.name || `${ep.method} ${ep.path}`,
        method: ep.method,
        path: ep.path,
        base_url: ep.base_url,
        endpoint_id: ep._id || ep.id,
        headers: ep.headers || {},
        query_params: ep.query_params || {},
        auth_type: ep.auth_type,
        tags: ep.tags || [],
      }));

    // Prepare optimized schema for context analysis
    const optimizedSchema = getOptimizedSchemaForAllEndpoints(
      analysis.analysis?.insights
    );

    // Prepare request body
    const requestBody = {
      endpoints: transformedEndpoints,
      schema: optimizedSchema,
      auth_requirements: auth_requirements || null,
      code_context: code_context || null,
      data_providers: data_providers || null,
      entity_relationships: entity_relationships || null,
    };

    // Call Python backend
    const response = await axios.post(
      `${PYTHON_BACKEND_URL}/static/context/analyze`,
      requestBody,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      }
    );

    return res.status(200).json({
      success: true,
      data: response.data,
      metadata: {
        suite_id: suiteId,
        from_analyzed_schema: true,
      },
    });
  } catch (error) {
    console.error("[ERROR] analyzeContextQuality:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: "Error from test generation service",
        error: error.response.data,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to analyze context quality",
      error: error.message,
    });
  }
};

/**
 * Get stored generated tests for a suite
 * GET /api/generate/tests/stored/:suiteId
 */
const getStoredGeneratedTests = async (req, res) => {
  try {
    const { suiteId } = req.params;
    const userId = req.user._id || req.user.id;

    const items = await GeneratedTest.find({
      user_id: userId.toString(),
      suite_id: suiteId,
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const executionResults = await getGeneratedTestResultsBySuite(suiteId, userId);

    // Create a map for quick lookup of execution results by conversation_id and test_case_name
    const resultsMap = new Map();
    for (const res of executionResults) {
      const key = `${res.conversation_id}-${res.test_case_name}`;
      if (!resultsMap.has(key)) {
        resultsMap.set(key, []);
      }
      resultsMap.get(key).push(res);
    }

    // Iterate through generated test items and enrich with execution results
    const enrichedItems = items.map((item) => {
      if (item.tests && Array.isArray(item.tests)) {
        const enrichedTests = item.tests.map((testCase) => {
          // Assuming testCase has a conversation_id and name for linking
          const testCaseName = testCase.name; // This should be the 'operationId' from the AI backend
          const conversationId = item.raw_response?.conversation_id || item.suite_id; // Derive conversation_id from generatedTestDoc or suiteId
          const key = `${conversationId}-${testCaseName}`;
          const matchingResults = resultsMap.get(key) || [];
          
          // Attach results to the test case
          return { ...testCase, execution_results: matchingResults };
        });
        return { ...item, tests: enrichedTests };
      }
      return item;
    });

    return res.status(200).json({
      success: true,
      data: enrichedItems,
      metadata: {
        suite_id: suiteId,
        count: enrichedItems.length,
        total_execution_results: executionResults.length,
      },
    });
  } catch (error) {
    console.error("[ERROR] getStoredGeneratedTests:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch stored generated tests",
      error: error.message,
    });
  }
};

/**
 * Report generated tests from AI Agent
 * POST /api/generate/tests/report
 */
const reportGeneratedTests = async (req, res) => {
  try {
    const { 
      suiteId, 
      userId, 
      source, 
      categoryName, 
      endpoint, 
      requestOptions, 
      tests, 
      rawResponse 
    } = req.body;

    if (!suiteId || !userId || !tests) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: suiteId, userId, and tests",
      });
    }

    // Persist to MongoDB
    const newTestReport = await GeneratedTest.create({
      user_id: userId,
      suite_id: suiteId,
      source: source || "single",
      category_name: categoryName || null,
      endpoint: endpoint ? {
        name: endpoint.name,
        method: endpoint.method,
        path: endpoint.path,
        base_url: endpoint.base_url || null,
        headers: endpoint.headers || {},
        query_params: endpoint.query_params || {},
      } : null,
      request_options: requestOptions || {},
      tests: tests,
      raw_response: rawResponse || null,
    });

    return res.status(201).json({
      success: true,
      message: "Tests reported and persisted successfully",
      testId: newTestReport._id
    });
  } catch (error) {
    console.error("[ERROR] reportGeneratedTests:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to report generated tests",
      error: error.message,
    });
  }
};

module.exports = {
  getCategories,
  generateTestsForModule,
  generateAllModules,
  generateSingleEndpointTests,
  analyzeContextQuality,
  getStoredGeneratedTests,
  reportGeneratedTests,
};
