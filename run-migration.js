const fs = require("fs");
const path = require("path");
const { pool } = require("./src/config/postgres");

async function runMigration() {
  console.log("🔄 Starting database migration...");
  
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, "../stress-api-ai/migrations/add_security_scan_tables.sql");
    const migrationSQL = fs.readFileSync(migrationPath, "utf8");
    
    console.log("📄 Migration file loaded:", migrationPath);
    
    // Execute the entire migration SQL
    // PostgreSQL can handle multiple statements in a single query
    console.log("📝 Executing migration SQL...");
    
    try {
      await pool.query(migrationSQL);
      console.log("✅ Migration SQL executed successfully");
    } catch (error) {
      // Some errors are expected (like "already exists" for IF NOT EXISTS)
      if (error.message.includes("already exists") || 
          error.message.includes("duplicate")) {
        console.log(`⚠️  Some objects may already exist (this is OK): ${error.message.split("\n")[0]}`);
      } else {
        // For other errors, try executing statement by statement
        console.log("⚠️  Full SQL execution had issues, trying statement by statement...");
        
        // Split and execute one by one
        const statements = migrationSQL
          .split(/;(?![^$]*\$\$)/) // Split by semicolon, but not inside $$ blocks
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith("--"));
        
        for (let i = 0; i < statements.length; i++) {
          const statement = statements[i];
          
          if (!statement || statement.startsWith("--")) {
            continue;
          }
          
          try {
            await pool.query(statement);
            console.log(`✅ Statement ${i + 1} executed`);
          } catch (stmtError) {
            if (stmtError.message.includes("already exists") || 
                stmtError.message.includes("duplicate") ||
                stmtError.message.includes("does not exist")) {
              console.log(`⚠️  Statement ${i + 1} skipped: ${stmtError.message.split("\n")[0]}`);
            } else {
              console.error(`❌ Error in statement ${i + 1}:`, stmtError.message);
              throw stmtError;
            }
          }
        }
      }
    }
    
    console.log("\n✅ Migration completed successfully!");
    console.log("\n📊 Verifying tables...");
    
    // Verify tables were created
    const tables = [
      "security_scans",
      "security_findings",
      "security_reports",
      "scan_templates",
      "identity_profiles",
    ];
    
    for (const table of tables) {
      const result = await pool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [table]
      );
      
      if (result.rows[0].exists) {
        console.log(`  ✅ Table '${table}' exists`);
      } else {
        console.log(`  ❌ Table '${table}' NOT found`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  }
}

// Run the migration
runMigration();

