/**
 * ragRoutes.js — AgenticIQ v13.6.2
 *
 * Added: GET /api/rag/health  — Ollama + Python service health check
 *        Used by ProjectChatbot to show status badge and block send
 *        when the backend isn't ready.
 */

const express = require("express");
const router  = express.Router();

const {
  getProjectContext,
  ragChat,
  getSessionHistory,
  getOllamaHealth,         // ← new
} = require("../controllers/RagController");

/* GET  /api/rag/health                          — Ollama + Python status  */
router.get("/health", getOllamaHealth);

/* GET  /api/rag/context/:projectId              — project context + session */
router.get("/context/:projectId", getProjectContext);

/* POST /api/rag/chat                            — grounded chat turn        */
router.post("/chat", ragChat);

/* GET  /api/rag/history/:projectId/:sessionId  — session message history   */
router.get("/history/:projectId/:sessionId", getSessionHistory);

module.exports = router;