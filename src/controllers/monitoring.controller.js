const monitoringService = require('../services/monitoringService');
const PassiveLog = require('../models/passiveLog.model');

exports.uploadAndIngest = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { format, fieldMapping } = req.body;
    const mapping = fieldMapping ? JSON.parse(fieldMapping) : null;
    
    // Detect format from extension if not provided
    const detectedFormat = format || req.file.originalname.split('.').pop();

    const result = await monitoringService.ingestLogs(
      req.file.path,
      detectedFormat,
      mapping,
      'file_upload'
    );

    res.status(200).json({
      message: 'Logs ingested successfully',
      data: result
    });
  } catch (error) {
    console.error('[MONITORING] Ingestion error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.webhookIngest = async (req, res) => {
  try {
    // Webhooks are usually JSON streams or single events
    const logs = Array.isArray(req.body) ? req.body : [req.body];
    
    // In a real scenario, we might want to skip the file system and go straight to DB
    // but for consistency with the service, we can normalize here
    const normalizedLogs = logs.map(log => monitoringService._normalizeLog(log, null, 'webhook'));
    
    await PassiveLog.insertMany(normalizedLogs, { ordered: false });

    res.status(200).json({
      message: 'Webhook logs processed',
      count: normalizedLogs.length
    });
  } catch (error) {
    console.error('[MONITORING] Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getLogs = async (req, res) => {
  try {
    const { path, method, status, limit = 100, skip = 0 } = req.query;
    const query = {};

    if (path) query.endpointPath = new RegExp(path, 'i');
    if (method) query.method = method.toUpperCase();
    if (status) query.statusCode = parseInt(status);

    const logs = await PassiveLog.find(query)
      .sort({ timestamp: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    const total = await PassiveLog.countDocuments(query);

    res.status(200).json({
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      data: logs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
