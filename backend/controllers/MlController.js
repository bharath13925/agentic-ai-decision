const path        = require("path");
const crypto      = require("crypto");
const axios       = require("axios");
const Project     = require("../models/Project");
const MLResult    = require("../models/MlResult");
const AgentResult = require("../models/AgentResult");
const UserAction  = require("../models/UserAction");

const PYTHON_URL  = process.env.PYTHON_URL  || "http://localhost:8000";

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, "../uploads");

console.log(`[MlController] UPLOADS_DIR resolved → ${UPLOADS_DIR}`);
console.log(`[MlController] PKL storage → GridFS (always) | CSV cleanup → DEFERRED (after compute-shap)`);

const computeDatasetFingerprint = (kpiSummary, objective, datasetStats) => {
  const r = (v, d) => (typeof v === "number" ? +v.toFixed(d) : 0);

  if (datasetStats && typeof datasetStats === "object") {
    const med = (feat) => {
      const s = datasetStats[feat];
      if (s && typeof s === "object" && typeof s.median === "number") return r(s.median, 4);
      return 0;
    };

    const parts = [
      med("unit_price"),
      med("discount_percent"),
      med("pages_viewed"),
      med("time_on_site_sec"),
      med("engagement_score"),
      med("discount_impact"),
      med("price_per_page"),
      med("user_type"),
      r(kpiSummary.avgCTR,             4),
      r(kpiSummary.avgConversionRate,  4),
      r(kpiSummary.avgCartAbandonment, 4),
      r(kpiSummary.avgROI,             4),
      Math.round(kpiSummary.totalSessions || 0),
      datasetStats.channel_conv_rates
        ? Object.entries(datasetStats.channel_conv_rates)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}:${r(v, 4)}`)
            .join(",")
        : "no_ch",
      objective || "unknown",
    ].join("|");

    return crypto.createHash("sha256").update(parts).digest("hex");
  }

  const parts = [
    r(kpiSummary.avgCTR,             4),
    r(kpiSummary.avgConversionRate,  4),
    r(kpiSummary.avgCartAbandonment, 4),
    r(kpiSummary.avgROI,             4),
    Math.round(kpiSummary.totalSessions || 0),
    objective || "unknown",
  ].join("|");
  return crypto.createHash("sha256").update(parts).digest("hex");
};

const findReusableMLResult = async (fingerprint, objective) => {
  if (!fingerprint) return null;
  const existing = await MLResult.findOne({
    datasetFingerprint:        fingerprint,
    trainedForObjective:       objective,
    status:                    "complete",
    kpiPredictorPath:          { $ne: null },
    "modelPaths.randomForest": { $ne: null },
    "modelPaths.xgboost":      { $ne: null },
    "modelPaths.lightgbm":     { $ne: null },
  }).sort({ createdAt: -1 });
  return existing || null;
};

const findExistingCompleteMLResult = async (projectId, objective) => {
  const ownResult = await MLResult.findOne({
    projectId,
    trainedForObjective: objective,
    status:              "complete",
    kpiPredictorPath:    { $ne: null },
    "modelPaths.randomForest": { $ne: null },
    "modelPaths.xgboost":      { $ne: null },
    "modelPaths.lightgbm":     { $ne: null },
  }).sort({ createdAt: -1 });

  if (ownResult) return ownResult;
  return null;
};

const findMLResultFromSourceProject = async (sourceProjectId, objective) => {
  if (!sourceProjectId) return null;

  const sourceResult = await MLResult.findOne({
    projectId:           sourceProjectId,
    trainedForObjective: objective,
    status:              "complete",
    kpiPredictorPath:    { $ne: null },
    "modelPaths.randomForest": { $ne: null },
    "modelPaths.xgboost":      { $ne: null },
    "modelPaths.lightgbm":     { $ne: null },
  }).sort({ createdAt: -1 });

  return sourceResult || null;
};

async function callPythonWithRetry(url, data, retries = 2, timeout = 600000) {
  try {
    return await axios.post(url, data, { timeout });
  } catch (err) {
    if (retries > 0) {
      console.warn(`[Python] Retry ${retries} remaining for ${url} — ${err.message}`);
      return callPythonWithRetry(url, data, retries - 1, timeout);
    }
    throw err;
  }
}

const validateKpiSummary = (kpi, projectId) => {
  const issues = [];
  if (!kpi || typeof kpi !== "object")
    return { valid: false, issues: ["kpiSummary is missing entirely"] };

  if (!kpi.avgCTR || kpi.avgCTR <= 0)
    issues.push(`avgCTR=${kpi.avgCTR} (expected >0 from advertising CSV)`);
  if (!kpi.avgConversionRate || kpi.avgConversionRate <= 0)
    issues.push(`avgConversionRate=${kpi.avgConversionRate} (expected >0 from ecommerce CSV)`);
  if (!kpi.avgCartAbandonment || kpi.avgCartAbandonment <= 0)
    issues.push(`avgCartAbandonment=${kpi.avgCartAbandonment} (expected >0 from ecommerce CSV)`);
  if (!kpi.avgROI || kpi.avgROI <= 0)
    issues.push(`avgROI=${kpi.avgROI} (expected >0 from marketing CSV)`);

  if (issues.length > 0) {
    console.warn(`[KPI Validation]  ${projectId}: Zero/missing KPI values:`);
    issues.forEach((i) => console.warn(`  - ${i}`));
  } else {
    console.log(
      `[KPI Validation]  ${projectId}: Real KPIs confirmed — ` +
      `CTR=${kpi.avgCTR?.toFixed(4)}% | Conv=${kpi.avgConversionRate?.toFixed(4)}% | ` +
      `Abandon=${kpi.avgCartAbandonment?.toFixed(2)}% | ROI=${kpi.avgROI?.toFixed(4)}x`
    );
  }
  return { valid: issues.length === 0, issues };
};

const pklAccessible = (pathOrKey) => {
  if (!pathOrKey) return false;
  return typeof pathOrKey === "string" && pathOrKey.length > 0 && pathOrKey.includes("/models/");
};

const _autoStoreRagContext = async (projectId, agentResultDoc, kpiSummary, objective) => {
  try {
    console.log(`[RAG:autoStore] Storing context for projectId=${projectId}…`);
    const response = await axios.post(
      `${PYTHON_URL}/store-agent-context`,
      {
        projectId,
        agentResult: {
          observerResult:   agentResultDoc.observerResult,
          analystResult:    agentResultDoc.analystResult,
          simulationResult: agentResultDoc.simulationResult,
          decisionResult:   agentResultDoc.decisionResult,
        },
        kpiSummary,
        objective,
      },
      { timeout: 120000 },
    );
    if (response.data?.status === "success") {
      console.log(
        `[RAG:autoStore] Stored ${response.data.stored?.length} docs | ` +
        `FAISS vectors=${response.data.faiss_vectors}`
      );
    } else {
      console.warn(`[RAG:autoStore] Non-success: ${response.data?.message}`);
    }
  } catch (err) {
    console.warn(`[RAG:autoStore] Failed (non-fatal): ${err.message}`);
  }
};

/* ════════════════════════════════════════════════════════════════
   POST /api/ml/train/:projectId
════════════════════════════════════════════════════════════════ */
const trainModels = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { uid }       = req.body;
    if (!uid) return res.status(400).json({ message: "uid is required." });

    console.log(`[ML:train] Request → projectId=${projectId} | uid=${uid}`);

    const project = await Project.findOne({ projectId });
    if (!project) return res.status(404).json({ message: "Project not found." });

    if (!["engineered", "error", "analyzing", "ml_complete", "complete"].includes(project.status)) {
      return res.status(400).json({
        message: `Cannot train. Status is "${project.status}". Must be "engineered" or later.`,
      });
    }

    const latestObjective = await UserAction
      .findOne({ projectId, actionType: "objective_selected" })
      .sort({ createdAt: -1 });
    if (!latestObjective)
      return res.status(400).json({ message: "No objective selected. Complete Step 2 first." });

    const objective = latestObjective.objective;

    // ── STEP 1: Check if THIS project already has a complete MLResult for this objective ──
    const ownComplete = await findExistingCompleteMLResult(projectId, objective);
    if (ownComplete) {
      console.log(
        `[ML:train] ✅ OWN COMPLETE — projectId=${projectId} already has trained models ` +
        `for objective="${objective}" | accuracy=${ownComplete.ensemble?.avgAccuracy}% | ` +
        `id=${ownComplete._id}`
      );
      await Project.findByIdAndUpdate(project._id, { status: "ml_complete", errorMessage: null });
      return res.status(200).json({
        message:           `Models already trained for objective "${objective}". Skipping retraining.`,
        projectId,
        mlResultId:        ownComplete._id,
        status:            "complete",
        reusedModels:      true,
        reusedFromProject: projectId,
        objective,
        ensemble:          ownComplete.ensemble,
        featureImportance: ownComplete.featureImportance,
      });
    }

    // ── STEP 2: If datasets were reused, check source project's MLResult ──
    if (project.reusedsDatasets && project.reusedFromProjectId) {
      const sourceResult = await findMLResultFromSourceProject(
        project.reusedFromProjectId, objective
      );
      if (sourceResult) {
        console.log(
          `[ML:train] ✅ SOURCE PROJECT REUSE — datasets came from ${project.reusedFromProjectId} ` +
          `which has trained models for objective="${objective}" | ` +
          `accuracy=${sourceResult.ensemble?.avgAccuracy}%`
        );

        await MLResult.deleteMany({ projectId });
        const reusedMlResult = await MLResult.create({
          projectId,
          uid,
          status:                    "complete",
          trainedForObjective:       objective,
          datasetFingerprint:        sourceResult.datasetFingerprint,
          reusedFromProjectId:       sourceResult.projectId,
          models:                    sourceResult.models,
          ensemble:                  sourceResult.ensemble,
          featureImportance:         sourceResult.featureImportance,
          modelPaths:                sourceResult.modelPaths,
          kpiPredictorPath:          sourceResult.kpiPredictorPath,
          avgPurchaseProbability:    sourceResult.avgPurchaseProbability,
          bestHyperparams:           sourceResult.bestHyperparams,
          learnedMechanismStrengths: sourceResult.learnedMechanismStrengths,
          learnedObjectiveWeights:   sourceResult.learnedObjectiveWeights,
          storageBackend:            "gridfs",
          pipelineVersion:           sourceResult.pipelineVersion,
        });

        await Project.findByIdAndUpdate(project._id, { status: "ml_complete", errorMessage: null });

        return res.status(200).json({
          message:           `Models reused from source project (same dataset, objective="${objective}"). Skipped retraining.`,
          projectId,
          mlResultId:        reusedMlResult._id,
          status:            "complete",
          reusedModels:      true,
          reusedFromProject: sourceResult.projectId,
          objective,
          ensemble:          sourceResult.ensemble,
          featureImportance: sourceResult.featureImportance,
        });
      }
      console.log(
        `[ML:train] Source project ${project.reusedFromProjectId} has NO trained models ` +
        `for objective="${objective}" — this is a NEW objective, full training required.`
      );
    }

    // ── STEP 3: Fingerprint-based dedup across all projects ──
    const statsSource = project.datasetStats ||
      (project.reusedsDatasets && project.reusedFromProjectId
        ? (await Project.findOne({ projectId: project.reusedFromProjectId }))?.datasetStats
        : null);

    const fingerprint = computeDatasetFingerprint(
      project.kpiSummary   || {},
      objective,
      statsSource || null,
    );
    console.log(
      `[ML:train] Dataset fingerprint: ${fingerprint.slice(0, 16)}… | objective: ${objective} | ` +
      `source: ${statsSource ? "feature-medians+KPI" : "KPI-summary-only"}`
    );

    const reusable = await findReusableMLResult(fingerprint, objective);

    if (reusable && reusable.projectId !== projectId) {
      if (reusable.trainedForObjective !== objective) {
        console.warn(
          `[ML:train] ⚠️  Fingerprint match found (${reusable.projectId}) but ` +
          `trainedForObjective mismatch: stored="${reusable.trainedForObjective}" ` +
          `current="${objective}" — forcing full retrain`
        );
        // Fall through to full training below
      } else {
        console.log(
          `[ML:train] ✅ FINGERPRINT REUSE — same dataset + same objective "${objective}" → ` +
          `reusing models from ${reusable.projectId} ` +
          `(trained ${new Date(reusable.createdAt).toLocaleDateString()}) | ` +
          `accuracy=${reusable.ensemble?.avgAccuracy}%`
        );

        await MLResult.deleteMany({ projectId });
        const reusedMlResult = await MLResult.create({
          projectId,
          uid,
          status:                    "complete",
          trainedForObjective:       objective,
          datasetFingerprint:        fingerprint,
          reusedFromProjectId:       reusable.projectId,
          models:                    reusable.models,
          ensemble:                  reusable.ensemble,
          featureImportance:         reusable.featureImportance,
          modelPaths:                reusable.modelPaths,
          kpiPredictorPath:          reusable.kpiPredictorPath,
          avgPurchaseProbability:    reusable.avgPurchaseProbability,
          bestHyperparams:           reusable.bestHyperparams,
          learnedMechanismStrengths: reusable.learnedMechanismStrengths,
          learnedObjectiveWeights:   reusable.learnedObjectiveWeights,
          storageBackend:            "gridfs",
          pipelineVersion:           reusable.pipelineVersion,
        });

        await Project.findByIdAndUpdate(project._id, { status: "ml_complete", errorMessage: null });

        return res.status(200).json({
          message:           `Models reused (same dataset + same objective "${objective}"). Skipped retraining.`,
          projectId,
          mlResultId:        reusedMlResult._id,
          status:            "complete",
          reusedModels:      true,
          reusedFromProject: reusable.projectId,
          objective,
          ensemble:          reusable.ensemble,
          featureImportance: reusable.featureImportance,
        });
      }
    }

    if (reusable && reusable.projectId === projectId) {
      console.log(
        `[ML:train] Fingerprint matches self (same project retrain for objective="${objective}") — ` +
        `proceeding with full training.`
      );
    }

    // ── STEP 4: NO MATCH — run full training ──
    // FIX: On Render, Node and Python have separate /tmp filesystems.
    // Python's /train-models endpoint handles CSV restoration from GridFS.
    // We also pass the sourceProjectId so Python can fall back to copying
    // from that project's GridFS CSV keys if the new project's keys don't exist yet.

    if (!project.engineeredFiles?.ecommerce) {
      return res.status(400).json({
        message: "Engineered files metadata not found in project. Please re-upload your datasets.",
        requiresReupload: true,
      });
    }

    await Project.findByIdAndUpdate(project._id, { status: "engineered", errorMessage: null });
    await MLResult.deleteMany({ projectId });
    const mlResult = await MLResult.create({
      projectId,
      uid,
      status:             "training",
      datasetFingerprint: fingerprint,
    });
    await Project.findByIdAndUpdate(project._id, { status: "analyzing" });

    console.log(
      `[ML:train] Starting full training → projectId=${projectId} | objective=${objective} | ` +
      `PKL→GridFS | CSV→loaded from GridFS by Python`
    );

    res.status(202).json({
      message:      "ML training started.",
      projectId,
      mlResultId:   mlResult._id,
      status:       "training",
      reusedModels: false,
      objective,
    });

    triggerMLTraining(project, mlResult, objective).catch((err) =>
      console.error(`[ML:train] ${projectId} — ${err.message}`)
    );
  } catch (err) {
    console.error("trainModels:", err.message);
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/ml/result/:projectId
════════════════════════════════════════════════════════════════ */
const getMLResult = async (req, res) => {
  try {
    const { projectId } = req.params;
    const mlResult = await MLResult.findOne({ projectId }).sort({ createdAt: -1 });
    if (!mlResult) return res.status(404).json({ message: "No ML result found." });
    return res.status(200).json({ mlResult });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════
   POST /api/ml/agent/:projectId
════════════════════════════════════════════════════════════════ */
const runAgentPipeline = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { uid }       = req.body;
    if (!uid) return res.status(400).json({ message: "uid is required." });

    console.log(`[AgentPipeline] Start → ${projectId} | uid=${uid}`);

    const project = await Project.findOne({ projectId });
    if (!project) return res.status(404).json({ message: "Project not found." });

    if (!["ml_complete", "complete"].includes(project.status)) {
      return res.status(400).json({
        message: `Cannot run agents. Status must be "ml_complete" or "complete". Current: "${project.status}".`,
      });
    }

    const mlResult = await MLResult
      .findOne({ projectId, status: "complete" })
      .sort({ createdAt: -1 });
    if (!mlResult)
      return res.status(400).json({ message: "ML training must complete before running agents." });

    console.log(`[AgentPipeline] ML accuracy → ${mlResult.ensemble?.avgAccuracy}%`);

    const realAccuracy = mlResult.ensemble?.avgAccuracy;
    if (!realAccuracy || realAccuracy <= 0) {
      return res.status(400).json({
        message: `ML has no valid accuracy (got: ${realAccuracy}). Please retrain.`,
      });
    }

    if (!mlResult.kpiPredictorPath) {
      return res.status(400).json({
        message:        "KPI regressor (.pkl) key not found. The model was trained before v15. Please retrain.",
        requiresRetrain: true,
      });
    }

    if (!pklAccessible(mlResult.kpiPredictorPath)) {
      return res.status(400).json({
        message: `KPI regressor GridFS key is invalid: "${mlResult.kpiPredictorPath}". Please retrain.`,
        requiresRetrain: true,
      });
    }

    const { valid: kpiValid, issues: kpiIssues } = validateKpiSummary(
      project.kpiSummary, projectId
    );
    if (!kpiValid) {
      return res.status(400).json({
        message:   `Invalid KPI data — check dataset. Issues: ${kpiIssues.join("; ")}`,
        kpiIssues,
      });
    }

    const modelPaths = mlResult.modelPaths || {};
    const pklStatus  = {};
    for (const [key, p] of Object.entries(modelPaths)) {
      const accessible = pklAccessible(p);
      pklStatus[key]   = accessible;
      if (!accessible) {
        console.warn(`[AgentPipeline] ⚠️  GridFS key invalid: ${key} → "${p}"`);
      }
    }
    const pklAvailable = Object.values(pklStatus).some(Boolean);
    console.log(
      `[AgentPipeline] PKL GridFS keys status: ${JSON.stringify(pklStatus)} | available=${pklAvailable}`
    );

    const [latestObjective, latestSimMode] = await Promise.all([
      UserAction.findOne({ projectId, actionType: "objective_selected" }).sort({ createdAt: -1 }),
      UserAction.findOne({ projectId, actionType: "simulation_mode"    }).sort({ createdAt: -1 }),
    ]);

    if (!latestObjective)
      return res.status(400).json({ message: "No objective found." });
    if (!latestSimMode)
      return res.status(400).json({ message: "No simulation mode found." });

    const trainedFor = mlResult.trainedForObjective;
    const currentObj = latestObjective.objective;
    if (trainedFor && trainedFor !== currentObj) {
      console.warn(
        `[AgentPipeline] ❌ Objective mismatch: trained="${trainedFor}" current="${currentObj}"`
      );
      return res.status(400).json({
        message:          `Model was trained for "${trainedFor}" but your current objective is "${currentObj}". Please retrain.`,
        requiresRetrain:  true,
        trainedFor,
        currentObjective: currentObj,
      });
    }

    await AgentResult.deleteMany({ projectId });
    const agentResult = await AgentResult.create({
      projectId,
      uid,
      objective:      latestObjective.objective,
      simulationMode: latestSimMode.simulationMode,
      mlAccuracy:     realAccuracy,
      status:         "running",
    });

    res.status(202).json({
      message:       "Agent pipeline started.",
      projectId,
      agentResultId: agentResult._id,
      status:        "running",
    });

    triggerAgentPipeline(
      project, agentResult, mlResult, latestObjective, latestSimMode, realAccuracy
    ).catch((err) => console.error(`[AgentPipeline] ${projectId} — ${err.message}`));
  } catch (err) {
    console.error("runAgentPipeline:", err.message);
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/ml/agent-result/:projectId
════════════════════════════════════════════════════════════════ */
const getAgentResult = async (req, res) => {
  try {
    const { projectId } = req.params;
    const agentResult   = await AgentResult.findOne({ projectId }).sort({ createdAt: -1 });
    if (!agentResult) return res.status(404).json({ message: "No agent result found." });
    return res.status(200).json({ agentResult });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════
   INTERNAL — Agent pipeline trigger
════════════════════════════════════════════════════════════════ */
const triggerAgentPipeline = async (
  project, agentResult, mlResult,
  latestObjective, latestSimMode, realAccuracy,
) => {
  try {
    console.log(
      `[AgentPipeline] Starting → ${project.projectId} | ` +
      `acc=${realAccuracy}% | obj=${latestObjective.objective}`
    );

    const kpi     = project.kpiSummary || {};
    const safekpi = {
      avgCTR:             kpi.avgCTR             ?? 0,
      avgConversionRate:  kpi.avgConversionRate  ?? 0,
      avgCartAbandonment: kpi.avgCartAbandonment ?? 0,
      avgROI:             kpi.avgROI             ?? 0,
      totalRevenue:       kpi.totalRevenue       ?? 0,
      totalClicks:        kpi.totalClicks        ?? 0,
      totalImpressions:   kpi.totalImpressions   ?? 0,
    };

    const strategyInput = latestSimMode.simulationMode === "mode1"
      ? (latestSimMode.strategyInput || {})
      : {};

    const modelPaths      = mlResult.modelPaths || {};
    const ensembleWeights = mlResult.ensemble?.weights || {
      rf: 0.333, xgb: 0.333, lgb: 0.334,
    };

    let datasetStats = project.datasetStats || null;
    if (!datasetStats && project.reusedsDatasets && project.reusedFromProjectId) {
      const sourceProject = await Project.findOne({ projectId: project.reusedFromProjectId });
      datasetStats = sourceProject?.datasetStats || null;
      if (datasetStats) {
        console.log(`[AgentPipeline] Using datasetStats from source project ${project.reusedFromProjectId}`);
      }
    }

    const ecommerceEngineerFile = null;

    const payload = {
      projectId:        project.projectId,
      mongoId:          project._id.toString(),
      agentResultId:    agentResult._id.toString(),
      objective:        latestObjective.objective,
      simulationMode:   latestSimMode.simulationMode,
      strategyInput,
      kpiSummary:       safekpi,
      mlEnsembleAcc:    realAccuracy,
      avgPurchaseProba: mlResult.avgPurchaseProbability ?? null,
      modelPaths,
      ensembleWeights,
      learnedMechanismStrengths: mlResult.learnedMechanismStrengths ?? null,
      learnedObjectiveWeights:   mlResult.learnedObjectiveWeights   ?? null,
      uploadsDir:                UPLOADS_DIR,
      ecommerceEngineerFile,
      featureImportance:         mlResult.featureImportance  ?? [],
      kpiPredictorPath:          mlResult.kpiPredictorPath   ?? null,
      datasetStats:              datasetStats,
    };

    const response = await callPythonWithRetry(
      `${PYTHON_URL}/run-agent-pipeline`, payload, 2, 600000
    );

    if (response.data?.status === "success") {
      const d           = response.data;
      const topStrategy = d.decisionResult?.recommendation?.strategyName;
      const confidence  = d.decisionResult?.recommendation?.confidence;
      const realKPIs    = d.decisionResult?.realDatasetKPIs || {};
      const projMetrics = d.decisionResult?.recommendation?.projectedMetrics || {};
      const bestStrat   = d.decisionResult?.rankedStrategies?.[0] || {};

      await AgentResult.findByIdAndUpdate(agentResult._id, {
        status:           "complete",
        observerResult:   d.observerResult,
        analystResult:    d.analystResult,
        simulationResult: d.simulationResult,
        decisionResult:   d.decisionResult,
        recommendation:   d.recommendation,
        kpis: {
          ctr:             realKPIs.ctr             ?? null,
          conversionRate:  realKPIs.conversionRate  ?? null,
          cartAbandonment: realKPIs.cartAbandonment ?? null,
          roi:             realKPIs.roi             ?? null,
        },
        predictedKpis: {
          ctr:             projMetrics.ctr             ?? null,
          conversionRate:  projMetrics.conversionRate  ?? null,
          cartAbandonment: projMetrics.cartAbandonment ?? null,
          roi:             projMetrics.roi             ?? null,
        },
        bestStrategy: {
          name:       topStrategy      ?? null,
          score:      bestStrat.score  ?? null,
          confidence: confidence       ?? null,
          pklProba:   bestStrat.mlPurchaseProba ?? null,
        },
      });

      console.log(`[AgentPipeline] ✅ Done → ${project.projectId} | Top: "${topStrategy}"`);

      const updatedAgentResult = await AgentResult.findById(agentResult._id);
      if (updatedAgentResult) {
        _autoStoreRagContext(
          project.projectId,
          updatedAgentResult,
          safekpi,
          latestObjective.objective,
        ).catch(() => {});
      }
    } else {
      const errMsg = response.data?.message || "Agent pipeline failed.";
      await AgentResult.findByIdAndUpdate(agentResult._id, {
        status:       "error",
        errorMessage: errMsg,
      });
      console.error(`[AgentPipeline] ❌ Error → ${project.projectId}: ${errMsg}`);
    }
  } catch (err) {
    console.error(`[AgentPipeline] ❌ Exception → ${project.projectId}: ${err.message}`);
    await AgentResult.findByIdAndUpdate(agentResult._id, {
      status:       "error",
      errorMessage: `Agent exception: ${err.message}`,
    }).catch(() => {});
  }
};

/* ════════════════════════════════════════════════════════════════
   INTERNAL — ML Training trigger

   FIX: When datasets are reused with a DIFFERENT objective, the new
   project's GridFS CSV keys may not exist yet (copy happens async
   after dedup). We pass reusedFromProjectId so Python can fall back
   to copying from the source project's GridFS keys if needed.
════════════════════════════════════════════════════════════════ */
const triggerMLTraining = async (project, mlResult, objective) => {
  try {
    console.log(
      `[ML:train] Starting → ${project.projectId} | Objective: ${objective} | ` +
      `PKL→GridFS | CSV→Python loads from GridFS by projectId`
    );

    const response = await callPythonWithRetry(
      `${PYTHON_URL}/train-models`,
      {
        projectId:       project.projectId,
        mongoId:         project._id.toString(),
        mlResultId:      mlResult._id.toString(),
        uploadsDir:      UPLOADS_DIR,
        ecommerceFile:   project.engineeredFiles?.ecommerce   || `engineered/${project.projectId}-ecommerce-engineered.csv`,
        marketingFile:   project.engineeredFiles?.marketing   || `engineered/${project.projectId}-marketing-engineered.csv`,
        advertisingFile: project.engineeredFiles?.advertising || `engineered/${project.projectId}-advertising-engineered.csv`,
        objective,
        useGridFsFallback: true,
        // FIX: pass source project ID so Python can copy CSVs if the new
        // project's GridFS keys don't exist yet (different objective scenario)
        reusedFromProjectId: project.reusedsDatasets ? (project.reusedFromProjectId || null) : null,
      },
      2,
      600000,
    );

    if (response.data?.status === "success") {
      const d = response.data;

      await MLResult.findByIdAndUpdate(mlResult._id, {
        status:                    "complete",
        trainedForObjective:       objective,
        datasetFingerprint:        mlResult.datasetFingerprint,
        models:                    d.models,
        ensemble:                  d.ensemble,
        featureImportance:         d.featureImportance,
        modelPaths:                d.modelPaths,
        avgPurchaseProbability:    d.avgPurchaseProbability ?? null,
        bestHyperparams:           d.bestHyperparams        ?? null,
        learnedMechanismStrengths: d.learnedMechanismStrengths ?? null,
        learnedObjectiveWeights:   d.learnedObjectiveWeights   ?? null,
        kpiPredictorPath:          d.kpiPredictorPath ?? null,
        storageBackend:            "gridfs",
        pipelineVersion:           d.pipelineVersion  ?? "v15.0.0",
      });

      await Project.findOneAndUpdate(
        { projectId: project.projectId },
        { status: "ml_complete" },
        { returnDocument: "after" }
      );

      console.log(
        `[ML:train] ✅ Done → ${project.projectId} | ` +
        `Ensemble=${d.ensemble.avgAccuracy}% | PKL→GridFS | objective=${objective} | ` +
        `fingerprint=${mlResult.datasetFingerprint?.slice(0, 12)}…`
      );
    } else {
      const errMsg = response.data?.message || "Training failed.";
      await MLResult.findByIdAndUpdate(mlResult._id, { status: "error", errorMessage: errMsg });
      await Project.findOneAndUpdate(
        { projectId: project.projectId },
        { status: "error", errorMessage: `ML training failed: ${errMsg.slice(0, 300)}` }
      );
      console.error(`[ML:train] ❌ Failed → ${project.projectId}: ${errMsg.slice(0, 300)}`);
    }
  } catch (err) {
    console.error(`[ML:train] ❌ Exception → ${project.projectId}: ${err.message}`);
    await MLResult.findByIdAndUpdate(mlResult._id, {
      status:       "error",
      errorMessage: `Training exception: ${err.message}`,
    }).catch(() => {});
    await Project.findOneAndUpdate(
      { projectId: project.projectId },
      { status: "error", errorMessage: `ML exception: ${err.message}` }
    ).catch(() => {});
  }
};

module.exports = { trainModels, getMLResult, runAgentPipeline, getAgentResult };