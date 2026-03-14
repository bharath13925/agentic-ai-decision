const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const userRoutes = require("./routes/UserRoutes");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

/* ─── Middleware ─── */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ─── Routes ─── */
app.use("/api/users", userRoutes);

/* ─── Health Check ─── */
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "AgenticIQ API is running." });
});

/* ─── Root ─── */
app.get("/", (req, res) => {
  res.json({ message: "AgenticIQ Backend API", version: "1.0.0" });
});

/* ─── MongoDB + Start Server ─── */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });