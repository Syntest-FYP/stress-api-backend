const environmentModel = require('../models/environment.model');

/**
 * Build a flat key-value map from an environment record.
 * Merges: env.variables (JSONB object), base_url, and auth token from auth_config.
 */
const buildEnvVariables = (env) => {
  if (!env) return {};

  let vars = {};

  // env.variables can be a JSONB object, a JSON string, or null
  if (env.variables) {
    try {
      const parsed = typeof env.variables === 'string'
        ? JSON.parse(env.variables)
        : env.variables;
      if (parsed && typeof parsed === 'object') {
        vars = { ...parsed };
      }
    } catch (e) {
      console.warn('[dataProvider] Failed to parse env.variables:', e.message);
    }
  }

  // Always expose base_url as a placeholder
  if (env.base_url) {
    vars.base_url = vars.base_url || env.base_url;
  }

  // Expose auth token from auth_config if present
  if (env.auth_config) {
    try {
      const auth = typeof env.auth_config === 'string'
        ? JSON.parse(env.auth_config)
        : env.auth_config;
      if (auth) {
        if (auth.token) vars.token = vars.token || auth.token;
        if (auth.access_token) vars.access_token = vars.access_token || auth.access_token;
        if (auth.api_key) vars.api_key = vars.api_key || auth.api_key;
        if (auth.bearer_token) vars.bearer_token = vars.bearer_token || auth.bearer_token;
      }
    } catch (e) {
      console.warn('[dataProvider] Failed to parse env.auth_config:', e.message);
    }
  }

  return vars;
};

/**
 * Replace {{placeholder}} tokens in a string with values from the merged context.
 * Falls back to leaving the placeholder unchanged if no value found.
 */
const resolvePlaceholders = async (text, environmentId, executionContext = {}) => {
  if (!text || typeof text !== 'string') return text;

  let variables = { ...executionContext };

  if (environmentId) {
    try {
      const env = await environmentModel.getEnvironmentById(environmentId);
      const envVars = buildEnvVariables(env);
      // executionContext takes priority over env vars (runtime values override static config)
      variables = { ...envVars, ...executionContext };
    } catch (e) {
      console.warn('[dataProvider] Failed to load environment for placeholder resolution:', e.message);
    }
  }

  // Replace {{key}} patterns
  const placeholderRegex = /\{\{(.*?)\}\}/g;
  const resolved = text.replace(placeholderRegex, (match, p1) => {
    const key = p1.trim();
    if (variables[key] !== undefined && variables[key] !== null) {
      return String(variables[key]);
    }
    console.warn(`[dataProvider] Unresolved placeholder: {{${key}}}`);
    return match; // leave unchanged
  });

  return resolved;
};

/**
 * Resolve all placeholders in a step definition (url, headers, body).
 */
const resolveExecutionStep = async (step, environmentId, executionContext = {}) => {
  const resolvedStep = { ...step };

  if (resolvedStep.url) {
    resolvedStep.url = await resolvePlaceholders(resolvedStep.url, environmentId, executionContext);
  }

  if (resolvedStep.headers && typeof resolvedStep.headers === 'object') {
    const headersStr = await resolvePlaceholders(JSON.stringify(resolvedStep.headers), environmentId, executionContext);
    try { resolvedStep.headers = JSON.parse(headersStr); } catch (e) { /* keep original */ }
  }

  if (resolvedStep.body) {
    if (typeof resolvedStep.body === 'string') {
      resolvedStep.body = await resolvePlaceholders(resolvedStep.body, environmentId, executionContext);
    } else if (typeof resolvedStep.body === 'object') {
      const bodyStr = await resolvePlaceholders(JSON.stringify(resolvedStep.body), environmentId, executionContext);
      try { resolvedStep.body = JSON.parse(bodyStr); } catch (e) { /* keep original */ }
    }
  }

  return resolvedStep;
};

const getEnvironment = async (id) => {
  return await environmentModel.getEnvironmentById(id);
};

module.exports = {
  resolvePlaceholders,
  resolveExecutionStep,
  getEnvironment,
  buildEnvVariables,
};
