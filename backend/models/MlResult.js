const mongoose = require("mongoose");

const mlResultSchema = new mongoose.Schema({
  projectId: { type: String, required: true, index: true },
  uid:       { type: String, required: true },

  /*
   * Per-model metrics — expanded to include all fields now returned by
   * app.py v15.0.0: balancedAccuracy, rocAuc, f1Purchased added.
   */
  models: {
    randomForest: {
      accuracy:         Number,
      balancedAccuracy: Number,
      precision:        Number,
      recall:           Number,
      f1Score:          Number,
      f1Purchased:      Number,
      rocAuc:           Number,
      trainTime:        Number,
    },
    xgboost: {
      accuracy:         Number,
      balancedAccuracy: Number,
      precision:        Number,
      recall:           Number,
      f1Score:          Number,
      f1Purchased:      Number,
      rocAuc:           Number,
      trainTime:        Number,
    },
    lightgbm: {
      accuracy:         Number,
      balancedAccuracy: Number,
      precision:        Number,
      recall:           Number,
      f1Score:          Number,
      f1Purchased:      Number,
      rocAuc:           Number,
      trainTime:        Number,
    },
  },

  /*
   * Ensemble — expanded to include avgBalancedAccuracy and avgRocAuc
   * returned by the ROC-AUC weighted ensemble in app.py v15.0.0.
   */
  ensemble: {
    avgAccuracy:         Number,
    avgBalancedAccuracy: Number,
    avgPrecision:        Number,
    avgRecall:           Number,
    avgF1Score:          Number,
    avgRocAuc:           Number,
    method:              { type: String, default: "roc_auc_weighted_average" },
    weights:             { rf: Number, xgb: Number, lgb: Number },
  },

  avgPurchaseProbability: { type: Number, default: null },
  featureImportance:      [{ feature: String, importance: Number }],

  /*
   * modelPaths — MongoDB GridFS keys (ALWAYS, local and production).
   * Format: "{projectId}/models/{model_name}.pkl"
   * Examples:
   *   "AI_AB12CD34/models/random_forest.pkl"
   *   "AI_AB12CD34/models/xgboost.pkl"
   *   "AI_AB12CD34/models/lightgbm.pkl"
   *
   * These are NOT disk paths. They are GridFS filenames stored in MongoDB.
   * Python's gridfs_storage.load_pickle(key) retrieves them.
   */
  modelPaths: {
    randomForest: String,
    xgboost:      String,
    lightgbm:     String,
  },

  /*
   * storageBackend — always "gridfs" from v15.0.0 onwards.
   * Kept for audit/debugging purposes.
   */
  storageBackend: {
    type:    String,
    enum:    ["disk", "gridfs"],
    default: "gridfs",
  },

  /*
   * trainedForObjective — the objective this model was trained for.
   * Agent pipeline checks this to prevent objective mismatch.
   */
  trainedForObjective: { type: String, default: null },

  /*
   * datasetFingerprint — SHA-256 hash encoding dataset features + objective.
   * Used for model reuse deduplication in MlController.
   */
  datasetFingerprint: { type: String, default: null },

  /*
   * reusedFromProjectId — if models were reused from another project,
   * this stores the source projectId.
   */
  reusedFromProjectId: { type: String, default: null },

  bestHyperparams:           { type: mongoose.Schema.Types.Mixed, default: null },
  learnedMechanismStrengths: { type: mongoose.Schema.Types.Mixed, default: null },
  learnedObjectiveWeights:   { type: mongoose.Schema.Types.Mixed, default: null },

  /*
   * kpiPredictorPath — MongoDB GridFS key for the KPI regressor bundle.
   * Format: "{projectId}/models/kpi_predictor.pkl"
   * Example: "AI_AB12CD34/models/kpi_predictor.pkl"
   */
  kpiPredictorPath: { type: String, default: null },

  pipelineVersion: { type: String, default: "v15.0.0" },

  status: {
    type:    String,
    enum:    ["training", "complete", "error"],
    default: "training",
  },
  errorMessage: { type: String, default: null },
}, { timestamps: true });

mlResultSchema.index({ projectId: 1, createdAt: -1 });
mlResultSchema.index({ datasetFingerprint: 1, trainedForObjective: 1 });

module.exports = mongoose.model("MLResult", mlResultSchema);