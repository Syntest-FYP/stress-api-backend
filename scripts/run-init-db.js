/**
 * Applies init-db.sql + security + generated_test_results migrations.
 * Requires .env with POSTGRES_* (see docker-compose) and Docker Postgres running.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const { pool } = require("../src/config/postgres");

async function runSqlFile(label, filePath) {
  const migrationSQL = fs.readFileSync(filePath, "utf8");
  console.log(`\n📄 ${label}:`, filePath);

  try {
    await pool.query(migrationSQL);
    console.log(`✅ ${label} executed`);
    return;
  } catch (error) {
    if (
      error.message.includes("already exists") ||
      error.message.includes("duplicate")
    ) {
      console.log(`⚠️  ${label} (partial):`, error.message.split("\n")[0]);
      return;
    }
    console.log(`⚠️  ${label} batch failed, trying statements...`);
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
      console.log(`  ✅ stmt ${i + 1}/${statements.length}`);
    } catch (stmtError) {
      if (
        stmtError.message.includes("already exists") ||
        stmtError.message.includes("duplicate") ||
        stmtError.message.includes("does not exist")
      ) {
        console.log(`  ⚠️  stmt ${i + 1} skip:`, stmtError.message.split("\n")[0]);
      } else {
        console.error(`  ❌ stmt ${i + 1}:`, stmtError.message);
        throw stmtError;
      }
    }
  }
}

async function main() {
  console.log("🔄 Applying database schema...\n");

  const root = path.join(__dirname, "..");
  const aiRoot = path.join(root, "..", "stress-api-ai");

  await runSqlFile("Core schema", path.join(root, "init-db.sql"));

  const aiChatSql = path.join(root, "migrations", "add_ai_chat_tables.sql");
  if (fs.existsSync(aiChatSql)) {
    await runSqlFile("AI chat tables (conversations, messages, …)", aiChatSql);
  }

  const loadTestSql = path.join(root, "migrations", "add_load_test_profiles.sql");
  if (fs.existsSync(loadTestSql)) {
    await runSqlFile("Load test profiles", loadTestSql);
  }

  const securitySql = path.join(aiRoot, "migrations", "add_security_scan_tables.sql");
  if (fs.existsSync(securitySql)) {
    await runSqlFile("Security scan tables", securitySql);
  } else {
    console.log("\n⚠️  Skipped security migration (file not found):", securitySql);
  }

  const genSql = path.join(aiRoot, "migrations", "add_generated_test_results.sql");
  if (fs.existsSync(genSql)) {
    await runSqlFile("Generated test results", genSql);
  } else {
    console.log("\n⚠️  Skipped generated_test_results (file not found):", genSql);
  }

  const check = await pool.query(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'test_suites'
    )`,
  );
  if (check.rows[0].exists) {
    console.log("\n✅ Table test_suites is present.");
  } else {
    console.error("\n❌ test_suites still missing — check errors above.");
    process.exit(1);
  }

  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
