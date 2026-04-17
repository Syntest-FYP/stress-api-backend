const fs = require('fs');
const path = require('path');
const { pool } = require('./src/config/postgres');
require('dotenv').config();

async function migrate() {
  const sqlFile = path.join(__dirname, 'src', 'migrations', 'monitoring_tables.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  try {
    await pool.query(sql);
    console.log('✅ Monitoring tables created successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error creating monitoring tables:', err);
    process.exit(1);
  }
}

migrate();
