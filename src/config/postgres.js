const { Pool } = require("pg");

// HARDCODED CONFIG FOR TESTING
// Using port 5433 to avoid conflict with Windows PostgreSQL service on 5432
const poolConfig = {
  host: "127.0.0.1",
  port: 5432, // Changed to 5433 (Docker maps 5433->5432) to avoid Windows PostgreSQL conflict
  database: "stressdb",
  user: "stressapisllgv",
  password: "sllgv20hoptportgresheu", // Original password from docker-compose.yml
  ssl: false,
};

// Log connection config (without password) for debugging
console.log("PostgreSQL Config (HARDCODED FOR TESTING):", {
  host: poolConfig.host,
  port: poolConfig.port,
  database: poolConfig.database,
  user: poolConfig.user,
  hasPassword: !!poolConfig.password,
  passwordLength: poolConfig.password?.length || 0,
  source: "Hardcoded for testing",
});

// Show masked password for debugging (first 2 and last 2 chars)
if (poolConfig.password) {
  const pwd = poolConfig.password;
  const masked =
    pwd.length > 4
      ? `${pwd.substring(0, 2)}${"*".repeat(pwd.length - 4)}${pwd.substring(
          pwd.length - 2,
        )}`
      : "****";
  console.log("🔍 Password (masked):", masked, `(length: ${pwd.length})`);
}

// Create pool with hardcoded config
// Try multiple approaches: individual parameters (most reliable for special characters)
let pool;

// APPROACH 1: Use individual parameters (bypasses URL encoding issues)
console.log("🔧 Attempting connection using individual parameters...");
pool = new Pool({
  host: poolConfig.host,
  port: poolConfig.port,
  database: poolConfig.database,
  user: poolConfig.user,
  password: poolConfig.password, // Direct password, no URL encoding
  ssl: false,
  // Add connection timeout
  connectionTimeoutMillis: 5000,
  // Add idle timeout
  idleTimeoutMillis: 30000,
});
console.log("✅ Created pool using individual parameters");

// Handle pool errors
pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
});

// Test connection on startup with retry
let retryCount = 0;
const maxRetries = 3;

function testConnection() {
  pool.query("SELECT NOW()", (err, res) => {
    if (err) {
      console.error("❌ PostgreSQL connection test failed:", err.message);
      console.error("❌ Error code:", err.code);
      console.error("❌ Error details:", {
        message: err.message,
        code: err.code,
        severity: err.severity,
      });
      const pwd = poolConfig.password || "";
      const maskedPwd =
        pwd.length > 4
          ? `${pwd.substring(0, 2)}${"*".repeat(pwd.length - 4)}${pwd.substring(
              pwd.length - 2,
            )}`
          : "****";
      console.error("Connection config:", {
        host: poolConfig.host,
        port: poolConfig.port,
        database: poolConfig.database,
        user: poolConfig.user,
        passwordLength: pwd.length,
        passwordMasked: maskedPwd,
        source: "Hardcoded for testing",
      });

      if (retryCount < maxRetries) {
        retryCount++;
        console.log(`🔄 Retrying connection (${retryCount}/${maxRetries})...`);
        setTimeout(testConnection, 2000);
      } else {
        console.error(
          "💡 Verify Docker container is running: docker-compose up -d",
        );
        console.error(
          "💡 Verify password matches Docker container: sllgv20hoptportgresheu",
        );
        console.error(
          "💡 Try: docker exec -it pg psql -U stressapisllgv -d stressdb",
        );
      }
    } else {
      console.log("✅ PostgreSQL connection test successful");
      console.log("✅ Server time:", res.rows[0].now);
    }
  });
}

// Start connection test
testConnection();

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log("Executed query", { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    const duration = Date.now() - start;
    console.error("Query error:", { text, duration, error: error.message });
    throw error;
  }
}

module.exports = { query, pool };
