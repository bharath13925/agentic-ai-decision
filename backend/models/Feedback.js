// ════════════════════════════════════════════════════════════════
//  Feedback.js
// ════════════════════════════════════════════════════════════════
const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema({
  projectId:     { type: String, required: true, index: true },
  uid:           { type: String, required: true },
  agentResultId: { type: String, required: true },

  strategyId:   { type: String, default: null },
  strategyName: { type: String, required: true },
  strategyRank: { type: Number, default: null },

  decision: {
    type:     String,
    enum:     ["approved", "rejected"],
    required: true,
  },

  confidence:  { type: Number, default: null },
  mlAccuracy:  { type: Number, default: null },
  objective:   { type: String, default: null },

  projectedMetrics: {
    conversionRate:  { type: Number, default: null },
    cartAbandonment: { type: Number, default: null },
    roi:             { type: Number, default: null },
    revenueLift:     { type: Number, default: null },
  },

  reason:                 { type: String,  default: null },
  nextStrategyShown:      { type: String,  default: null },
  allStrategiesExhausted: { type: Boolean, default: false },
}, { timestamps: true });

feedbackSchema.index({ projectId: 1, createdAt: -1 });
feedbackSchema.index({ agentResultId: 1 });

module.exports = mongoose.model("Feedback", feedbackSchema);