const SwaggerParser = require('swagger-parser');
const { Collection } = require('postman-collection');
const fs = require('fs');

/**
 * Normalize OpenAPI/Swagger paths to a common structure
 */
function normalizeOpenApi(api) {
  const endpoints = [];
  const paths = api.paths || {};
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, details] of Object.entries(methods)) {
      endpoints.push({
        path,
        method: method.toUpperCase(),
        parameters: details.parameters || [],
        responses: details.responses || {},
        description: details.summary || details.description || '',
        requestBody: details.requestBody || undefined,
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
        parameters: item.request.url.query ? item.request.url.query.map(q => ({ key: q.key, value: q.value })) : [],
        responses: {}, // Postman collections don't have response schemas by default
        description: item.name || '',
        requestBody: item.request.body ? item.request.body.toJSON() : undefined,
      });
    }
  });
  return endpoints;
}

/**
 * Detects the format and parses the API documentation
 * @param {string|object} input - File path or JSON object
 * @returns {Promise<Array>} Normalized endpoints array
 */
async function parseApiDoc(input) {
  let data = input;
  // If input is a file path, read and parse it
  if (typeof input === 'string') {
    const fileContent = fs.readFileSync(input, 'utf8');
    try {
      data = JSON.parse(fileContent);
    } catch (e) {
      // Try YAML if JSON fails
      const yaml = require('js-yaml');
      data = yaml.load(fileContent);
    }
  }

  // Detect OpenAPI/Swagger
  if (data.openapi || data.swagger) {
    // Use swagger-parser to validate and dereference
    const api = await SwaggerParser.dereference(data);
    return normalizeOpenApi(api);
  }

  // Detect Postman collection
  if (data.info && data.item && (data.info.schema || data.info._postman_id)) {
    const collection = new Collection(data);
    return normalizePostman(collection);
  }

  throw new Error('Unsupported API documentation format.');
}

module.exports = {
  parseApiDoc,
};
