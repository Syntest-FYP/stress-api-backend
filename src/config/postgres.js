const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: false,
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log("Executed query", { text, duration, rows: res.rowCount });
  return res;
}

module.exports = { query, pool };
