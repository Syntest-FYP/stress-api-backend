const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// Check for required environment variables
if (!process.env.SUPABASE_URL) {
  console.error("❌ SUPABASE_URL environment variable is missing!");
  console.error("Please create a .env file with: SUPABASE_URL=https://your-project.supabase.co");
}

if (!process.env.SUPABASE_ANON_KEY) {
  console.error("❌ SUPABASE_ANON_KEY environment variable is missing!");
  console.error("Please create a .env file with: SUPABASE_ANON_KEY=your-anon-key");
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY environment variable is missing!");
  console.error("Please create a .env file with: SUPABASE_SERVICE_ROLE_KEY=your-service-role-key");
}

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key"
);

const supabaseUser = createClient(
  process.env.SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_ANON_KEY || "placeholder-key",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

module.exports = {
  supabaseAdmin,
  supabaseUser,
};
