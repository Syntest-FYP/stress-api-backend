const express = require('express');
const router = express.Router();
const testController = require('../controllers/test.controller');
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

// Create test
router.post('/', authenticateToken, testController.create);

// Get all tests for user
router.get('/', authenticateToken, testController.getAll);

// Get test by id
router.get('/:id', authenticateToken, testController.getById);

// Update test
router.put('/:id', authenticateToken, testController.update);

// Delete test
router.delete('/:id', authenticateToken, testController.delete);

module.exports = router; 