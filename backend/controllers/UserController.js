const User = require("../models/User");

const registerUser = async (req, res) => {
  try {
    const { uid, name, email, provider } = req.body;
    if (!uid || !name || !email)
      return res.status(400).json({ message: "uid, name and email are required." });

    const existing = await User.findOne({ uid });
    if (existing)
      return res.status(200).json({ message: "User already exists.", user: existing });

    const user = await User.create({
      uid,
      name,
      email,
      provider: provider || "email",
    });
    return res.status(201).json({ message: "User registered successfully.", user });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
};

const getUserByUid = async (req, res) => {
  try {
    const { uid } = req.params;
    const user    = await User.findOne({ uid });
    if (!user) return res.status(404).json({ message: "User not found." });
    return res.status(200).json({ user });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-__v");
    return res.status(200).json({ users });
  } catch (error) {
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
};

module.exports = { registerUser, getUserByUid, getAllUsers };