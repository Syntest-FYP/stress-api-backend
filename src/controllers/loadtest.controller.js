const axios = require("axios");
const { query } = require("../config/postgres");

const AI_BACKEND_URL = process.env.AI_BACKEND_URL || "http://localhost:8000";

/** Same JWT source as verifyAuth: cookie (browser) or Authorization header. Server-side axios does not forward browser cookies to Python. */
function accessTokenForAiProxy(req) {
  const fromCookie = req.cookies?.access_token;
  if (fromCookie) return fromCookie;
  const h = req.headers.authorization;
  if (h && h.startsWith("Bearer ")) return h.slice(7);
  return "";
}

function missingLoadTestProfilesTable(error) {
  if (!error) return false;
  if (error.code === "42P01") return true;
  const msg = error.message || "";
  return msg.includes("load_test_profiles") && msg.includes("does not exist");
}

exports.generateProfile = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const {
      suite_id,
      profile_type,
      max_vus,
      duration_minutes,
      sla_requirements,
      selected_endpoints,
    } = req.body;

    if (!suite_id) {
      return res.status(400).json({ success: false, message: "suite_id is required" });
    }

    const token = accessTokenForAiProxy(req);

    const response = await axios.post(
      `${AI_BACKEND_URL}/load-test/generate-profile`,
      { suite_id, profile_type, max_vus, duration_minutes, sla_requirements, selected_endpoints },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        timeout: 60000,
      }
    );

    return res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error("[LoadTest] Profile generation error:", error.response?.data || error.message);
    const status = error.response?.status || 500;
    const detail = error.response?.data?.detail || error.message;
    return res.status(status).json({ success: false, message: detail });
  }
};

exports.executeLoadTest = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { suite_id, profile, k6_script, base_url, data_pool } = req.body;

    if (!suite_id || !profile || !k6_script || !base_url) {
      return res.status(400).json({
        success: false,
        message: "suite_id, profile, k6_script, and base_url are required",
      });
    }

    const token = accessTokenForAiProxy(req);

    const response = await axios.post(
      `${AI_BACKEND_URL}/load-test/execute`,
      { suite_id, profile, k6_script, base_url, data_pool },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        timeout: 60000,
      }
    );

    // Save load test profile to database
    try {
      await query(
        `INSERT INTO load_test_profiles (user_id, suite_id, conversation_id, profile_type, max_vus, profile_config, k6_script, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          suite_id,
          response.data.conversation_id,
          profile.profile_type,
          profile.max_vus || 100,
          JSON.stringify(profile),
          k6_script,
          "running",
        ]
      );
    } catch (dbErr) {
      console.error("[LoadTest] Failed to save profile to DB:", dbErr.message);
    }

    return res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error("[LoadTest] Execution error:", error.response?.data || error.message);
    const status = error.response?.status || 500;
    const detail = error.response?.data?.detail || error.message;
    return res.status(status).json({ success: false, message: detail });
  }
};

exports.suggestSla = async (req, res) => {
  try {
    const { suite_id } = req.body;
    if (!suite_id) {
      return res.status(400).json({ success: false, message: "suite_id is required" });
    }

    const token = accessTokenForAiProxy(req);

    const response = await axios.post(
      `${AI_BACKEND_URL}/load-test/suggest-sla`,
      { suite_id },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        timeout: 30000,
      }
    );

    return res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    console.error("[LoadTest] SLA suggestion error:", error.response?.data || error.message);
    const status = error.response?.status || 500;
    const detail = error.response?.data?.detail || error.message;
    return res.status(status).json({ success: false, message: detail });
  }
};

exports.getLoadTestHistory = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { suiteId } = req.params;

    const result = await query(
      `SELECT * FROM load_test_profiles WHERE user_id = $1 AND suite_id = $2 ORDER BY created_at DESC LIMIT 20`,
      [userId, suiteId]
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    if (missingLoadTestProfilesTable(error)) {
      console.warn(
        "[LoadTest] Table load_test_profiles missing — run: npm run db:load-test (or npm run db:init)"
      );
      return res.status(200).json({ success: true, data: [] });
    }
    console.error("[LoadTest] History fetch error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveLoadTestResult = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { conversation_id, result } = req.body;

    if (!conversation_id || !result) {
      return res.status(400).json({ success: false, message: "conversation_id and result are required" });
    }

    await query(
      `UPDATE load_test_profiles
       SET status = $1, result_data = $2, finished_at = NOW()
       WHERE conversation_id = $3 AND user_id = $4`,
      [result.status || "completed", JSON.stringify(result), conversation_id, userId]
    );

    return res.status(200).json({ success: true, message: "Result saved" });
  } catch (error) {
    if (missingLoadTestProfilesTable(error)) {
      console.warn("[LoadTest] Result not persisted — load_test_profiles table missing");
      return res.status(200).json({ success: true, message: "Result acknowledged (table not migrated)" });
    }
    console.error("[LoadTest] Save result error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};
