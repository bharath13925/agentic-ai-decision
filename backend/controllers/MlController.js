const path        = require("path");
const axios       = require("axios");
const Project     = require("../models/Project");
const MLResult    = require("../models/MlResult");
const AgentResult = require("../models/AgentResult");
const UserAction  = require("../models/UserAction");

const PYTHON_URL  = process.env.PYTHON_URL  || "http://localhost:8000";
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "../uploads");

/* ════════════════════════════════════════════════════════════════
   Retry wrapper for Python microservice calls
════════════════════════════════════════════════════════════════ */
async function callPythonWithRetry(url, data, retries = 2, timeout = 180000) {
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

/* ════════════════════════════════════════════════════════════════
   HELPER — validate kpiSummary has real non-zero values
════════════════════════════════════════════════════════════════ */
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
    console.warn(`[KPI Validation] ⚠️  ${projectId}: Zero/missing KPI values:`);
    issues.forEach((i) => console.warn(`  - ${i}`));
  } else {
    console.log(
      `[KPI Validation] ✅ ${projectId}: Real KPIs confirmed — ` +
      `CTR=${kpi.avgCTR?.toFixed(4)}% | Conv=${kpi.avgConversionRate?.toFixed(4)}% | ` +
      `Abandon=${kpi.avgCartAbandonment?.toFixed(2)}% | ROI=${kpi.avgROI?.toFixed(4)}x`
    );
  }
  return { valid: issues.length === 0, issues };
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

    if (!["engineered", "error", "analyzing", "ml_complete"].includes(project.status)) {
      return res.status(400).json({
        message: `Cannot train. Status is "${project.status}". Must be "engineered".`,
      });
    }
    if (!project.engineeredFiles?.ecommerce) {
      return res.status(400).json({
        message: "Engineered files not found. Please re-run feature engineering.",
      });
    }

    const fsLib   = require("fs");
    const pathLib = require("path");
    const ecoFull = pathLib.join(UPLOADS_DIR, project.engineeredFiles.ecommerce);
    const mktFull = pathLib.join(UPLOADS_DIR, project.engineeredFiles.marketing);
    const advFull = pathLib.join(UPLOADS_DIR, project.engineeredFiles.advertising);

    const missingDisk = [
      !fsLib.existsSync(ecoFull) && `ecommerce: ${project.engineeredFiles.ecommerce}`,
      !fsLib.existsSync(mktFull) && `marketing: ${project.engineeredFiles.marketing}`,
      !fsLib.existsSync(advFull) && `advertising: ${project.engineeredFiles.advertising}`,
    ].filter(Boolean);

    if (missingDisk.length > 0) {
      console.error(
        `[ML:train] ❌ Engineered files missing on disk for ${projectId}: ${missingDisk.join(", ")}`
      );
      return res.status(400).json({
        message:
          "Engineered files are missing on disk (likely from a previous session or server restart). " +
          "Please re-upload your datasets to regenerate them. Missing: " + missingDisk.join(", "),
        requiresReupload: true,
        missingFiles:     missingDisk,
      });
    }

    const latestObjective = await UserAction
      .findOne({ projectId, actionType: "objective_selected" })
      .sort({ createdAt: -1 });
    if (!latestObjective)
      return res.status(400).json({ message: "No objective selected. Complete Step 2 first." });

    await Project.findByIdAndUpdate(project._id, { status: "engineered", errorMessage: null });
    await MLResult.deleteMany({ projectId });
    const mlResult = await MLResult.create({ projectId, uid, status: "training" });
    await Project.findByIdAndUpdate(project._id, { status: "analyzing" });

    console.log(
      `[ML:train] Started → projectId=${projectId} | objective=${latestObjective.objective}`
    );

    res.status(202).json({
      message:    "ML training started.",
      projectId,
      mlResultId: mlResult._id,
      status:     "training",
    });

    triggerMLTraining(project, mlResult, latestObjective.objective).catch((err) =>
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
   Passes datasetStats so simulation agent uses real dataset medians
   for the base feature vector (FIX B/C / FIX AA).
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
        message:        "KPI regressor (.pkl) not found. The model was trained before v12. Please retrain.",
        requiresRetrain: true,
      });
    }

    if (!require("fs").existsSync(mlResult.kpiPredictorPath)) {
      return res.status(400).json({
        message:        `KPI regressor file missing at: ${mlResult.kpiPredictorPath}. Please retrain.`,
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
      const exists   = p && require("fs").existsSync(p);
      pklStatus[key] = exists;
      if (!exists) console.warn(`[AgentPipeline] ⚠️  PKL file missing: ${key} → ${p}`);
    }
    const pklAvailable = Object.values(pklStatus).some(Boolean);
    console.log(
      `[AgentPipeline] PKL files: ${JSON.stringify(pklStatus)} | available=${pklAvailable}`
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
    console.log(`[AgentPipeline] ✅ Objective match: "${currentObj}"`);

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

    // FIX B/C + FIX AA: real dataset stats for base feature vector construction
    const datasetStats = project.datasetStats || null;
    if (datasetStats) {
      const maxPages = datasetStats._max_pages || "not stored";
      const maxTime  = datasetStats._max_time  || "not stored";
      console.log(
        `[AgentPipeline] datasetStats present — max_pages=${maxPages}, max_time=${maxTime}`
      );
    } else {
      console.warn(
        `[AgentPipeline] ⚠️  datasetStats missing for ${project.projectId}. ` +
        `Simulation agent will fall back to _SAFE_DEFAULTS. Re-run feature engineering to fix.`
      );
    }

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
      uploadsDir:            UPLOADS_DIR,
      ecommerceEngineerFile: project.engineeredFiles?.ecommerce || null,
      featureImportance:     mlResult.featureImportance  ?? [],
      kpiPredictorPath:      mlResult.kpiPredictorPath   ?? null,
      // FIX B/C + FIX AA: real medians + normalization maxes + channel rates
      datasetStats:          datasetStats,
    };

    console.log(
      `[AgentPipeline] v13.4 payload extras: ` +
      `featureImportance=${payload.featureImportance?.length ?? 0} features | ` +
      `kpiPredictorPath=${payload.kpiPredictorPath ? "✅" : "❌"} | ` +
      `datasetStats=${datasetStats ? "✅" : "⚠️ missing"}`
    );

    const response = await callPythonWithRetry(
      `${PYTHON_URL}/run-agent-pipeline`, payload, 2, 180000
    );

    if (response.data?.status === "success") {
      const d           = response.data;
      const topStrategy = d.decisionResult?.recommendation?.strategyName;
      const confidence  = d.decisionResult?.recommendation?.confidence;
      const mlDriven    = d.simulationResult?.mlDriven;

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

      console.log(`[AgentPipeline] ✅ Done → ${project.projectId}`);
      console.log(
        `[AgentPipeline] Top: "${topStrategy}" | Confidence: ${confidence}% | ` +
        `ML-driven: ${mlDriven}`
      );
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
════════════════════════════════════════════════════════════════ */
const triggerMLTraining = async (project, mlResult, objective) => {
  try {
    console.log(`[ML:train] Starting → ${project.projectId} | Objective: ${objective}`);

    const fsLib   = require("fs");
    const pathLib = require("path");
    const ecoFull = pathLib.join(UPLOADS_DIR, project.engineeredFiles.ecommerce);
    const mktFull = pathLib.join(UPLOADS_DIR, project.engineeredFiles.marketing);
    const advFull = pathLib.join(UPLOADS_DIR, project.engineeredFiles.advertising);

    const missingFiles = [
      !fsLib.existsSync(ecoFull) && ecoFull,
      !fsLib.existsSync(mktFull) && mktFull,
      !fsLib.existsSync(advFull) && advFull,
    ].filter(Boolean);

    if (missingFiles.length > 0) {
      const errMsg =
        "Engineered files missing on disk (likely from a previous session or machine restart). " +
        "Please re-upload your datasets. Missing: " + missingFiles.join(", ");
      console.error(`[ML:train] ❌ ${project.projectId}: ${errMsg}`);
      await MLResult.findByIdAndUpdate(mlResult._id, { status: "error", errorMessage: errMsg });
      await Project.findOneAndUpdate(
        { projectId: project.projectId },
        { status: "error", errorMessage: errMsg }
      );
      return;
    }

    console.log(`[ML:train] ✅ Engineered files verified on disk → ${project.projectId}`);

    const response = await callPythonWithRetry(
      `${PYTHON_URL}/train-models`,
      {
        projectId:       project.projectId,
        mongoId:         project._id.toString(),
        mlResultId:      mlResult._id.toString(),
        uploadsDir:      UPLOADS_DIR,
        ecommerceFile:   project.engineeredFiles.ecommerce,
        marketingFile:   project.engineeredFiles.marketing,
        advertisingFile: project.engineeredFiles.advertising,
        objective,
      },
      2,
      600000,
    );

    if (response.data?.status === "success") {
      const d = response.data;

      await MLResult.findByIdAndUpdate(mlResult._id, {
        status:                    "complete",
        trainedForObjective:       objective,
        models:                    d.models,
        ensemble:                  d.ensemble,
        featureImportance:         d.featureImportance,
        modelPaths:                d.modelPaths,
        avgPurchaseProbability:    d.avgPurchaseProbability ?? null,
        bestHyperparams:           d.bestHyperparams        ?? null,
        learnedMechanismStrengths: d.learnedMechanismStrengths ?? null,
        learnedObjectiveWeights:   d.learnedObjectiveWeights   ?? null,
        kpiPredictorPath:          d.kpiPredictorPath ?? null,
        pipelineVersion:           d.pipelineVersion  ?? "v13.4",
      });

      await Project.findOneAndUpdate(
        { projectId: project.projectId },
        { status: "ml_complete" },
        { returnDocument: "after" }
      );

      console.log(
        `[ML:train] ✅ Done → ${project.projectId} | ` +
        `Ensemble=${d.ensemble.avgAccuracy}% | ` +
        `RF=${d.models.randomForest.accuracy}% | ` +
        `XGB=${d.models.xgboost.accuracy}% | ` +
        `LGB=${d.models.lightgbm.accuracy}% | ` +
        `AvgProba=${d.avgPurchaseProbability} | Rows=${d.trainingRows}`
      );
      console.log(
        `[ML:train] PKL saved: RF=${d.modelPaths.randomForest} | ` +
        `XGB=${d.modelPaths.xgboost} | LGB=${d.modelPaths.lightgbm}`
      );
      console.log(
        `[ML:train] KPI Regressor: ${d.kpiPredictorPath ?? "NOT FOUND — retrain needed"}`
      );
      console.log(
        `[ML:train] Top features: ${d.featureImportance
          ?.slice(0, 3)
          .map((f) => `${f.feature}(${(f.importance * 100).toFixed(1)}%)`)
          .join(", ")}`
      );
    } else {
      const errMsg = response.data?.message || "Training failed.";
      await MLResult.findByIdAndUpdate(mlResult._id, { status: "error", errorMessage: errMsg });
      await Project.findOneAndUpdate(
        { projectId: project.projectId },
        { status: "error", errorMessage: `ML training failed: ${errMsg}` }
      );
      console.error(`[ML:train] ❌ Failed → ${project.projectId}: ${errMsg}`);
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