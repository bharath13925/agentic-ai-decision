// ════════════════════════════════════════════════════════════════
//  Contact.js
// ════════════════════════════════════════════════════════════════
const mongoose = require("mongoose");
 
const contactSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  email:     { type: String, required: true, trim: true, lowercase: true },
  message:   { type: String, required: true },
  sentAt:    { type: Date, default: Date.now },
  ipAddress: { type: String },
});
 
module.exports = mongoose.model("Contact", contactSchema);