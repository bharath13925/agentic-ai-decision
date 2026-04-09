const path        = require("path");
const fs          = require("fs");
const axios       = require("axios");
const Feedback    = require("../models/Feedback");
const AgentResult = require("../models/AgentResult");
const Project     = require("../models/Project");
const MLResult    = require("../models/MlResult");

const PYTHON_URL  = process.env.PYTHON_URL  || "http://localhost:8000";

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, "../uploads");

const isValidGfsKey = (key) => {
  return typeof key === "string" && key.length > 0 && key.includes("/models/");
};

const _deleteAllProjectCsvs = (project, projectId) => {
  const filesToDelete = [];

  if (project.files) {
    const { ecommerce, marketing, advertising } = project.files;
    if (ecommerce)   filesToDelete.push(path.join(UPLOADS_DIR, ecommerce));
    if (marketing)   filesToDelete.push(path.join(UPLOADS_DIR, marketing));
    if (advertising) filesToDelete.push(path.join(UPLOADS_DIR, advertising));
  }
  if (project.cleanedFiles) {
    const { ecommerce, marketing, advertising } = project.cleanedFiles;
    if (ecommerce)   filesToDelete.push(path.join(UPLOADS_DIR, ecommerce));
    if (marketing)   filesToDelete.push(path.join(UPLOADS_DIR, marketing));
    if (advertising) filesToDelete.push(path.join(UPLOADS_DIR, advertising));
  }
  if (project.engineeredFiles) {
    const { ecommerce, marketing, advertising } = project.engineeredFiles;
    if (ecommerce)   filesToDelete.push(path.join(UPLOADS_DIR, ecommerce));
    if (marketing)   filesToDelete.push(path.join(UPLOADS_DIR, marketing));
    if (advertising) filesToDelete.push(path.join(UPLOADS_DIR, advertising));
  }

  let deleted = 0;
  let skipped = 0;
  for (const filePath of filesToDelete) {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        deleted++;
        console.log(`[CSV:cleanup] Deleted: ${filePath}`);
      } catch (e) {
        console.warn(`[CSV:cleanup] Could not delete ${filePath}: ${e.message}`);
      }
    } else {
      skipped++;
    }
  }
  console.log(
    `[CSV:cleanup][post-shap] projectId=${projectId} | deleted=${deleted} | skipped=${skipped}`
  );
};

const _triggerPostSHAPCleanup = async (project, projectId) => {
  try {
    const pyResp = await axios.post(
      `${PYTHON_URL}/delete-project-csvs`,
      {
        projectId,
        uploadsDir:      UPLOADS_DIR,
        ecommerceFile:   project.engineeredFiles?.ecommerce   || null,
        marketingFile:   project.engineeredFiles?.marketing   || null,
        advertisingFile: project.engineeredFiles?.advertising || null,
      },
      { timeout: 15000 }
    );
    console.log(
      `[CSV:cleanup][post-shap] Python side: ` +
      `deleted=${JSON.stringify(pyResp.data?.deleted)} | ` +
      `skipped=${JSON.stringify(pyResp.data?.skipped)}`
    );
  } catch (e) {
    console.warn(
      `[CSV:cleanup][post-shap] Python /delete-project-csvs failed (non-fatal): ${e.message}`
    );
  }

  _deleteAllProjectCsvs(project, projectId);
};

const _cleanupTriggered = new Map(); 
const _CLEANUP_TTL_MS   = 24 * 60 * 60 * 1000; 

function _hasCleanupBeenTriggered(projectId) {
  const ts = _cleanupTriggered.get(projectId);
  if (!ts) return false;
  if (Date.now() - ts > _CLEANUP_TTL_MS) {
    _cleanupTriggered.delete(projectId);
    return false;
  }
  return true;
}

function _markCleanupTriggered(projectId) {
  _cleanupTriggered.set(projectId, Date.now());
}

const approveStrategy = async (req, res) => {
  try {
    const { uid, projectId, agentResultId, strategyIndex = 0, reason } = req.body;

    if (!uid || !projectId || !agentResultId)
      return res.status(400).json({ message: "uid, projectId, agentResultId required." });

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
    console.log(`[Feedback:approve]  projectId=${projectId} | Strategy: "${strategy.name}"`);

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

const rejectStrategy = async (req, res) => {
  try {
    const { uid, projectId, agentResultId, strategyIndex = 0, reason } = req.body;

    if (!uid || !projectId || !agentResultId)
      return res.status(400).json({ message: "uid, projectId, agentResultId required." });

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

    const modelPaths       = mlResult.modelPaths || {};
    const MODEL_PREFERENCE = ["xgboost", "randomForest", "lightgbm"];
    let resolvedModelPath  = null;
    let resolvedModelKey   = null;

    for (const key of MODEL_PREFERENCE) {
      const gfsKey = modelPaths[key];
      if (gfsKey && isValidGfsKey(gfsKey)) {
        resolvedModelPath = gfsKey;
        resolvedModelKey  = key;
        break;
      }
      if (gfsKey) {
        console.warn(`[SHAP] Invalid GridFS key for ${key}: "${gfsKey}"`);
      }
    }

    console.log(
      `[SHAP] projectId=${projectId} | strategyIndex=${strategyIndex} | ` +
      `modelKey=${resolvedModelKey || "NONE"} | GridFS key=${resolvedModelPath || "NONE"}`
    );

    const ecommerceFile   = project.engineeredFiles?.ecommerce   || "";
    const marketingFile   = project.engineeredFiles?.marketing   || "";
    const advertisingFile = project.engineeredFiles?.advertising || "";

    if (resolvedModelPath) {
      try {
        const response = await axios.post(
          `${PYTHON_URL}/compute-shap`,
          {
            projectId,
            uploadsDir:        UPLOADS_DIR,
            ecommerceFile,
            marketingFile,
            advertisingFile,
            modelPath:         resolvedModelPath,
            objective:         agentResult.objective,
            strategyName:      strategy?.name || "Top Strategy",
            featureImportance: realFeatureImportance,
          },
          { timeout: 90000 }
        );

        if (response.data?.status === "success") {
          console.log(
            `[SHAP] Computed | fallback=${response.data.fallback} | ` +
            `sampleSize=${response.data.sampleSize} | model=${resolvedModelKey} | GridFS`
          );

          // FIX: use TTL-aware Map instead of leaking Set
          if (!_hasCleanupBeenTriggered(projectId)) {
            _markCleanupTriggered(projectId);
            console.log(
              `[CSV:cleanup] First successful SHAP for ${projectId} — triggering post-SHAP cleanup`
            );
            _triggerPostSHAPCleanup(project, projectId).catch((e) =>
              console.warn(`[CSV:cleanup] post-SHAP cleanup error (non-fatal): ${e.message}`)
            );
          } else {
            console.log(
              `[CSV:cleanup] Cleanup already triggered for ${projectId} — skipping duplicate`
            );
          }

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
        console.warn(`[SHAP] Python /compute-shap failed — using fallback: ${shapErr.message}`);
      }
    } else {
      console.warn(
        `[SHAP] No valid GridFS key for projectId=${projectId}. Using feature importance fallback.`
      );
    }

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

    const fallback = _buildRealFallbackSHAP(realFeatureImportance);
    const fallbackContext = resolvedModelPath
      ? `Feature importance shown (SHAP computation failed for ${resolvedModelKey} model from GridFS). ` +
        `Direction cannot be determined from tree importances alone. Check server logs.`
      : `Feature importance shown (no valid GridFS key found — please retrain models). ` +
        `Direction cannot be determined from importances alone.`;

    return res.status(200).json({
      message:         "Feature importance from trained model (SHAP fallback).",
      shapValues:      fallback,
      topFeatures:     fallback.slice(0, 6),
      strategyContext: _buildFallbackContext(fallback, strategy?.name, agentResult.objective),
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

const _buildRealFallbackSHAP = (featureImportance) => {
  if (!featureImportance || featureImportance.length === 0) return [];
  const total = featureImportance.reduce((s, f) => s + (f.importance || 0), 0) || 1;
  return featureImportance.slice(0, 8).map((f) => ({
    feature:     f.feature,
    importance:  round4(f.importance / total),
    shapValue:   round4(f.importance / total),
    direction:   "unknown",
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

const _shapDescriptionUnknown = (feature) => {
  const map = {
    pages_viewed:      "Pages viewed — key driver of purchase probability",
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
    added_to_cart:     "Added to cart — strongest non-leaky purchase intent signal",
    quantity:          "Quantity — items in cart signal purchase commitment",
    cart_engage:       "Cart engagement — cart intent combined with session depth",
    cart_time_ratio:   "Cart time ratio — time invested by cart-adding visitors",
    cart_pages_ratio:  "Cart pages ratio — browsing depth of cart-adding visitors",
  };
  return map[feature] || `${feature} — contributes to model prediction (direction unknown)`;
};

const round4 = (v) => Math.round((v || 0) * 10000) / 10000;

module.exports = { approveStrategy, rejectStrategy, getSHAP, getFeedbackHistory };