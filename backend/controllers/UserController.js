const User = require("../models/User");

/* ─────────────────────────────────────────
   POST /api/users/register
   Called after Firebase signup succeeds.
   Saves name, email, uid, provider to MongoDB.
───────────────────────────────────────── */
const registerUser = async (req, res) => {
  try {
    const { uid, name, email, provider } = req.body;

    if (!uid || !name || !email) {
      return res.status(400).json({ message: "uid, name and email are required." });
    }

    // Check if user already exists (e.g. Google re-signup)
    const existing = await User.findOne({ uid });
    if (existing) {
      return res.status(200).json({ message: "User already exists.", user: existing });
    }

    const user = await User.create({
      uid,
      name,
      email,
      provider: provider || "email",
    });

    return res.status(201).json({ message: "User registered successfully.", user });
  } catch (error) {
    console.error("registerUser error:", error.message);
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
};

/* ─────────────────────────────────────────
   GET /api/users/:uid
   Fetch user profile by Firebase UID.
   Used by Dashboard to show welcome name.
───────────────────────────────────────── */
const getUserByUid = async (req, res) => {
  try {
    const { uid } = req.params;
    const user = await User.findOne({ uid });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error("getUserByUid error:", error.message);
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
};

/* ─────────────────────────────────────────
   GET /api/users
   Get all users (admin/debug use)
───────────────────────────────────────── */
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-__v");
    return res.status(200).json({ users });
  } catch (error) {
    console.error("getAllUsers error:", error.message);
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
};

module.exports = { registerUser, getUserByUid, getAllUsers };