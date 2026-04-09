import React, { useState } from "react";
import { motion } from "framer-motion";
import { FiShield } from "react-icons/fi";

const sections = [
  { title: "1. Information We Collect",   content: "We collect information you provide when creating an account (name, email, password) and the CSV datasets you upload for analysis. We also collect usage data such as log files and interaction data to improve the service." },
  { title: "2. How We Use Your Information", content: "Your data is used solely to provide the AgenticIQ pipeline: cleaning CSVs, engineering features, training ML models on your dataset, and generating strategy recommendations. We do not use your data to train shared or global models." },
  { title: "3. Data Storage & Security",  content: "Data is stored securely using Firebase (Google Cloud). All files are associated with your Firebase UID and inaccessible to other users. ML model .pkl files are saved per-project to MongoDB GridFS under a unique project ID." },
  { title: "4. Data Sharing",             content: "We do not sell, trade, or rent your personal information or business data. We do not share your uploaded datasets with third parties. Aggregated, anonymised usage statistics may be used to improve the platform." },
  { title: "5. Project Data",             content: "Each project's CSV files, engineered datasets, trained .pkl files (stored in GridFS), KPI summaries, and agent results are stored under your project ID. Duplicate datasets are detected by SHA-256 hash." },
  { title: "6. Authentication",           content: "AgenticIQ uses Firebase Authentication supporting email/password and Google OAuth. We do not store raw passwords — Firebase handles all credential management with industry-standard encryption." },
  { title: "7. Your Rights",              content: "You may request access to, correction of, or deletion of your data at any time by contacting us at the email below." },
  { title: "8. Changes to This Policy",   content: "We may update this Privacy Policy periodically. Changes will be posted on this page with an updated effective date." },
  { title: "9. Contact",                  content: "For privacy-related questions, contact us at bharathbandi13925@gmail.com." },
];

function PolicyCard({ s, i }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05, duration: 0.5 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="rounded-2xl p-6 transition-all duration-300 relative overflow-hidden cursor-default"
      style={{
        background: "linear-gradient(145deg,rgba(255,255,255,0.045),rgba(255,255,255,0.01))",
        border: `1px solid ${hovered ? "rgba(124,92,255,0.35)" : "rgba(255,255,255,0.08)"}`,
        boxShadow: hovered ? "0 8px 40px rgba(124,92,255,0.12)" : "none",
      }}
    >
      {hovered && (
        <>
          <motion.div className="absolute inset-0 rounded-2xl" style={{ background: "radial-gradient(circle at 0% 50%, rgba(124,92,255,0.1), transparent 65%)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
          <motion.div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg,transparent,#7C5CFF,transparent)" }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.35 }} />
          <motion.div className="absolute left-0 top-4 bottom-4 w-0.5 rounded-full" style={{ background: "linear-gradient(180deg,transparent,#7C5CFF,transparent)" }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.3 }} />
        </>
      )}
      <div className="relative z-10">
        <motion.h2
          className="text-white font-bold text-base mb-3 flex items-center gap-2"
          animate={hovered ? { x: 3 } : { x: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.span
            className="text-[10px] font-mono px-2 py-0.5 rounded-full"
            style={{ background: "rgba(124,92,255,0.15)", color: "#7C5CFF", border: "1px solid rgba(124,92,255,0.25)" }}
          >
            {String(i + 1).padStart(2, "0")}
          </motion.span>
          {s.title.replace(/^\d+\.\s/, "")}
        </motion.h2>
        <p className="text-[#9CA3AF] text-sm leading-relaxed">{s.content}</p>
      </div>
    </motion.div>
  );
}

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen text-[#E6E6EB] pt-28 pb-20 px-6 relative overflow-hidden" style={{ background: "#05050A" }}>
      <motion.div className="absolute pointer-events-none" style={{ width: 400, height: 400, left: "3%", top: "5%", background: "#7C5CFF", opacity: 0.065, borderRadius: "50%", filter: "blur(90px)" }}
        animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 8, repeat: Infinity }} />
      <motion.div className="absolute pointer-events-none" style={{ width: 300, height: 300, right: "5%", bottom: "15%", background: "#00E0FF", opacity: 0.04, borderRadius: "50%", filter: "blur(80px)" }}
        animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 10, repeat: Infinity, delay: 2 }} />

      <div className="max-w-3xl mx-auto relative z-10">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <div className="flex items-center gap-4 mb-8">
            <motion.div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#7C5CFF,#00E0FF)" }}
              animate={{ boxShadow: ["0 0 20px rgba(124,92,255,0.4)", "0 0 40px rgba(0,224,255,0.5)", "0 0 20px rgba(124,92,255,0.4)"] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <FiShield className="text-white" size={22} />
            </motion.div>
            <div>
              <motion.span className="text-xs font-mono text-[#7C5CFF] tracking-widest uppercase block mb-1" animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 2, repeat: Infinity }}>Legal</motion.span>
              <h1 className="text-3xl md:text-4xl font-black text-white leading-none">Privacy Policy</h1>
            </div>
          </div>

          <motion.div
            className="flex items-center gap-3 mb-8 p-4 rounded-2xl relative overflow-hidden"
            style={{ background: "linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <motion.div className="w-2 h-2 rounded-full bg-[#22C55E]" animate={{ scale: [1, 1.5, 1], boxShadow: ["0 0 0 0 #22C55E40", "0 0 0 8px #22C55E00"] }} transition={{ duration: 2, repeat: Infinity }} />
            <p className="text-[#9CA3AF] text-sm">Effective date: March 14, 2026 · AgenticIQ Platform</p>
          </motion.div>

          <p className="text-[#9CA3AF] leading-relaxed mb-10 text-sm">AgenticIQ is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your data.</p>

          <div className="space-y-4">
            {sections.map((s, i) => <PolicyCard key={i} s={s} i={i} />)}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default PrivacyPolicy;