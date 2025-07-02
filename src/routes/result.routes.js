const express = require('express');
const router = express.Router();
const resultController = require('../controllers/result.controller');
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

router.post('/', authenticateToken, resultController.create);
router.get('/execution/:execution_id', authenticateToken, resultController.getByExecution);
router.get('/:id', authenticateToken, resultController.getById);
router.delete('/:id', authenticateToken, resultController.delete);

module.exports = router; 