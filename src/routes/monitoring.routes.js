const express = require('express');
const router = express.Router();
const { verifyAuth } = require('../middleware/auth');
const { uploadLogs } = require('../middleware/logUpload');
const monitoringController = require('../controllers/monitoring.controller');

router.post('/upload', verifyAuth, uploadLogs, monitoringController.uploadAndIngest);
router.post('/webhook', monitoringController.webhookIngest);
router.get('/logs', verifyAuth, monitoringController.getLogs);

module.exports = router;
