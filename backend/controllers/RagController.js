/**
 * RagController.js — AgenticIQ v13.6.2
 *
 * FIXES vs v13.6.1:
 *
 *  FIX CTRL-A — getOllamaHealth() added.  Called by GET /api/rag/health
 *               so the frontend can check Ollama status before the user
 *               types anything.  Prevents every message from hitting a
 *               broken endpoint and showing the timeout error.
 *
 *  FIX CTRL-B — ragChat() pre-checks /health-rag on the Python service
 *               before firing the full /rag-chat call.  If the service
 *               isn't warm yet it returns a clear "still loading" message
 *               instead of a 3-minute timeout.
 *
 *  FIX CTRL-C — Timeout raised to 240 000 ms (4 min) as a hard safety net.
 *               Real-world latency after warmup is 5-30 s.  The warmup
 *               itself (model cold-start) can take up to 90 s on CPU-only
 *               machines; the Python service now waits internally so this
 *               limit is rarely hit.
 *
 *  FIX CTRL-D — OLLAMA_LLM_MODEL env var read and forwarded in error
 *               messages so they always name the correct model.
 *
 *  FIX CTRL-E — Session save errors are caught silently so a Mongo hiccup
 *               never causes a 500 that masks the real chat response.
 */

const path        = require("path");
const axios       = require("axios");
const Project     = require("../models/Project");
const MLResult    = require("../models/MlResult");
const AgentResult = require("../models/AgentResult");
const RagSession  = require("../models/RagSession");

const PYTHON_URL  = process.env.PYTHON_URL  || "http://localhost:8000";
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "../uploads");

// FIX CTRL-D: read the same env var your Python service uses
const OLLAMA_LLM_MODEL = process.env.OLLAMA_LLM_MODEL || "llama3";

// FIX CTRL-C: 4-minute hard limit.  Python warmup handles the first 90 s.
const RAG_TIMEOUT_MS    = 240_000;
// Quick timeout for the health-check pre-flight — fail fast
const HEALTH_TIMEOUT_MS =   5_000;

/* ════════════════════════════════════════════════════════════════
   FIX CTRL-A: GET /api/rag/health
   Lightweight endpoint the frontend polls on project load.
   Returns { ready, warming, error, model } so the UI can show
   "Ollama loading…" instead of letting the user hit send and wait.
════════════════════════════════════════════════════════════════ */
const getOllamaHealth = async (req, res) => {
  try {
    const response = await axios.get(`${PYTHON_URL}/health-rag`, {
      timeout: HEALTH_TIMEOUT_MS,
    });
    return res.status(200).json(response.data);
  } catch (err) {
    const isConnect =
      err.code === "ECONNREFUSED" || err.code === "ECONNRESET";
    return res.status(200).json({
      ready:   false,
      warming: false,
      error:   isConnect
        ? "Python RAG microservice is not running. Start it with: uvicorn app:app --reload --port 8000"
        : err.message,
      model:   OLLAMA_LLM_MODEL,
    });
  }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/rag/context/:projectId
════════════════════════════════════════════════════════════════ */
const getProjectContext = async (req, res) => {
  try {
    const { projectId } = req.params;

    const [project, mlResult, agentResult] = await Promise.all([
      Project.findOne({ projectId }),
      MLResult.findOne({ projectId, status: "complete" }).sort({ createdAt: -1 }),
      AgentResult.findOne({ projectId, status: "complete" }).sort({ createdAt: -1 }),
    ]);

    if (!project) {
      return res
        .status(404)
        .json({ message: "Project not found. Check your Project ID." });
    }

    const UserAction = require("../models/UserAction");
    const latestObj  = await UserAction.findOne({
      projectId,
      actionType: "objective_selected",
    }).sort({ createdAt: -1 });

    const latestSession = await RagSession.latestForProject(projectId);

    const kpi          = project.kpiSummary || {};
    const featureCount = mlResult?.featureImportance?.length ?? 0;
    const mlAccuracy   = mlResult?.ensemble?.avgAccuracy       ?? null;
    const healthScore  = agentResult?.observerResult?.healthScore ?? null;
    const topStrategy  =
      agentResult?.decisionResult?.recommendation?.strategyName ?? null;

    const modelPaths       = mlResult?.modelPaths       || {};
    const kpiPredictorPath = mlResult?.kpiPredictorPath || null;

    // FIX CTRL-A: check actual Ollama health and include in context response
    let ragHealth = { ready: false, warming: false, error: null, model: OLLAMA_LLM_MODEL };
    try {
      const hr = await axios.get(`${PYTHON_URL}/health-rag`, { timeout: HEALTH_TIMEOUT_MS });
      ragHealth = hr.data;
    } catch {
      ragHealth.error = "Python RAG service unreachable";
    }

    return res.status(200).json({
      projectId,
      projectName:         project.projectName,
      status:              project.status,
      objective:           latestObj?.objective ?? null,
      kpiSummary:          kpi,
      hasMLResult:         !!mlResult,
      mlAccuracy,
      featureCount,
      featureImportance:   mlResult?.featureImportance ?? [],
      hasAgentResult:      !!agentResult,
      healthScore,
      topStrategy,
      modelPaths,
      kpiPredictorPath,
      uploadsDir:          UPLOADS_DIR,
      // FIX CTRL-A: real health instead of hardcoded true
      ragReady:    ragHealth.ready,
      ragWarming:  ragHealth.warming,
      ragError:    ragHealth.error,
      ragModel:    ragHealth.model,
      pipelineVersion:     mlResult?.pipelineVersion ?? null,
      latestSession: latestSession
        ? {
            sessionId:    latestSession.sessionId,
            totalTurns:   latestSession.totalTurns,
            lastQuestion: latestSession.lastQuestion,
            messages:     latestSession.messages.slice(-20),
          }
        : null,
      mlResult:    mlResult    ? _sanitise(mlResult)    : null,
      agentResult: agentResult ? _sanitise(agentResult) : null,
    });
  } catch (err) {
    console.error("[RagController:context]", err.message);
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════
   POST /api/rag/chat
   FIX CTRL-B: pre-flight health check before the full RAG call
════════════════════════════════════════════════════════════════ */
const ragChat = async (req, res) => {
  try {
    const {
      projectId,
      sessionId,
      question,
      history = [],
      uid     = null,
    } = req.body;

    if (!projectId || !question) {
      return res
        .status(400)
        .json({ message: "projectId and question are required." });
    }
    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required." });
    }

    // ── FIX CTRL-B: quick health pre-flight ───────────────────
    // Only blocks for HEALTH_TIMEOUT_MS (5 s) so it's cheap.
    // If the service is warming up, return a friendly message
    // immediately instead of letting the user wait 3+ minutes.
    try {
      const hr = await axios.get(`${PYTHON_URL}/health-rag`, { timeout: HEALTH_TIMEOUT_MS });
      const h  = hr.data;
      if (!h.ready && h.warming) {
        return res.status(200).json({
          answer:  `⏳ Ollama is loading model **${h.model || OLLAMA_LLM_MODEL}** into memory — this takes 30-90 s on first start.\n\nPlease wait a moment and try again.`,
          status:  "warming",
          warming: true,
        });
      }
      if (!h.ready && h.error) {
        return res.status(200).json({
          answer: (
            `Ollama is not ready.\n\n${h.error}\n\n` +
            `Make sure you have run:\n` +
            `  ollama serve\n` +
            `  ollama pull ${h.model || OLLAMA_LLM_MODEL}`
          ),
          status: "error",
        });
      }
    } catch (healthErr) {
      // Python service itself is down
      return res.status(200).json({
        answer: (
          "The Python RAG microservice is not running.\n\n" +
          "Start it with:\n" +
          "  uvicorn app:app --reload --port 8000\n\n" +
          "Then make sure Ollama is running:\n" +
          "  ollama serve\n" +
          `  ollama pull ${OLLAMA_LLM_MODEL}`
        ),
        status: "error",
      });
    }

    // ── Fetch fresh context on every turn ──────────────────────
    const [project, mlResult, agentResult] = await Promise.all([
      Project.findOne({ projectId }),
      MLResult.findOne({ projectId, status: "complete" }).sort({ createdAt: -1 }),
      AgentResult.findOne({ projectId, status: "complete" }).sort({ createdAt: -1 }),
    ]);

    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    const UserAction = require("../models/UserAction");
    const latestObj  = await UserAction
      .findOne({ projectId, actionType: "objective_selected" })
      .sort({ createdAt: -1 });

    const kpi     = project.kpiSummary || {};
    const session = await RagSession.findOrCreate(projectId, sessionId, {
      uid,
      objective:          latestObj?.objective ?? null,
      kpiSnapshot: {
        avgCTR:             kpi.avgCTR             ?? null,
        avgConversionRate:  kpi.avgConversionRate  ?? null,
        avgCartAbandonment: kpi.avgCartAbandonment ?? null,
        avgROI:             kpi.avgROI             ?? null,
      },
      mlAccuracySnapshot:  mlResult?.ensemble?.avgAccuracy  ?? null,
      topStrategySnapshot: agentResult?.decisionResult?.recommendation?.strategyName ?? null,
      healthScoreSnapshot: agentResult?.observerResult?.healthScore ?? null,
    });

    const historyToUse =
      history.length > 0 ? history.slice(-12) : session.getHistory(6);

    // ── Build Python payload ────────────────────────────────────
    const payload = {
      projectId,
      question,
      history:           historyToUse,
      objective:         latestObj?.objective ?? null,
      kpiSummary:        kpi,
      uploadsDir:        UPLOADS_DIR,
      modelPaths:        mlResult?.modelPaths  ?? {},
      kpiPredictorPath:  mlResult?.kpiPredictorPath ?? null,
      featureImportance: mlResult?.featureImportance ?? [],
      ensemble:          mlResult?.ensemble   ?? null,
      mlResult:          mlResult    ? _sanitise(mlResult)    : null,
      agentResult:       agentResult ? _sanitise(agentResult) : null,
    };

    console.log(
      `[RAG:chat] projectId=${projectId} | sessionId=${sessionId} | ` +
      `question="${question.slice(0, 80)}…"`
    );

    // ── Call Python RAG service (FIX CTRL-C: 240 s timeout) ────
    let answer        = "";
    let retrievedDocs = [];
    let totalDocs     = 0;
    let isError       = false;

    try {
      const response = await axios.post(`${PYTHON_URL}/rag-chat`, payload, {
        timeout: RAG_TIMEOUT_MS,
      });
      const data = response.data;

      if (data.status === "success") {
        answer        = data.answer        || "";
        retrievedDocs = data.retrievedDocs || [];
        totalDocs     = data.totalDocs     || 0;
      } else {
        answer  = data.answer || data.message || "Unable to generate a response.";
        isError = true;
      }
    } catch (axiosErr) {
      const isConnect =
        axiosErr.code === "ECONNREFUSED" || axiosErr.code === "ECONNRESET";
      const isTimeout =
        axiosErr.code === "ETIMEDOUT"   || axiosErr.code === "ECONNABORTED";

      if (isConnect) {
        answer =
          "Python RAG service stopped. Restart it:\n" +
          "  uvicorn app:app --reload --port 8000";
      } else if (isTimeout) {
        answer =
          `The request timed out (>${RAG_TIMEOUT_MS / 60000} min).\n` +
          "This usually means the machine is very slow. Try a lighter model:\n" +
          "  ollama pull llama3.2:1b\n" +
          "Then set OLLAMA_LLM_MODEL=llama3.2:1b in your .env and restart.";
      } else {
        answer = `RAG service error: ${axiosErr.message}`;
      }
      isError = true;
    }

    // ── FIX CTRL-E: session save can't crash the response ──────
    try {
      await session.addTurn(question, answer, {
        retrievedDocs,
        totalDocsIndexed: totalDocs,
        isError,
      });
    } catch (saveErr) {
      console.warn("[RagController] Session save failed (non-fatal):", saveErr.message);
    }

    return res.status(200).json({
      answer,
      retrievedDocs,
      totalDocs,
      sessionId,
      status: isError ? "error" : "success",
    });
  } catch (err) {
    console.error("[RagController:chat]", err.message);
    return res.status(500).json({
      answer: `Server error: ${err.message}`,
      status: "error",
    });
  }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/rag/history/:projectId/:sessionId
════════════════════════════════════════════════════════════════ */
const getSessionHistory = async (req, res) => {
  try {
    const { projectId, sessionId } = req.params;
    const session = await RagSession.findOne({ projectId, sessionId });
    if (!session) {
      return res.status(404).json({ message: "Session not found." });
    }
    return res.status(200).json({
      sessionId,
      totalTurns: session.totalTurns,
      messages:   session.messages,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════════════ */
function _sanitise(doc) {
  if (!doc) return null;
  try {
    return JSON.parse(JSON.stringify(doc.toObject ? doc.toObject() : doc));
  } catch {
    return null;
  }
}

module.exports = { getProjectContext, ragChat, getSessionHistory, getOllamaHealth };