const { parseApiDoc } = require('../services/apiDocParser');
const fs = require('fs');
const path = require('path');

exports.parseApiDocFromFile = async (req, res) => {
  try {
    const filePath = path.resolve(process.cwd(), req.query.path);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: 'File not found' });
    }
    const endpoints = await parseApiDoc(filePath);
    res.json(endpoints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};