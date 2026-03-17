const mongoose = require("mongoose");
const crypto   = require("crypto");

const projectSchema = new mongoose.Schema(
  {
    /* ── Identity ── */
    projectId: {
      type: String,
      unique: true,
      default: () => "AI_" + crypto.randomBytes(4).toString("hex").toUpperCase(),
    },
    projectName: { type: String, required: true, trim: true },
    uid:         { type: String, required: true },

    /* ── Raw uploaded filenames (multer) ── */
    files: {
      ecommerce:   { type: String, default: null },
      marketing:   { type: String, default: null },
      advertising: { type: String, default: null },
    },

    /* ── Cleaned filenames (Python microservice output) ── */
    cleanedFiles: {
      ecommerce:   { type: String, default: null },
      marketing:   { type: String, default: null },
      advertising: { type: String, default: null },
    },

    /* ── Engineered feature filenames (Python feature engineering output) ── */
    engineeredFiles: {
      ecommerce:   { type: String, default: null },
      marketing:   { type: String, default: null },
      advertising: { type: String, default: null },
    },

    /* ── Computed KPI summary (stored after feature engineering) ── */
    kpiSummary: {
      avgCTR:           { type: Number, default: null },
      avgConversionRate:{ type: Number, default: null },
      avgCartAbandonment:{ type: Number, default: null },
      avgROI:           { type: Number, default: null },
      totalRevenue:     { type: Number, default: null },
      totalClicks:      { type: Number, default: null },
      totalImpressions: { type: Number, default: null },
    },

    /* ── User-selected business objective (Step 2) ── */
    objective: {
      type: String,
      enum: [
        "increase_revenue",
        "reduce_cart_abandonment",
        "improve_conversion_rate",
        "optimize_marketing_roi",
        null,
      ],
      default: null,
    },

    /* ── Pipeline status ── */
    status: {
      type: String,
      enum: [
        "uploaded",     // files saved to disk
        "cleaning",     // Python: removing nulls/duplicates
        "cleaned",      // Python done — ready for feature engineering
        "engineering",  // Python: computing CTR, ROI etc.
        "engineered",   // Feature engineering done — ready for ML
        "analyzing",    // ML pipeline running
        "complete",     // Full pipeline done
        "error",
      ],
      default: "uploaded",
    },

    errorMessage: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Project", projectSchema);