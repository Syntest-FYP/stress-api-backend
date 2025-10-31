const axios = require("axios");
const EndpointCollection = require("../models/Endpoint");
const { getSpecAnalysisBySuite } = require("../models/spec.model");
const GeneratedTest = require("../models/generated_test.model");

// Configuration
const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

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
        headers: ep.headers || {},
        query_params: ep.query_params || {},
        auth_type: ep.auth_type,
        tags: ep.tags || [],
      }));

    // Prepare request body for module-from-analyst endpoint
    const requestBody = {
      endpoints: transformedEndpoints,
      module_name: categoryName,
      test_count: test_count,
      schema: analysis.analysis?.insights || null,
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
      await GeneratedTest.create({
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
        },
        tests: response.data?.test_cases || response.data?.tests || null,
        raw_response: response.data || null,
      });
    } catch (persistErr) {
      console.error(
        "[WARN] Failed to persist generated module tests:",
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
        headers: ep.headers || {},
        query_params: ep.query_params || {},
        auth_type: ep.auth_type,
        tags: ep.tags || [],
      }));

    // Prepare request body for all-endpoints endpoint
    const requestBody = {
      endpoints: transformedEndpoints,
      test_count: test_count,
      schema: analysis.analysis?.insights || null,
      auth_requirements: auth_requirements || null,
      code_context: code_context || null,
      data_providers: data_providers || null,
      entity_relationships: entity_relationships || null,
    };

    // Call Python backend all-endpoints endpoint
    const response = await axios.post(
      `${PYTHON_BACKEND_URL}/static/all-endpoints`,
      requestBody,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 180000, // 3 minute timeout
      }
    );

    // Persist generated tests
    try {
      await GeneratedTest.create({
        user_id: userId.toString(),
        suite_id: suiteId,
        source: "all",
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
    } catch (persistErr) {
      console.error(
        "[WARN] Failed to persist generated all-endpoints tests:",
        persistErr.message
      );
    }

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

    // Prepare request body for single-endpoint endpoint
    const requestBody = {
      endpoint: endpoint,
      test_count: test_count,
      schema: analysis.analysis?.insights || null,
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
      await GeneratedTest.create({
        user_id: userId.toString(),
        suite_id: suiteId,
        source: "single",
        endpoint: {
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
    } catch (persistErr) {
      console.error(
        "[WARN] Failed to persist generated single-endpoint tests:",
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
        headers: ep.headers || {},
        query_params: ep.query_params || {},
        auth_type: ep.auth_type,
        tags: ep.tags || [],
      }));

    // Prepare request body
    const requestBody = {
      endpoints: transformedEndpoints,
      schema: analysis.analysis?.insights || null,
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

    return res.status(200).json({
      success: true,
      data: items,
      metadata: {
        suite_id: suiteId,
        count: items.length,
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

module.exports = {
  getCategories,
  generateTestsForModule,
  generateAllModules,
  generateSingleEndpointTests,
  analyzeContextQuality,
  getStoredGeneratedTests,
};
