const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
const dotenv   = require("dotenv");
const path     = require("path");
const fs       = require("fs");

dotenv.config();

const userRoutes     = require("./routes/UserRoutes");
const projectRoutes  = require("./routes/ProjectRoutes");
const mlRoutes       = require("./routes/MlRoutes");
const feedbackRoutes = require("./routes/FeedbackRoutes");
const contactRoutes  = require("./routes/ContactRoutes");
const ragRoutes      = require("./routes/RagRoutes");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Version constant ──────────────────────────────────────────────────────────
const APP_VERSION = "15.0.0";

// ── Resolve UPLOADS_DIR to absolute path at startup ──────────────────────────
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, "uploads");

console.log(`[Server] UPLOADS_DIR  → ${UPLOADS_DIR}`);
console.log(`[Server] Version      → v${APP_VERSION}`);
console.log(`[Server] NODE_ENV     → ${process.env.NODE_ENV || "development"}`);

// ── Pre-create ALL required directories synchronously before anything else ───
// This must happen before routes are loaded so multer's destination callback
// always finds the directory.  Using recursive: true means it's a safe no-op
// if the dirs already exist (e.g. on warm restarts).
const REQUIRED_DIRS = [
  UPLOADS_DIR,
  path.join(UPLOADS_DIR, "cleaned"),
  path.join(UPLOADS_DIR, "engineered"),
  path.join(UPLOADS_DIR, "models"),
  path.join(UPLOADS_DIR, "rag"),
];

REQUIRED_DIRS.forEach((dir) => {
  try {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[Server] Dir ready: ${dir}`);
  } catch (e) {
    // /tmp paths on Render are always writable; warn but don't crash.
    console.warn(`[Server] Could not create dir ${dir}: ${e.message}`);
  }
});

// ── CORS ──────────────────────────────────────────────────────────────────────
const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({
  origin:         corsOrigin,
  methods:        ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
console.log(`[Server] CORS_ORIGIN  → ${corsOrigin}`);

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ── Serve uploaded files statically ──────────────────────────────────────────
app.use("/uploads", express.static(UPLOADS_DIR));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/users",    userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/ml",       mlRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/contact",  contactRoutes);
app.use("/api/rag",      ragRoutes);

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) =>
  res.json({
    status:      "OK",
    message:     "AgenticIQ API running.",
    version:     APP_VERSION,
    uploadsDir:  UPLOADS_DIR,
    mongoState:  mongoose.connection.readyState, // 1 = connected
  })
);

app.get("/", (req, res) =>
  res.json({ message: "AgenticIQ Backend", version: APP_VERSION })
);

// ── Global JSON error handler ─────────────────────────────────────────────────
// Catches anything that falls through (including multer errors that slip past
// the route-level handler).  Always returns JSON, never HTML — this is the fix
// for the "Unexpected token '<', <!DOCTYPE..." error on the frontend.
app.use((err, req, res, next) => {
  console.error("[Server] Unhandled error:", err.message);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error.",
    error:   process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

// ── 404 handler — also returns JSON, not HTML ────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` });
});

// ── MongoDB + Listen ──────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, "0.0.0.0", () =>
      console.log(`🚀 AgenticIQ v${APP_VERSION} → http://0.0.0.0:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("❌ MongoDB failed:", err.message);
    process.exit(1);
  });