import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiEye, FiBarChart2, FiCpu, FiZap, FiChevronDown, FiSend,
} from "react-icons/fi";
import { MdEmail } from "react-icons/md";
import animationVideo from "../assets/animation_video.mp4";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.7, delay, ease: "easeOut" },
});

/* ─── Agent Canvas ─── */
function AgentCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animId;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);
    const AGENTS = [
      { label: "Observer",   color: "#7C5CFF", x: 0.2,  y: 0.35 },
      { label: "Analyst",    color: "#00E0FF", x: 0.45, y: 0.22 },
      { label: "Simulation", color: "#FF4FD8", x: 0.7,  y: 0.38 },
      { label: "Decision",   color: "#7C5CFF", x: 0.52, y: 0.62 },
    ];
    const PARTICLES = Array.from({ length: 80 }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0003, vy: (Math.random() - 0.5) * 0.0003,
      r: Math.random() * 1.5 + 0.5, alpha: Math.random() * 0.5 + 0.2,
    }));
    let t = 0;
    const draw = () => {
      t += 0.005;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width, H = canvas.height;
      PARTICLES.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
        ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(124,92,255,${p.alpha})`; ctx.fill();
      });
      const agents = AGENTS.map((a, i) => ({
        ...a, px: a.x * W + Math.sin(t + i) * 18, py: a.y * H + Math.cos(t * 0.7 + i) * 12,
      }));
      for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
          const a = agents[i], b = agents[j];
          const pulse = (Math.sin(t * 2 + i + j) + 1) / 2;
          const grad = ctx.createLinearGradient(a.px, a.py, b.px, b.py);
          grad.addColorStop(0, `${a.color}88`); grad.addColorStop(1, `${b.color}88`);
          ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py);
          ctx.strokeStyle = grad; ctx.lineWidth = 1.2;
          ctx.globalAlpha = 0.3 + pulse * 0.4; ctx.stroke(); ctx.globalAlpha = 1;
          const progress = (Math.sin(t * 1.5 + i * 1.3 + j) + 1) / 2;
          ctx.beginPath();
          ctx.arc(a.px + (b.px - a.px) * progress, a.py + (b.py - a.py) * progress, 3, 0, Math.PI * 2);
          ctx.fillStyle = "#00E0FF"; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
        }
      }
      agents.forEach((a) => {
        const grd = ctx.createRadialGradient(a.px, a.py, 0, a.px, a.py, 40);
        grd.addColorStop(0, `${a.color}55`); grd.addColorStop(1, "transparent");
        ctx.beginPath(); ctx.arc(a.px, a.py, 40, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();
        ctx.beginPath(); ctx.arc(a.px, a.py, 10, 0, Math.PI * 2);
        ctx.fillStyle = a.color; ctx.shadowColor = a.color; ctx.shadowBlur = 20;
        ctx.fill(); ctx.shadowBlur = 0;
        ctx.font = "bold 11px 'Courier New', monospace";
        ctx.fillStyle = "#E6E6EB"; ctx.globalAlpha = 0.85; ctx.textAlign = "center";
        ctx.fillText(a.label, a.px, a.py + 26); ctx.globalAlpha = 1;
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-60" />;
}

/* ─── Feature data ─── */
const featureData = [
  { icon: <FiEye size={22} />,       title: "Observer Agent",   desc: "Continuously monitors incoming business data streams, detecting patterns and anomalies in real-time.", color: "#7C5CFF", tag: "Real-time" },
  { icon: <FiBarChart2 size={22} />, title: "Analyst Agent",    desc: "Applies ensemble ML models — XGBoost, LightGBM, Random Forest — with SHAP explainability.", color: "#00E0FF", tag: "XGBoost · SHAP" },
  { icon: <FiCpu size={22} />,       title: "Simulation Agent", desc: "Runs forward simulations across multiple scenarios to predict probable business outcomes.", color: "#FF4FD8", tag: "Predictive" },
  { icon: <FiZap size={22} />,       title: "Decision Agent",   desc: "Synthesizes multi-agent insights into ranked, explainable strategic recommendations.", color: "#7C5CFF", tag: "Strategy" },
];

function FeatureCard({ icon, title, desc, color, tag, delay }) {
  return (
    <motion.div
      {...fadeUp(delay)}
      whileHover={{ scale: 1.04, boxShadow: `0 0 40px ${color}33`, borderColor: `${color}60` }}
      whileTap={{ scale: 0.97 }}
      className="relative group bg-[#111118] border border-white/10 rounded-2xl p-6 cursor-pointer transition-all duration-300 overflow-hidden"
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
        style={{ background: `radial-gradient(circle at 30% 30%, ${color}15, transparent 70%)` }} />
      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 text-white shadow-lg"
        style={{ background: `linear-gradient(135deg, ${color}cc, ${color}55)`, boxShadow: `0 0 20px ${color}44` }}>
        {icon}
      </div>
      <span className="inline-block text-xs font-mono px-2 py-0.5 rounded-full border mb-3"
        style={{ color, borderColor: `${color}44`, background: `${color}15` }}>
        {tag}
      </span>
      <h3 className="text-[#E6E6EB] font-bold text-base mb-2">{title}</h3>
      <p className="text-[#9CA3AF] text-sm leading-relaxed">{desc}</p>
    </motion.div>
  );
}

const faqs = [
  { q: "What is Agentic AI?", a: "Agentic AI refers to autonomous AI agents that observe, reason, simulate, and decide — working collaboratively in a pipeline to solve complex tasks without constant human input." },
  { q: "How does the decision system work?", a: "The Observer feeds data to the Analyst (ML models), which hands off to Simulation for scenario modeling. The Decision Agent synthesizes these into ranked strategy recommendations with SHAP explanations." },
  { q: "Is it real-time capable?", a: "Yes — the Observer Agent is designed for streaming data ingestion. The MERN stack backend supports WebSocket updates for live decision dashboards." },
  { q: "What ML models are used?", a: "Random Forest, XGBoost, and LightGBM form an ensemble. SHAP (SHapley Additive exPlanations) is used for model interpretability on every prediction." },
  { q: "What tech stack powers the platform?", a: "Frontend: React (Vite) + TailwindCSS. Backend: Node.js + Express + MongoDB. ML layer: Python with scikit-learn, XGBoost, LightGBM, SHAP." },
];

function FAQItem({ q, a, index }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      {...fadeUp(index * 0.08)}
      className="border border-white/10 rounded-xl overflow-hidden bg-[#111118] hover:border-[#7C5CFF]/30 transition-colors duration-300"
    >
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-6 py-4 text-left">
        <span className="text-[#E6E6EB] font-medium text-sm">{q}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.3 }}
          className="text-[#7C5CFF] ml-4 shrink-0">
          <FiChevronDown size={18} />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: "easeInOut" }}>
            <div className="px-6 pb-5 text-[#9CA3AF] text-sm leading-relaxed border-t border-white/5 pt-3">{a}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Main ─── */
export default function LandingPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });

  return (
    <div className="min-h-screen text-[#E6E6EB] font-sans" style={{ background: "#0B0B0F" }}>

      {/* ══ HERO ══ */}
      <section id="home" className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
        {/* Video bg */}
        <div className="absolute inset-0 z-0">
          <video src={animationVideo} autoPlay loop muted playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-[#0B0B0F]/55" />
        </div>

        {/* Unicorn-style glow burst */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-1 pointer-events-none">
          <div className="w-96 h-40 rounded-full blur-3xl opacity-80"
            style={{ background: "radial-gradient(ellipse at center, #ffffff 0%, #c084fc 25%, #7C5CFF 50%, transparent 75%)", transform: "translateY(40%)" }} />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-175 h-72 blur-3xl opacity-50"
            style={{ background: "radial-gradient(ellipse at center, #7C5CFF 0%, #FF4FD8 40%, transparent 70%)", transform: "translateY(30%)" }} />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-225 h-48 blur-3xl opacity-25"
            style={{ background: "radial-gradient(ellipse at center, #00E0FF 0%, transparent 65%)", transform: "translateY(50%)" }} />
        </div>

        <AgentCanvas />

        <div className="absolute inset-0 z-1 opacity-5 pointer-events-none"
          style={{ backgroundImage: `radial-gradient(circle, #7C5CFF 1px, transparent 1px)`, backgroundSize: "40px 40px" }} />

        {/* Content */}
        <div className="relative z-10 text-center px-6 max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#7C5CFF]/40 bg-[#7C5CFF]/10 text-xs text-[#7C5CFF] font-mono mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00E0FF] animate-pulse" />
            Multi-Agent · XGBoost · SHAP · MERN
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.1, ease: "easeOut" }}
            className="text-5xl md:text-7xl font-black leading-tight tracking-tight mb-6">
            <span className="text-white">Agentic</span>
            <span style={{ background: "linear-gradient(90deg, #7C5CFF, #00E0FF, #FF4FD8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>IQ</span>
            <br />
            <span className="text-white text-3xl md:text-4xl font-bold">Decision Intelligence Platform</span>
          </motion.h1>

        <p className="text-[#9CA3AF] text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Four autonomous agents — Observer, Analyst, Simulation & Decision —
            working together to transform your business data into{" "}
            <span className="text-[#00E0FF]">explainable strategies</span>.
        </p>

          {/* Stats */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
            className="flex items-center justify-center gap-8 mt-16 flex-wrap">
            {[{ val: "4", label: "AI Agents" }, { val: "3", label: "ML Models" }, { val: "100%", label: "Explainable" }, { val: "MERN", label: "Stack" }].map(({ val, label }) => (
              <div key={label} className="text-center">
                <div className="text-2xl font-black text-white">{val}</div>
                <div className="text-xs text-[#9CA3AF] mt-0.5">{label}</div>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
          <span className="text-[#9CA3AF] text-xs">Scroll to explore</span>
          <motion.div animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
            <FiChevronDown className="text-[#7C5CFF]" size={20} />
          </motion.div>
        </motion.div>
      </section>

      {/* ══ FEATURES ══ */}
      <section id="features" className="relative py-28 px-6">
        <div className="absolute inset-0 opacity-30"
          style={{ background: "radial-gradient(circle at 50% 0%, #7c5cff18, transparent 60%)" }} />
        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div {...fadeUp()} className="text-center mb-16">
            <span className="text-xs font-mono text-[#7C5CFF] tracking-widest uppercase mb-3 block">Multi-Agent Architecture</span>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
              Four Agents.{" "}
              <span style={{ background: "linear-gradient(90deg, #00E0FF, #FF4FD8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                One Decision.
              </span>
            </h2>
            <p className="text-[#9CA3AF] max-w-xl mx-auto">
              Each agent specializes in a stage of the intelligence pipeline,
              collectively enabling robust, explainable business decisions.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {featureData.map((f, i) => <FeatureCard key={f.title} {...f} delay={i * 0.1} />)}
          </div>
          {/* Pipeline */}
          <motion.div {...fadeUp(0.3)} className="mt-14 flex flex-col md:flex-row items-center justify-center gap-3 md:gap-0">
            {["Observer", "Analyst", "Simulation", "Decision"].map((agent, i) => (
              <div key={agent} className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white border-2"
                    style={{ borderColor: featureData[i].color, background: `${featureData[i].color}22`, boxShadow: `0 0 16px ${featureData[i].color}44` }}>
                    {i + 1}
                  </div>
                  <span className="text-[10px] text-[#9CA3AF] mt-1 font-mono">{agent}</span>
                </div>
                {i < 3 && <div className="hidden md:block w-16 h-0.5 bg-linear-to-r from-[#7C5CFF] to-[#00E0FF] opacity-50 mb-4" />}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══ LOGIN / SIGNUP CTA ══ */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-10">
            <span className="text-xs font-mono text-[#7C5CFF] tracking-widest uppercase mb-3 block">
              Get Access
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-3">
              Ready to make smarter decisions?
            </h2>
            <p className="text-[#9CA3AF] text-sm max-w-md mx-auto">
              Create a free account or login to your existing one and start
              running your first agentic analysis.
            </p>
          </motion.div>

          <motion.div
            {...fadeUp(0.15)}
            className="relative bg-[#111118] border border-white/10 rounded-2xl p-10 overflow-hidden"
            style={{ background: "radial-gradient(circle at 50% -20%, #7c5cff18, transparent 60%), #111118" }}
          >
            {/* Background glow blobs */}
            <div className="absolute top-0 left-1/4 w-48 h-48 bg-[#7C5CFF]/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-[#00E0FF]/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col sm:flex-row items-center justify-center gap-5">
              {/* Login Button */}
              <motion.button
                onClick={() => navigate("/login")}
                whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(124,92,255,0.5)" }}
                whileTap={{ scale: 0.97 }}
                className="w-full sm:w-56 py-4 rounded-2xl font-bold text-white text-base bg-linear-to-r from-[#7C5CFF] to-[#00E0FF] shadow-[0_0_20px_rgba(124,92,255,0.35)] transition-all duration-300"
              >
                Login
              </motion.button>

              {/* Divider */}
              <span className="text-[#9CA3AF] text-sm font-medium hidden sm:block">or</span>
              <span className="text-[#9CA3AF] text-sm font-medium sm:hidden">— or —</span>

              {/* Signup Button */}
              <motion.button
                onClick={() => navigate("/signup")}
                whileHover={{ scale: 1.05, borderColor: "#00E0FF88", color: "#fff" }}
                whileTap={{ scale: 0.97 }}
                className="w-full sm:w-56 py-4 rounded-2xl font-bold text-[#E6E6EB] text-base border-2 border-white/20 hover:bg-white/5 transition-all duration-300"
              >
                Create Account
              </motion.button>
            </div>
            
          </motion.div>
        </div>
      </section>

      {/* ══ FAQ ══ */}
      <section id="faq" className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-14">
            <span className="text-xs font-mono text-[#00E0FF] tracking-widest uppercase mb-3 block">Got Questions?</span>
            <h2 className="text-4xl md:text-5xl font-black text-white">Frequently Asked</h2>
          </motion.div>
          <div className="flex flex-col gap-3">
            {faqs.map((faq, i) => <FAQItem key={i} {...faq} index={i} />)}
          </div>
        </div>
      </section>

      {/* ══ CONTACT ══ */}
      <section id="contact" className="py-24 px-6">
        <div className="max-w-2xl mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-14">
            <span className="text-xs font-mono text-[#FF4FD8] tracking-widest uppercase mb-3 block">Reach Out</span>
            <h2 className="text-4xl md:text-5xl font-black text-white">Let's Connect</h2>
            <p className="text-[#9CA3AF] text-sm mt-3">Have a question or want to collaborate? Send us a message.</p>
          </motion.div>

          <motion.div {...fadeUp(0.1)} className="bg-[#111118] border border-white/10 rounded-2xl p-8">
            <div className="flex flex-col gap-4">
              <input
                type="text" placeholder="Your name" value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-[#E6E6EB] placeholder-[#9CA3AF] focus:outline-none focus:border-[#7C5CFF]/60 transition-all"
              />
              <input
                type="email" placeholder="Email address" value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-[#E6E6EB] placeholder-[#9CA3AF] focus:outline-none focus:border-[#7C5CFF]/60 transition-all"
              />
              <textarea
                rows={4} placeholder="Your message..." value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-[#E6E6EB] placeholder-[#9CA3AF] focus:outline-none focus:border-[#7C5CFF]/60 transition-all resize-none"
              />
              <motion.button
                whileHover={{ scale: 1.03, boxShadow: "0 0 30px rgba(124,92,255,0.5)" }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-white bg-linear-to-r from-[#7C5CFF] to-[#FF4FD8] shadow-[0_0_20px_rgba(124,92,255,0.35)] transition-all"
              >
                <FiSend size={16} />
                Send Message
              </motion.button>
            </div>

            {/* Minimal contact info */}
            <div className="mt-6 pt-5 border-t border-white/10 flex items-center gap-3 text-[#9CA3AF]">
              <MdEmail className="text-[#00E0FF] shrink-0" size={18} />
              <a href="mailto:bharathbandi13925@gmail.com" className="text-sm hover:text-[#00E0FF] transition-colors">
                bharathbandi13925@gmail.com
              </a>
            </div>
          </motion.div>
        </div>
      </section>

    </div>
  );
}