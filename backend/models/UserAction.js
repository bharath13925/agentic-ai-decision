const mongoose = require("mongoose");

const userActionSchema = new mongoose.Schema({
  projectId: { type: String, required: true, index: true },
  uid:       { type: String, required: true },

  actionType: {
    type:     String,
    enum:     [
      "objective_selected", "simulation_mode",
      "analysis_run", "strategy_approved", "strategy_rejected",
    ],
    required: true,
  },

  objective: {
    type:    String,
    enum:    [
      "increase_revenue", "reduce_cart_abandonment",
      "improve_conversion_rate", "optimize_marketing_roi", null,
    ],
    default: null,
  },

  simulationMode: { type: String, enum: ["mode1", "mode2", null], default: null },

  strategyInput: {
    adBudgetIncrease: { type: Number, default: null },
    discount:         { type: Number, default: null },
    channel:          { type: String, default: null },
    customerSegment:  { type: String, default: null },
  },

  note: { type: String, default: null },
}, { timestamps: true });

userActionSchema.index({ projectId: 1, actionType: 1, createdAt: -1 });

module.exports = mongoose.model("UserAction", userActionSchema);