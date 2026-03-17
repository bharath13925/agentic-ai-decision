const path    = require("path");
const fs      = require("fs");
const axios   = require("axios");
const Project = require("../models/Project");

const PYTHON_URL = process.env.PYTHON_URL || "http://localhost:8000";

/* ═══════════════════════════════════════════════════════════
   POST /api/projects/upload
   Body (multipart/form-data):
     uid, projectName, ecommerce, marketing, advertising
═══════════════════════════════════════════════════════════ */
const uploadDatasets = async (req, res) => {
  try {
    const { uid, projectName } = req.body;

    if (!uid || !projectName) {
      return res.status(400).json({ message: "uid and projectName are required." });
    }

    const files = req.files;
    if (!files?.ecommerce || !files?.marketing || !files?.advertising) {
      return res.status(400).json({
        message: "Please upload all 3 CSV files: ecommerce, marketing, advertising.",
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
      status: "uploaded",
    });

    /* ── Trigger Python cleaning async (no await — runs in background) ── */
    triggerPythonCleaning(project).catch((err) =>
      console.error(`[Python:clean] ${project.projectId} — ${err.message}`)
    );

    return res.status(201).json({
      message:     "Datasets uploaded. Cleaning started in background.",
      projectId:   project.projectId,
      projectName: project.projectName,
      status:      "uploaded",
    });
  } catch (err) {
    console.error("uploadDatasets:", err.message);
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   GET /api/projects/resume/:projectId
   Called when user enters Project ID to resume.
   Returns project status + what step they can go to.
   Also re-triggers pipeline if stuck at "cleaned".
═══════════════════════════════════════════════════════════ */
const resumeProject = async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findOne({ projectId });

    if (!project) {
      return res.status(404).json({ message: "Project not found. Check your Project ID." });
    }

    /* ── Auto-recover: if stuck at "cleaned", re-trigger feature engineering ── */
    if (project.status === "cleaned") {
      console.log(`[Resume] Project ${projectId} stuck at 'cleaned' — re-triggering feature engineering.`);
      triggerFeatureEngineering(project).catch((err) =>
        console.error(`[Resume:engineer] ${projectId} — ${err.message}`)
      );
    }

    const allowedStep = getAllowedStep(project.status);

    return res.status(200).json({
      project: {
        projectId:    project.projectId,
        projectName:  project.projectName,
        status:       project.status,
        objective:    project.objective,
        kpiSummary:   project.kpiSummary,
        errorMessage: project.errorMessage,
        createdAt:    project.createdAt,
      },
      allowedStep,
      message: getResumeMessage(project.status),
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   GET /api/projects/status/:projectId
   Polled by frontend every 3s to check pipeline progress
═══════════════════════════════════════════════════════════ */
const getProjectStatus = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findOne({ projectId }).select(
      "projectId projectName status kpiSummary objective errorMessage createdAt"
    );

    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    return res.status(200).json({
      project,
      allowedStep: getAllowedStep(project.status),
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   POST /api/projects/engineer/:projectId
   Manually trigger feature engineering.
   Accepts status: cleaned | error (retry)
═══════════════════════════════════════════════════════════ */
const runFeatureEngineering = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findOne({ projectId });

    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    const retryable = ["cleaned", "error"];
    if (!retryable.includes(project.status)) {
      return res.status(400).json({
        message: `Cannot run feature engineering. Current status: "${project.status}". Must be "cleaned" or "error".`,
      });
    }

    if (!project.cleanedFiles?.ecommerce) {
      return res.status(400).json({
        message: "Cleaned files not found. Please re-upload your datasets.",
      });
    }

    /* ── Trigger async ── */
    triggerFeatureEngineering(project).catch((err) =>
      console.error(`[engineer] ${projectId} — ${err.message}`)
    );

    return res.status(200).json({
      message:   "Feature engineering started.",
      projectId: project.projectId,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   POST /api/projects/objective/:projectId
   Body: { objective }
   Saves user's selected business objective
═══════════════════════════════════════════════════════════ */
const saveObjective = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { objective }  = req.body;

    const validObjectives = [
      "increase_revenue",
      "reduce_cart_abandonment",
      "improve_conversion_rate",
      "optimize_marketing_roi",
    ];

    if (!objective || !validObjectives.includes(objective)) {
      return res.status(400).json({ message: "Invalid objective value." });
    }

    const project = await Project.findOneAndUpdate(
      { projectId },
      { objective },
      { returnDocument: "after" }
    ).select("projectId projectName status objective kpiSummary");

    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    return res.status(200).json({
      message:   "Objective saved.",
      project,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   GET /api/projects/user/:uid
   Get all projects for a Firebase user
═══════════════════════════════════════════════════════════ */
const getUserProjects = async (req, res) => {
  try {
    const { uid } = req.params;
    const projects = await Project.find({ uid })
      .select("projectId projectName status objective createdAt")
      .sort({ createdAt: -1 });

    return res.status(200).json({ projects });
  } catch (err) {
    return res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   INTERNAL: Python data cleaning
═══════════════════════════════════════════════════════════ */
const triggerPythonCleaning = async (project) => {
  const uploadsDir = path.join(__dirname, "../uploads");

  try {
    await Project.findByIdAndUpdate(project._id, { status: "cleaning" });
    console.log(`[Python:clean] Starting → ${project.projectId}`);

    const response = await axios.post(
      `${PYTHON_URL}/clean-datasets`,
      {
        projectId:       project.projectId,
        mongoId:         project._id.toString(),
        uploadsDir,
        ecommerceFile:   project.files.ecommerce,
        marketingFile:   project.files.marketing,
        advertisingFile: project.files.advertising,
      },
      { timeout: 120000 }
    );

    if (response.data?.status === "success") {
      /* ── Save cleaned files to DB first ── */
      await Project.findByIdAndUpdate(project._id, {
        status: "cleaned",
        cleanedFiles: {
          ecommerce:   response.data.cleanedFiles.ecommerce,
          marketing:   response.data.cleanedFiles.marketing,
          advertising: response.data.cleanedFiles.advertising,
        },
      });
      console.log(`[Python:clean] Done → ${project.projectId}`);

      /* ── Re-fetch from DB so cleanedFiles are populated ── */
      const freshProject = await Project.findById(project._id);
      if (!freshProject) throw new Error("Project disappeared from DB after cleaning.");

      /* ── Auto-trigger feature engineering ── */
      await triggerFeatureEngineering(freshProject);

    } else {
      const errMsg = response.data?.message || "Cleaning failed.";
      console.error(`[Python:clean] Error → ${project.projectId}: ${errMsg}`);
      await Project.findByIdAndUpdate(project._id, {
        status: "error",
        errorMessage: errMsg,
      });
    }
  } catch (err) {
    console.error(`[Python:clean] Exception → ${project.projectId}: ${err.message}`);
    await Project.findByIdAndUpdate(project._id, {
      status: "error",
      errorMessage: `Cleaning exception: ${err.message}`,
    }).catch(() => {});
  }
};

/* ═══════════════════════════════════════════════════════════
   INTERNAL: Python feature engineering
═══════════════════════════════════════════════════════════ */
const triggerFeatureEngineering = async (project) => {
  const uploadsDir = path.join(__dirname, "../uploads");

  try {
    /* ── Guard: cleanedFiles must exist ── */
    if (
      !project.cleanedFiles?.ecommerce ||
      !project.cleanedFiles?.marketing ||
      !project.cleanedFiles?.advertising
    ) {
      throw new Error("cleanedFiles missing — cannot run feature engineering.");
    }

    await Project.findByIdAndUpdate(project._id, { status: "engineering" });
    console.log(`[Python:engineer] Starting → ${project.projectId}`);

    const response = await axios.post(
      `${PYTHON_URL}/engineer-features`,
      {
        projectId:       project.projectId,
        mongoId:         project._id.toString(),
        uploadsDir,
        ecommerceFile:   project.cleanedFiles.ecommerce,
        marketingFile:   project.cleanedFiles.marketing,
        advertisingFile: project.cleanedFiles.advertising,
      },
      { timeout: 120000 }
    );

    if (response.data?.status === "success") {
      await Project.findByIdAndUpdate(project._id, {
        status: "engineered",
        engineeredFiles: {
          ecommerce:   response.data.engineeredFiles.ecommerce,
          marketing:   response.data.engineeredFiles.marketing,
          advertising: response.data.engineeredFiles.advertising,
        },
        kpiSummary: response.data.kpiSummary,
      });
      console.log(`[Python:engineer] Done → ${project.projectId}`);
    } else {
      const errMsg = response.data?.message || "Feature engineering failed.";
      console.error(`[Python:engineer] Error → ${project.projectId}: ${errMsg}`);
      await Project.findByIdAndUpdate(project._id, {
        status: "error",
        errorMessage: errMsg,
      });
    }
  } catch (err) {
    console.error(`[Python:engineer] Exception → ${project.projectId}: ${err.message}`);
    await Project.findByIdAndUpdate(project._id, {
      status: "error",
      errorMessage: `Feature engineering exception: ${err.message}`,
    }).catch(() => {});
  }
};

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */
const getAllowedStep = (status) => {
  const map = {
    uploaded:   1,
    cleaning:   1,
    cleaned:    1,
    engineering:1,
    engineered: 2, // ready for objective selection
    analyzing:  3, // ready for simulation
    complete:   4, // all done
    error:      1,
  };
  return map[status] ?? 1;
};

const getResumeMessage = (status) => {
  const map = {
    uploaded:    "Files uploaded. Data cleaning in progress.",
    cleaning:    "Python microservice is cleaning your data. Please wait.",
    cleaned:     "Data cleaned. Feature engineering in progress.",
    engineering: "Python microservice is computing features. Please wait.",
    engineered:  "Features ready. Please select your business objective.",
    analyzing:   "ML pipeline is running. Please wait.",
    complete:    "Analysis complete. View your results.",
    error:       "An error occurred. Please re-upload your datasets.",
  };
  return map[status] ?? "Project found.";
};

module.exports = {
  uploadDatasets,
  resumeProject,
  getProjectStatus,
  runFeatureEngineering,
  saveObjective,
  getUserProjects,
};