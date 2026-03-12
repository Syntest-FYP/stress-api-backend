const EndpointService = require('../services/endpointService');
const { sendResponse, sendError } = require('../utils/response');

class EndpointController {
  // Create a new endpoint (add to collection)
  static async create(req, res) {
    try {
      const { suite_id, ...endpointData } = req.body;
      const user_id = req.user.id;

      if (!suite_id) {
        return sendError(res, 400, 'suite_id is required');
      }

      const collection = await EndpointService.addEndpointToCollection(user_id, suite_id, endpointData);
      return sendResponse(res, 201, 'Endpoint added successfully', collection);
    } catch (error) {
      return sendError(res, 400, error.message);
    }
  }

  // Get endpoints by suite
  static async getBySuite(req, res) {
    try {
      const { suite_id } = req.params;
      const user_id = req.user.id;

      const endpoints = await EndpointService.getEndpointsBySuite(user_id, suite_id);
      return sendResponse(res, 200, 'Endpoints retrieved successfully', endpoints);
    } catch (error) {
      console.error("[EndpointController Error] getBySuite:", error);
      return sendError(res, 400, error.message);
    }
  }

  // Get all endpoint collections for user
  static async getAll(req, res) {
    try {
      const user_id = req.user.id;
      const collections = await EndpointService.getAllEndpointCollectionsByUser(user_id);
      return sendResponse(res, 200, 'Endpoint collections retrieved successfully', collections);
    } catch (error) {
      return sendError(res, 400, error.message);
    }
  }

  // Get single endpoint collection
  static async getCollection(req, res) {
    try {
      const { suite_id } = req.params;
      const user_id = req.user.id;

      const collection = await EndpointService.getEndpointCollection(user_id, suite_id);
      if (!collection) {
        return sendError(res, 404, 'Endpoint collection not found');
      }

      return sendResponse(res, 200, 'Endpoint collection retrieved successfully', collection);
    } catch (error) {
      return sendError(res, 400, error.message);
    }
  }

  // Get single endpoint by ID
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const user_id = req.user.id;

      const endpoint = await EndpointService.getEndpointById(id, user_id);
      if (!endpoint) {
        return sendError(res, 404, 'Endpoint not found');
      }

      return sendResponse(res, 200, 'Endpoint retrieved successfully', endpoint);
    } catch (error) {
      return sendError(res, 400, error.message);
    }
  }

  // Update endpoint in collection
  static async update(req, res) {
    try {
      const { id, suite_id } = req.params;
      const user_id = req.user.id;
      const updateData = req.body;

      if (!suite_id) {
        return sendError(res, 400, 'suite_id is required in URL params');
      }

      const collection = await EndpointService.updateEndpointInCollection(user_id, suite_id, id, updateData);
      if (!collection) {
        return sendError(res, 404, 'Endpoint or collection not found');
      }

      return sendResponse(res, 200, 'Endpoint updated successfully', collection);
    } catch (error) {
      return sendError(res, 400, error.message);
    }
  }

  // Delete endpoint from collection
  static async delete(req, res) {
    try {
      const { id, suite_id } = req.params;
      const user_id = req.user.id;

      if (!suite_id) {
        return sendError(res, 400, 'suite_id is required in URL params');
      }

      const collection = await EndpointService.deleteEndpointFromCollection(user_id, suite_id, id);
      if (!collection) {
        return sendError(res, 404, 'Endpoint or collection not found');
      }

      return sendResponse(res, 200, 'Endpoint deleted successfully', collection);
    } catch (error) {
      return sendError(res, 400, error.message);
    }
  }

  // Delete entire endpoint collection
  static async deleteCollection(req, res) {
    try {
      const { suite_id } = req.params;
      const user_id = req.user.id;

      const collection = await EndpointService.deleteEndpointCollection(user_id, suite_id);
      if (!collection) {
        return sendError(res, 404, 'Endpoint collection not found');
      }

      return sendResponse(res, 200, 'Endpoint collection deleted successfully', { deleted: true });
    } catch (error) {
      return sendError(res, 400, error.message);
    }
  }
}

module.exports = EndpointController;
