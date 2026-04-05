const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const {
  uploadDatasets,
  resumeProject,
  getProjectStatus,
  saveObjective,
  saveSimulationMode,
  runFeatureEngineering,
  getUserProjects,
} = require("../controllers/ProjectController");

// FIX ENG-4: resolve UPLOADS_DIR to absolute path — must match ProjectController
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, "../uploads");

const cleanedDir    = path.join(UPLOADS_DIR, "cleaned");
const engineeredDir = path.join(UPLOADS_DIR, "engineered");
const modelsDir     = path.join(UPLOADS_DIR, "models");

[UPLOADS_DIR, cleanedDir, engineeredDir, modelsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) =>
    cb(null, `${Date.now()}-${file.fieldname}${path.extname(file.originalname)}`),
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

router.post("/upload",                     csvUpload, uploadDatasets);
router.get("/resume/:projectId",           resumeProject);
router.get("/status/:projectId",           getProjectStatus);
router.post("/objective/:projectId",       saveObjective);
router.post("/simulation-mode/:projectId", saveSimulationMode);
router.post("/engineer/:projectId",        runFeatureEngineering);
router.get("/user/:uid",                   getUserProjects);

module.exports = router;