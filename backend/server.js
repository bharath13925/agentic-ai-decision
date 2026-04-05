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

// FIX ENG-4: resolve UPLOADS_DIR to absolute path at startup
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, "uploads");

console.log(`[Server] UPLOADS_DIR → ${UPLOADS_DIR}`);

const cleanedDir    = path.join(UPLOADS_DIR, "cleaned");
const engineeredDir = path.join(UPLOADS_DIR, "engineered");
const modelsDir     = path.join(UPLOADS_DIR, "models");
const ragDir        = path.join(UPLOADS_DIR, "rag");

[UPLOADS_DIR, cleanedDir, engineeredDir, modelsDir, ragDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOADS_DIR));

app.use("/api/users",    userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/ml",       mlRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/contact",  contactRoutes);
app.use("/api/rag",      ragRoutes);

app.get("/api/health", (req, res) =>
  res.json({ status: "OK", message: "AgenticIQ API running.", version: "13.6.3" })
);
app.get("/", (req, res) =>
  res.json({ message: "AgenticIQ Backend", version: "13.6.3" })
);

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () =>
      console.log(`🚀 AgenticIQ v13.6.3 Server → http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("❌ MongoDB failed:", err.message);
    process.exit(1);
  });