const { parseApiDoc } = require('../services/apiDocParser');
const EndpointService = require('../services/endpointService');
const fs = require('fs');
const path = require('path');

exports.parseApiDocFromFile = async (req, res) => {
  try {
    const filePath = path.resolve(process.cwd(), req.query.path);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: 'File not found' });
    }
    const endpoints = await parseApiDoc(filePath);
    // Optional attach to suite if provided
    if (req.query.suite_id && req.user?.id) {
      try {
        const collection = await EndpointService.createOrUpdateEndpointCollection(req.user.id, req.query.suite_id, endpoints);
        return res.json({ 
          parsed: endpoints.length, 
          inserted: collection ? collection.total_endpoints : 0, 
          endpoints: collection ? collection.endpoints : [],
          collection_id: collection ? collection._id : null
        });
      } catch (e) {
        console.error('Import error:', e.message);
        // fallback to just returning parsed if import fails
      }
    }
    res.json(endpoints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.uploadAndParseSpec = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const userId = req.user.id;
    const suiteId = req.body.suite_id;

    // Parse the uploaded file
    const endpoints = await parseApiDoc(filePath);

    // If suite_id provided, import endpoints to database
    if (suiteId) {
      try {
        const collection = await EndpointService.createOrUpdateEndpointCollection(userId, suiteId, endpoints);
        return res.json({
          success: true,
          message: 'File uploaded and endpoints imported successfully',
          file: {
            originalName: req.file.originalname,
            filename: req.file.filename,
            path: req.file.path,
            size: req.file.size
          },
          parsed: endpoints.length,
          inserted: collection ? collection.total_endpoints : 0,
          endpoints: collection ? collection.endpoints : [],
          collection_id: collection ? collection._id : null
        });
      } catch (importErr) {
        // Log the error for debugging
        console.error('Import error:', importErr.message);
        console.error('Suite ID:', suiteId, 'User ID:', userId);
        
        // If import fails, still return parsed endpoints
        return res.json({
          success: true,
          message: 'File uploaded and parsed successfully, but import to suite failed',
          file: {
            originalName: req.file.originalname,
            filename: req.file.filename,
            path: req.file.path,
            size: req.file.size
          },
          parsed: endpoints.length,
          inserted: 0,
          endpoints: endpoints,
          importError: importErr.message
        });
      }
    }

    // Just return parsed endpoints if no suite_id
    res.json({
      success: true,
      message: 'File uploaded and parsed successfully',
      file: {
        originalName: req.file.originalname,
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
      },
      parsed: endpoints.length,
      endpoints: endpoints
    });

  } catch (err) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: err.message });
  }
};