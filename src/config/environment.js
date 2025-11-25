require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  APP_NAME: process.env.APP_NAME || "NexDashSync",
  AI_SERVICE_URL: process.env.AI_SERVICE_URL || "http://localhost:8000",
};
