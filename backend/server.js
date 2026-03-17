const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
const dotenv   = require("dotenv");
const path     = require("path");
const fs       = require("fs");

const userRoutes    = require("./routes/UserRoutes");
const projectRoutes = require("./routes/ProjectRoutes");

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 5000;

/* ─── Ensure uploads + uploads/cleaned folders exist ─── */
const uploadsDir        = path.join(__dirname, "uploads");
const uploadsCleanedDir = path.join(__dirname, "uploads/cleaned");
if (!fs.existsSync(uploadsDir))        fs.mkdirSync(uploadsDir,        { recursive: true });
if (!fs.existsSync(uploadsCleanedDir)) fs.mkdirSync(uploadsCleanedDir, { recursive: true });

/* ─── Middleware ─── */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ─── Static file serving (optional) ─── */
app.use("/uploads", express.static(uploadsDir));

/* ─── API Routes ─── */
app.use("/api/users",    userRoutes);
app.use("/api/projects", projectRoutes);

/* ─── Health check ─── */
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "AgenticIQ API running." });
});

/* ─── Root ─── */
app.get("/", (req, res) => {
  res.json({ message: "AgenticIQ Backend", version: "1.0.0" });
});

/* ─── MongoDB + Start server ─── */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () =>
      console.log(`🚀 Server running → http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("❌ MongoDB failed:", err.message);
    process.exit(1);
  });