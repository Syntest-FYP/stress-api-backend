/**
 * Applies migrations/add_load_test_profiles.sql only (no full reset).
 * Fixes: relation "load_test_profiles" does not exist
 *
 *   npm run db:load-test
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const { pool } = require("../src/config/postgres");

async function runSqlFile(label, filePath) {
  const migrationSQL = fs.readFileSync(filePath, "utf8");
  console.log(`\n${label}:`, filePath);

  try {
    await pool.query(migrationSQL);
    console.log(`${label} executed (batch)`);
    return;
  } catch (error) {
    if (
      error.message.includes("already exists") ||
      error.message.includes("duplicate")
    ) {
      console.log(`${label} (partial):`, error.message.split("\n")[0]);
      return;
    }
    console.log(`${label} batch failed, trying statements...`);
  }

  const statements = migrationSQL
    .split(/;(?![^$]*\$\$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (!statement || statement.startsWith("--")) continue;
    try {
      await pool.query(statement + (statement.endsWith(";") ? "" : ";"));
      console.log(`  stmt ${i + 1}/${statements.length}`);
    } catch (stmtError) {
      if (
        stmtError.message.includes("already exists") ||
        stmtError.message.includes("duplicate") ||
        stmtError.message.includes("does not exist")
      ) {
        console.log(`  stmt ${i + 1} skip:`, stmtError.message.split("\n")[0]);
      } else {
        console.error(`  stmt ${i + 1}:`, stmtError.message);
        throw stmtError;
      }
    }
  }
}

async function main() {
  const filePath = path.join(__dirname, "..", "migrations", "add_load_test_profiles.sql");
  if (!fs.existsSync(filePath)) {
    console.error("Missing:", filePath);
    process.exit(1);
  }
  await runSqlFile("Load test profiles", filePath);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
