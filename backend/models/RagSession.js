// ════════════════════════════════════════════════════════════════
//  RagSession.js  —  AgenticIQ v13.5
//
//  Stores the full FAISS + Ollama chat history for each project
//  session so conversations can be resumed across page reloads.
//
//  Schema design decisions:
//    • One document per (projectId + sessionId) pair.  A new
//      sessionId is created each time the user loads a project in
//      the chatbot.  This lets us keep multiple sessions per
//      project without blowing up a single document.
//    • messages is a sub-document array — kept intentionally flat
//      so the entire conversation can be fetched in one query and
//      passed back to the frontend / Python RAG service without
//      any additional joins.
//    • retrievedDocs is stored per assistant message so we can
//      audit which FAISS chunks drove each answer.
//    • ttl index (expiresAt) auto-deletes sessions older than 30
//      days — keeps the collection lean without manual cleanup.
// ════════════════════════════════════════════════════════════════

const mongoose = require("mongoose");

/* ── Sub-schema: one turn in the conversation ─────────────────── */
const messageSchema = new mongoose.Schema(
  {
    role: {
      type:     String,
      enum:     ["user", "assistant", "system"],
      required: true,
    },
    content: {
      type:     String,
      required: true,
    },
    /* Only populated on assistant turns */
    retrievedDocs: {
      type:    [String],  // FAISS document IDs that informed the answer
      default: [],
    },
    totalDocsIndexed: {
      type:    Number,
      default: null,
    },
    isError: {
      type:    Boolean,
      default: false,
    },
  },
  {
    _id:        true,
    timestamps: { createdAt: "sentAt", updatedAt: false },
  }
);

/* ── Main schema ──────────────────────────────────────────────── */
const ragSessionSchema = new mongoose.Schema(
  {
    /* ── Identifiers ─────────────────────────────────────────── */
    projectId: {
      type:     String,
      required: true,
      index:    true,
    },

    /*
     * Unique session identifier — generated client-side as
     * `${projectId}_${Date.now()}` so the frontend can track
     * which session is active without a round-trip.
     */
    sessionId: {
      type:     String,
      required: true,
      unique:   true,
    },

    uid: {
      type:    String,
      default: null,
    },

    /* ── Snapshot of context used when this session started ──── */
    objective: {
      type:    String,
      default: null,
    },

    /*
     * KPI values stored at session-open time so we can compare
     * them against any later re-runs without re-fetching MongoDB.
     */
    kpiSnapshot: {
      avgCTR:             { type: Number, default: null },
      avgConversionRate:  { type: Number, default: null },
      avgCartAbandonment: { type: Number, default: null },
      avgROI:             { type: Number, default: null },
    },

    mlAccuracySnapshot: {
      type:    Number,
      default: null,
    },

    topStrategySnapshot: {
      type:    String,
      default: null,
    },

    healthScoreSnapshot: {
      type:    Number,
      default: null,
    },

    /* ── Conversation turns ──────────────────────────────────── */
    messages: {
      type:    [messageSchema],
      default: [],
    },

    /* ── Session metadata ────────────────────────────────────── */
    totalTurns: {
      type:    Number,
      default: 0,
    },

    lastQuestion: {
      type:    String,
      default: null,
    },

    /*
     * TTL field — MongoDB will automatically delete documents
     * when expiresAt is reached (30 days from session creation).
     */
    expiresAt: {
      type:    Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

/* ── Indexes ─────────────────────────────────────────────────── */

// Fast lookup of all sessions for a project (newest first)
ragSessionSchema.index({ projectId: 1, createdAt: -1 });

// TTL index — auto-expire old sessions
ragSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/* ── Instance methods ────────────────────────────────────────── */

/**
 * Append a user message and (optionally) an assistant reply atomically.
 * Keeps totalTurns and lastQuestion in sync.
 *
 * @param {string} userContent        - The user's question
 * @param {string} assistantContent   - The LLM's answer
 * @param {object} meta               - { retrievedDocs, totalDocsIndexed, isError }
 */
ragSessionSchema.methods.addTurn = async function (
  userContent,
  assistantContent,
  { retrievedDocs = [], totalDocsIndexed = null, isError = false } = {}
) {
  this.messages.push({ role: "user",      content: userContent });
  this.messages.push({
    role:             "assistant",
    content:          assistantContent,
    retrievedDocs,
    totalDocsIndexed,
    isError,
  });
  this.totalTurns    += 1;
  this.lastQuestion   = userContent.slice(0, 300);
  return this.save();
};

/**
 * Return the last N turns as a flat [{role, content}] array
 * suitable for passing directly to the Ollama message history.
 *
 * @param {number} n - number of complete turns (each turn = 2 messages)
 */
ragSessionSchema.methods.getHistory = function (n = 6) {
  // Each "turn" is a user + assistant pair → 2 messages
  const slice = this.messages.slice(-(n * 2));
  return slice.map((m) => ({ role: m.role, content: m.content }));
};

/* ── Static helpers ──────────────────────────────────────────── */

/**
 * Find or create a session document.
 *
 * @param {string} projectId
 * @param {string} sessionId
 * @param {object} contextSnapshot  - { objective, kpiSnapshot, mlAccuracy, … }
 */
ragSessionSchema.statics.findOrCreate = async function (
  projectId,
  sessionId,
  {
    uid              = null,
    objective        = null,
    kpiSnapshot      = {},
    mlAccuracySnapshot = null,
    topStrategySnapshot = null,
    healthScoreSnapshot = null,
  } = {}
) {
  let session = await this.findOne({ sessionId });
  if (!session) {
    session = await this.create({
      projectId,
      sessionId,
      uid,
      objective,
      kpiSnapshot,
      mlAccuracySnapshot,
      topStrategySnapshot,
      healthScoreSnapshot,
    });
  }
  return session;
};

/**
 * Fetch the most recent session for a project (for resuming chat
 * when the user re-opens the chatbot without a fresh session ID).
 */
ragSessionSchema.statics.latestForProject = function (projectId) {
  return this.findOne({ projectId })
    .sort({ createdAt: -1 })
    .select("sessionId messages totalTurns lastQuestion kpiSnapshot objective");
};

/* ── Export ──────────────────────────────────────────────────── */
module.exports = mongoose.model("RagSession", ragSessionSchema);