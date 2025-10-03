const express = require('express');
const router = express.Router();
const { verifyAuth } = require('../middleware/auth');
const { parseApiDocFromFile, uploadAndParseSpec } = require('../controllers/parser.controller');
const { uploadSpec } = require('../middleware/upload');

router.get('/api-doc', verifyAuth, parseApiDocFromFile);
router.get('/api-doc-swagger', verifyAuth, parseApiDocFromFile);
router.post('/upload', verifyAuth, uploadSpec, uploadAndParseSpec);

module.exports = router;