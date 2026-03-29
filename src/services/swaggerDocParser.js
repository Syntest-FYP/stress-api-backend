const fs = require("fs");
const yaml = require("js-yaml");
const SwaggerParser = require("swagger-parser");
const swagger2openapi = require("swagger2openapi");

const OPENAPI_HTTP_METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);

/**
 * Parses a Swagger/OpenAPI (3.0.x or 3.1.x) file and extracts endpoints
 * @param {string} filePath - Path to the Swagger/OpenAPI file
 * @returns {Promise<Array>} Normalized endpoints array
 */
async function parseSwaggerFile(filePath) {
  try {
    // --- Read and parse file manually (JSON or YAML) ---
    const content = fs.readFileSync(filePath, "utf8");
    const rawSpec = yaml.load(content);

    let specToParse;

    // --- Detect OpenAPI 3.1.x and convert ---
    if (rawSpec.openapi && rawSpec.openapi.startsWith("3.1")) {
      console.log("Detected OpenAPI 3.1.x — converting to 3.0.3...");

      const conversion = await new Promise((resolve, reject) => {
        swagger2openapi.convertObj(
          rawSpec,
          { patch: true, warnOnly: true },
          (err, options) => {
            if (err) return reject(err);
            resolve(options.openapi);
          }
        );
      });

      specToParse = conversion;
    } else {
      specToParse = rawSpec;
    }

    // --- Now safely parse using SwaggerParser ---
    const api = await SwaggerParser.dereference(specToParse);

    const endpoints = [];
    const paths = api.paths || {};

    for (const [pathKey, methods] of Object.entries(paths)) {
      for (const [method, details] of Object.entries(methods)) {
        if (typeof details !== "object") continue;
        if (!OPENAPI_HTTP_METHODS.has(method.toLowerCase())) continue;

        endpoints.push({
          path: pathKey,
          method: method.toUpperCase(),
          parameters: details.parameters || [],
          responses: details.responses || {},
          description: details.summary || details.description || "",
          requestBody: normalizeRequestBody(details.requestBody),
        });
      }
    }

    console.log(`Parsed OpenAPI version: ${api.openapi}`);
    return endpoints;
  } catch (err) {
    console.error("Swagger parsing failed:", err.message);
    throw new Error(`Swagger parsing failed: ${err.message}`);
  }
}

/**
 * Normalizes Swagger requestBody to match Postman-like structure
 */
function normalizeRequestBody(requestBody) {
  if (!requestBody) return undefined;

  // JSON body
  if (requestBody.content && requestBody.content["application/json"]) {
    return {
      mode: "raw",
      raw: JSON.stringify(requestBody.content["application/json"].schema || {}),
      options: { raw: { language: "json" } },
    };
  }

  // Form-data
  if (requestBody.content && requestBody.content["multipart/form-data"]) {
    const formdata = [];
    const schema = requestBody.content["multipart/form-data"].schema;

    if (schema && schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        formdata.push({
          key,
          type:
            prop.type === "string" && prop.format === "binary"
              ? "file"
              : "text",
          value: "",
          description: prop.description || "",
        });
      }
    }

    return { mode: "formdata", formdata };
  }

  return undefined;
}

exports.parseSwaggerFile = parseSwaggerFile;
