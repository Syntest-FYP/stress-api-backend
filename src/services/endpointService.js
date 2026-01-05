const EndpointCollection = require("../models/Endpoint");
const { normalizeQueryParams } = require("../utils/queryParamNormalizer");

class EndpointService {
  // Create or update endpoint collection
  static async createOrUpdateEndpointCollection(user_id, suite_id, endpoints) {
    if (!endpoints || endpoints.length === 0) return null;

    const endpointDocs = endpoints.map((endpoint) => ({
      name: endpoint.name || endpoint.description || null,
      method: endpoint.method,
      path: endpoint.path,
      base_url: endpoint.base_url || null,
      headers: endpoint.headers || {},
      query_params: normalizeQueryParams(
        endpoint.query_params || endpoint.parameters || {}
      ),
      auth_type: endpoint.auth_type || null,
      tags: endpoint.tags || [],
      request_body: endpoint.request_body || endpoint.requestBody || null,
      responses: endpoint.responses || null,
      is_active: true,
    }));

    const result = await EndpointCollection.findOneAndUpdate(
      { user_id, suite_id },
      {
        $set: {
          user_id,
          suite_id,
          endpoints: endpointDocs,
          total_endpoints: endpointDocs.length,
          last_updated: new Date(),
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    );

    return result;
  }

  // Add single endpoint to collection
  static async addEndpointToCollection(user_id, suite_id, endpointData) {
    const endpointDoc = {
      name: endpointData.name || endpointData.description || null,
      method: endpointData.method,
      path: endpointData.path,
      base_url: endpointData.base_url || null,
      headers: endpointData.headers || {},
      query_params: normalizeQueryParams(
        endpointData.query_params || endpointData.parameters || {}
      ),
      auth_type: endpointData.auth_type || null,
      tags: endpointData.tags || [],
      request_body:
        endpointData.request_body || endpointData.requestBody || null,
      responses: endpointData.responses || null,
      is_active: true,
    };

    const result = await EndpointCollection.findOneAndUpdate(
      { user_id, suite_id },
      {
        $push: { endpoints: endpointDoc },
        $inc: { total_endpoints: 1 },
        $set: { last_updated: new Date() },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    );

    return result;
  }

  // Get endpoints by suite
  static async getEndpointsBySuite(user_id, suite_id) {
    const collection = await EndpointCollection.findOne({ user_id, suite_id });
    return collection ? collection.endpoints : [];
  }

  // Get all endpoint collections for a user
  static async getAllEndpointCollectionsByUser(user_id) {
    return await EndpointCollection.find({ user_id }).sort({ updatedAt: -1 });
  }

  // Get single endpoint collection
  static async getEndpointCollection(user_id, suite_id) {
    return await EndpointCollection.findOne({ user_id, suite_id });
  }

  // Update specific endpoint in collection
  static async updateEndpointInCollection(
    user_id,
    suite_id,
    endpoint_id,
    updateData
  ) {
    const sanitizedUpdate = { ...updateData };
    if (Object.prototype.hasOwnProperty.call(sanitizedUpdate, "query_params")) {
      sanitizedUpdate.query_params = normalizeQueryParams(
        sanitizedUpdate.query_params
      );
    }

    const result = await EndpointCollection.findOneAndUpdate(
      {
        user_id,
        suite_id,
        "endpoints._id": endpoint_id,
      },
      {
        $set: {
          "endpoints.$": { ...sanitizedUpdate, _id: endpoint_id },
          last_updated: new Date(),
        },
      },
      { new: true, runValidators: true }
    );

    return result;
  }

  // Delete specific endpoint from collection
  static async deleteEndpointFromCollection(user_id, suite_id, endpoint_id) {
    const result = await EndpointCollection.findOneAndUpdate(
      { user_id, suite_id },
      {
        $pull: { endpoints: { _id: endpoint_id } },
        $inc: { total_endpoints: -1 },
        $set: { last_updated: new Date() },
      },
      { new: true }
    );

    return result;
  }

  // Delete entire endpoint collection
  static async deleteEndpointCollection(user_id, suite_id) {
    return await EndpointCollection.findOneAndDelete({ user_id, suite_id });
  }

  // Get single endpoint by ID (searches across all collections for user)
  static async getEndpointById(endpoint_id, user_id) {
    const collection = await EndpointCollection.findOne({
      user_id,
      "endpoints._id": endpoint_id,
    });

    if (!collection) return null;

    const endpoint = collection.endpoints.find(
      (ep) => ep._id.toString() === endpoint_id
    );
    return endpoint;
  }
}

module.exports = EndpointService;
