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

// ── Resolve UPLOADS_DIR to absolute path — must match ProjectController ──────
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, "../uploads");

console.log(`[ProjectRoutes] UPLOADS_DIR resolved → ${UPLOADS_DIR}`);

// ── Ensure ALL required subdirectories exist at startup ───────────────────────
// Uses recursive: true so it never throws if the dir already exists.
// This runs synchronously at module load so multer's destination callback
// is guaranteed to find the directory ready.
const cleanedDir    = path.join(UPLOADS_DIR, "cleaned");
const engineeredDir = path.join(UPLOADS_DIR, "engineered");
const modelsDir     = path.join(UPLOADS_DIR, "models");
const ragDir        = path.join(UPLOADS_DIR, "rag");

[UPLOADS_DIR, cleanedDir, engineeredDir, modelsDir, ragDir].forEach((dir) => {
  try {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[ProjectRoutes] Dir ready: ${dir}`);
  } catch (e) {
    // Log but don't crash — if /tmp is not writable we'll surface a clear error
    // on the first upload attempt rather than at startup.
    console.warn(`[ProjectRoutes] Could not create dir ${dir}: ${e.message}`);
  }
});

// ── Multer storage — destination callback re-creates dir each time ────────────
// This guards against the rare case where /tmp gets cleared between requests
// on some platforms (Render ephemeral filesystem, cold starts, etc.).
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      // Re-ensure the root upload dir exists every time a file arrives.
      // fs.mkdirSync with recursive: true is a no-op when it already exists,
      // so the cost is negligible.
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      cb(null, UPLOADS_DIR);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) =>
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
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

const csvUpload = upload.fields([
  { name: "ecommerce",   maxCount: 1 },
  { name: "marketing",   maxCount: 1 },
  { name: "advertising", maxCount: 1 },
]);

// ── Multer error handler middleware ───────────────────────────────────────────
// Converts multer errors (file type, size, dest) into clean JSON responses
// instead of letting them bubble up as HTML 500 pages.
const csvUploadWithErrorHandling = (req, res, next) => {
  csvUpload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ message: err.message || "File upload failed." });
    }
    next();
  });
};

// ── Routes ────────────────────────────────────────────────────────────────────
router.post("/upload",                     csvUploadWithErrorHandling, uploadDatasets);
router.get("/resume/:projectId",           resumeProject);
router.get("/status/:projectId",           getProjectStatus);
router.post("/objective/:projectId",       saveObjective);
router.post("/simulation-mode/:projectId", saveSimulationMode);
router.post("/engineer/:projectId",        runFeatureEngineering);
router.get("/user/:uid",                   getUserProjects);

module.exports = router;