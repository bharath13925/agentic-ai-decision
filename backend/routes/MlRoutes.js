const express = require("express");
const router  = express.Router();
const {
  trainModels,
  getMLResult,
  runAgentPipeline,
  getAgentResult,
} = require("../controllers/MlController");

router.post("/train/:projectId",       trainModels);
router.get("/result/:projectId",       getMLResult);
router.post("/agent/:projectId",       runAgentPipeline);
router.get("/agent-result/:projectId", getAgentResult);

module.exports = router;