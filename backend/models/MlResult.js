const mongoose = require("mongoose");

const mlResultSchema = new mongoose.Schema({
  projectId: { type: String, required: true, index: true },
  uid:       { type: String, required: true },

  models: {
    randomForest: {
      accuracy: Number, precision: Number, recall: Number,
      f1Score:  Number, trainTime: Number,
    },
    xgboost: {
      accuracy: Number, precision: Number, recall: Number,
      f1Score:  Number, trainTime: Number,
    },
    lightgbm: {
      accuracy: Number, precision: Number, recall: Number,
      f1Score:  Number, trainTime: Number,
    },
  },

  ensemble: {
    avgAccuracy:  Number,
    avgPrecision: Number,
    avgRecall:    Number,
    avgF1Score:   Number,
    method:       { type: String, default: "weighted_average" },
    weights:      { rf: Number, xgb: Number, lgb: Number },
  },

  avgPurchaseProbability: { type: Number, default: null },
  featureImportance:      [{ feature: String, importance: Number }],

  modelPaths: {
    randomForest: String,
    xgboost:      String,
    lightgbm:     String,
  },

  /*
   * The objective this model was trained for.
   * The agent pipeline checks this against the current objective and rejects
   * mismatches — ensuring projections are always objective-consistent.
   */
  trainedForObjective: { type: String, default: null },

  /*
   * Tuned hyperparameters per model — stored for audit / reproducibility.
   */
  bestHyperparams: { type: mongoose.Schema.Types.Mixed, default: null },

  /*
   * DATA-DRIVEN mechanism strengths derived from feature importance.
   * Computed in train_models and passed to simulation_agent to weight
   * each strategy's KPI impact multipliers.
   * Replaces hardcoded MECHANISM_STRENGTH constants in simulation_agent.
   */
  learnedMechanismStrengths: { type: mongoose.Schema.Types.Mixed, default: null },

  /*
   * DATA-DRIVEN objective weights derived from feature importance.
   * Replaces hardcoded DEFAULT_OBJECTIVE_WEIGHTS in simulation_agent
   * when available, making scoring reflect the actual dataset's signal.
   */
  learnedObjectiveWeights: { type: mongoose.Schema.Types.Mixed, default: null },

  /*
   * Path to the KPI regressor (RandomForestRegressor) pkl.
   * REQUIRED for the simulation agent — pipeline refuses to run without it.
   * Stores the full absolute path so file-existence checks work across restarts.
   */
  kpiPredictorPath: { type: String, default: null },

  /*
   * Pipeline version tag — set explicitly from the Python microservice response.
   * DO NOT rely on this schema default for version tracking; the triggerMLTraining
   * function overwrites it with d.pipelineVersion from app.py.
   * Default here is a fallback for documents created before v13.4.
   */
  pipelineVersion: { type: String, default: "v13.4" },

  status: {
    type:    String,
    enum:    ["training", "complete", "error"],
    default: "training",
  },
  errorMessage: { type: String, default: null },
}, { timestamps: true });

mlResultSchema.index({ projectId: 1, createdAt: -1 });

module.exports = mongoose.model("MLResult", mlResultSchema);