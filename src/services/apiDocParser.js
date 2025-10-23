const SwaggerParser = require("swagger-parser");
const { Collection } = require("postman-collection");
const fs = require("fs");
const yaml = require("js-yaml");

function summarizeSchema(schema) {
  if (!schema || typeof schema !== "object") return undefined;
  const summary = {};
  if (schema.$ref) summary.$ref = schema.$ref;
  if (schema.type) summary.type = schema.type;
  if (schema.title) summary.title = schema.title;
  if (schema.format) summary.format = schema.format;
  if (schema.items) summary.items = summarizeSchema(schema.items);
  return summary;
}

function summarizeRequestBody(requestBody) {
  if (!requestBody || typeof requestBody !== "object") return undefined;
  const content = requestBody.content || {};
  const result = {};
  for (const [ct, media] of Object.entries(content)) {
    result[ct] = {
      schema: summarizeSchema(media && media.schema),
      encoding:
        media && media.encoding ? Object.keys(media.encoding) : undefined,
    };
  }
  return { required: requestBody.required || false, content: result };
}

function summarizeResponses(responses) {
  const result = {};
  if (!responses || typeof responses !== "object") return result;
  for (const [code, resp] of Object.entries(responses)) {
    const content = (resp && resp.content) || {};
    const csum = {};
    for (const [ct, media] of Object.entries(content)) {
      csum[ct] = { schema: summarizeSchema(media && media.schema) };
    }
    result[code] = { description: resp && resp.description, content: csum };
  }
  return result;
}

/**
 * Convert OpenAPI 3.1 to 3.0 format
 */
function downgradeOpenApi31To30(spec) {
  const converted = JSON.parse(JSON.stringify(spec));

  // Change version
  converted.openapi = "3.0.3";

  // Handle webhooks (3.1 feature) - move to paths with x-webhook extension
  if (converted.webhooks) {
    converted["x-webhooks"] = converted.webhooks;
    delete converted.webhooks;
  }

  // Recursively fix schemas
  function fixSchema(schema) {
    if (!schema || typeof schema !== "object") return;

    // Handle null types (3.1 allows type: "null", 3.0 uses nullable)
    if (Array.isArray(schema.type)) {
      const hasNull = schema.type.includes("null");
      const otherTypes = schema.type.filter((t) => t !== "null");
      if (hasNull && otherTypes.length === 1) {
        schema.type = otherTypes[0];
        schema.nullable = true;
      } else if (hasNull) {
        schema.type = otherTypes;
        schema.nullable = true;
      }
    } else if (schema.type === "null") {
      delete schema.type;
      schema.nullable = true;
    }

    // Remove 3.1-specific keywords
    delete schema.$comment;
    delete schema.unevaluatedProperties;
    delete schema.unevaluatedItems;
    delete schema.prefixItems;
    delete schema.const;

    // Convert const to enum
    if (schema.const !== undefined) {
      schema.enum = [schema.const];
      delete schema.const;
    }

    // Recurse into nested schemas
    if (schema.properties) {
      Object.values(schema.properties).forEach(fixSchema);
    }
    if (schema.items) fixSchema(schema.items);
    if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === "object"
    ) {
      fixSchema(schema.additionalProperties);
    }
    if (schema.allOf) schema.allOf.forEach(fixSchema);
    if (schema.oneOf) schema.oneOf.forEach(fixSchema);
    if (schema.anyOf) schema.anyOf.forEach(fixSchema);
  }

  // Fix all schemas in components
  if (converted.components?.schemas) {
    Object.values(converted.components.schemas).forEach(fixSchema);
  }

  // Fix schemas in paths
  if (converted.paths) {
    Object.values(converted.paths).forEach((pathItem) => {
      Object.values(pathItem).forEach((operation) => {
        if (typeof operation !== "object") return;

        // Fix request body
        if (operation.requestBody?.content) {
          Object.values(operation.requestBody.content).forEach((media) => {
            if (media.schema) fixSchema(media.schema);
          });
        }

        // Fix responses
        if (operation.responses) {
          Object.values(operation.responses).forEach((response) => {
            if (response.content) {
              Object.values(response.content).forEach((media) => {
                if (media.schema) fixSchema(media.schema);
              });
            }
          });
        }

        // Fix parameters
        if (operation.parameters) {
          operation.parameters.forEach((param) => {
            if (param.schema) fixSchema(param.schema);
          });
        }
      });
    });
  }

  return converted;
}

/**
 * Normalize OpenAPI/Swagger paths to a common structure
 */
function normalizeOpenApi(api) {
  const endpoints = [];
  const paths = api.paths || {};
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, details] of Object.entries(methods)) {
      if (typeof details !== "object") continue;
      endpoints.push({
        path,
        method: method.toUpperCase(),
        parameters: details.parameters || [],
        responses: summarizeResponses(details.responses),
        description: details.summary || details.description || "",
        requestBody: summarizeRequestBody(details.requestBody),
      });
    }
  }
  return endpoints;
}

/**
 * Normalize Postman collection to a common structure
 */
function normalizePostman(collection) {
  const endpoints = [];
  collection.forEachItem((item) => {
    if (item.request) {
      endpoints.push({
        path: item.request.url.getPathWithQuery(),
        method: item.request.method,
        parameters: item.request.url.query
          ? item.request.url.query.map((q) => ({ key: q.key, value: q.value }))
          : [],
        responses: {}, // Postman collections don't have response schemas by default
        description: item.name || "",
        requestBody: item.request.body ? item.request.body.toJSON() : undefined,
      });
    }
  });
  return endpoints;
}

/**
 * Normalize custom endpoints format
 */
function normalizeCustomFormat(data) {
  return data.endpoints.map((endpoint) => ({
    path: endpoint.path,
    method: endpoint.method.toUpperCase(),
    parameters: endpoint.parameters || [],
    responses: endpoint.responses || {},
    description: endpoint.description || "",
    requestBody: endpoint.requestBody || undefined,
  }));
}

/**
 * Detects the format and parses the API documentation
 * @param {string|object} input - File path or JSON object
 * @returns {Promise<Array>} Normalized endpoints array
 */
async function parseApiDoc(input) {
  let data = input;

  if (typeof input === "string") {
    const content = fs.readFileSync(input, "utf8");
    data = content.trim().startsWith("{")
      ? JSON.parse(content)
      : yaml.load(content);
  }

  if (data.endpoints) {
    return normalizeCustomFormat(data);
  }

  if (data.openapi || data.swagger) {
    let apiToProcess = data;

    // Convert OpenAPI 3.1 to 3.0 if needed
    if (data.openapi && data.openapi.startsWith("3.1")) {
      console.log("Converting OpenAPI 3.1 to 3.0 for compatibility...");
      apiToProcess = downgradeOpenApi31To30(data);
    }

    // Parse and bundle the API spec
    const bundledApi = await SwaggerParser.bundle(apiToProcess);
    return normalizeOpenApi(bundledApi);
  }

  if (data.info && data.item && (data.info.schema || data.info._postman_id)) {
    const collection = new Collection(data);
    return normalizePostman(collection);
  }

  throw new Error("Unsupported API documentation format.");
}

module.exports = {
  parseApiDoc,
};
