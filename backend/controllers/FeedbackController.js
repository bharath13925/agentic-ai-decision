const path        = require("path");
const fs          = require("fs");
const axios       = require("axios");
const Feedback    = require("../models/Feedback");
const AgentResult = require("../models/AgentResult");
const Project     = require("../models/Project");
const MLResult    = require("../models/MlResult");

const PYTHON_URL  = process.env.PYTHON_URL  || "http://localhost:8000";
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "../uploads");

/* ════════════════════════════════════════════════════════════════
   POST /api/feedback/approve
════════════════════════════════════════════════════════════════ */
const approveStrategy = async (req, res) => {
  try {
    const { uid, projectId, agentResultId, strategyIndex = 0, reason } = req.body;

    if (!uid || !projectId || !agentResultId)
      return res.status(400).json({ message: "uid, projectId, agentResultId required." });

    console.log(`[Feedback:approve] projectId=${projectId} | strategyIndex=${strategyIndex}`);

    const agentResult = await AgentResult.findById(agentResultId);
    if (!agentResult)
      return res.status(404).json({ message: "Agent result not found." });

    if (agentResult.status !== "complete") {
      return res.status(400).json({
        message: `Cannot approve — agent pipeline status is "${agentResult.status}". Must be "complete".`,
      });
    }

    const strategies = agentResult.decisionResult?.rankedStrategies || [];
    const strategy   = strategies[strategyIndex];
    if (!strategy)
      return res.status(404).json({ message: `Strategy at index ${strategyIndex} not found.` });

    const feedback = await Feedback.create({
      projectId,
      uid,
      agentResultId,
      strategyId:   strategy.id || `strategy_${strategyIndex}`,
      strategyName: strategy.name,
      strategyRank: strategy.rank || strategyIndex + 1,
      decision:     "approved",
      confidence:   strategy.score,
      mlAccuracy:   agentResult.mlAccuracy,
      objective:    agentResult.objective,
      projectedMetrics: {
        conversionRate:  strategy.projectedMetrics?.conversionRate  || null,
        cartAbandonment: strategy.projectedMetrics?.cartAbandonment || null,
        roi:             strategy.projectedMetrics?.roi             || null,
        revenueLift:     strategy.projectedMetrics?.revenueLift     || null,
      },
      reason:                 reason || null,
      allStrategiesExhausted: false,
    });

    await Project.findOneAndUpdate({ projectId }, { status: "complete" });
    console.log(`[Feedback:approve] ✅ projectId=${projectId} | Strategy: "${strategy.name}"`);

    return res.status(201).json({
      message:    "Strategy approved and stored. Project complete.",
      feedback,
      nextAction: "complete",
    });
  } catch (err) {
    console.error("approveStrategy:", err.message);
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════
   POST /api/feedback/reject
════════════════════════════════════════════════════════════════ */
const rejectStrategy = async (req, res) => {
  try {
    const { uid, projectId, agentResultId, strategyIndex = 0, reason } = req.body;

    if (!uid || !projectId || !agentResultId)
      return res.status(400).json({ message: "uid, projectId, agentResultId required." });

    console.log(`[Feedback:reject] projectId=${projectId} | strategyIndex=${strategyIndex}`);

    const agentResult = await AgentResult.findById(agentResultId);
    if (!agentResult)
      return res.status(404).json({ message: "Agent result not found." });

    if (agentResult.status !== "complete") {
      return res.status(400).json({
        message: `Cannot reject — agent pipeline status is "${agentResult.status}". Must be "complete".`,
      });
    }

    const strategies   = agentResult.decisionResult?.rankedStrategies || [];
    const strategy     = strategies[strategyIndex];
    if (!strategy)
      return res.status(404).json({ message: `Strategy at index ${strategyIndex} not found.` });

    const nextIndex    = strategyIndex + 1;
    const nextStrategy = strategies[nextIndex] || null;
    const exhausted    = !nextStrategy;

    await Feedback.create({
      projectId,
      uid,
      agentResultId,
      strategyId:   strategy.id || `strategy_${strategyIndex}`,
      strategyName: strategy.name,
      strategyRank: strategy.rank || strategyIndex + 1,
      decision:     "rejected",
      confidence:   strategy.score,
      mlAccuracy:   agentResult.mlAccuracy,
      objective:    agentResult.objective,
      projectedMetrics: {
        conversionRate:  strategy.projectedMetrics?.conversionRate  || null,
        cartAbandonment: strategy.projectedMetrics?.cartAbandonment || null,
        roi:             strategy.projectedMetrics?.roi             || null,
        revenueLift:     strategy.projectedMetrics?.revenueLift     || null,
      },
      reason:                 reason || null,
      nextStrategyShown:      nextStrategy?.name || null,
      allStrategiesExhausted: exhausted,
    });

    console.log(
      `[Feedback:reject] projectId=${projectId} | "${strategy.name}" | Exhausted: ${exhausted}`
    );

    if (exhausted) {
      return res.status(200).json({
        message:      "All strategies exhausted.",
        nextAction:   "exhausted",
        nextStrategy: null,
        nextIndex:    null,
        currentIndex: strategyIndex,
      });
    }

    return res.status(200).json({
      message:      `Strategy rejected. Showing #${nextIndex + 1}.`,
      nextAction:   "show_next",
      nextStrategy,
      nextIndex,
      currentIndex: strategyIndex,
    });
  } catch (err) {
    console.error("rejectStrategy:", err.message);
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════
   POST /api/feedback/shap

   FIX 1 — MODEL PATH SELECTION:
     Picks the first model path that physically exists on disk
     (XGB → RF → LGB), with a clear log for skipped models.
     Previously always used xgboost even when missing after restart.

   FIX 2 — DIRECTION WAS HARDCODED "positive":
     _buildRealFallbackSHAP now sets direction:"unknown" for every
     feature — importances are always positive magnitudes with no
     directional information.  Matches Python-side FIX L.
════════════════════════════════════════════════════════════════ */
const getSHAP = async (req, res) => {
  try {
    const { projectId, agentResultId, strategyIndex = 0 } = req.body;

    if (!projectId || !agentResultId)
      return res.status(400).json({ message: "projectId and agentResultId required." });

    const [project, agentResult, mlResult] = await Promise.all([
      Project.findOne({ projectId }),
      AgentResult.findById(agentResultId),
      MLResult.findOne({ projectId, status: "complete" }).sort({ createdAt: -1 }),
    ]);

    if (!project || !agentResult || !mlResult)
      return res.status(404).json({
        message: "Project, agent result, or ML result not found.",
      });

    const strategies            = agentResult.decisionResult?.rankedStrategies || [];
    const strategy              = strategies[strategyIndex];
    const realFeatureImportance = mlResult.featureImportance || [];

    // FIX 1: pick the first model path that physically exists on disk.
    // XGBoost preferred (supports TreeExplainer, stored as (model, LabelEncoder) tuple
    // which Python FIX K handles correctly).  Falls back to RF then LGB.
    const modelPaths       = mlResult.modelPaths || {};
    const MODEL_PREFERENCE = ["xgboost", "randomForest", "lightgbm"];
    let resolvedModelPath  = null;
    let resolvedModelKey   = null;

    for (const key of MODEL_PREFERENCE) {
      const p = modelPaths[key];
      if (p && fs.existsSync(p)) {
        resolvedModelPath = p;
        resolvedModelKey  = key;
        break;
      }
      if (p) {
        console.warn(`[SHAP] ${key} model path missing on disk: ${p}`);
      }
    }

    console.log(
      `[SHAP] projectId=${projectId} | strategyIndex=${strategyIndex} | ` +
      `modelKey=${resolvedModelKey || "NONE"} | path=${resolvedModelPath || "NONE"}`
    );

    // Attempt real SHAP via Python only when a model file is available
    if (resolvedModelPath) {
      try {
        const response = await axios.post(
          `${PYTHON_URL}/compute-shap`,
          {
            projectId,
            uploadsDir:        UPLOADS_DIR,
            ecommerceFile:     project.engineeredFiles.ecommerce,
            marketingFile:     project.engineeredFiles.marketing,
            advertisingFile:   project.engineeredFiles.advertising,
            modelPath:         resolvedModelPath,  // FIX 1: verified path
            objective:         agentResult.objective,
            strategyName:      strategy?.name || "Top Strategy",
            featureImportance: realFeatureImportance,
          },
          { timeout: 90000 }
        );

        if (response.data?.status === "success") {
          console.log(
            `[SHAP] ✅ Real SHAP computed | fallback=${response.data.fallback} | ` +
            `sampleSize=${response.data.sampleSize} | model=${resolvedModelKey}`
          );
          return res.status(200).json({
            message:         "SHAP computed.",
            shapValues:      response.data.shapValues,
            topFeatures:     response.data.topFeatures,
            strategyContext: response.data.strategyContext,
            sampleSize:      response.data.sampleSize,
            fallback:        response.data.fallback     || false,
            fallbackType:    response.data.fallbackType || null,
            fallbackContext: response.data.fallbackContext || null,
          });
        }

        console.warn(
          `[SHAP] Python returned non-success: ${JSON.stringify(response.data?.message)}`
        );
      } catch (shapErr) {
        console.warn(
          `[SHAP] Python /compute-shap failed — using Node-side fallback: ${shapErr.message}`
        );
      }
    } else {
      console.warn(
        `[SHAP] No model file found on disk for projectId=${projectId}. ` +
        `Checked: ${MODEL_PREFERENCE.map((k) => `${k}=${modelPaths[k] || "not set"}`).join(", ")}. ` +
        `Using feature importance fallback.`
      );
    }

    // ── Node-side fallback ──
    if (realFeatureImportance.length === 0) {
      return res.status(200).json({
        message:         "SHAP unavailable — no feature importance stored. Retrain models first.",
        shapValues:      [],
        topFeatures:     [],
        strategyContext: "Feature importance unavailable. Please retrain models.",
        fallback:        true,
        noData:          true,
      });
    }

    // FIX 2: direction is "unknown" — importance magnitudes carry no sign
    const fallback = _buildRealFallbackSHAP(realFeatureImportance);
    const fallbackContext = resolvedModelPath
      ? `Feature importance shown (SHAP computation failed for ${resolvedModelKey} model). ` +
        `Values show each feature's contribution magnitude but direction (positive/negative impact) ` +
        `cannot be determined from tree importances alone. Re-train or check server logs.`
      : `Feature importance shown (no model file found on disk — server may have restarted). ` +
        `Direction cannot be determined from importances alone. Re-train to restore real SHAP.`;

    return res.status(200).json({
      message:         "Feature importance from trained model (SHAP fallback).",
      shapValues:      fallback,
      topFeatures:     fallback.slice(0, 6),
      strategyContext: _buildFallbackContext(
        fallback, strategy?.name, agentResult.objective
      ),
      fallback:        true,
      fallbackType:    "feature_importance",
      fallbackContext,
    });
  } catch (err) {
    console.error("getSHAP:", err.message);
    return res.status(500).json({
      message:     "SHAP computation failed.",
      shapValues:  [],
      topFeatures: [],
      fallback:    true,
      error:       err.message,
    });
  }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/feedback/:projectId
════════════════════════════════════════════════════════════════ */
const getFeedbackHistory = async (req, res) => {
  try {
    const { projectId } = req.params;
    const feedbacks = await Feedback.find({ projectId }).sort({ createdAt: -1 });
    return res.status(200).json({ feedbacks });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════
   INTERNAL HELPERS
════════════════════════════════════════════════════════════════ */

/**
 * FIX 2: Build Node-side fallback SHAP using feature importances.
 *
 * BEFORE (wrong):  direction: "positive"  — hardcoded, wrong for ~50% of features
 * AFTER (correct): direction: "unknown"   — importances are unsigned magnitudes
 *
 * Matches Python-side FIX L so the UI gets a consistent signal regardless
 * of which side generated the fallback.
 */
const _buildRealFallbackSHAP = (featureImportance) => {
  if (!featureImportance || featureImportance.length === 0) return [];
  const total = featureImportance.reduce((s, f) => s + (f.importance || 0), 0) || 1;
  return featureImportance.slice(0, 8).map((f) => ({
    feature:    f.feature,
    importance: round4(f.importance / total),
    // shapValue is the importance magnitude (≥ 0).  It is NOT a signed SHAP
    // value — direction cannot be inferred from tree importances alone.
    shapValue:  round4(f.importance / total),
    direction:  "unknown",  // FIX 2: was "positive"
    description: _shapDescriptionUnknown(f.feature),
  }));
};

const _buildFallbackContext = (features, strategyName, objective) => {
  if (!features || features.length === 0)
    return "Feature importance unavailable. Please retrain models.";
  const top1   = features[0]?.feature || "";
  const top2   = features[1]?.feature || null;
  const objMap = {
    increase_revenue:        "purchase probability",
    reduce_cart_abandonment: "cart abandonment",
    improve_conversion_rate: "conversion rate",
    optimize_marketing_roi:  "marketing ROI",
  };
  const target = objMap[objective] || "the outcome";
  let ctx = `For strategy "${strategyName}", the ML model's prediction of ${target} is most influenced by "${top1}"`;
  if (top2) ctx += ` and "${top2}"`;
  ctx += ". These features are computed from your actual uploaded dataset.";
  return ctx;
};

/**
 * FIX 2: Descriptions used when direction is unknown (importance fallback).
 * Avoids claiming any directional effect that cannot be confirmed.
 */
const _shapDescriptionUnknown = (feature) => {
  const map = {
    pages_viewed:      "Pages viewed — key driver of purchase probability (direction unknown from importance alone)",
    time_on_site_sec:  "Time on site — strongly associated with conversion",
    discount_percent:  "Discount percentage — influences purchase decisions",
    unit_price:        "Product price — affects purchase probability",
    device_type:       "Device type — mobile vs desktop conversion patterns",
    marketing_channel: "Traffic source — affects purchase intent",
    product_category:  "Product category — shapes purchase probability",
    rating:            "Product rating — affects purchase confidence",
    visit_day:         "Day of visit — contributes to model prediction",
    visit_month:       "Month — seasonal purchase pattern",
    visit_weekday:     "Day of week — contributes to model prediction",
    payment_method:    "Payment method — affects checkout completion",
    location:          "Customer location — contributes to model prediction",
    user_type:         "User type (new/returning) — affects conversion",
    visit_season:      "Season — purchase likelihood pattern",
    engagement_score:  "Combined engagement score — pages + time signal",
    discount_impact:   "Absolute discount value — margin/purchase trade-off",
    price_per_page:    "Price per page browsed — purchase journey friction",
  };
  return map[feature] || `${feature} — contributes to model prediction (direction unknown)`;
};

const round4 = (v) => Math.round((v || 0) * 10000) / 10000;

module.exports = { approveStrategy, rejectStrategy, getSHAP, getFeedbackHistory };