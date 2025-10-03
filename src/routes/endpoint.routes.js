const express = require('express');
const router = express.Router();
const EndpointController = require('../controllers/endpoint.controller');
const { verifyAuth } = require('../middleware/auth');

// Create endpoint (add to collection)
router.post('/', verifyAuth, EndpointController.create);

// Get all endpoint collections for user
router.get('/', verifyAuth, EndpointController.getAll);

// Get endpoints by suite
router.get('/suite/:suite_id', verifyAuth, EndpointController.getBySuite);

// Get single endpoint collection
router.get('/collection/:suite_id', verifyAuth, EndpointController.getCollection);

// Get single endpoint by ID
router.get('/:id', verifyAuth, EndpointController.getById);

// Update endpoint in collection
router.put('/:suite_id/:id', verifyAuth, EndpointController.update);

// Delete endpoint from collection
router.delete('/:suite_id/:id', verifyAuth, EndpointController.delete);

// Delete entire endpoint collection
router.delete('/collection/:suite_id', verifyAuth, EndpointController.deleteCollection);

module.exports = router;