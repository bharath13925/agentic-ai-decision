const axios       = require("axios");
const Project     = require("../models/Project");
const AgentResult = require("../models/AgentResult");

const PYTHON_URL = process.env.PYTHON_URL || "http://localhost:8000";

/* ════════════════════════════════════════════════════════════════
   POST /api/rag/chat
   Body: { projectId, query, model?, topK? }
════════════════════════════════════════════════════════════════ */
const ragChat = async (req, res) => {
  try {
    const { projectId, query,model = "qwen2.5:7b", topK = 4 } = req.body;

    if (!projectId)
      return res.status(400).json({ message: "projectId is required." });
    if (!query || !query.trim())
      return res.status(400).json({ message: "query is required." });

    console.log(
      `[RAG:chat] projectId=${projectId} | ` +
      `query="${query.trim().slice(0, 60)}..." | model=${model}`
    );

    const response = await axios.post(
      `${PYTHON_URL}/rag-chat`,
      { projectId, query: query.trim(), model, topK },
      { timeout: 120000 },
    );

    return res.status(200).json(response.data);
  } catch (err) {
    console.error("[RagController:chat]", err.message);

    const isTimeout = err.code === "ECONNABORTED";
    const isDown    = err.code === "ECONNREFUSED";

    return res.status(500).json({
      status:  "error",
      message: isDown
        ? "Python microservice is not running. Start it and try again."
        : isTimeout
        ? "RAG query timed out. The LLM may be loading — please try again."
        : `RAG chat failed: ${err.message}`,
      answer: isDown
        ? "The AI assistant is unavailable. Ensure the Python microservice is running."
        : "I encountered an error. Please try again.",
      sources:          [],
      total_docs:       0,
      docs_retrieved:   0,
      retrieval_method: "error",
      error:            err.message,
    });
  }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/rag/stats/:projectId
   Returns FAISS store metadata for a project.
════════════════════════════════════════════════════════════════ */
const getRagStats = async (req, res) => {
  try {
    const { projectId } = req.params;

    const response = await axios.get(
      `${PYTHON_URL}/rag-stats/${projectId}`,
      { timeout: 15000 },
    );

    return res.status(200).json(response.data);
  } catch (err) {
    console.error("[RagController:stats]", err.message);
    return res.status(500).json({
      status:  "error",
      message: err.message,
      exists:  false,
    });
  }
};

/* ════════════════════════════════════════════════════════════════
   DELETE /api/rag/clear/:projectId
   Clears FAISS store for a project.
════════════════════════════════════════════════════════════════ */
const clearRagContext = async (req, res) => {
  try {
    const { projectId } = req.params;

    const response = await axios.delete(
      `${PYTHON_URL}/rag-clear/${projectId}`,
      { timeout: 15000 },
    );

    console.log(`[RAG:clear] projectId=${projectId} | cleared=${response.data?.cleared}`);
    return res.status(200).json(response.data);
  } catch (err) {
    console.error("[RagController:clear]", err.message);
    return res.status(500).json({
      status:  "error",
      message: err.message,
      cleared: false,
    });
  }
};

/* ════════════════════════════════════════════════════════════════
   POST /api/rag/store
   Body: { projectId, uid? }
   Manually trigger RAG context storage from the latest completed
   agent result in MongoDB. Useful if auto-store failed after pipeline.
════════════════════════════════════════════════════════════════ */
const storeContext = async (req, res) => {
  try {
    const { projectId } = req.body;

    if (!projectId)
      return res.status(400).json({ message: "projectId is required." });

    const [project, agentResult] = await Promise.all([
      Project.findOne({ projectId }),
      AgentResult.findOne({ projectId, status: "complete" }).sort({ createdAt: -1 }),
    ]);

    if (!project)
      return res.status(404).json({ message: "Project not found." });
    if (!agentResult)
      return res.status(404).json({
        message: "No completed agent result found. Run the Agent Decision Pipeline first.",
      });

    const objective = agentResult.objective || "increase_revenue";

    console.log(`[RAG:store] Manual store → projectId=${projectId} | objective=${objective}`);

    const response = await axios.post(
      `${PYTHON_URL}/store-agent-context`,
      {
        projectId,
        agentResult: {
          observerResult:   agentResult.observerResult,
          analystResult:    agentResult.analystResult,
          simulationResult: agentResult.simulationResult,
          decisionResult:   agentResult.decisionResult,
        },
        kpiSummary: project.kpiSummary || {},
        objective,
      },
      { timeout: 60000 },
    );

    console.log(
      `[RAG:store] ✅ Stored ${response.data?.stored?.length} docs | ` +
      `FAISS=${response.data?.faiss_vectors}`
    );

    return res.status(200).json(response.data);
  } catch (err) {
    console.error("[RagController:store]", err.message);
    return res.status(500).json({
      status:  "error",
      message: err.message,
    });
  }
};

module.exports = { ragChat, getRagStats, clearRagContext, storeContext };