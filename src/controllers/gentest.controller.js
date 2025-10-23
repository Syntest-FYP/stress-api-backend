const axios = require("axios");
const EndpointCollection = require("../models/Endpoint"); // Adjust path as needed

// Configuration
const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

/**
 * List all modules for a test suite
 * POST /api/test-generation/modules/:suiteId
 */
const listModules = async (req, res) => {
  try {
    const { suiteId } = req.params;
    const userId = req.user._id || req.user.id; // Get from verifyAuth middleware
    const {
      schema,
      auth_requirements,
      code_context,
      data_providers,
      entity_relationships,
    } = req.body;

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

    if (
      !endpointCollection.endpoints ||
      endpointCollection.endpoints.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "No endpoints available in this suite",
      });
    }

    // Transform endpoints to match Python backend format
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

    // Prepare request body for Python backend
    const requestBody = {
      endpoints: transformedEndpoints,
      schema: schema || null,
      auth_requirements: auth_requirements || null,
      code_context: code_context || null,
      data_providers: data_providers || null,
      entity_relationships: entity_relationships || null,
    };

    // Call Python backend
    const response = await axios.post(
      `${PYTHON_BACKEND_URL}/static/modules`,
      requestBody,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 60000, // 60 second timeout
      }
    );

    // Return response with additional metadata
    return res.status(200).json({
      success: true,
      data: response.data,
      metadata: {
        suite_id: suiteId,
        total_endpoints_in_suite: endpointCollection.total_endpoints,
        active_endpoints_processed: transformedEndpoints.length,
      },
    });
  } catch (error) {
    console.error("[ERROR] listModules:", error.message);

    if (error.response) {
      // Python backend returned an error
      return res.status(error.response.status).json({
        success: false,
        message: "Error from test generation service",
        error: error.response.data,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to list modules",
      error: error.message,
    });
  }
};

/**
 * Generate tests for a specific module
 * POST /api/test-generation/modules/:suiteId/:moduleName/tests
 */
const generateTestsForModule = async (req, res) => {
  try {
    const { suiteId, moduleName } = req.params;
    const userId = req.user._id || req.user.id;
    const {
      test_count = 3,
      schema,
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
      module_name: moduleName,
      test_count: test_count,
      schema: schema || null,
      auth_requirements: auth_requirements || null,
      code_context: code_context || null,
      data_providers: data_providers || null,
      entity_relationships: entity_relationships || null,
    };

    // Call Python backend
    const response = await axios.post(
      `${PYTHON_BACKEND_URL}/static/modules/${moduleName}/tests`,
      requestBody,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 120000, // 2 minute timeout
      }
    );

    return res.status(200).json({
      success: true,
      data: response.data,
      metadata: {
        suite_id: suiteId,
        module_name: moduleName,
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
 * Generate tests for all modules
 * POST /api/test-generation/generate-all/:suiteId
 */
const generateAllModules = async (req, res) => {
  try {
    const { suiteId } = req.params;
    const userId = req.user._id || req.user.id;
    const {
      tests_per_module = 3,
      schema,
      auth_requirements,
      code_context,
      data_providers,
      entity_relationships,
    } = req.body;

    // Validate tests_per_module
    if (tests_per_module < 1 || tests_per_module > 10) {
      return res.status(400).json({
        success: false,
        message: "tests_per_module must be between 1 and 10",
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
      schema: schema || null,
      auth_requirements: auth_requirements || null,
      code_context: code_context || null,
      data_providers: data_providers || null,
      entity_relationships: entity_relationships || null,
    };

    // Call Python backend with query parameter
    const response = await axios.post(
      `${PYTHON_BACKEND_URL}/static/generate-all?tests_per_module=${tests_per_module}`,
      requestBody,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 180000, // 3 minute timeout
      }
    );

    return res.status(200).json({
      success: true,
      data: response.data,
      metadata: {
        suite_id: suiteId,
        tests_per_module: tests_per_module,
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
 * Quick generate basic tests
 * POST /api/test-generation/quick-generate/:suiteId
 */
const quickGenerate = async (req, res) => {
  try {
    const { suiteId } = req.params;
    const userId = req.user._id || req.user.id;
    const { test_count = 2 } = req.body;

    // Validate test_count
    if (test_count < 1 || test_count > 5) {
      return res.status(400).json({
        success: false,
        message: "test_count must be between 1 and 5 for quick generation",
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

    // Prepare request body (minimal context for speed)
    const requestBody = {
      endpoints: transformedEndpoints,
    };

    // Call Python backend
    const response = await axios.post(
      `${PYTHON_BACKEND_URL}/static/quick-generate?test_count=${test_count}`,
      requestBody,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 60000,
      }
    );

    return res.status(200).json({
      success: true,
      data: response.data,
      metadata: {
        suite_id: suiteId,
      },
    });
  } catch (error) {
    console.error("[ERROR] quickGenerate:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: "Error from test generation service",
        error: error.response.data,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to quick generate tests",
      error: error.message,
    });
  }
};

/**
 * Get module information
 * GET /api/test-generation/modules/:suiteId/:moduleName/info
 */
const getModuleInfo = async (req, res) => {
  try {
    const { suiteId, moduleName } = req.params;
    const userId = req.user._id || req.user.id;

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
    };

    // Call Python backend
    const response = await axios.get(
      `${PYTHON_BACKEND_URL}/static/modules/${moduleName}/info`,
      {
        data: requestBody,
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      }
    );

    return res.status(200).json({
      success: true,
      data: response.data,
      metadata: {
        suite_id: suiteId,
      },
    });
  } catch (error) {
    console.error("[ERROR] getModuleInfo:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: "Error from test generation service",
        error: error.response.data,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to get module info",
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
      schema,
      auth_requirements,
      code_context,
      data_providers,
      entity_relationships,
    } = req.body;

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
      schema: schema || null,
      auth_requirements: auth_requirements || null,
      code_context: code_context || null,
      data_providers: data_providers || null,
      entity_relationships: entity_relationships || null,
    };

    // Call Python backend
    const response = await axios.get(
      `${PYTHON_BACKEND_URL}/static/context/analyze`,
      {
        data: requestBody,
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      }
    );

    return res.status(200).json({
      success: true,
      data: response.data,
      metadata: {
        suite_id: suiteId,
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

module.exports = {
  listModules,
  generateTestsForModule,
  generateAllModules,
  quickGenerate,
  getModuleInfo,
  analyzeContextQuality,
};
