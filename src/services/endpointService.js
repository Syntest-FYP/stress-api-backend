const EndpointCollection = require("../models/Endpoint");
const { normalizeQueryParams } = require("../utils/queryParamNormalizer");
const { query } = require("../config/postgres");

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

    if (result) {
      await this.syncEndpointsToPostgres(user_id, suite_id, result.endpoints);
    }

    return result;
  }

  // Sync helpers for PostgreSQL
  static async syncEndpointsToPostgres(user_id, suite_id, endpoints) {
    try {
      // For consistency with the collection model, we refresh the suite's endpoints in Postgres
      // First, get currently listed IDs in this suite to handle deletions if necessary
      // However, a simpler approach for now is to delete and re-insert or use UPSERT
      
      if (!endpoints || endpoints.length === 0) {
        await query("DELETE FROM api_endpoints WHERE suite_id = $1", [suite_id]);
        return;
      }

      // 1. Delete endpoints that are no longer in the MongoDB collection for this suite
      const currentIds = endpoints.map(ep => ep._id.toString());
      await query(
        "DELETE FROM api_endpoints WHERE suite_id = $1 AND id NOT IN (SELECT unnest($2::varchar[]))",
        [suite_id, currentIds]
      );

      // 2. Upsert current endpoints
      for (const ep of endpoints) {
        await query(
          `INSERT INTO api_endpoints (id, user_id, suite_id, name, method, path, base_url, headers, query_params, auth_type, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             method = EXCLUDED.method,
             path = EXCLUDED.path,
             base_url = EXCLUDED.base_url,
             headers = EXCLUDED.headers,
             query_params = EXCLUDED.query_params,
             auth_type = EXCLUDED.auth_type,
             is_active = EXCLUDED.is_active,
             updated_at = NOW()`,
          [
            ep._id.toString(),
            user_id,
            suite_id,
            ep.name || null,
            ep.method,
            ep.path,
            ep.base_url || null,
            JSON.stringify(ep.headers || {}),
            JSON.stringify(ep.query_params || {}),
            ep.auth_type || null,
            ep.is_active !== false
          ]
        );
      }
      console.log(`[SYNC] Successfully synced ${endpoints.length} endpoints to PostgreSQL for suite ${suite_id}`);
    } catch (err) {
      console.error(`[SYNC_ERROR] Failed to sync endpoints to PostgreSQL for suite ${suite_id}:`, err.message);
    }
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

    if (result) {
      await this.syncEndpointsToPostgres(user_id, suite_id, result.endpoints);
    }

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

    if (result) {
      await this.syncEndpointsToPostgres(user_id, suite_id, result.endpoints);
    }

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

    if (result) {
      await this.syncEndpointsToPostgres(user_id, suite_id, result.endpoints);
    }

    return result;
  }

  // Delete entire endpoint collection
  static async deleteEndpointCollection(user_id, suite_id) {
    const result = await EndpointCollection.findOneAndDelete({ user_id, suite_id });
    if (result) {
      await query("DELETE FROM api_endpoints WHERE suite_id = $1", [suite_id]);
    }
    return result;
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
