import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FaGithub, FaLinkedin, FaInstagram } from "react-icons/fa";
import { FiCpu, FiArrowRight, FiZap, FiEye, FiBarChart2 } from "react-icons/fi";
import { MdEmail } from "react-icons/md";

export default function Footer() {
  const navigate = useNavigate();
  const [hoveredSocial, setHoveredSocial] = useState(null);

  const socials = [
    { icon: <FaGithub size={16} />, label: "GitHub", href: "https://github.com/bharath13925", color: "#9CA3AF" },
    { icon: <FaLinkedin size={16} />, label: "LinkedIn", href: "https://www.linkedin.com/in/bandi-bharath-a3a97b2a3/", color: "#0077B5" },
    { icon: <FaInstagram size={16} />, label: "Instagram", href: "https://www.instagram.com/bharath_13925/", color: "#FF4FD8" },
  ];

  const pipeline = [
    { label: "Observer Agent", color: "#7C5CFF", desc: "KPI Detection", icon: FiEye },
    { label: "Analyst Agent", color: "#00E0FF", desc: "Root Cause", icon: FiBarChart2 },
    { label: "Simulation Agent", color: "#FF4FD8", desc: "Strategy Gen", icon: FiCpu },
    { label: "Decision Agent", color: "#22C55E", desc: "PKL Validation", icon: FiZap },
  ];

  const legal = [
    { label: "Privacy Policy", path: "/privacy" },
    { label: "Terms & Conditions", path: "/terms" },
    { label: "Support", path: "/support" },
  ];

  return (
    <footer className="relative border-t border-white/8 overflow-hidden" style={{ background: "#05050A" }}>
      {/* Top shimmer line */}
      <div className="absolute top-0 left-0 right-0 h-px overflow-hidden">
        <div className="h-full" style={{ background: "linear-gradient(90deg,transparent,#7C5CFF,#FF4FD8,#00E0FF,transparent)" }} />
        <motion.div className="absolute inset-0"
          animate={{ x: ["-100%", "100%"] }} transition={{ duration: 3.5, repeat: Infinity, ease: "linear" }}
          style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.8),transparent)", width: "30%" }} />
      </div>

      {/* Top glow */}
      <motion.div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-24 opacity-12 blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(ellipse,#7C5CFF,transparent 70%)" }}
        animate={{ opacity: [0.08, 0.18, 0.08], scale: [1, 1.1, 1] }}
        transition={{ duration: 4, repeat: Infinity }} />

      <div className="max-w-7xl mx-auto px-6 pt-16 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">

          {/* Brand */}
          <div className="md:col-span-1">
            <motion.div className="flex items-center gap-3 mb-5 cursor-pointer group"
              onClick={() => navigate("/")} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <motion.div className="w-9 h-9 rounded-xl flex items-center justify-center relative overflow-hidden"
                style={{ background: "linear-gradient(135deg,#7C5CFF,#00E0FF)" }}
                whileHover={{ boxShadow: "0 0 30px rgba(124,92,255,0.7)", rotate: 8 }}
                animate={{ boxShadow: ["0 0 15px rgba(124,92,255,0.4)", "0 0 30px rgba(0,224,255,0.4)", "0 0 15px rgba(124,92,255,0.4)"] }}
                transition={{ duration: 3, repeat: Infinity }}>
                <motion.div className="absolute inset-0"
                  animate={{ x: ["-100%", "100%"] }} transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                  style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)" }} />
                <FiCpu className="text-white text-base relative z-10" />
              </motion.div>
              <span className="text-white font-black text-lg">
                <motion.span style={{ color: "#7C5CFF" }} animate={{ color: ["#7C5CFF", "#9B79FF", "#7C5CFF"] }} transition={{ duration: 3.5, repeat: Infinity }}>Agentic</motion.span>
                <motion.span style={{ color: "#00E0FF" }} animate={{ color: ["#00E0FF", "#4DFDFF", "#00E0FF"] }} transition={{ duration: 3.5, repeat: Infinity, delay: 0.5 }}>IQ</motion.span>
              </span>
            </motion.div>

            <p className="text-[#9CA3AF] text-sm leading-relaxed mb-5 max-w-xs">4-agent AI decision intelligence platform. Upload 3 CSVs, train 3 ML models on your data, get PKL-validated strategy recommendations.</p>

            <motion.a href="mailto:bharathbandi13925@gmail.com"
              className="flex items-center gap-2 text-sm mb-5 group w-fit"
              whileHover={{ x: 4 }}>
              <motion.div animate={{ rotate: [0, -10, 10, 0] }} transition={{ duration: 3, repeat: Infinity }}>
                <MdEmail className="text-[#00E0FF] shrink-0" size={16} />
              </motion.div>
              <span className="text-[#9CA3AF] group-hover:text-[#00E0FF] transition-colors">bharathbandi13925@gmail.com</span>
            </motion.a>

            <div className="flex gap-2">
              {socials.map(({ icon, label, href, color }) => (
                <motion.a key={label} href={href} target="_blank" rel="noopener noreferrer"
                  whileHover={{ scale: 1.2, y: -4, boxShadow: `0 8px 24px ${color}40` }}
                  whileTap={{ scale: 0.9 }}
                  onHoverStart={() => setHoveredSocial(label)}
                  onHoverEnd={() => setHoveredSocial(null)}
                  aria-label={label}
                  className="w-9 h-9 rounded-xl border border-white/10 bg-white/4 flex items-center justify-center transition-all duration-300 relative overflow-hidden"
                  style={{ color: hoveredSocial === label ? color : "#9CA3AF", borderColor: hoveredSocial === label ? `${color}60` : "rgba(255,255,255,0.1)" }}>
                  {hoveredSocial === label && (
                    <motion.div className="absolute inset-0" style={{ background: `${color}15` }}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
                  )}
                  <span className="relative z-10">{icon}</span>
                </motion.a>
              ))}
            </div>
          </div>

          {/* Pipeline */}
          <div className="md:col-span-1">
            <h4 className="text-[11px] font-bold mb-5 uppercase tracking-widest text-[#9CA3AF]">Pipeline</h4>
            <div className="space-y-3">
              {pipeline.map(({ label, color, desc, icon: Icon }, i) => (
                <motion.div key={label}
                  initial={{ opacity: 0, x: -15 }} whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.07 }}
                  whileHover={{ x: 6 }}
                  className="flex items-center gap-3 group cursor-default">
                  <motion.div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${color}15`, border: `1px solid ${color}25` }}
                    whileHover={{ scale: 1.2, boxShadow: `0 0 16px ${color}60` }}>
                    <Icon size={13} style={{ color }} />
                  </motion.div>
                  <span className="text-[#E6E6EB] text-sm group-hover:text-white transition-colors">{label}</span>
                  <span className="text-[10px] font-mono text-[#9CA3AF] ml-auto">{desc}</span>
                  <motion.div className="w-1.5 h-1.5 rounded-full shrink-0 opacity-0 group-hover:opacity-100"
                    style={{ background: color }}
                    animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
                </motion.div>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-white/6">
              <p className="text-[#9CA3AF] text-[10px] font-mono uppercase tracking-wider mb-2">ML Stack</p>
              <div className="flex gap-2 flex-wrap">
                {["Random Forest", "XGBoost", "LightGBM", "SHAP"].map((t, i) => (
                  <motion.span key={t}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-white/8 text-[#9CA3AF] bg-white/3 cursor-default"
                    whileHover={{ scale: 1.08, borderColor: "rgba(124,92,255,0.4)", color: "#E6E6EB", backgroundColor: "rgba(124,92,255,0.08)" }}
                    transition={{ duration: 0.18 }}>
                    {t}
                  </motion.span>
                ))}
              </div>
            </div>
          </div>

          {/* Legal + CTA */}
          <div>
            <h4 className="text-[11px] font-bold mb-5 uppercase tracking-widest text-[#9CA3AF]">Legal</h4>
            <ul className="space-y-2 mb-8">
              {legal.map(({ label, path }) => (
                <li key={label}>
                  <motion.button onClick={() => navigate(path)}
                    whileHover={{ x: 5, color: "#E6E6EB" }}
                    className="text-[#9CA3AF] text-sm transition-all flex items-center gap-1.5 group">
                    <motion.span className="w-3.5 h-3.5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <FiArrowRight size={11} style={{ color: "#7C5CFF" }} />
                    </motion.span>
                    {label}
                  </motion.button>
                </li>
              ))}
            </ul>
            <motion.button onClick={() => navigate("/signup")}
              whileHover={{ scale: 1.04, boxShadow: "0 0 35px rgba(124,92,255,0.55)" }}
              whileTap={{ scale: 0.97 }}
              className="w-full py-3 rounded-xl font-semibold text-white text-sm relative overflow-hidden"
              style={{ background: "linear-gradient(135deg,#7C5CFF,#FF4FD8)" }}>
              <motion.div className="absolute inset-0" animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)" }} />
              <motion.div className="absolute inset-0" animate={{ opacity: [0, 0.12, 0] }}
                transition={{ duration: 2.2, repeat: Infinity }}
                style={{ background: "radial-gradient(circle at 50% 0%,rgba(255,255,255,0.6),transparent 65%)" }} />
              <span className="relative">Start Free Analysis →</span>
            </motion.button>
          </div>
        </div>

        <motion.div className="h-px mb-6"
          style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)" }} />

        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <motion.p className="text-[#9CA3AF] text-xs font-mono"
            animate={{ opacity: [0.5, 0.9, 0.5] }} transition={{ duration: 4, repeat: Infinity }}>
            © 2026 AgenticIQ. All rights reserved.
          </motion.p>
          <p className="text-[#9CA3AF] text-xs font-mono">Built with RF · XGBoost · LightGBM · SHAP · MERN</p>
        </div>
      </div>
    </footer>
  );
}