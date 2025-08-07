const fs = require('fs');
const path = require('path');
const SwaggerParser = require('swagger-parser');

/**
 * Parses a Swagger/OpenAPI file and extracts endpoints
 * @param {string} filePath - Path to the Swagger/OpenAPI file
 * @returns {Promise<Array>} Normalized endpoints array
 */
async function parseSwaggerFile(filePath) {
  try {
    // Read and parse the file (supports both JSON and YAML)
    const api = await SwaggerParser.dereference(filePath);
    
    const endpoints = [];
    const paths = api.paths || {};

    // Iterate through all paths and methods
    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, details] of Object.entries(methods)) {
        if (typeof details !== 'object') continue;

        endpoints.push({
          path,
          method: method.toUpperCase(),
          parameters: details.parameters || [],
          responses: details.responses || {},
          description: details.summary || details.description || '',
          requestBody: normalizeRequestBody(details.requestBody),
        });
      }
    }

    return endpoints;
  } catch (err) {
    throw new Error(`Swagger parsing failed: ${err.message}`);
  }
}

exports.parseSwaggerFile = parseSwaggerFile;

/**
 * Normalizes Swagger requestBody to match Postman-like structure
 */
function normalizeRequestBody(requestBody) {
  if (!requestBody) return undefined;

  // Handle JSON content
  if (requestBody.content && requestBody.content['application/json']) {
    return {
      mode: 'raw',
      raw: JSON.stringify(requestBody.content['application/json'].schema || {}),
      options: { raw: { language: 'json' } }
    };
  }

  // Handle form-data
  if (requestBody.content && requestBody.content['multipart/form-data']) {
    const formdata = [];
    const schema = requestBody.content['multipart/form-data'].schema;
    
    if (schema && schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        formdata.push({
          key,
          type: prop.type === 'string' && prop.format === 'binary' ? 'file' : 'text',
          value: '',
          description: prop.description || ''
        });
      }
    }
    
    return { mode: 'formdata', formdata };
  }

  return undefined;
}