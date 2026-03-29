// ════════════════════════════════════════════════════════════════
//  User.js
// ════════════════════════════════════════════════════════════════
const mongoose2 = require("mongoose");
 
const userSchema = new mongoose2.Schema({
  uid:   { type: String, required: true, unique: true },
  name:  { type: String, required: true, trim: true },
  email: {
    type:      String,
    required:  true,
    unique:    true,
    lowercase: true,
    trim:      true,
  },
  provider: {
    type:    String,
    enum:    ["email", "google"],
    default: "email",
  },
}, { timestamps: true });
 
module.exports = mongoose2.model("User", userSchema);