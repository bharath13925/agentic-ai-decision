import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useScroll, useTransform, useInView, useSpring, useMotionValue } from "framer-motion";
import { FiChevronDown, FiSend, FiArrowRight, FiZap, FiCpu, FiBarChart2, FiEye, FiActivity, FiShield, FiDatabase, FiTrendingUp, FiTarget, FiCheck, FiAlertTriangle } from "react-icons/fi";
import { MdEmail } from "react-icons/md";
import animationVideo from "../assets/animation_video.mp4";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

function useScrollReveal(margin = "-80px") {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin });
  return [ref, isInView];
}

/* ── Animated counter ── */
function Counter({ to, suffix = "" }) {
  const [count, setCount] = useState(0);
  const [ref, inView] = useScrollReveal();
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = to / 60;
    const timer = setInterval(() => {
      start += step;
      if (start >= to) { setCount(to); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [inView, to]);
  return <span ref={ref}>{count}{suffix}</span>;
}

/* ── Neural canvas ── */
function NeuralCanvas() {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animId;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);
    const onMouse = (e) => { const r = canvas.getBoundingClientRect(); mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener("mousemove", onMouse);
    const NODES = Array.from({ length: 55 }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0004,
      vy: (Math.random() - 0.5) * 0.0004,
      r: Math.random() * 2.5 + 1,
      pulse: Math.random() * Math.PI * 2,
    }));
    const COLORS = ["#7C5CFF", "#00E0FF", "#FF4FD8", "#22C55E"];
    let t = 0;
    const draw = () => {
      t += 0.008;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width, H = canvas.height;
      const mx = mouseRef.current.x, my = mouseRef.current.y;
      NODES.forEach(n => { n.x += n.vx; n.y += n.vy; if (n.x < 0 || n.x > 1) n.vx *= -1; if (n.y < 0 || n.y > 1) n.vy *= -1; n.pulse += 0.02; });
      for (let i = 0; i < NODES.length; i++) {
        for (let j = i + 1; j < NODES.length; j++) {
          const a = NODES[i], b = NODES[j];
          const dx = (a.x - b.x) * W, dy = (a.y - b.y) * H;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 160) {
            const alpha = (1 - dist / 160) * 0.35;
            const grad = ctx.createLinearGradient(a.x * W, a.y * H, b.x * W, b.y * H);
            grad.addColorStop(0, `rgba(124,92,255,${alpha})`); grad.addColorStop(1, `rgba(0,224,255,${alpha})`);
            ctx.beginPath(); ctx.moveTo(a.x * W, a.y * H); ctx.lineTo(b.x * W, b.y * H);
            ctx.strokeStyle = grad; ctx.lineWidth = 0.8; ctx.stroke();
            const prog = (Math.sin(t * 1.5 + i * 0.7 + j * 0.3) + 1) / 2;
            ctx.beginPath(); ctx.arc(a.x * W + (b.x * W - a.x * W) * prog, a.y * H + (b.y * H - a.y * H) * prog, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0,224,255,${alpha * 2})`; ctx.fill();
          }
        }
      }
      NODES.forEach(n => {
        const dx = n.x * W - mx, dy = n.y * H - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          const force = (1 - dist / 120) * 0.6;
          ctx.beginPath(); ctx.moveTo(n.x * W, n.y * H); ctx.lineTo(mx, my);
          ctx.strokeStyle = `rgba(255,79,216,${force * 0.4})`; ctx.lineWidth = 1; ctx.stroke();
        }
      });
      NODES.forEach((n, i) => {
        const pulse = (Math.sin(n.pulse) + 1) / 2;
        const color = COLORS[i % COLORS.length];
        const grd = ctx.createRadialGradient(n.x * W, n.y * H, 0, n.x * W, n.y * H, n.r * 4);
        grd.addColorStop(0, color + "99"); grd.addColorStop(1, "transparent");
        ctx.beginPath(); ctx.arc(n.x * W, n.y * H, n.r * 4, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();
        ctx.beginPath(); ctx.arc(n.x * W, n.y * H, n.r + pulse * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10 + pulse * 8; ctx.fill(); ctx.shadowBlur = 0;
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); canvas.removeEventListener("mousemove", onMouse); };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-55 pointer-events-auto" />;
}

/* ── Floating orb ── */
function FloatingOrb({ color, size, x, y, delay = 0 }) {
  return (
    <motion.div className="absolute rounded-full blur-3xl pointer-events-none"
      style={{ width: size, height: size, left: x, top: y, background: color, opacity: 0.18 }}
      animate={{ y: [0, -30, 0], scale: [1, 1.12, 1], opacity: [0.13, 0.22, 0.13] }}
      transition={{ duration: 8 + delay, repeat: Infinity, ease: "easeInOut", delay }} />
  );
}

/* ── Spark burst ── */
function SparkBurst({ count = 12 }) {
  const sparks = useRef(
    Array.from({ length: count }, (_, i) => ({
      id: i, x: Math.random() * 100, y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      color: ["#7C5CFF", "#00E0FF", "#FF4FD8", "#22C55E"][i % 4],
      dur: 8 + Math.random() * 10, delay: Math.random() * 6,
    }))
  ).current;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {sparks.map(s => (
        <motion.div key={s.id} className="absolute rounded-full"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, background: s.color }}
          animate={{ y: [0, -60, 0], opacity: [0, 0.7, 0], scale: [0.3, 1.5, 0.3] }}
          transition={{ duration: s.dur, repeat: Infinity, delay: s.delay }} />
      ))}
    </div>
  );
}

/* ── Pipeline step ── */
function PipelineStep({ n, label, color, icon: Icon, active }) {
  return (
    <motion.div className="flex flex-col items-center gap-2 flex-1"
      animate={active ? { scale: [1, 1.08, 1] } : {}}
      transition={{ duration: 2, repeat: Infinity, delay: n * 0.5 }}>
      <motion.div className="w-12 h-12 rounded-2xl flex items-center justify-center border-2 relative overflow-hidden"
        style={{ borderColor: color, background: `${color}18`, boxShadow: active ? `0 0 28px ${color}66` : `0 0 12px ${color}22` }}>
        <Icon size={20} style={{ color }} />
        {active && (
          <>
            <motion.div className="absolute inset-0"
              style={{ background: `linear-gradient(135deg, ${color}30, transparent)` }}
              animate={{ opacity: [0.4, 0.9, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }} />
            <motion.div className="absolute inset-0 rounded-2xl border-2"
              style={{ borderColor: color }}
              animate={{ scale: [1, 1.6], opacity: [0.8, 0] }}
              transition={{ duration: 1.4, repeat: Infinity }} />
          </>
        )}
      </motion.div>
      <span className="text-white text-xs font-bold">{label}</span>
      <span className="text-[10px] font-mono" style={{ color }}>0{n + 1}</span>
    </motion.div>
  );
}

/* ── Agent Card ── */
const AGENTS = [
  { id: "observer", icon: FiEye, color: "#7C5CFF", tag: "Agent 01", title: "Observer Agent", subtitle: "Real-time KPI Detection", desc: "Ingests your 3 CSV datasets and computes REAL KPIs — CTR, conversion rate, cart abandonment, and ROI — directly from your uploaded data. Sets dataset-specific benchmarks, not industry averages.", bullets: ["Computes real CTR from advertising data", "Measures actual cart abandonment rate", "Flags critical vs warning vs healthy KPIs", "Dataset-specific severity thresholds"] },
  { id: "analyst", icon: FiBarChart2, color: "#00E0FF", tag: "Agent 02", title: "Analyst Agent", subtitle: "Root Cause Diagnosis", desc: "Ranks your KPI gaps by actual severity from the data. Maps which KPIs are broken, diagnoses root causes, and ranks fix directions — all based on measured values from your uploaded dataset.", bullets: ["Severity-ranked fix directions", "Root cause per broken KPI", "Real gap vs benchmark analysis", "Objective-aligned diagnosis"] },
  { id: "simulation", icon: FiCpu, color: "#FF4FD8", tag: "Agent 03", title: "Simulation Agent", subtitle: "Strategy Projection", desc: "Generates 3–6 strategies with projected KPI metrics. Uses data-driven mechanism strengths learned from your model's feature importance — not hardcoded constants.", bullets: ["Learned mechanism strengths from feature importance", "Real gap × ML confidence projections", "Mode 1: Your custom strategy inputs", "Mode 2: Fully automated AI strategies"] },
  { id: "decision", icon: FiZap, color: "#22C55E", tag: "Agent 04", title: "Decision Agent", subtitle: "PKL-Validated Ranking", desc: "Loads actual .pkl model files and calls predict_proba for EACH strategy individually. Every strategy gets its own feature vector → its own ML score. No shared average, no formula bias.", bullets: ["Per-strategy predict_proba from PKL files", "Feature-level explanation of user inputs", "Objective-matched weighted scoring", "Confidence grounded in model accuracy"] },
];

function AgentCard({ agent, index }) {
  const [ref, inView] = useScrollReveal();
  const [hovered, setHovered] = useState(false);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotX = useSpring(useTransform(mouseY, [-1, 1], [4, -4]), { damping: 30, stiffness: 200 });
  const rotY = useSpring(useTransform(mouseX, [-1, 1], [-4, 4]), { damping: 30, stiffness: 200 });
  const Icon = agent.icon;

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(((e.clientX - rect.left) / rect.width - 0.5) * 2);
    mouseY.set(((e.clientY - rect.top) / rect.height - 0.5) * 2);
  };
  const handleMouseLeave = () => { mouseX.set(0); mouseY.set(0); };

  return (
    <motion.div ref={ref}
      initial={{ opacity: 0, y: 60, rotateX: 15 }}
      animate={inView ? { opacity: 1, y: 0, rotateX: 0 } : {}}
      transition={{ duration: 0.7, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformStyle: "preserve-3d", rotateX: rotX, rotateY: rotY, perspective: 800 }}
      onHoverStart={() => setHovered(true)} onHoverEnd={() => setHovered(false)}
      onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
      className="relative cursor-pointer">
      <motion.div animate={hovered ? { scale: 1.02, y: -8 } : { scale: 1, y: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
        className="relative rounded-3xl p-7 overflow-hidden h-full"
        style={{
          background: "linear-gradient(145deg,rgba(255,255,255,0.045),rgba(255,255,255,0.01))",
          border: `1px solid ${hovered ? `${agent.color}55` : "rgba(255,255,255,0.08)"}`,
          boxShadow: hovered ? `0 20px 60px ${agent.color}25, 0 0 0 1px ${agent.color}20` : "none",
          transition: "border-color 0.3s, box-shadow 0.3s",
        }}>
        {/* BG glow */}
        <motion.div className="absolute inset-0 rounded-3xl"
          animate={{ opacity: hovered ? 1 : 0 }}
          style={{ background: `radial-gradient(circle at 20% 20%, ${agent.color}18, transparent 65%)` }} />
        {/* Top shimmer */}
        {hovered && (
          <motion.div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: `linear-gradient(90deg,transparent,${agent.color},transparent)` }}
            initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.4 }} />
        )}
        {/* Sweep */}
        <motion.div className="absolute inset-0 pointer-events-none"
          style={{ background: `linear-gradient(90deg,transparent,${agent.color}08,transparent)` }}
          animate={hovered ? { x: ["-100%", "200%"] } : {}}
          transition={{ duration: 1.8, repeat: hovered ? Infinity : 0, ease: "easeInOut" }} />

        <div className="flex items-center justify-between mb-5 relative z-10">
          <motion.span className="text-[10px] font-mono px-3 py-1 rounded-full border font-bold tracking-widest"
            style={{ color: agent.color, borderColor: `${agent.color}40`, background: `${agent.color}12` }}
            animate={hovered ? { scale: 1.06, boxShadow: `0 0 12px ${agent.color}50` } : { scale: 1 }}>
            {agent.tag}
          </motion.span>
          <motion.div className="w-11 h-11 rounded-2xl flex items-center justify-center relative overflow-hidden"
            style={{ background: `${agent.color}20`, border: `1px solid ${agent.color}40` }}
            animate={hovered ? { rotate: [0, -12, 12, 0], scale: 1.12, boxShadow: `0 0 20px ${agent.color}60` } : { rotate: 0, scale: 1 }}
            transition={{ duration: 0.5 }}>
            <Icon size={20} style={{ color: agent.color }} />
            {hovered && <motion.div className="absolute inset-0" style={{ background: `linear-gradient(135deg,${agent.color}30,transparent)` }}
              animate={{ opacity: [0.4, 0.9, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }} />}
          </motion.div>
        </div>

        <h3 className="text-white font-black text-xl mb-1 relative z-10">{agent.title}</h3>
        <motion.p className="text-xs font-mono mb-3 relative z-10" style={{ color: agent.color }}
          animate={hovered ? { letterSpacing: "0.08em" } : { letterSpacing: "0em" }}
          transition={{ duration: 0.3 }}>
          {agent.subtitle}
        </motion.p>
        <p className="text-[#9CA3AF] text-sm leading-relaxed mb-5 relative z-10">{agent.desc}</p>

        <div className="space-y-2 relative z-10">
          {agent.bullets.map((b, i) => (
            <motion.div key={i} className="flex items-start gap-2"
              initial={{ opacity: 0, x: -10 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: index * 0.12 + i * 0.06 + 0.3 }}
              whileHover={{ x: 4, color: "#E6E6EB" }}>
              <motion.div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: agent.color }}
                animate={hovered ? { scale: [1, 1.6, 1], boxShadow: [`0 0 0 0 ${agent.color}40`, `0 0 0 6px ${agent.color}00`] } : {}}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }} />
              <p className="text-[#E6E6EB] text-xs transition-colors">{b}</p>
            </motion.div>
          ))}
        </div>

        <motion.div className="absolute bottom-0 left-0 h-0.5 rounded-full"
          style={{ background: `linear-gradient(90deg,${agent.color},transparent)` }}
          animate={hovered ? { width: "100%" } : { width: "0%" }}
          transition={{ duration: 0.4 }} />
      </motion.div>
    </motion.div>
  );
}

/* ── ML Card ── */
function MLCard({ name, color, desc, delay }) {
  const [ref, inView] = useScrollReveal();
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div ref={ref}
      initial={{ opacity: 0, scale: 0.85, rotateY: 20 }}
      animate={inView ? { opacity: 1, scale: 1, rotateY: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ scale: 1.04, y: -6, boxShadow: `0 20px 60px ${color}25` }}
      onHoverStart={() => setHovered(true)} onHoverEnd={() => setHovered(false)}
      className="relative rounded-2xl p-6 overflow-hidden cursor-pointer"
      style={{ background: "linear-gradient(145deg,rgba(255,255,255,0.045),rgba(255,255,255,0.01))", border: `1px solid rgba(255,255,255,0.08)` }}>
      <motion.div className="absolute inset-0"
        animate={{ opacity: hovered ? 1 : 0 }}
        style={{ background: `radial-gradient(circle at 50% 0%, ${color}18, transparent 65%)` }} />
      {hovered && (
        <motion.div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg,transparent,${color},transparent)` }}
          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.35 }} />
      )}
      <motion.div className="w-2.5 h-2.5 rounded-full mb-4 relative z-10"
        style={{ background: color }}
        animate={hovered ? { scale: [1, 1.8, 1], boxShadow: [`0 0 0 0 ${color}60`, `0 0 0 10px ${color}00`] } : { boxShadow: `0 0 10px ${color}` }}
        transition={{ duration: 1.5, repeat: hovered ? Infinity : 0 }} />
      <h4 className="text-white font-bold text-base mb-1 relative z-10">{name}</h4>
      <p className="text-[#9CA3AF] text-xs leading-relaxed relative z-10">{desc}</p>
    </motion.div>
  );
}

/* ── FAQ ── */
const FAQS = [
  { q: "How is AgenticIQ different from a regular dashboard?", a: "AgenticIQ runs a 4-agent AI pipeline — Observer → Analyst → Simulation → Decision — that actively diagnoses KPI issues, generates strategies, validates each one using trained ML models (RF + XGB + LightGBM), and recommends the best action with full SHAP explainability." },
  { q: "What does 'per-strategy ML scoring' mean?", a: "The Decision Agent loads actual .pkl files and calls predict_proba with a unique feature vector for each strategy. So offer_discount gets its own probability, improve_checkout_ux gets its own — none share a single average score. Zero bias in the ranking." },
  { q: "Why does the same dataset produce different models for different objectives?", a: "By design. Increase Revenue trains on high-value purchases (top 25% revenue). Reduce Cart Abandonment trains on cart_abandoned. Improve Conversion Rate trains on ALL 25,000 sessions. Optimize Marketing ROI trains on above-median revenue purchasers. Four targets = four genuinely different models." },
  { q: "What are learnedMechanismStrengths?", a: "During training, ensemble feature importance is used to compute how effective each strategy type is at moving each KPI. These replace hardcoded constants from previous versions — all projections are data-driven from YOUR model." },
  { q: "What is Mode 1 vs Mode 2 simulation?", a: "Mode 1 lets you define your own strategy (ad budget %, discount %, channel, segment). The model validates it with predict_proba and shows exactly why your strategy ranks where it does. Mode 2 is fully automated: agents generate optimal strategies themselves." },
  { q: "Is it safe to upload my business data?", a: "Yes. Data is processed only for your session. Files are stored per-project with a unique hash for deduplication. Firebase Authentication ensures your project is private. No data is shared with third parties." },
  { q: "What happens when I change the objective after training?", a: "The system detects the mismatch. If you trained for 'increase_revenue' and switch to 'optimize_marketing_roi', agents are blocked with a clear message requiring retrain. This prevents wrong recommendations." },
  { q: "What tech stack does AgenticIQ run on?", a: "Frontend: React 18 + Vite + TailwindCSS + Framer Motion. Backend: Node.js + Express + MongoDB. ML microservice: Python FastAPI with scikit-learn, XGBoost, LightGBM, SHAP. Auth: Firebase. All 3 ML models run GridSearchCV with 3-fold cross-validation." },
];

function FAQItem({ item, index }) {
  const [open, setOpen] = useState(false);
  const [ref, inView] = useScrollReveal();
  return (
    <motion.div ref={ref}
      initial={{ opacity: 0, y: 24 }} animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      className="border rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        background: "linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))",
        borderColor: open ? "rgba(124,92,255,0.45)" : "rgba(255,255,255,0.08)",
        boxShadow: open ? "0 0 30px rgba(124,92,255,0.12)" : "none",
      }}>
      <motion.button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-5 text-left gap-4"
        whileHover={{ backgroundColor: "rgba(124,92,255,0.04)" }}>
        <span className="text-[#E6E6EB] font-semibold text-sm">{item.q}</span>
        <motion.div animate={{ rotate: open ? 45 : 0, scale: open ? 1.2 : 1 }}
          transition={{ duration: 0.28 }}
          className="shrink-0 text-xl font-light" style={{ color: open ? "#FF4FD8" : "#7C5CFF" }}>+</motion.div>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: "easeInOut" }}>
            <motion.div className="px-6 pb-5 pt-2 text-[#9CA3AF] text-sm leading-relaxed border-t border-white/6"
              initial={{ y: -8 }} animate={{ y: 0 }} transition={{ duration: 0.3 }}>
              {item.a}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Laser input for contact form ── */
function ContactField({ name, type, placeholder, value, onChange, accentColor = "#7C5CFF" }) {
  const [focused, setFocused] = useState(false);
  return (
    <motion.div className="relative" whileHover={{ scale: 1.01 }}>
      <motion.div className="absolute -inset-px rounded-xl pointer-events-none"
        animate={{ opacity: focused ? 0.5 : 0 }}
        style={{ background: `linear-gradient(135deg,${accentColor}55,${accentColor}18)`, filter: "blur(6px)", borderRadius: "0.75rem" }} />
      <div className="relative rounded-xl overflow-hidden"
        style={{
          border: `1px solid ${focused ? `${accentColor}65` : "rgba(255,255,255,0.1)"}`,
          background: focused ? `${accentColor}0D` : "rgba(255,255,255,0.04)",
          transition: "all 0.22s ease",
        }}>
        {focused && (
          <motion.div className="absolute left-0 right-0 h-px pointer-events-none"
            style={{ background: `linear-gradient(90deg,transparent,${accentColor},transparent)`, boxShadow: `0 0 8px ${accentColor}` }}
            animate={{ top: ["0%", "100%", "0%"] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }} />
        )}
        <motion.div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          animate={{ opacity: focused ? 1 : 0, scaleX: focused ? 1 : 0 }}
          style={{ background: `linear-gradient(90deg,transparent,${accentColor},transparent)` }}
          transition={{ duration: 0.28 }} />
        <input name={name} type={type} placeholder={placeholder} value={value} onChange={onChange} required
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          className="w-full px-4 py-3.5 text-sm text-[#E6E6EB] placeholder-[#9CA3AF]/60 focus:outline-none bg-transparent cursor-text" />
      </div>
      <motion.div className="absolute -bottom-px left-6 right-6 h-px rounded-full pointer-events-none"
        animate={{ opacity: focused ? 1 : 0, scaleX: focused ? 1 : 0 }}
        style={{ background: `linear-gradient(90deg,transparent,${accentColor},transparent)`, boxShadow: `0 0 10px ${accentColor}` }}
        transition={{ duration: 0.28 }} />
    </motion.div>
  );
}

function ContactTextarea({ name, placeholder, value, onChange, rows = 4, accentColor = "#FF4FD8" }) {
  const [focused, setFocused] = useState(false);
  return (
    <motion.div className="relative" whileHover={{ scale: 1.01 }}>
      <motion.div className="absolute -inset-px rounded-xl pointer-events-none"
        animate={{ opacity: focused ? 0.5 : 0 }}
        style={{ background: `linear-gradient(135deg,${accentColor}55,${accentColor}18)`, filter: "blur(6px)", borderRadius: "0.75rem" }} />
      <div className="relative rounded-xl overflow-hidden"
        style={{
          border: `1px solid ${focused ? `${accentColor}65` : "rgba(255,255,255,0.1)"}`,
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
        <textarea name={name} placeholder={placeholder} value={value} onChange={onChange} required rows={rows}
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

/* ── Main ── */
export default function LandingPage() {
  const navigate = useNavigate();
  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -120]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0]);
  const [formData,   setFormData]   = useState({ name: "", email: "", message: "" });
  const [formStatus, setFormStatus] = useState("idle"); // idle | loading | success | error
  const [formErrMsg, setFormErrMsg] = useState("");
  const [activeAgent, setActiveAgent] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActiveAgent(a => (a + 1) % 4), 1800);
    return () => clearInterval(t);
  }, []);

  const handleContact = async (e) => {
    e.preventDefault();
    setFormStatus("loading");
    setFormErrMsg("");
    try {
      const res  = await fetch(`${API}/contact`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:    formData.name.trim(),
          email:   formData.email.trim(),
          message: formData.message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send.");
      setFormStatus("success");
      setFormData({ name: "", email: "", message: "" });
      setTimeout(() => setFormStatus("idle"), 5000);
    } catch (err) {
      setFormErrMsg(err.message);
      setFormStatus("error");
      setTimeout(() => setFormStatus("idle"), 4500);
    }
  };

  return (
    <div className="min-h-screen text-[#E6E6EB] overflow-x-hidden" style={{ background: "#05050A" }}>

      {/* ── HERO ── */}
      <section id="home" className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <video src={animationVideo} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom,#05050Acc,#05050A88 50%,#05050Aee)" }} />
        </div>
        <FloatingOrb color="#7C5CFF" size={500} x="5%" y="10%" delay={0} />
        <FloatingOrb color="#00E0FF" size={400} x="60%" y="5%" delay={2} />
        <FloatingOrb color="#FF4FD8" size={300} x="80%" y="60%" delay={4} />
        <FloatingOrb color="#7C5CFF" size={350} x="15%" y="65%" delay={1} />
        <NeuralCanvas />
        <SparkBurst count={16} />
        <motion.div className="fixed top-0 left-0 right-0 h-0.5 z-50 origin-left"
          style={{ scaleX: scrollYProgress, background: "linear-gradient(90deg,#7C5CFF,#FF4FD8,#00E0FF)" }} />

        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative z-10 text-center px-6 max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: -20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="inline-flex items-center gap-3 px-5 py-2 rounded-full border border-[#7C5CFF]/40 bg-[#7C5CFF]/10 text-xs text-[#7C5CFF] font-mono mb-8 backdrop-blur-sm"
            whileHover={{ scale: 1.05, borderColor: "#7C5CFF80", boxShadow: "0 0 30px rgba(124,92,255,0.3)" }}>
            <motion.span className="w-2 h-2 rounded-full bg-[#22C55E]"
              animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1], boxShadow: ["0 0 0 0 #22C55E40", "0 0 0 8px #22C55E00"] }}
              transition={{ duration: 1.5, repeat: Infinity }} />
            4-Agent AI Pipeline · PKL-Validated · SHAP Explainable
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="text-5xl md:text-7xl lg:text-8xl font-black leading-[0.9] tracking-tight mb-6">
            <motion.span className="text-white" animate={{ textShadow: ["0 0 0px #7C5CFF", "0 0 40px #7C5CFF30", "0 0 0px #7C5CFF"] }} transition={{ duration: 3, repeat: Infinity }}>Agentic</motion.span>
            <motion.span style={{ background: "linear-gradient(135deg,#7C5CFF,#FF4FD8,#00E0FF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundSize: "200%" }}
              animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }} transition={{ duration: 4, repeat: Infinity }}>IQ</motion.span>
            <br />
            <span className="text-white text-3xl md:text-4xl lg:text-5xl font-bold">Decision Intelligence</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.4 }}
            className="text-[#9CA3AF] text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Four autonomous agents transform your CSV data into{" "}
            <motion.span className="text-[#00E0FF]" animate={{ textShadow: ["0 0 0px #00E0FF", "0 0 20px #00E0FF80", "0 0 0px #00E0FF"] }} transition={{ duration: 2, repeat: Infinity }}>PKL-validated strategies</motion.span>{" "}
            with full <span className="text-[#FF4FD8]">ML explainability</span>
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <motion.button onClick={() => navigate("/signup")}
              whileHover={{ scale: 1.06, boxShadow: "0 0 60px rgba(124,92,255,0.8), 0 0 120px rgba(255,79,216,0.3)" }}
              whileTap={{ scale: 0.97 }}
              className="px-8 py-4 rounded-2xl font-bold text-white text-base relative overflow-hidden"
              style={{ background: "linear-gradient(135deg,#7C5CFF,#FF4FD8)" }}>
              <motion.div className="absolute inset-0" animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)" }} />
              <motion.div className="absolute inset-0 rounded-2xl"
                animate={{ opacity: [0, 0.15, 0] }} transition={{ duration: 2.5, repeat: Infinity }}
                style={{ background: "radial-gradient(circle at 50% 0%,rgba(255,255,255,0.6),transparent 65%)" }} />
              <span className="relative flex items-center gap-2 justify-center">
                Start Free Analysis
                <motion.span animate={{ x: [0, 5, 0] }} transition={{ duration: 1.2, repeat: Infinity }}>
                  <FiArrowRight size={18} />
                </motion.span>
              </span>
            </motion.button>
            <motion.button onClick={() => navigate("/login")}
              whileHover={{ scale: 1.04, borderColor: "#00E0FF66", backgroundColor: "rgba(0,224,255,0.06)", boxShadow: "0 0 25px rgba(0,224,255,0.2)" }}
              whileTap={{ scale: 0.97 }}
              className="px-8 py-4 rounded-2xl font-bold text-[#E6E6EB] text-base border border-white/20 transition-all relative overflow-hidden">
              <motion.div className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(90deg,transparent,rgba(0,224,255,0.05),transparent)" }}
                animate={{ x: ["-100%", "200%"] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} />
              <span className="relative">Login →</span>
            </motion.button>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="max-w-md mx-auto">
            <p className="text-[#9CA3AF] text-[10px] font-mono uppercase tracking-widest mb-4">Live Pipeline</p>
            <div className="flex items-center gap-2">
              {[
                { label: "Observer", icon: FiEye, color: "#7C5CFF" },
                { label: "Analyst", icon: FiBarChart2, color: "#00E0FF" },
                { label: "Simulation", icon: FiCpu, color: "#FF4FD8" },
                { label: "Decision", icon: FiZap, color: "#22C55E" },
              ].map((a, i) => (
                <React.Fragment key={a.label}>
                  <PipelineStep n={i} label={a.label} color={a.color} icon={a.icon} active={activeAgent === i} />
                  {i < 3 && (
                    <motion.div className="shrink-0 h-0.5 flex-1 rounded-full"
                      style={{ background: activeAgent > i ? "#22C55E" : "#ffffff15" }}
                      animate={activeAgent === i ? { opacity: [0.3, 1, 0.3] } : {}}
                      transition={{ duration: 0.8, repeat: Infinity }} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </motion.div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
          <span className="text-[#9CA3AF] text-[10px] font-mono uppercase tracking-widest">Scroll</span>
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 1.5, repeat: Infinity }}
            className="w-5 h-8 rounded-full border border-white/20 flex items-start justify-center pt-1.5">
            <motion.div className="w-1 h-2 rounded-full bg-[#7C5CFF]"
              animate={{ y: [0, 10, 0], opacity: [1, 0, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
          </motion.div>
        </motion.div>
      </section>

      {/* ── STATS ── */}
      <section className="py-16 px-6 border-y border-white/6 relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 50%, #7C5CFF08, transparent 70%)" }} />
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 relative z-10">
          {[
            { label: "AI Agents", val: 4, suffix: "", color: "#7C5CFF" },
            { label: "ML Models", val: 3, suffix: "", color: "#00E0FF" },
            { label: "Sessions Analysed", val: 25, suffix: "K+", color: "#FF4FD8" },
            { label: "Explainable", val: 100, suffix: "%", color: "#22C55E" },
          ].map((s) => {
            const [ref, inView] = useScrollReveal();
            return (
              <motion.div key={s.label} ref={ref}
                initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}}
                whileHover={{ scale: 1.08, y: -4 }}
                className="text-center cursor-default group">
                <motion.p className="text-4xl font-black mb-1" style={{ color: s.color }}
                  animate={{ textShadow: [`0 0 0px ${s.color}`, `0 0 30px ${s.color}60`, `0 0 0px ${s.color}`] }}
                  transition={{ duration: 2.5 + Math.random(), repeat: Infinity, delay: Math.random() * 2 }}>
                  <Counter to={s.val} suffix={s.suffix} />
                </motion.p>
                <p className="text-[#9CA3AF] text-xs font-mono">{s.label}</p>
                <motion.div className="h-px mt-2 rounded-full mx-auto"
                  style={{ background: s.color, width: "0%" }}
                  whileHover={{ width: "60%" }}
                  transition={{ duration: 0.3 }} />
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ── AGENTS ── */}
      <section id="features" className="py-28 px-6 relative overflow-hidden">
        <FloatingOrb color="#7C5CFF" size={600} x="50%" y="20%" delay={0} />
        <SparkBurst count={10} />
        <div className="max-w-6xl mx-auto relative z-10">
          {(() => {
            const [ref, inView] = useScrollReveal();
            return (
              <motion.div ref={ref} initial={{ opacity: 0, y: 40 }} animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.7 }} className="text-center mb-16">
                <motion.span className="text-xs font-mono text-[#7C5CFF] tracking-[0.3em] uppercase mb-3 block"
                  animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 2, repeat: Infinity }}>
                  ✦ 4-Agent Decision Pipeline ✦
                </motion.span>
                <h2 className="text-4xl md:text-6xl font-black text-white mb-5 leading-tight">
                  Every agent learns from{" "}
                  <span style={{ background: "linear-gradient(135deg,#00E0FF,#FF4FD8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                    your real data
                  </span>
                </h2>
                <p className="text-[#9CA3AF] max-w-2xl mx-auto text-base leading-relaxed">
                  Every projection, every probability, every recommendation is computed from your uploaded dataset and the models trained on it.
                </p>
              </motion.div>
            );
          })()}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {AGENTS.map((a, i) => <AgentCard key={a.id} agent={a} index={i} />)}
          </div>
        </div>
      </section>

      {/* ── ML MODELS ── */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 30% 50%, #00E0FF06, transparent 60%), radial-gradient(ellipse at 70% 50%, #FF4FD806, transparent 60%)" }} />
        <div className="max-w-6xl mx-auto relative z-10">
          {(() => {
            const [ref, inView] = useScrollReveal();
            return (
              <motion.div ref={ref} initial={{ opacity: 0, y: 40 }} animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.7 }} className="text-center mb-14">
                <span className="text-xs font-mono text-[#00E0FF] tracking-[0.3em] uppercase mb-3 block">✦ Hyperparameter-Tuned ✦</span>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
                  Three models.{" "}
                  <span style={{ background: "linear-gradient(135deg,#7C5CFF,#00E0FF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>One ensemble.</span>
                </h2>
                <p className="text-[#9CA3AF] max-w-xl mx-auto">RandomizedSearchCV with 3-fold stratified cross-validation tunes every model on YOUR specific dataset — not generic defaults.</p>
              </motion.div>
            );
          })()}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
            {[
              { name: "Random Forest", color: "#7C5CFF", desc: "150–300 trees, tuned max_depth and min_samples. Class-balanced weights handle purchase imbalance. Trained on YOUR uploaded dataset with RandomizedSearchCV." },
              { name: "XGBoost", color: "#00E0FF", desc: "scale_pos_weight auto-computed from your class ratio. Tuned learning_rate, subsample, colsample_bytree — all from YOUR data distribution." },
              { name: "LightGBM", color: "#FF4FD8", desc: "Early stopping on your validation set. Tuned num_leaves, min_child_samples. Fastest of the three — performance depends on your dataset." },
            ].map((m, i) => <MLCard key={m.name} {...m} delay={i * 0.1} />)}
          </div>
          {(() => {
            const [ref, inView] = useScrollReveal();
            return (
              <motion.div ref={ref} initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6 }}
                whileHover={{ boxShadow: "0 0 60px rgba(34,197,94,0.2)" }}
                className="rounded-3xl p-8 text-center relative overflow-hidden cursor-default"
                style={{ background: "linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))", border: "1px solid rgba(34,197,94,0.3)" }}>
                <motion.div className="absolute inset-0 rounded-3xl"
                  style={{ background: "radial-gradient(ellipse at 50% 0%, #22C55E15, transparent 70%)" }}
                  animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 3, repeat: Infinity }} />
                <div className="relative z-10">
                  <span className="text-xs font-mono text-[#22C55E] tracking-widest uppercase block mb-3">Weighted Ensemble</span>
                  <p className="text-white font-black text-2xl mb-3">Accuracy-weighted average of all three</p>
                  <p className="text-[#9CA3AF] text-sm max-w-lg mx-auto mb-6">
                    Weights assigned proportional to each model's accuracy on YOUR test set. Better model = more influence on the final recommendation. Feature importances are then mapped to <span className="text-[#22C55E] font-semibold">learnedMechanismStrengths</span> and <span className="text-[#7C5CFF] font-semibold">learnedObjectiveWeights</span> — making all agent projections fully data-driven from your specific dataset.
                  </p>
                  <div className="flex items-center justify-center gap-6 flex-wrap">
                    {[
                      { label: "Accuracy", desc: "Computed from your test split", color: "#22C55E" },
                      { label: "ROC-AUC", desc: "Reflects class separation on your data", color: "#00E0FF" },
                      { label: "F1 Score", desc: "Measured on your purchased class", color: "#7C5CFF" },
                    ].map((m, i) => (
                      <motion.div key={m.label} className="text-center px-4 py-3 rounded-xl border"
                        style={{ borderColor: `${m.color}25`, background: `${m.color}08` }}
                        whileHover={{ scale: 1.06, y: -3, borderColor: `${m.color}50` }}>
                        <motion.p className="font-black text-base text-white mb-0.5">{m.label}</motion.p>
                        <p className="text-[#9CA3AF] text-[10px] font-mono">{m.desc}</p>
                        <motion.div className="w-1.5 h-1.5 rounded-full mx-auto mt-2"
                          style={{ background: m.color }}
                          animate={{ scale: [1, 1.6, 1], boxShadow: [`0 0 0 0 ${m.color}50`, `0 0 0 6px ${m.color}00`] }}
                          transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }} />
                      </motion.div>
                    ))}
                  </div>
                  <p className="text-[#9CA3AF] text-xs mt-5 font-mono">All metrics computed on YOUR uploaded data after training — no default values shown here.</p>
                </div>
              </motion.div>
            );
          })()}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 px-6 relative overflow-hidden border-y border-white/6">
        <FloatingOrb color="#FF4FD8" size={500} x="80%" y="30%" delay={3} />
        <div className="max-w-5xl mx-auto relative z-10">
          {(() => {
            const [ref, inView] = useScrollReveal();
            return (
              <motion.div ref={ref} initial={{ opacity: 0, y: 40 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7 }} className="text-center mb-16">
                <span className="text-xs font-mono text-[#FF4FD8] tracking-[0.3em] uppercase mb-3 block">✦ 5-Step Flow ✦</span>
                <h2 className="text-4xl md:text-5xl font-black text-white mb-4">From CSV to decision in 5 steps</h2>
              </motion.div>
            );
          })()}
          <div className="space-y-4">
            {[
              { n: 1, color: "#7C5CFF", title: "Upload 3 Datasets", sub: "Ecommerce + Marketing + Advertising CSVs", desc: "The system cleans, deduplicates, and engineers features from all 3 files. KPIs (CTR, conversion rate, cart abandonment, ROI) are computed from your actual data." },
              { n: 2, color: "#00E0FF", title: "Select Objective", sub: "4 options with different training targets", desc: "Choosing your objective determines the ML training target. Each objective = different model, different rows, different feature importance." },
              { n: 3, color: "#FF4FD8", title: "Choose Simulation Mode", sub: "User-Defined (Mode 1) or Auto AI (Mode 2)", desc: "Mode 1: Define your strategy and the model validates with predict_proba. Mode 2: AI agents generate optimal strategies from scratch." },
              { n: 4, color: "#FF9800", title: "ML Training + Hyperparameter Tuning", sub: "RandomizedSearchCV · 3-fold CV · 3 models", desc: "RF, XGBoost, and LightGBM are tuned on YOUR data. Feature importances stored as learnedMechanismStrengths for agent use." },
              { n: 5, color: "#22C55E", title: "Agent Pipeline + Decision", sub: "Observer → Analyst → Simulation → Decision", desc: "PKL files loaded. Each strategy gets a unique feature vector → predict_proba. Decision agent re-ranks using real per-strategy ML scores. SHAP explains top features." },
            ].map((step, i) => {
              const [ref, inView] = useScrollReveal();
              return (
                <motion.div key={step.n} ref={ref}
                  initial={{ opacity: 0, x: i % 2 === 0 ? -50 : 50 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ scale: 1.015, x: 4, boxShadow: `0 8px 40px ${step.color}18` }}
                  className="flex gap-5 items-start p-6 rounded-2xl border border-white/8 transition-all duration-300 relative overflow-hidden group cursor-default"
                  style={{ background: "linear-gradient(145deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))" }}>
                  <motion.div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400"
                    style={{ background: `radial-gradient(circle at 0% 50%, ${step.color}08, transparent 65%)` }} />
                  <motion.div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full"
                    style={{ background: step.color }}
                    initial={{ scaleY: 0 }} whileHover={{ scaleY: 1 }}
                    transition={{ duration: 0.3, ease: "easeOut" }} />
                  <motion.div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 relative z-10"
                    style={{ background: `${step.color}20`, color: step.color, border: `1px solid ${step.color}40` }}
                    animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 4, repeat: Infinity, delay: i * 0.3 }}
                    whileHover={{ scale: 1.15, boxShadow: `0 0 20px ${step.color}60` }}>
                    {step.n}
                  </motion.div>
                  <div className="flex-1 relative z-10">
                    <p className="text-white font-bold text-base">{step.title}</p>
                    <p className="text-xs font-mono mb-2" style={{ color: step.color }}>{step.sub}</p>
                    <p className="text-[#9CA3AF] text-sm leading-relaxed">{step.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-28 px-6 relative overflow-hidden">
        <FloatingOrb color="#7C5CFF" size={600} x="20%" y="30%" delay={0} />
        <FloatingOrb color="#00E0FF" size={400} x="70%" y="40%" delay={2} />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          {(() => {
            const [ref, inView] = useScrollReveal();
            return (
              <motion.div ref={ref} initial={{ opacity: 0, scale: 0.9 }} animate={inView ? { opacity: 1, scale: 1 } : {}} transition={{ duration: 0.7 }}>
                <h2 className="text-4xl md:text-6xl font-black text-white mb-6 leading-tight">
                  Ready to make decisions{" "}
                  <span style={{ background: "linear-gradient(135deg,#7C5CFF,#FF4FD8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                    that are actually validated?
                  </span>
                </h2>
                <p className="text-[#9CA3AF] text-lg mb-10 max-w-xl mx-auto">Upload your 3 CSVs, train 3 ML models on your data, and get strategy recommendations backed by real predict_proba scores — not formulas.</p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <motion.button onClick={() => navigate("/signup")}
                    whileHover={{ scale: 1.06, boxShadow: "0 0 70px rgba(124,92,255,0.9)" }}
                    whileTap={{ scale: 0.97 }}
                    className="px-10 py-4 rounded-2xl font-bold text-white text-base relative overflow-hidden"
                    style={{ background: "linear-gradient(135deg,#7C5CFF,#FF4FD8,#00E0FF)" }}>
                    <motion.div className="absolute inset-0" animate={{ x: ["-100%", "100%"] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)" }} />
                    <span className="relative">Start Free →</span>
                  </motion.button>
                  <motion.button onClick={() => navigate("/login")}
                    whileHover={{ scale: 1.04, borderColor: "#7C5CFF60", boxShadow: "0 0 25px rgba(124,92,255,0.2)" }}
                    whileTap={{ scale: 0.97 }}
                    className="px-10 py-4 rounded-2xl font-bold text-[#E6E6EB] border border-white/20 hover:bg-white/5 transition-all">
                    Login
                  </motion.button>
                </div>
              </motion.div>
            );
          })()}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-24 px-6 border-t border-white/6">
        <div className="max-w-3xl mx-auto">
          {(() => {
            const [ref, inView] = useScrollReveal();
            return (
              <motion.div ref={ref} initial={{ opacity: 0, y: 40 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7 }} className="text-center mb-14">
                <span className="text-xs font-mono text-[#FF4FD8] tracking-[0.3em] uppercase mb-3 block">✦ FAQ ✦</span>
                <h2 className="text-4xl md:text-5xl font-black text-white">How does it actually work?</h2>
                <p className="text-[#9CA3AF] mt-3 text-sm">Technical questions answered honestly.</p>
              </motion.div>
            );
          })()}
          <div className="space-y-3">
            {FAQS.map((item, i) => <FAQItem key={i} item={item} index={i} />)}
          </div>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section id="contact" className="py-24 px-6 border-t border-white/6">
        <div className="max-w-xl mx-auto">
          {(() => {
            const [ref, inView] = useScrollReveal();
            return (
              <motion.div ref={ref} initial={{ opacity: 0, y: 40 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7 }} className="text-center mb-12">
                <span className="text-xs font-mono text-[#00E0FF] tracking-[0.3em] uppercase mb-3 block">✦ Contact ✦</span>
                <h2 className="text-4xl font-black text-white mb-3">Let's Connect</h2>
                <p className="text-[#9CA3AF] text-sm">Have questions about the pipeline? Reach out.</p>
              </motion.div>
            );
          })()}

          <motion.form onSubmit={handleContact}
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="rounded-3xl p-8 space-y-4 relative overflow-hidden"
            style={{ background: "linear-gradient(145deg,rgba(255,255,255,0.045),rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.08)" }}>

            {/* Top shimmer */}
            <div className="absolute top-0 left-0 right-0 h-px overflow-hidden">
              <div className="h-full" style={{ background: "linear-gradient(90deg,transparent,#7C5CFF,#FF4FD8,#00E0FF,transparent)" }} />
              <motion.div className="absolute inset-0" animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.7),transparent)", width: "28%" }} />
            </div>

            {/* Ambient glow */}
            <motion.div className="absolute inset-0 rounded-3xl pointer-events-none"
              style={{ background: "radial-gradient(circle at 30% 30%, #7C5CFF0A, transparent 60%)" }}
              animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 4, repeat: Infinity }} />

            {/* Success banner */}
            <AnimatePresence>
              {formStatus === "success" && (
                <motion.div initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-4 py-3.5 rounded-xl text-sm flex items-center gap-3 relative z-10"
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
              {formStatus === "error" && (
                <motion.div
                  initial={{ opacity: 0, y: -10, height: 0, x: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto", x: [0, -5, 5, -4, 4, 0] }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ x: { duration: 0.35 } }}
                  className="px-4 py-3 rounded-xl text-sm flex items-center gap-2 relative z-10"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.28)", color: "#f87171" }}>
                  <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 0.4 }}>
                    <FiAlertTriangle size={14} />
                  </motion.div>
                  {formErrMsg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Fields */}
            {[
              { field: "name",    type: "text",  placeholder: "Your full name",        accent: "#7C5CFF" },
              { field: "email",   type: "email", placeholder: "Your email address",    accent: "#00E0FF" },
            ].map(({ field, type, placeholder, accent }) => (
              <ContactField key={field} name={field} type={type} placeholder={placeholder}
                value={formData[field]} onChange={e => setFormData(p => ({ ...p, [field]: e.target.value }))}
                accentColor={accent} />
            ))}
            <ContactTextarea name="message" placeholder="Your message…" rows={4}
              value={formData.message} onChange={e => setFormData(p => ({ ...p, message: e.target.value }))}
              accentColor="#FF4FD8" />

            {/* Submit */}
            <motion.button type="submit" disabled={formStatus === "loading"}
              whileHover={{ scale: 1.02, boxShadow: "0 0 40px rgba(124,92,255,0.6)" }}
              whileTap={{ scale: 0.97 }}
              className="w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 relative overflow-hidden disabled:opacity-55"
              style={{ background: "linear-gradient(135deg,#7C5CFF,#FF4FD8)" }}>
              <motion.div className="absolute inset-0" animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)" }} />
              <motion.div className="absolute inset-0 rounded-xl"
                animate={{ opacity: [0, 0.14, 0] }} transition={{ duration: 2.5, repeat: Infinity }}
                style={{ background: "radial-gradient(circle at 50% 0%,rgba(255,255,255,0.6),transparent 65%)" }} />
              <span className="relative flex items-center gap-2">
                {formStatus === "loading" ? (
                  <>
                    {[0, 1, 2].map(i => (
                      <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-white"
                        animate={{ y: [0, -7, 0] }} transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.15 }} />
                    ))}
                    <span>Sending…</span>
                  </>
                ) : (
                  <><FiSend size={16} /> Send Message</>
                )}
              </span>
            </motion.button>

            <p className="text-center text-[#9CA3AF] text-xs relative z-10">
              <MdEmail className="inline mr-1 text-[#00E0FF]" size={13} />
              bharathbandi13925@gmail.com
            </p>
          </motion.form>
        </div>
      </section>
    </div>
  );
}