const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");

const {
  uploadDatasets,
  resumeProject,
  getProjectStatus,
  runFeatureEngineering,
  saveObjective,
  getUserProjects,
} = require("../controllers/ProjectController");

/* ── Multer config ── */
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => {
    cb(null, `${Date.now()}-${file.fieldname}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.toLowerCase().endsWith(".csv");
    ok ? cb(null, true) : cb(new Error("Only CSV files are allowed."));
  },
  limits: { fileSize: 100 * 1024 * 1024 },
});

const csvUpload = upload.fields([
  { name: "ecommerce",   maxCount: 1 },
  { name: "marketing",   maxCount: 1 },
  { name: "advertising", maxCount: 1 },
]);

/* ── Routes ── */

// POST /api/projects/upload
router.post("/upload", csvUpload, uploadDatasets);

// GET  /api/projects/resume/:projectId   ← resume by Project ID
router.get("/resume/:projectId", resumeProject);

// GET  /api/projects/status/:projectId   ← poll pipeline status
router.get("/status/:projectId", getProjectStatus);

// POST /api/projects/engineer/:projectId ← manually trigger feature engineering
router.post("/engineer/:projectId", runFeatureEngineering);

// POST /api/projects/objective/:projectId ← save business objective
router.post("/objective/:projectId", saveObjective);

// GET  /api/projects/user/:uid           ← get all user projects
router.get("/user/:uid", getUserProjects);

module.exports = router;