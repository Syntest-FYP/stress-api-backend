const SwaggerParser = require('swagger-parser');
const { Collection } = require('postman-collection');
const fs = require('fs');
const yaml = require('js-yaml');

function summarizeSchema(schema) {
  if (!schema || typeof schema !== 'object') return undefined;
  const summary = {};
  if (schema.$ref) summary.$ref = schema.$ref;
  if (schema.type) summary.type = schema.type;
  if (schema.title) summary.title = schema.title;
  if (schema.format) summary.format = schema.format;
  if (schema.items) summary.items = summarizeSchema(schema.items);
  return summary;
}

function summarizeRequestBody(requestBody) {
  if (!requestBody || typeof requestBody !== 'object') return undefined;
  const content = requestBody.content || {};
  const result = {};
  for (const [ct, media] of Object.entries(content)) {
    result[ct] = {
      schema: summarizeSchema(media && media.schema),
      encoding: media && media.encoding ? Object.keys(media.encoding) : undefined,
    };
  }
  return { required: requestBody.required || false, content: result };
}

function summarizeResponses(responses) {
  const result = {};
  if (!responses || typeof responses !== 'object') return result;
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
 * Normalize OpenAPI/Swagger paths to a common structure
 */
function normalizeOpenApi(api) {
  const endpoints = [];
  const paths = api.paths || {};
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, details] of Object.entries(methods)) {
      if (typeof details !== 'object') continue;
      endpoints.push({
        path,
        method: method.toUpperCase(),
        parameters: details.parameters || [],
        responses: summarizeResponses(details.responses),
        description: details.summary || details.description || '',
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
 * Normalize custom endpoints format
 */
function normalizeCustomFormat(data) {
  return data.endpoints.map(endpoint => ({
    path: endpoint.path,
    method: endpoint.method.toUpperCase(),
    parameters: endpoint.parameters || [],
    responses: endpoint.responses || {},
    description: endpoint.description || '',
    requestBody: endpoint.requestBody || undefined
  }));
}

/**
 * Detects the format and parses the API documentation
 * @param {string|object} input - File path or JSON object
 * @returns {Promise<Array>} Normalized endpoints array
 */
async function parseApiDoc(input) {
  let data = input;
  
  if (typeof input === 'string') {
    const content = fs.readFileSync(input, 'utf8');
    data = content.trim().startsWith('{') ? JSON.parse(content) : yaml.load(content);
  }


  // Detection priority
  if (data.endpoints) {
    return normalizeCustomFormat(data);
  }

  // Detect OpenAPI/Swagger
  if (data.openapi || data.swagger) {
    // Use swagger-parser bundle to avoid circular structures on deref
    const api = await SwaggerParser.bundle(data);
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



