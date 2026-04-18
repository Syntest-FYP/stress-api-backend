const environmentModel = require("../models/environment.model");

const resolvePlaceholders = async (
  text,
  environmentId,
  executionContext = {},
) => {
  if (!text || typeof text !== "string") return text;

  let variables = { ...executionContext };
  if (environmentId) {
    const env = await environmentModel.getEnvironmentById(environmentId);
    if (env && env.variables) {
      variables = { ...env.variables, ...variables };
    }
    // Also include base_url

    if (env && env.base_url) {
      variables.base_url = variables.base_url || env.base_url;
    }
  }

  // Regex to find {{placeholder}}
  const placeholderRegex = /{{(.*?)}}/g;

  return text.replace(placeholderRegex, (match, p1) => {
    const key = p1.trim();
    return variables[key] !== undefined ? variables[key] : match;
  });
};

const resolveExecutionStep = async (
  step,
  environmentId,
  executionContext = {},
) => {
  const resolvedStep = { ...step };

  if (resolvedStep.url) {
    resolvedStep.url = await resolvePlaceholders(
      resolvedStep.url,
      environmentId,
      executionContext,
    );
  }

  if (resolvedStep.body && typeof resolvedStep.body === "string") {
    resolvedStep.body = await resolvePlaceholders(
      resolvedStep.body,
      environmentId,
      executionContext,
    );
  } else if (resolvedStep.body && typeof resolvedStep.body === "object") {
    resolvedStep.body = JSON.parse(
      await resolvePlaceholders(
        JSON.stringify(resolvedStep.body),
        environmentId,
        executionContext,
      ),
    );
  }

  if (resolvedStep.headers) {
    resolvedStep.headers = JSON.parse(
      await resolvePlaceholders(
        JSON.stringify(resolvedStep.headers),
        environmentId,
        executionContext,
      ),
    );
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
};
