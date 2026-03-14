const express = require("express");
const router = express.Router();
const {
  registerUser,
  getUserByUid,
  getAllUsers,
} = require("../controllers/UserController");

// POST /api/users/register  → save user after Firebase signup
router.post("/register", registerUser);

// GET  /api/users/:uid      → fetch user profile by Firebase UID
router.get("/:uid", getUserByUid);

// GET  /api/users           → get all users
router.get("/", getAllUsers);

module.exports = router;