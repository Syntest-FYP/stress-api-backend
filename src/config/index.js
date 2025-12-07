// Re-export pool from postgres.js to ensure single source of truth
// This ensures all models using require('../config') get the correct connection
const { pool } = require('./postgres');

module.exports = { pool };
