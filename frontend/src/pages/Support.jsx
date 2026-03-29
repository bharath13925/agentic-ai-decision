import React, { useState } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useRef } from "react";
import {
  FiMail, FiMessageSquare, FiCpu, FiZap, FiShield,
  FiDatabase, FiSend, FiCheck, FiAlertTriangle,
} from "react-icons/fi";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const faqs = [
  { q: "How do I upload my datasets?", a: "On Step 1, upload three CSV files: Ecommerce, Marketing, and Advertising. All three are required. The system deduplicates by SHA-256 hash — if you re-upload the same files, it skips processing and jumps to Step 2." },
  { q: "What objectives are available and how do they differ?", a: "Four objectives — each trains a different ML model: Increase Revenue (high_value_purchase target), Reduce Cart Abandonment (cart_abandoned among add-to-cart sessions), Improve Conversion Rate (purchased across ALL sessions), Optimize Marketing ROI (above-median revenue purchasers). Changing objective requires retraining." },
  { q: "What is Mode 1 vs Mode 2?", a: "Mode 1 (User Defined): You input your strategy — ad budget %, discount %, channel, segment. The system validates it with PKL files and shows where you rank and why via per-feature explanations. Mode 2 (Auto AI): Agents analyse KPI gaps and generate 3–5 optimal strategies autonomously." },
  { q: "Why do I need to retrain when I change the objective?", a: "Each objective uses a different training target and row filter. Using models trained for the wrong objective produces biased recommendations. The system blocks this with an objective mismatch check." },
  { q: "What are learnedMechanismStrengths?", a: "After training, the ensemble's feature importance is mapped to strategy types. These replace hardcoded constants — all projections are now data-driven from YOUR model." },
  { q: "How is the final strategy ranked?", a: "The Decision Agent loads .pkl files and calls predict_proba with a unique feature vector for EACH strategy. The score = KPI_improvement × per-strategy PKL probability × learned objective weights. Zero formula bias." },
  { q: "How do I save my Project ID?", a: "The Project ID (AI_XXXXXXXX) is shown once after upload on Step 1. Copy it immediately using the Copy button. You need it to resume your project from the home page." },
  { q: "What does the SHAP explainability panel show?", a: "After agents run, SHAP loads the XGBoost .pkl file and computes per-feature importance for your top strategy. It shows which features most influence the model's prediction and whether they push probability up or down." },
];

const categories = [
  { icon: FiDatabase, title: "Data Upload",       desc: "CSV formats, deduplication, feature engineering", color: "#7C5CFF" },
  { icon: FiCpu,      title: "ML Training",       desc: "Hyperparameter tuning, objectives, model files",  color: "#00E0FF" },
  { icon: FiZap,      title: "Agent Pipeline",    desc: "PKL scoring, SHAP, Mode 1 vs Mode 2",             color: "#FF4FD8" },
  { icon: FiShield,   title: "Account & Security",desc: "Firebase auth, data privacy, project IDs",        color: "#22C55E" },
];

/* ── Animated laser input ── */
function LaserInput({ label, name, type = "text", placeholder, value, onChange, required, accentColor = "#7C5CFF" }) {
  const [focused, setFocused] = useState(false);
  return (
    <motion.div className="relative" whileHover={{ scale: 1.01 }}>
      {/* Glow aura */}
      <motion.div className="absolute -inset-px rounded-xl pointer-events-none"
        animate={{ opacity: focused ? 0.55 : 0 }}
        style={{ background: `linear-gradient(135deg,${accentColor}55,${accentColor}22)`, filter: "blur(6px)", borderRadius: "0.75rem" }} />

      <div className="relative rounded-xl overflow-hidden"
        style={{
          border: `1px solid ${focused ? `${accentColor}70` : "rgba(255,255,255,0.1)"}`,
          background: focused ? `${accentColor}0D` : "rgba(255,255,255,0.04)",
          transition: "all 0.22s ease",
        }}>
        {/* Scanning beam */}
        {focused && (
          <motion.div className="absolute left-0 right-0 h-px pointer-events-none"
            style={{ background: `linear-gradient(90deg,transparent,${accentColor},transparent)`, boxShadow: `0 0 8px ${accentColor}` }}
            animate={{ top: ["0%", "100%", "0%"] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }} />
        )}
        {/* Top accent */}
        <motion.div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          animate={{ opacity: focused ? 1 : 0, scaleX: focused ? 1 : 0 }}
          style={{ background: `linear-gradient(90deg,transparent,${accentColor},transparent)` }}
          transition={{ duration: 0.28 }} />

        <input name={name} type={type} placeholder={placeholder} value={value}
          onChange={onChange} required={required}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          className="w-full px-4 py-3.5 text-sm text-[#E6E6EB] placeholder-[#9CA3AF]/60 focus:outline-none bg-transparent cursor-text" />
      </div>

      {/* Bottom glow */}
      <motion.div className="absolute -bottom-px left-6 right-6 h-px rounded-full pointer-events-none"
        animate={{ opacity: focused ? 1 : 0, scaleX: focused ? 1 : 0 }}
        style={{ background: `linear-gradient(90deg,transparent,${accentColor},transparent)`, boxShadow: `0 0 10px ${accentColor}` }}
        transition={{ duration: 0.28 }} />
    </motion.div>
  );
}

function LaserTextarea({ name, placeholder, value, onChange, required, rows = 4, accentColor = "#7C5CFF" }) {
  const [focused, setFocused] = useState(false);
  return (
    <motion.div className="relative" whileHover={{ scale: 1.01 }}>
      <motion.div className="absolute -inset-px rounded-xl pointer-events-none"
        animate={{ opacity: focused ? 0.55 : 0 }}
        style={{ background: `linear-gradient(135deg,${accentColor}55,${accentColor}22)`, filter: "blur(6px)", borderRadius: "0.75rem" }} />
      <div className="relative rounded-xl overflow-hidden"
        style={{
          border: `1px solid ${focused ? `${accentColor}70` : "rgba(255,255,255,0.1)"}`,
          background: focused ? `${accentColor}0D` : "rgba(255,255,255,0.04)",
          transition: "all 0.22s ease",
        }}>
        {focused && (
          <motion.div className="absolute left-0 right-0 h-px pointer-events-none"
            style={{ background: `linear-gradient(90deg,transparent,${accentColor},transparent)` }}
            animate={{ top: ["0%", "100%", "0%"] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }} />
        )}
        <motion.div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          animate={{ opacity: focused ? 1 : 0, scaleX: focused ? 1 : 0 }}
          style={{ background: `linear-gradient(90deg,transparent,${accentColor},transparent)` }}
          transition={{ duration: 0.28 }} />
        <textarea name={name} placeholder={placeholder} value={value} onChange={onChange}
          required={required} rows={rows}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          className="w-full px-4 py-3.5 text-sm text-[#E6E6EB] placeholder-[#9CA3AF]/60 focus:outline-none bg-transparent cursor-text resize-none" />
      </div>
      <motion.div className="absolute -bottom-px left-6 right-6 h-px rounded-full pointer-events-none"
        animate={{ opacity: focused ? 1 : 0, scaleX: focused ? 1 : 0 }}
        style={{ background: `linear-gradient(90deg,transparent,${accentColor},transparent)`, boxShadow: `0 0 10px ${accentColor}` }}
        transition={{ duration: 0.28 }} />
    </motion.div>
  );
}

function FAQItem({ q, a, index }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref}
      initial={{ opacity: 0, y: 24 }} animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      className="border rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer"
      style={{
        background: "linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))",
        borderColor: open ? "rgba(124,92,255,0.45)" : "rgba(255,255,255,0.08)",
        boxShadow: open ? "0 0 30px rgba(124,92,255,0.12), inset 0 1px 0 rgba(124,92,255,0.15)" : "none",
      }}>
      <motion.button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-5 text-left gap-4"
        whileHover={{ backgroundColor: "rgba(124,92,255,0.05)" }}>
        <span className="text-[#E6E6EB] font-semibold text-sm leading-relaxed">{q}</span>
        <motion.div animate={{ rotate: open ? 45 : 0, scale: open ? 1.2 : 1 }}
          transition={{ duration: 0.28 }}
          style={{ color: open ? "#FF4FD8" : "#7C5CFF" }}
          className="shrink-0 text-xl font-light">+</motion.div>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.32, ease: "easeInOut" }}>
            <motion.div className="px-6 pb-5 pt-2 text-[#9CA3AF] text-sm leading-relaxed border-t border-white/6"
              initial={{ y: -8 }} animate={{ y: 0 }} transition={{ duration: 0.28 }}>
              {a}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ════════════════════════════════════════════
   CONTACT FORM — calls POST /api/contact
════════════════════════════════════════════ */
function ContactForm() {
  const [form, setForm]       = useState({ name: "", email: "", message: "" });
  const [status, setStatus]   = useState("idle"); // idle | loading | success | error
  const [errMsg, setErrMsg]   = useState("");

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("loading");
    setErrMsg("");
    try {
      const res  = await fetch(`${API}/contact`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:    form.name.trim(),
          email:   form.email.trim(),
          message: form.message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send.");
      setStatus("success");
      setForm({ name: "", email: "", message: "" });
      setTimeout(() => setStatus("idle"), 5000);
    } catch (err) {
      setErrMsg(err.message);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4500);
    }
  };

  const accentColors = { name: "#7C5CFF", email: "#00E0FF", message: "#FF4FD8" };

  return (
    <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }} transition={{ duration: 0.6 }}
      className="rounded-3xl p-8 relative overflow-hidden"
      style={{ background: "linear-gradient(145deg,rgba(255,255,255,0.045),rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.08)" }}>

      {/* Ambient glow */}
      <motion.div className="absolute inset-0 rounded-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle at 25% 25%, #7C5CFF10, transparent 60%)" }}
        animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 3.5, repeat: Infinity }} />

      {/* Top shimmer line */}
      <div className="absolute top-0 left-0 right-0 h-px overflow-hidden">
        <div className="h-full" style={{ background: "linear-gradient(90deg,transparent,#7C5CFF,#FF4FD8,transparent)" }} />
        <motion.div className="absolute inset-0" animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.7),transparent)", width: "25%" }} />
      </div>

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-6">
          <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 3.5, repeat: Infinity }}>
            <FiMessageSquare className="text-[#7C5CFF]" size={20} />
          </motion.div>
          <h2 className="text-white font-bold text-lg">Send a Message</h2>
          <span className="text-[10px] font-mono text-[#9CA3AF] ml-auto">→ bharathbandi13925@gmail.com</span>
        </div>

        {/* Success */}
        <AnimatePresence>
          {status === "success" && (
            <motion.div initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 px-4 py-3.5 rounded-xl text-sm flex items-center gap-3"
              style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.28)", color: "#4ade80" }}>
              <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 0.55 }}>
                <FiCheck size={16} />
              </motion.div>
              <div>
                <p className="font-semibold">Message sent!</p>
                <p className="text-[10px] text-[#22C55E]/70 font-mono mt-0.5">We'll respond within 24h.</p>
              </div>
            </motion.div>
          )}
          {status === "error" && (
            <motion.div initial={{ opacity: 0, y: -10, height: 0, x: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto", x: [0, -5, 5, -4, 4, 0] }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ x: { duration: 0.35 } }}
              className="mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.28)", color: "#f87171" }}>
              <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 0.4 }}>
                <FiAlertTriangle size={14} />
              </motion.div>
              {errMsg}
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <LaserInput name="name" type="text" placeholder="Your full name"
            value={form.name} onChange={handleChange} required
            accentColor={accentColors.name} />

          <LaserInput name="email" type="email" placeholder="Your email address"
            value={form.email} onChange={handleChange} required
            accentColor={accentColors.email} />

          <LaserTextarea name="message" placeholder="Describe your question or feedback…"
            value={form.message} onChange={handleChange} required rows={4}
            accentColor={accentColors.message} />

          <motion.button type="submit" disabled={status === "loading"}
            whileHover={{ scale: 1.025, boxShadow: "0 0 40px rgba(124,92,255,0.6)" }}
            whileTap={{ scale: 0.975 }}
            className="w-full py-3.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 relative overflow-hidden disabled:opacity-55"
            style={{ background: "linear-gradient(135deg,#7C5CFF,#FF4FD8)" }}>
            <motion.div className="absolute inset-0" animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
              style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)" }} />
            <motion.div className="absolute inset-0 rounded-xl"
              animate={{ opacity: [0, 0.14, 0] }} transition={{ duration: 2.5, repeat: Infinity }}
              style={{ background: "radial-gradient(circle at 50% 0%,rgba(255,255,255,0.6),transparent 65%)" }} />

            <span className="relative flex items-center gap-2">
              {status === "loading" ? (
                <>
                  {[0, 1, 2].map(i => (
                    <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-white"
                      animate={{ y: [0, -7, 0] }} transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.15 }} />
                  ))}
                  <span>Sending…</span>
                </>
              ) : (
                <>
                  <FiSend size={15} />
                  Send Message
                </>
              )}
            </span>
          </motion.button>
        </form>
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════
   MAIN SUPPORT PAGE
════════════════════════════════════════════ */
export default function Support() {
  return (
    <div className="min-h-screen text-[#E6E6EB] pt-28 pb-20 px-6 relative overflow-hidden" style={{ background: "#05050A" }}>
      {/* Ambient orbs */}
      <motion.div className="absolute pointer-events-none"
        style={{ width: 420, height: 420, left: "3%", top: "8%", background: "#7C5CFF", opacity: 0.065, borderRadius: "50%", filter: "blur(85px)" }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.055, 0.09, 0.055] }}
        transition={{ duration: 8, repeat: Infinity }} />
      <motion.div className="absolute pointer-events-none"
        style={{ width: 360, height: 360, right: "3%", bottom: "18%", background: "#00E0FF", opacity: 0.055, borderRadius: "50%", filter: "blur(85px)" }}
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 10, repeat: Infinity, delay: 1.5 }} />

      <div className="max-w-5xl mx-auto relative z-10">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }} className="text-center mb-16">
          <motion.span className="text-xs font-mono text-[#7C5CFF] tracking-[0.3em] uppercase mb-4 block"
            animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 2.2, repeat: Infinity }}>
            ✦ Help Center ✦
          </motion.span>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4">
            How can we{" "}
            <span style={{ background: "linear-gradient(135deg,#7C5CFF,#00E0FF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              help you?
            </span>
          </h1>
          <p className="text-[#9CA3AF] max-w-xl mx-auto text-sm leading-relaxed">AgenticIQ-specific documentation, FAQ, and direct support.</p>
        </motion.div>

        {/* Categories */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {categories.map(({ icon: Icon, title, desc, color }, i) => (
            <motion.div key={title}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              whileHover={{ scale: 1.05, y: -6, boxShadow: `0 16px 50px ${color}25` }}
              className="rounded-2xl p-5 group cursor-pointer relative overflow-hidden transition-all"
              style={{ background: "linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.08)" }}>
              <motion.div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-350"
                style={{ background: `radial-gradient(circle at 20% 20%, ${color}15, transparent 65%)` }} />
              <motion.div className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `linear-gradient(90deg,transparent,${color},transparent)` }} />
              <motion.div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 relative z-10"
                style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
                whileHover={{ rotate: [0, -10, 10, 0], scale: 1.15, boxShadow: `0 0 20px ${color}60` }}
                transition={{ duration: 0.45 }}>
                <Icon size={18} />
              </motion.div>
              <h3 className="text-[#E6E6EB] font-bold text-sm mb-1 relative z-10 group-hover:text-white transition-colors">{title}</h3>
              <p className="text-[#9CA3AF] text-xs leading-relaxed relative z-10">{desc}</p>
            </motion.div>
          ))}
        </div>

        {/* FAQ */}
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-16">
          <div className="text-center mb-10">
            <span className="text-xs font-mono text-[#FF4FD8] tracking-[0.3em] uppercase mb-3 block">✦ FAQ ✦</span>
            <h2 className="text-3xl font-black text-white">Technical Questions Answered</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => <FAQItem key={i} {...faq} index={i} />)}
          </div>
        </motion.div>

        {/* Contact + Info */}
        <div className="grid md:grid-cols-2 gap-8">
          <ContactForm />

          {/* Info side */}
          <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6 }}
            className="space-y-4">

            {/* Email card */}
            <motion.div className="rounded-2xl p-6 relative overflow-hidden"
              style={{ background: "linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.08)" }}
              whileHover={{ borderColor: "rgba(0,224,255,0.35)", boxShadow: "0 8px 40px rgba(0,224,255,0.1)" }}>
              <div className="flex items-center gap-3 mb-3">
                <motion.div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(0,224,255,0.12)", border: "1px solid rgba(0,224,255,0.22)", color: "#00E0FF" }}
                  animate={{ boxShadow: ["0 0 0 0 #00E0FF30", "0 0 0 10px #00E0FF00"] }}
                  transition={{ duration: 2, repeat: Infinity }}>
                  <FiMail size={16} />
                </motion.div>
                <div>
                  <p className="text-white text-sm font-semibold">Email Support</p>
                  <p className="text-[#9CA3AF] text-xs">Responds within 24 hours</p>
                </div>
              </div>
              <motion.a href="mailto:bharathbandi13925@gmail.com"
                className="text-[#00E0FF] text-sm hover:underline inline-block"
                whileHover={{ x: 3 }}>
                bharathbandi13925@gmail.com
              </motion.a>
            </motion.div>

            {/* Quick reference */}
            <motion.div className="rounded-2xl p-6 relative overflow-hidden"
              style={{ background: "linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))", border: "1px solid rgba(124,92,255,0.2)" }}
              whileHover={{ borderColor: "rgba(124,92,255,0.4)", boxShadow: "0 8px 40px rgba(124,92,255,0.1)" }}>
              <motion.div className="absolute inset-0 rounded-2xl"
                style={{ background: "radial-gradient(circle at 25% 25%, #7C5CFF10, transparent 60%)" }}
                animate={{ opacity: [0.4, 0.9, 0.4] }} transition={{ duration: 3, repeat: Infinity }} />
              <h3 className="text-white font-semibold text-sm mb-3 relative z-10">Quick Reference</h3>
              <div className="space-y-2 relative z-10">
                {[
                  ["Project ID format", "AI_XXXXXXXX"],
                  ["ML models",        "RF + XGBoost + LightGBM"],
                  ["Explainability",   "SHAP (XGBoost PKL)"],
                  ["Auth",             "Firebase (email + Google)"],
                  ["Backend",          "Node.js + FastAPI + MongoDB"],
                ].map(([label, val]) => (
                  <motion.div key={label} className="flex justify-between text-xs" whileHover={{ x: 3 }}>
                    <span className="text-[#9CA3AF]">{label}</span>
                    <motion.span className="text-[#E6E6EB] font-mono"
                      whileHover={{ color: "#7C5CFF" }} transition={{ duration: 0.18 }}>{val}</motion.span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Privacy badge */}
            <motion.div className="rounded-2xl p-5 relative overflow-hidden"
              style={{ background: "linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))", border: "1px solid rgba(34,197,94,0.2)" }}
              whileHover={{ borderColor: "rgba(34,197,94,0.4)", boxShadow: "0 8px 35px rgba(34,197,94,0.1)" }}>
              <motion.p className="text-[#22C55E] text-xs font-mono uppercase tracking-wider mb-2"
                animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 2.5, repeat: Infinity }}>
                ✓ Data Privacy
              </motion.p>
              <p className="text-[#9CA3AF] text-xs leading-relaxed">
                Your CSV data is stored per-project under your Firebase UID. No data is shared with other users or used to train shared models.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}