const express = require("express");
const router  = express.Router();
const {
  approveStrategy,
  rejectStrategy,
  getSHAP,
  getFeedbackHistory,
} = require("../controllers/FeedbackController");

router.post("/approve",    approveStrategy);
router.post("/reject",     rejectStrategy);
router.post("/shap",       getSHAP);
router.get("/:projectId",  getFeedbackHistory);

module.exports = router;