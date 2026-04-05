const path       = require("path");
const fs         = require("fs");
const crypto     = require("crypto");
const axios      = require("axios");
const Project    = require("../models/Project");
const UserAction = require("../models/UserAction");

const PYTHON_URL  = process.env.PYTHON_URL  || "http://localhost:8000";

// FIX ENG-4: resolve UPLOADS_DIR to an absolute path at module load time.
// This prevents path mismatch when the Node process CWD differs from __dirname.
// Local dev: UPLOADS_DIR=./uploads (in backend/.env) → resolves relative to CWD.
// Render:    set UPLOADS_DIR=/mnt/data/uploads in the dashboard (already absolute).
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, "../uploads");

console.log(`[ProjectController] UPLOADS_DIR resolved → ${UPLOADS_DIR}`);

/* ════════════════════════════════════════════════════════════════
   Retry wrapper for Python microservice calls
════════════════════════════════════════════════════════════════ */
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

/* ════════════════════════════════════════════════════════════════
   HELPER — SHA-256 file hash (for dedup)
════════════════════════════════════════════════════════════════ */
const hashFile = (filePath) =>
  new Promise((resolve, reject) => {
    const hash   = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data",  (chunk) => hash.update(chunk));
    stream.on("end",   ()      => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });

/* ════════════════════════════════════════════════════════════════
   POST /api/projects/upload
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

    const dedupValid =
      existing &&
      existing.engineeredFiles?.ecommerce &&
      existing.engineeredFiles?.marketing &&
      existing.engineeredFiles?.advertising &&
      fs.existsSync(path.join(UPLOADS_DIR, existing.engineeredFiles.ecommerce)) &&
      fs.existsSync(path.join(UPLOADS_DIR, existing.engineeredFiles.marketing)) &&
      fs.existsSync(path.join(UPLOADS_DIR, existing.engineeredFiles.advertising));

    if (dedupValid) {
      console.log(`[Upload] Dedup hit → reusing processed files from ${existing.projectId}`);

      const project = await Project.create({
        uid,
        projectName,
        files: {
          ecommerce:   files.ecommerce[0].filename,
          marketing:   files.marketing[0].filename,
          advertising: files.advertising[0].filename,
        },
        fileHashes:      { ecommerce: hashEco, marketing: hashMkt, advertising: hashAdv },
        cleanedFiles:    existing.cleanedFiles,
        engineeredFiles: existing.engineeredFiles,
        kpiSummary:      existing.kpiSummary,
        datasetStats:    existing.datasetStats || null,
        status:               "engineered",
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

    if (existing && !dedupValid) {
      console.warn(
        `[Upload] Dedup hit for ${existing.projectId} but engineered files missing on disk — ` +
        `falling through to fresh processing.`
      );
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

    triggerPythonCleaning(project).catch((err) =>
      console.error(`[Python:clean] ${project.projectId} — ${err.message}`)
    );

    return res.status(201).json({
      message:        "Datasets uploaded. Cleaning started.",
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
      console.log(`[Resume] ${projectId} stuck at 'cleaned' — re-triggering feature engineering.`);
      triggerFeatureEngineering(project).catch((err) =>
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
    if (!project.cleanedFiles?.ecommerce)
      return res.status(400).json({ message: "Cleaned files not found. Re-upload datasets." });

    triggerFeatureEngineering(project).catch((err) =>
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
   INTERNAL — Python cleaning pipeline
════════════════════════════════════════════════════════════════ */
const triggerPythonCleaning = async (project) => {
  try {
    const ecoPath = path.join(UPLOADS_DIR, project.files.ecommerce);
    const mktPath = path.join(UPLOADS_DIR, project.files.marketing);
    const advPath = path.join(UPLOADS_DIR, project.files.advertising);

    if (!fs.existsSync(ecoPath) || !fs.existsSync(mktPath) || !fs.existsSync(advPath)) {
      await Project.findByIdAndUpdate(project._id, {
        status:       "error",
        errorMessage: "Uploaded files not found on disk. Please re-upload.",
      });
      return;
    }

    await Project.findByIdAndUpdate(project._id, { status: "cleaning" });

    const response = await callPythonWithRetry(
      `${PYTHON_URL}/clean-datasets`,
      {
        projectId:       project.projectId,
        mongoId:         project._id.toString(),
        // FIX ENG-4: always send the resolved absolute path
        uploadsDir:      UPLOADS_DIR,
        ecommerceFile:   project.files.ecommerce,
        marketingFile:   project.files.marketing,
        advertisingFile: project.files.advertising,
      },
      2,
      120000,
    );

    if (response.data?.status === "success") {
      await Project.findByIdAndUpdate(project._id, {
        status:       "cleaned",
        cleanedFiles: {
          ecommerce:   response.data.cleanedFiles.ecommerce,
          marketing:   response.data.cleanedFiles.marketing,
          advertising: response.data.cleanedFiles.advertising,
        },
      });
      const fresh = await Project.findById(project._id);
      await triggerFeatureEngineering(fresh);
    } else {
      const errMsg = response.data?.message || "Cleaning failed.";
      console.error(`[Python:clean] ❌ ${project.projectId}: ${errMsg}`);
      await Project.findByIdAndUpdate(project._id, {
        status:       "error",
        errorMessage: errMsg,
      });
    }
  } catch (err) {
    const errMsg = `Cleaning exception: ${err.message}`;
    console.error(`[Python:clean] ❌ ${project.projectId}: ${errMsg}`);
    await Project.findByIdAndUpdate(project._id, {
      status:       "error",
      errorMessage: errMsg,
    }).catch(() => {});
  }
};

/* ════════════════════════════════════════════════════════════════
   INTERNAL — Feature engineering
   FIX ENG-4: sends absolute UPLOADS_DIR path to Python.
   FIX ENG-5: stores actual Python error message on failure.
════════════════════════════════════════════════════════════════ */
const triggerFeatureEngineering = async (project) => {
  try {
    if (!project.cleanedFiles?.ecommerce)
      throw new Error("cleanedFiles missing.");

    await Project.findByIdAndUpdate(project._id, { status: "engineering" });

    const response = await callPythonWithRetry(
      `${PYTHON_URL}/engineer-features`,
      {
        projectId:       project.projectId,
        mongoId:         project._id.toString(),
        // FIX ENG-4: always send the resolved absolute path
        uploadsDir:      UPLOADS_DIR,
        ecommerceFile:   project.cleanedFiles.ecommerce,
        marketingFile:   project.cleanedFiles.marketing,
        advertisingFile: project.cleanedFiles.advertising,
      },
      2,
      120000,
    );

    if (response.data?.status === "success") {
      const updatePayload = {
        status:          "engineered",
        engineeredFiles: {
          ecommerce:   response.data.engineeredFiles.ecommerce,
          marketing:   response.data.engineeredFiles.marketing,
          advertising: response.data.engineeredFiles.advertising,
        },
        kpiSummary: response.data.kpiSummary,
      };

      if (
        response.data.datasetStats &&
        Object.keys(response.data.datasetStats).length > 0
      ) {
        updatePayload.datasetStats = response.data.datasetStats;
        console.log(
          `[Python:engineer] datasetStats stored for ${project.projectId} | ` +
          `max_pages=${response.data.datasetStats._max_pages} | ` +
          `max_time=${response.data.datasetStats._max_time}`
        );
      } else {
        console.warn(
          `[Python:engineer] ⚠️  No datasetStats returned for ${project.projectId}. ` +
          `Simulation agent will use safe defaults.`
        );
      }

      await Project.findByIdAndUpdate(project._id, updatePayload);

      console.log(
        `[Python:engineer] Done → ${project.projectId} | ` +
        `KPIs: ${JSON.stringify(response.data.kpiSummary)}`
      );
    } else {
      // FIX ENG-5: capture the actual Python error message (includes traceback)
      const errMsg = response.data?.message || "Feature engineering failed.";
      console.error(`[Python:engineer] ❌ ${project.projectId}: ${errMsg.slice(0, 500)}`);
      await Project.findByIdAndUpdate(project._id, {
        status:       "error",
        // Store a concise version (first 400 chars) so it fits in the UI
        errorMessage: errMsg.slice(0, 400),
      });
    }
  } catch (err) {
    const errMsg = `Feature engineering exception: ${err.message}`;
    console.error(`[Python:engineer] ❌ ${project.projectId}: ${errMsg}`);
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
  if (!["engineered", "analyzing", "ml_complete", "complete"].includes(status)) return 1;
  if (!latestObjective) return 2;
  if (!latestSimMode)   return 3;
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