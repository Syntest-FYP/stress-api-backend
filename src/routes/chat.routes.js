const express = require("express");
const router = express.Router();
const { verifyAuth } = require("../middleware/auth");
const {
  postChatMessage,
  orchestrateChat,
  getSessionContext,
  clearSession,
  streamChat,
  getChatHistory,
  getSuiteChatSessions,
} = require("../controllers/chat.controller");

router.use(verifyAuth);

// Basic chat proxy (LLM intent-aware orchestrator via Python /chat)
router.post("/message", postChatMessage);

router.get("/stream", streamChat);

// Orchestrated chat with schema/context passthrough
router.post("/orchestrate", orchestrateChat);

// Session helpers
router.get("/session/:sessionId/context", getSessionContext);
router.get("/session/:sessionId/history", getChatHistory);
router.get("/history/:sessionId", getChatHistory); // Alias for compatibility
router.get("/sessions/:suiteId", getSuiteChatSessions);
router.delete("/session/:sessionId", clearSession);

module.exports = router;
