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

// FIX: Consistent version constant used throughout
const APP_VERSION = "15.0.0";

// Resolve UPLOADS_DIR to absolute path at startup
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, "uploads");

console.log(`[Server] UPLOADS_DIR  → ${UPLOADS_DIR}`);
console.log(`[Server] Version      → v${APP_VERSION}`);

// FIX: Added cleanedDir — was missing, causing Python microservice to fail on
//      first clean run when the directory doesn't yet exist.
const cleanedDir    = path.join(UPLOADS_DIR, "cleaned");
const engineeredDir = path.join(UPLOADS_DIR, "engineered");
const modelsDir     = path.join(UPLOADS_DIR, "models");
const ragDir        = path.join(UPLOADS_DIR, "rag");

[UPLOADS_DIR, cleanedDir, engineeredDir, modelsDir, ragDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── CORS ─────────────────────────────────────────────────────────────────────
const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({
  origin: corsOrigin,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use("/uploads", express.static(UPLOADS_DIR));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/users",    userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/ml",       mlRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/contact",  contactRoutes);
app.use("/api/rag",      ragRoutes);

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) =>
  res.json({
    status:  "OK",
    message: "AgenticIQ API running.",
    version: APP_VERSION,
  })
);

app.get("/", (req, res) =>
  res.json({ message: "AgenticIQ Backend", version: APP_VERSION })
);

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[Server] Unhandled error:", err.message);
  res.status(500).json({ message: "Internal server error.", error: err.message });
});

// ── MongoDB + Listen ──────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () =>
      console.log(`🚀 AgenticIQ v${APP_VERSION} Server → http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("❌ MongoDB failed:", err.message);
    process.exit(1);
  });