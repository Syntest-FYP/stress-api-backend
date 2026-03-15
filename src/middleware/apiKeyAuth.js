const { pool } = require("../config/postgres");
const { sendError } = require("../utils/response");

const verifyApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers["x-api-key"] || req.headers["api-key"];

    if (!apiKey) {
      return res.status(401).json({ error: "API Key is required" });
    }

    const result = await pool.query("SELECT id FROM users WHERE api_key = $1", [apiKey]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid API Key" });
    }

    req.user_id = result.rows[0].id;
    next();
  } catch (error) {
    console.error("[ApiKeyAuth] Error:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = { verifyApiKey };
