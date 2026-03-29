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
const ragRoutes      = require("./routes/RagRoutes");       // ← v13.5 RAG + Ollama

const app  = express();
const PORT = process.env.PORT || 5000;

/* ── Ensure required directories exist ── */
const uploadsDir    = path.join(__dirname, "uploads");
const cleanedDir    = path.join(__dirname, "uploads/cleaned");
const engineeredDir = path.join(__dirname, "uploads/engineered");
const modelsDir     = path.join(__dirname, "uploads/models");

[uploadsDir, cleanedDir, engineeredDir, modelsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/* ── Middleware ── */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadsDir));

/* ── Routes ── */
app.use("/api/users",    userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/ml",       mlRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/contact",  contactRoutes);
app.use("/api/rag",      ragRoutes);                        // ← v13.5 RAG + Ollama

/* ── Health check ── */
app.get("/api/health", (req, res) =>
  res.json({ status: "OK", message: "AgenticIQ API running.", version: "13.5.0" })
);
app.get("/", (req, res) =>
  res.json({ message: "AgenticIQ Backend", version: "13.5.0" })
);

/* ── MongoDB + Start ── */
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () =>
      console.log(`🚀 AgenticIQ v13.5 Server → http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("❌ MongoDB failed:", err.message);
    process.exit(1);
  });