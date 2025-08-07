const express = require('express');
const router = express.Router();
const { parseApiDocFromFile } = require('../controllers/parser.controller');

router.get('/api-doc', parseApiDocFromFile);
router.get('/api-doc-swagger', parseApiDocFromFile);

module.exports = router;