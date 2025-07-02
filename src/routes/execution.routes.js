const express = require('express');
const router = express.Router();
const executionController = require('../controllers/execution.controller');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Create execution
router.post('/', authenticateToken, executionController.create);

// Get all executions for a test
router.get('/test/:test_id', authenticateToken, executionController.getByTest);

// Get execution by id
router.get('/:id', authenticateToken, executionController.getById);

// Update execution
router.put('/:id', authenticateToken, executionController.update);

// Delete execution
router.delete('/:id', authenticateToken, executionController.delete);

module.exports = router; 