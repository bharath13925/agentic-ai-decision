const mongoose = require("mongoose");
const crypto   = require("crypto");

const projectSchema = new mongoose.Schema({
  projectId: {
    type:    String,
    unique:  true,
    default: () => "AI_" + crypto.randomBytes(4).toString("hex").toUpperCase(),
  },
  projectName: { type: String, required: true, trim: true },
  uid:         { type: String, required: true },

  files:           { ecommerce: String, marketing: String, advertising: String },
  cleanedFiles:    { ecommerce: String, marketing: String, advertising: String },
  engineeredFiles: { ecommerce: String, marketing: String, advertising: String },
  fileHashes:      { ecommerce: String, marketing: String, advertising: String },

  kpiSummary: {
    avgCTR:             { type: Number, default: null },
    avgConversionRate:  { type: Number, default: null },
    avgCartAbandonment: { type: Number, default: null },
    avgROI:             { type: Number, default: null },
    totalRevenue:       { type: Number, default: null },
    totalClicks:        { type: Number, default: null },
    totalImpressions:   { type: Number, default: null },
  },

  /*
   * FIX B/C + FIX AA: datasetStats stores per-feature statistics computed
   * during feature engineering (/engineer-features → app.py).
   *
   * Structure:
   *   {
   *     "<feature_name>": { median, mean, std, max, min },
   *     "_max_pages": <float>,   ← population max for engagement_score normalization
   *     "_max_time":  <float>,   ← population max for engagement_score normalization
   *     "channel_conv_rates": {  ← real per-channel conversion rates
   *       "Google Ads": 20.45, "Facebook Ads": 22.43, ... (also keyed by int)
   *     },
   *     "segment_conv_rates":    { "0": 1.0363, "1": 0.9770 },
   *     "segment_abandon_rates": { "0": 0.9842, "1": 1.0101 },
   *   }
   *
   * Usage:
   *   - Passed to simulation_agent so the base feature vector uses real
   *     dataset medians instead of hardcoded _SAFE_DEFAULTS.
   *   - Passed to _build_strategy_feature_vector (FIX AA) to scale strategy
   *     deltas from the actual observed median, not an estimated one.
   *   - Carried forward on dedup so reused projects still have real stats.
   *
   * Mixed type — arbitrary feature names without schema migrations.
   */
  datasetStats: {
    type:    mongoose.Schema.Types.Mixed,
    default: null,
  },

  status: {
    type: String,
    enum: [
      "uploaded", "cleaning", "cleaned", "engineering",
      "engineered", "analyzing", "ml_complete", "complete", "error",
    ],
    default: "uploaded",
  },

  reusedsDatasets:     { type: Boolean, default: false },
  reusedFromProjectId: { type: String,  default: null },
  errorMessage:        { type: String,  default: null },
}, { timestamps: true });

// Compound index for dedup lookups
projectSchema.index({
  "fileHashes.ecommerce":   1,
  "fileHashes.marketing":   1,
  "fileHashes.advertising": 1,
});

module.exports = mongoose.model("Project", projectSchema);