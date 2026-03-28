const { Pool } = require("pg");

// Defaults match stress-api-backend/docker-compose.yml (host maps 5433 -> container 5432)
const poolConfig = {
  host: process.env.POSTGRES_HOST || "127.0.0.1",
  port: parseInt(process.env.POSTGRES_PORT || "5433", 10),
  database: process.env.POSTGRES_DB || "stressdb",
  user: process.env.POSTGRES_USER || "stressapisllgv",
  password: process.env.POSTGRES_PASSWORD || "sllgv20hoptportgresheu",
  ssl: process.env.POSTGRES_SSL === "true",
};

console.log("PostgreSQL Config:", {
  host: poolConfig.host,
  port: poolConfig.port,
  database: poolConfig.database,
  user: poolConfig.user,
  hasPassword: !!poolConfig.password,
  passwordLength: poolConfig.password?.length || 0,
  source: "env (POSTGRES_*) with docker-compose defaults",
});

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

let pool;

console.log("🔧 Creating PostgreSQL pool...");
pool = new Pool({
  host: poolConfig.host,
  port: poolConfig.port,
  database: poolConfig.database,
  user: poolConfig.user,
  password: poolConfig.password,
  ssl: poolConfig.ssl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: parseInt(
    process.env.POSTGRES_CONNECTION_TIMEOUT_MS || "15000",
    10,
  ),
  idleTimeoutMillis: 30000,
});
console.log("✅ Created pool");

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
});

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
      });

      if (retryCount < maxRetries) {
        retryCount++;
        console.log(`🔄 Retrying connection (${retryCount}/${maxRetries})...`);
        setTimeout(testConnection, 2000);
      } else {
        console.error("💡 Verify Docker: docker compose up -d");
        console.error(
          "💡 Host port should be POSTGRES_PORT=5433 (see docker-compose port mapping)",
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
