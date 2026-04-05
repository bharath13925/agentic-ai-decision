const express = require("express");
const router  = express.Router();
const {
  ragChat,
  getRagStats,
  clearRagContext,
  storeContext,
} = require("../controllers/RagController");

/*
  RAG / AI Chat Routes — mounted at /api/rag (see server.js)

  POST   /api/rag/chat            → Ask a question grounded in FAISS ML context
  POST   /api/rag/store           → Manually (re)store agent context into FAISS
  GET    /api/rag/stats/:projectId → Metadata about the per-project FAISS store
  DELETE /api/rag/clear/:projectId → Clear FAISS store for a project
*/

router.post(  "/chat",              ragChat        );
router.post(  "/store",             storeContext   );
router.get(   "/stats/:projectId",  getRagStats    );
router.delete("/clear/:projectId",  clearRagContext);

module.exports = router;