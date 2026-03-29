const mongoose = require("mongoose");

const agentResultSchema = new mongoose.Schema({
  projectId: { type: String, required: true, index: true },
  uid:       { type: String, required: true },

  /* ── Full agent outputs — flexible JSON ──────────────────────────
     Dynamic so agent structure can evolve without schema migrations.
  ────────────────────────────────────────────────────────────────── */
  observerResult:   { type: Object, default: null },
  analystResult:    { type: Object, default: null },
  simulationResult: { type: Object, default: null },
  decisionResult:   { type: Object, default: null },
  recommendation:   { type: Object, default: null },

  /* ── Extracted key fields — indexed copies for fast queries ──────
     Pulled from decisionResult after pipeline completes.
     NOT the source of truth — mirrors data inside decisionResult.

     Use cases:
       db.agentresults.find({ "kpis.conversionRate": { $gt: 20 } })
       db.agentresults.find({ "bestStrategy.score": { $gte: 80 } })
  ────────────────────────────────────────────────────────────────── */

  /** Real KPI values from the uploaded dataset */
  kpis: {
    ctr:             { type: Number, default: null },
    conversionRate:  { type: Number, default: null },
    cartAbandonment: { type: Number, default: null },
    roi:             { type: Number, default: null },
  },

  /** ML-projected KPI values after the recommended strategy */
  predictedKpis: {
    ctr:             { type: Number, default: null },
    conversionRate:  { type: Number, default: null },
    cartAbandonment: { type: Number, default: null },
    roi:             { type: Number, default: null },
  },

  /** Top-ranked strategy — for quick dashboard queries */
  bestStrategy: {
    name:       { type: String, default: null },
    score:      { type: Number, default: null },
    confidence: { type: Number, default: null },
    pklProba:   { type: Number, default: null },
  },

  /* ── Pipeline metadata ──────────────────────────────────────── */
  objective:      { type: String, default: null },
  simulationMode: { type: String, default: null },
  mlAccuracy:     { type: Number, default: null },

  status: {
    type:    String,
    enum:    ["running", "complete", "error"],
    default: "running",
  },
  errorMessage: { type: String, default: null },
}, { timestamps: true });

/* ── Indexes ─────────────────────────────────────────────────── */
agentResultSchema.index({ projectId: 1, createdAt: -1 });
agentResultSchema.index({ "kpis.conversionRate":          1 });
agentResultSchema.index({ "kpis.cartAbandonment":         1 });
agentResultSchema.index({ "kpis.roi":                     1 });
agentResultSchema.index({ "bestStrategy.score":           1 });
agentResultSchema.index({ "predictedKpis.conversionRate": 1 });

module.exports = mongoose.model("AgentResult", agentResultSchema);