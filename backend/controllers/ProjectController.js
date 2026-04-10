const path       = require("path");
const fs         = require("fs");
const crypto     = require("crypto");
const axios      = require("axios");
const Project    = require("../models/Project");
const UserAction = require("../models/UserAction");

const PYTHON_URL  = process.env.PYTHON_URL  || "http://localhost:8000";

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, "../uploads");

console.log(`[ProjectController] UPLOADS_DIR resolved → ${UPLOADS_DIR}`);

async function callPythonWithRetry(url, data, retries = 2, timeout = 120000) {
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

const hashFile = (filePath) =>
  new Promise((resolve, reject) => {
    const hash   = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data",  (chunk) => hash.update(chunk));
    stream.on("end",   ()      => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });

const safeDelete = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`[File:delete] Removed: ${filePath}`);
    } catch (e) {
      console.warn(`[File:delete] Could not remove ${filePath}: ${e.message}`);
    }
  }
};

/* ════════════════════════════════════════════════════════════════
   POST /api/projects/upload
   FIX: Sends file CONTENTS as base64 to Python /process-datasets.
   This works correctly across separate Render containers where
   /tmp is NOT shared between Node and Python services.
════════════════════════════════════════════════════════════════ */
const uploadDatasets = async (req, res) => {
  try {
    const { uid, projectName } = req.body;
    if (!uid || !projectName)
      return res.status(400).json({ message: "uid and projectName are required." });

    const files = req.files;
    if (!files?.ecommerce || !files?.marketing || !files?.advertising)
      return res.status(400).json({ message: "Please upload all 3 CSV files." });

    const ecoPath = path.join(UPLOADS_DIR, files.ecommerce[0].filename);
    const mktPath = path.join(UPLOADS_DIR, files.marketing[0].filename);
    const advPath = path.join(UPLOADS_DIR, files.advertising[0].filename);

    if (!fs.existsSync(ecoPath) || !fs.existsSync(mktPath) || !fs.existsSync(advPath)) {
      return res.status(500).json({
        message: "Uploaded files could not be saved. Please try again.",
      });
    }

    const [hashEco, hashMkt, hashAdv] = await Promise.all([
      hashFile(ecoPath), hashFile(mktPath), hashFile(advPath),
    ]);

    console.log(`[Upload] uid=${uid} | project="${projectName}" | hash check starting`);

    const REUSABLE_STATUSES = ["engineered", "analyzing", "ml_complete", "complete"];
    const existing = await Project.findOne({
      "fileHashes.ecommerce":   hashEco,
      "fileHashes.marketing":   hashMkt,
      "fileHashes.advertising": hashAdv,
      status: { $in: REUSABLE_STATUSES },
    }).sort({ createdAt: -1 });

    const isPostTraining = existing &&
      ["ml_complete", "complete"].includes(existing.status);

    const hasValidKpi = existing &&
      existing.kpiSummary &&
      existing.kpiSummary.avgConversionRate > 0;

    const dedupValid = hasValidKpi && existing;

    if (dedupValid) {
      console.log(`[Upload] Dedup hit → reusing processed data from ${existing.projectId} (status: ${existing.status})`);

      safeDelete(ecoPath);
      safeDelete(mktPath);
      safeDelete(advPath);

      const project = await Project.create({
        uid,
        projectName,
        files: existing.files || {
          ecommerce:   null,
          marketing:   null,
          advertising: null,
        },
        fileHashes:      { ecommerce: hashEco, marketing: hashMkt, advertising: hashAdv },
        cleanedFiles:    existing.cleanedFiles    || null,
        engineeredFiles: existing.engineeredFiles || null,
        kpiSummary:      existing.kpiSummary,
        datasetStats:    existing.datasetStats || null,
        status:               isPostTraining ? existing.status : "engineered",
        reusedsDatasets:      true,
        reusedFromProjectId:  existing.projectId,
      });

      return res.status(201).json({
        message:        "Datasets recognised — reusing previously processed files. Ready to select objective.",
        projectId:      project.projectId,
        projectName:    project.projectName,
        status:         project.status,
        reusedDatasets: true,
        kpiSummary:     project.kpiSummary,
        project: {
          projectId:   project.projectId,
          projectName: project.projectName,
          status:      project.status,
          kpiSummary:  project.kpiSummary,
        },
      });
    }

    const project = await Project.create({
      uid,
      projectName,
      files: {
        ecommerce:   files.ecommerce[0].filename,
        marketing:   files.marketing[0].filename,
        advertising: files.advertising[0].filename,
      },
      fileHashes: { ecommerce: hashEco, marketing: hashMkt, advertising: hashAdv },
      status: "uploaded",
    });

    console.log(`[Upload] New project created → ${project.projectId}`);

    res.status(201).json({
      message:        "Datasets uploaded. Processing started.",
      projectId:      project.projectId,
      projectName:    project.projectName,
      status:         project.status,
      reusedDatasets: false,
      project: {
        projectId:   project.projectId,
        projectName: project.projectName,
        status:      project.status,
        kpiSummary:  null,
      },
    });

    // FIX: Read file contents and send as base64 to Python.
    // This works across separate Render containers where /tmp is NOT shared.
    triggerPythonProcessing(project, ecoPath, mktPath, advPath).catch((err) =>
      console.error(`[Python:process] ${project.projectId} — ${err.message}`)
    );
  } catch (err) {
    console.error("uploadDatasets:", err.message);
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/projects/resume/:projectId
════════════════════════════════════════════════════════════════ */
const resumeProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findOne({ projectId });
    if (!project)
      return res.status(404).json({ message: "Project not found. Check your Project ID." });

    console.log(`[Resume] projectId=${projectId} | status=${project.status}`);

    if (project.status === "cleaned") {
      console.log(`[Resume] ${projectId} stuck at 'cleaned' — re-triggering feature engineering via GridFS restore.`);
      triggerFeatureEngineeringFromGridFS(project).catch((err) =>
        console.error(`[Resume:engineer] ${projectId} — ${err.message}`)
      );
    }

    const [latestObjective, latestSimMode] = await Promise.all([
      UserAction.findOne({ projectId, actionType: "objective_selected" }).sort({ createdAt: -1 }),
      UserAction.findOne({ projectId, actionType: "simulation_mode"    }).sort({ createdAt: -1 }),
    ]);

    return res.status(200).json({
      project: {
        projectId:           project.projectId,
        projectName:         project.projectName,
        status:              project.status,
        kpiSummary:          project.kpiSummary,
        errorMessage:        project.errorMessage,
        createdAt:           project.createdAt,
        reusedsDatasets:     project.reusedsDatasets,
        reusedFromProjectId: project.reusedFromProjectId,
      },
      latestObjective: latestObjective
        ? { objective: latestObjective.objective, savedAt: latestObjective.createdAt }
        : null,
      latestSimMode: latestSimMode
        ? {
            simulationMode: latestSimMode.simulationMode,
            strategyInput:  latestSimMode.strategyInput,
            savedAt:        latestSimMode.createdAt,
          }
        : null,
      allowedStep: getAllowedStep(project.status, latestObjective, latestSimMode),
      message:     getResumeMessage(project.status),
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/projects/status/:projectId
════════════════════════════════════════════════════════════════ */
const getProjectStatus = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findOne({ projectId }).select(
      "projectId projectName status kpiSummary errorMessage createdAt reusedsDatasets reusedFromProjectId"
    );
    if (!project)
      return res.status(404).json({ message: "Project not found." });

    const [latestObjective, latestSimMode] = await Promise.all([
      UserAction.findOne({ projectId, actionType: "objective_selected" }).sort({ createdAt: -1 }),
      UserAction.findOne({ projectId, actionType: "simulation_mode"    }).sort({ createdAt: -1 }),
    ]);

    return res.status(200).json({
      project,
      latestObjective: latestObjective
        ? { objective: latestObjective.objective, savedAt: latestObjective.createdAt }
        : null,
      latestSimMode: latestSimMode
        ? {
            simulationMode: latestSimMode.simulationMode,
            strategyInput:  latestSimMode.strategyInput,
            savedAt:        latestSimMode.createdAt,
          }
        : null,
      allowedStep: getAllowedStep(project.status, latestObjective, latestSimMode),
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════
   POST /api/projects/objective/:projectId
════════════════════════════════════════════════════════════════ */
const saveObjective = async (req, res) => {
  try {
    const { projectId }      = req.params;
    const { uid, objective } = req.body;

    const validObjectives = [
      "increase_revenue",
      "reduce_cart_abandonment",
      "improve_conversion_rate",
      "optimize_marketing_roi",
    ];
    if (!uid)
      return res.status(400).json({ message: "uid is required." });
    if (!validObjectives.includes(objective))
      return res.status(400).json({ message: "Invalid objective." });

    const project = await Project.findOne({ projectId });
    if (!project)
      return res.status(404).json({ message: "Project not found." });

    if (!["engineered", "ml_complete", "complete"].includes(project.status)) {
      return res.status(400).json({
        message: `Cannot save objective. Project status is "${project.status}". Must be "engineered" or later.`,
      });
    }

    const action = await UserAction.create({
      projectId, uid, actionType: "objective_selected", objective,
    });

    console.log(`[Objective] Saved → projectId=${projectId} | objective=${objective}`);

    return res.status(201).json({
      message:  "Objective saved.",
      projectId,
      objective,
      actionId: action._id,
      savedAt:  action.createdAt,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════
   POST /api/projects/simulation-mode/:projectId
════════════════════════════════════════════════════════════════ */
const saveSimulationMode = async (req, res) => {
  try {
    const { projectId }                          = req.params;
    const { uid, simulationMode, strategyInput } = req.body;

    if (!uid)
      return res.status(400).json({ message: "uid is required." });
    if (!["mode1", "mode2"].includes(simulationMode))
      return res.status(400).json({ message: "simulationMode must be 'mode1' or 'mode2'." });

    if (simulationMode === "mode1") {
      if (!strategyInput)
        return res.status(400).json({ message: "strategyInput required for mode1." });
      const { adBudgetIncrease, discount, channel, customerSegment } = strategyInput;
      if (adBudgetIncrease == null || discount == null || !channel || !customerSegment)
        return res.status(400).json({
          message: "mode1 requires: adBudgetIncrease, discount, channel, customerSegment.",
        });
    }

    const project = await Project.findOne({ projectId });
    if (!project)
      return res.status(404).json({ message: "Project not found." });

    const action = await UserAction.create({
      projectId, uid,
      actionType:    "simulation_mode",
      simulationMode,
      strategyInput: simulationMode === "mode1" ? strategyInput : null,
    });

    console.log(`[SimMode] Saved → projectId=${projectId} | mode=${simulationMode}`);

    return res.status(201).json({
      message:       "Simulation mode saved.",
      projectId,
      simulationMode,
      strategyInput: simulationMode === "mode1" ? strategyInput : null,
      actionId:      action._id,
      savedAt:       action.createdAt,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════
   POST /api/projects/engineer/:projectId
════════════════════════════════════════════════════════════════ */
const runFeatureEngineering = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findOne({ projectId });
    if (!project)
      return res.status(404).json({ message: "Project not found." });

    if (!["cleaned", "error"].includes(project.status))
      return res.status(400).json({
        message: `Cannot run feature engineering. Current status: "${project.status}".`,
      });

    triggerFeatureEngineeringFromGridFS(project).catch((err) =>
      console.error(`[engineer] ${projectId} — ${err.message}`)
    );
    return res.status(200).json({ message: "Feature engineering started.", projectId });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/projects/user/:uid
════════════════════════════════════════════════════════════════ */
const getUserProjects = async (req, res) => {
  try {
    const { uid }  = req.params;
    const projects = await Project.find({ uid })
      .select("projectId projectName status createdAt reusedsDatasets kpiSummary")
      .sort({ createdAt: -1 });
    return res.status(200).json({ projects });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ════════════════════════════════════════════════════════════════
   INTERNAL — Main processing pipeline
   FIX: Reads file contents from Node's local disk (where multer
   saved them), encodes as base64, sends to Python /process-datasets.
   Python decodes, processes in ITS OWN /tmp, saves to GridFS.
   This is the ONLY cross-container-safe approach on Render.
════════════════════════════════════════════════════════════════ */
const triggerPythonProcessing = async (project, ecoPath, mktPath, advPath) => {
  try {
    if (!fs.existsSync(ecoPath) || !fs.existsSync(mktPath) || !fs.existsSync(advPath)) {
      await Project.findByIdAndUpdate(project._id, {
        status:       "error",
        errorMessage: "Uploaded files not found on disk after multer save.",
      });
      return;
    }

    // Read file contents from Node's local disk
    const ecoContent = fs.readFileSync(ecoPath).toString("base64");
    const mktContent = fs.readFileSync(mktPath).toString("base64");
    const advContent = fs.readFileSync(advPath).toString("base64");

    // Delete from Node's disk immediately after reading
    safeDelete(ecoPath);
    safeDelete(mktPath);
    safeDelete(advPath);

    await Project.findByIdAndUpdate(project._id, { status: "cleaning" });

    console.log(`[Python:process] Sending file contents as base64 to Python for ${project.projectId}`);

    // FIX: Use /process-datasets which accepts base64 content.
    // Python writes to ITS OWN /tmp and saves engineered CSVs to GridFS.
    const response = await callPythonWithRetry(
      `${PYTHON_URL}/process-datasets`,
      {
        projectId:            project.projectId,
        mongoId:              project._id.toString(),
        ecommerceContent:     ecoContent,
        marketingContent:     mktContent,
        advertisingContent:   advContent,
        ecommerceFilename:    project.files.ecommerce,
        marketingFilename:    project.files.marketing,
        advertisingFilename:  project.files.advertising,
      },
      2,
      300000, // 5 minutes
    );

    if (response.data?.status === "success") {
      const updatePayload = {
        status:          "engineered",
        cleanedFiles:    response.data.cleanedFiles    || null,
        engineeredFiles: response.data.engineeredFiles || {
          ecommerce:   `engineered/${project.projectId}-ecommerce-engineered.csv`,
          marketing:   `engineered/${project.projectId}-marketing-engineered.csv`,
          advertising: `engineered/${project.projectId}-advertising-engineered.csv`,
        },
        kpiSummary: response.data.kpiSummary,
      };

      if (response.data.datasetStats && Object.keys(response.data.datasetStats).length > 0) {
        updatePayload.datasetStats = response.data.datasetStats;
        console.log(`[Python:process] datasetStats stored for ${project.projectId}`);
      }

      await Project.findByIdAndUpdate(project._id, updatePayload);

      console.log(
        `[Python:process] ✅ Done → ${project.projectId} | ` +
        `KPIs: ${JSON.stringify(response.data.kpiSummary)}`
      );
    } else {
      const errMsg = response.data?.message || "Processing failed.";
      console.error(`[Python:process] ❌ ${project.projectId}: ${errMsg.slice(0, 500)}`);
      await Project.findByIdAndUpdate(project._id, {
        status:       "error",
        errorMessage: errMsg.slice(0, 400),
      });
    }
  } catch (err) {
    const errMsg = `Processing exception: ${err.message}`;
    console.error(`[Python:process] ❌ ${project.projectId}: ${errMsg}`);
    await Project.findByIdAndUpdate(project._id, {
      status:       "error",
      errorMessage: errMsg,
    }).catch(() => {});
  }
};

/* ════════════════════════════════════════════════════════════════
   INTERNAL — Feature engineering from GridFS (for resume/retry)
════════════════════════════════════════════════════════════════ */
const triggerFeatureEngineeringFromGridFS = async (project) => {
  try {
    await Project.findByIdAndUpdate(project._id, { status: "engineering" });

    const response = await callPythonWithRetry(
      `${PYTHON_URL}/engineer-from-gridfs`,
      {
        projectId: project.projectId,
        mongoId:   project._id.toString(),
      },
      2,
      180000,
    );

    if (response.data?.status === "success") {
      const updatePayload = {
        status:          "engineered",
        engineeredFiles: response.data.engineeredFiles || {
          ecommerce:   `engineered/${project.projectId}-ecommerce-engineered.csv`,
          marketing:   `engineered/${project.projectId}-marketing-engineered.csv`,
          advertising: `engineered/${project.projectId}-advertising-engineered.csv`,
        },
        kpiSummary: response.data.kpiSummary,
      };

      if (response.data.datasetStats && Object.keys(response.data.datasetStats).length > 0) {
        updatePayload.datasetStats = response.data.datasetStats;
      }

      await Project.findByIdAndUpdate(project._id, updatePayload);
      console.log(`[Python:engineer-gridfs] ✅ Done → ${project.projectId}`);
    } else {
      const errMsg = response.data?.message || "Feature engineering from GridFS failed.";
      await Project.findByIdAndUpdate(project._id, {
        status:       "error",
        errorMessage: errMsg.slice(0, 400),
      });
    }
  } catch (err) {
    const errMsg = `Feature engineering exception: ${err.message}`;
    await Project.findByIdAndUpdate(project._id, {
      status:       "error",
      errorMessage: errMsg,
    }).catch(() => {});
  }
};

/* ════════════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════════════ */
const getAllowedStep = (status, latestObjective, latestSimMode) => {
  const PRE_STEP2 = ["uploaded", "cleaning", "cleaned", "engineering", "error"];
  if (PRE_STEP2.includes(status)) return 1;
  if (!["engineered", "analyzing", "ml_complete", "complete"].includes(status)) return 1;
  if (!latestObjective) return 2;
  if (!latestSimMode)   return 3;
  if (["analyzing"].includes(status)) return 4;
  if (["ml_complete", "complete"].includes(status)) return 5;
  return 4;
};

const getResumeMessage = (status) => {
  const map = {
    uploaded:    "Files uploaded. Cleaning in progress.",
    cleaning:    "Python microservice is cleaning your data.",
    cleaned:     "Data cleaned. Feature engineering in progress.",
    engineering: "Computing CTR, ROI, Conversion Rate features.",
    engineered:  "Ready. Select your business objective.",
    analyzing:   "ML models are training.",
    ml_complete: "Models trained. Ready to run Agent Decision Pipeline.",
    complete:    "Project complete. Strategy approved.",
    error:       "An error occurred.",
  };
  return map[status] ?? "Project found.";
};

module.exports = {
  uploadDatasets,
  resumeProject,
  getProjectStatus,
  saveObjective,
  saveSimulationMode,
  runFeatureEngineering,
  getUserProjects,
};