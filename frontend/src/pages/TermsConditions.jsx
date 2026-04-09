import React, { useState } from "react";
import { motion } from "framer-motion";
import { FiFileText } from "react-icons/fi";

const sections = [
  { title: "1. Acceptance of Terms",        content: "By accessing or using AgenticIQ, you agree to be bound by these Terms. If you do not agree, please do not use the platform." },
  { title: "2. Use of the Platform",        content: "You agree to use AgenticIQ only for lawful business analysis purposes. You may not attempt to reverse-engineer the ML models, extract training data, circumvent authentication, or use the platform to cause harm." },
  { title: "3. User Accounts",              content: "You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. Notify us immediately of any unauthorised access." },
  { title: "4. Data & Content",             content: "You retain ownership of all CSV data you upload. By uploading, you grant AgenticIQ a limited licence to process that data solely to provide the analysis pipeline. We do not use your data to train shared models." },
  { title: "5. Intellectual Property",      content: "The AgenticIQ platform — including the 4-agent pipeline, ML training logic, PKL-based scoring system, and SHAP integration — is the exclusive property of AgenticIQ. You may not reproduce or create derivative works without written consent." },
  { title: "6. ML Model Accuracy",          content: "AgenticIQ uses ML models (RF, XGBoost, LightGBM) tuned on your dataset. Model accuracy depends on your data quality. Recommendations are decision-support tools — they do not constitute professional business, financial, or legal advice." },
  { title: "7. Disclaimers",                content: "AgenticIQ is provided 'as is' without warranties of any kind. We do not guarantee uninterrupted service or that results will be accurate for every business decision." },
  { title: "8. Limitation of Liability",    content: "To the fullest extent permitted by law, AgenticIQ shall not be liable for indirect, incidental, special, or consequential damages arising from your use of the platform." },
  { title: "9. Termination",                content: "We reserve the right to suspend or terminate access at our discretion if these Terms are violated." },
  { title: "10. Governing Law",             content: "These Terms are governed by the laws of India. Disputes are subject to the exclusive jurisdiction of the courts in Vijayawada, Andhra Pradesh." },
  { title: "11. Contact",                   content: "For questions about these Terms, contact us at bharathbandi13925@gmail.com." },
];

function TermCard({ s, i }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.04, duration: 0.5 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="rounded-2xl p-6 transition-all duration-300 relative overflow-hidden cursor-default"
      style={{
        background: "linear-gradient(145deg,rgba(255,255,255,0.045),rgba(255,255,255,0.01))",
        border: `1px solid ${hovered ? "rgba(0,224,255,0.32)" : "rgba(255,255,255,0.08)"}`,
        boxShadow: hovered ? "0 8px 40px rgba(0,224,255,0.1)" : "none",
      }}
    >
      {hovered && (
        <>
          <motion.div className="absolute inset-0 rounded-2xl" style={{ background: "radial-gradient(circle at 100% 0%, rgba(0,224,255,0.08), transparent 65%)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
          <motion.div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg,transparent,#00E0FF,transparent)" }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.35 }} />
          <motion.div className="absolute right-0 top-4 bottom-4 w-0.5 rounded-full" style={{ background: "linear-gradient(180deg,transparent,#00E0FF,transparent)" }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.3 }} />
        </>
      )}
      <div className="relative z-10">
        <motion.h2
          className="text-white font-bold text-base mb-3 flex items-center gap-2"
          animate={hovered ? { x: 2 } : { x: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.span
            className="text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0"
            style={{ background: "rgba(0,224,255,0.12)", color: "#00E0FF", border: "1px solid rgba(0,224,255,0.22)" }}
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

export default function TermsConditions() {
  return (
    <div className="min-h-screen text-[#E6E6EB] pt-28 pb-20 px-6 relative overflow-hidden" style={{ background: "#05050A" }}>
      <motion.div className="absolute pointer-events-none" style={{ width: 400, height: 400, right: "4%", top: "5%", background: "#00E0FF", opacity: 0.05, borderRadius: "50%", filter: "blur(90px)" }}
        animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 9, repeat: Infinity }} />
      <motion.div className="absolute pointer-events-none" style={{ width: 300, height: 300, left: "5%", bottom: "20%", background: "#7C5CFF", opacity: 0.045, borderRadius: "50%", filter: "blur(80px)" }}
        animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 11, repeat: Infinity, delay: 1.5 }} />

      <div className="max-w-3xl mx-auto relative z-10">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <div className="flex items-center gap-4 mb-8">
            <motion.div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#00E0FF,#7C5CFF)" }}
              animate={{ boxShadow: ["0 0 20px rgba(0,224,255,0.4)", "0 0 40px rgba(124,92,255,0.5)", "0 0 20px rgba(0,224,255,0.4)"] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <FiFileText className="text-white" size={22} />
            </motion.div>
            <div>
              <motion.span className="text-xs font-mono text-[#00E0FF] tracking-widest uppercase block mb-1" animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 2, repeat: Infinity }}>Legal</motion.span>
              <h1 className="text-3xl md:text-4xl font-black text-white leading-none">Terms & Conditions</h1>
            </div>
          </div>

          <motion.div
            className="flex items-center gap-3 mb-8 p-4 rounded-2xl relative overflow-hidden"
            style={{ background: "linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <motion.div className="w-2 h-2 rounded-full bg-[#00E0FF]" animate={{ scale: [1, 1.5, 1], boxShadow: ["0 0 0 0 #00E0FF40", "0 0 0 8px #00E0FF00"] }} transition={{ duration: 2, repeat: Infinity }} />
            <p className="text-[#9CA3AF] text-sm">Effective date: March 14, 2026 · AgenticIQ Platform</p>
          </motion.div>

          <p className="text-[#9CA3AF] leading-relaxed mb-10 text-sm">Please read these Terms carefully before using AgenticIQ. They constitute a legally binding agreement between you and AgenticIQ.</p>

          <div className="space-y-4">
            {sections.map((s, i) => <TermCard key={i} s={s} i={i} />)}
          </div>
        </motion.div>
      </div>
    </div>
  );
}