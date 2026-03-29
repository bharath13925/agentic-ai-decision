import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import {
  FiCpu, FiMail, FiLock, FiEye, FiEyeOff,
  FiArrowRight, FiAlertTriangle, FiCheck, FiZap,
} from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/* ── Circuit board background ── */
function CircuitLines() {
  const lines = [
    { x1: "5%", y1: "20%", x2: "25%", y2: "20%", color: "#7C5CFF" },
    { x1: "25%", y1: "20%", x2: "25%", y2: "45%", color: "#7C5CFF" },
    { x1: "25%", y1: "45%", x2: "55%", y2: "45%", color: "#7C5CFF" },
    { x1: "75%", y1: "30%", x2: "95%", y2: "30%", color: "#00E0FF" },
    { x1: "75%", y1: "30%", x2: "75%", y2: "65%", color: "#00E0FF" },
    { x1: "75%", y1: "65%", x2: "40%", y2: "65%", color: "#00E0FF" },
    { x1: "10%", y1: "75%", x2: "35%", y2: "75%", color: "#FF4FD8" },
    { x1: "60%", y1: "80%", x2: "90%", y2: "80%", color: "#22C55E" },
    { x1: "60%", y1: "80%", x2: "60%", y2: "55%", color: "#22C55E" },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-25">
      <svg width="100%" height="100%" className="absolute inset-0">
        {lines.map((l, i) => (
          <motion.line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke={l.color} strokeWidth={0.8} strokeOpacity={0.4}
            animate={{ strokeOpacity: [0.15, 0.55, 0.15] }}
            transition={{ duration: 3 + i * 0.4, repeat: Infinity, delay: i * 0.3 }} />
        ))}
        {lines.map((l, i) => (
          <motion.circle key={`c${i}`} r={3} fill={l.color}
            animate={{
              cx: [l.x1, l.x2].map(v => v),
              cy: [l.y1, l.y2].map(v => v),
              opacity: [0, 1, 0],
            }}
            transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.55, ease: "easeInOut" }} />
        ))}
      </svg>
      {/* Dot nodes at intersections */}
      {[
        { x: "25%", y: "20%", c: "#7C5CFF" }, { x: "25%", y: "45%", c: "#7C5CFF" },
        { x: "75%", y: "30%", c: "#00E0FF" }, { x: "75%", y: "65%", c: "#00E0FF" },
        { x: "60%", y: "80%", c: "#22C55E" },
      ].map((dot, i) => (
        <motion.div key={i} className="absolute w-2 h-2 rounded-full"
          style={{ left: dot.x, top: dot.y, transform: "translate(-50%,-50%)", background: dot.c, boxShadow: `0 0 8px ${dot.c}` }}
          animate={{ scale: [1, 1.8, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }} />
      ))}
    </div>
  );
}

/* ── Ambient orbs ── */
function AmbientOrbs() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {[
        { x: "28%", y: "35%", color: "#7C5CFF", size: 320, dur: 10 },
        { x: "72%", y: "55%", color: "#00E0FF", size: 260, dur: 12 },
        { x: "50%", y: "85%", color: "#FF4FD8", size: 220, dur: 9 },
        { x: "10%", y: "60%", color: "#22C55E", size: 180, dur: 14 },
      ].map((orb, i) => (
        <motion.div key={i} className="absolute rounded-full"
          style={{
            left: orb.x, top: orb.y,
            width: orb.size, height: orb.size,
            background: orb.color,
            filter: "blur(100px)",
            transform: "translate(-50%,-50%)",
            opacity: 0.065,
          }}
          animate={{ x: [0, 28, -18, 12, 0], y: [0, -22, 18, -8, 0] }}
          transition={{ duration: orb.dur, repeat: Infinity, ease: "easeInOut", delay: i * 0.7 }} />
      ))}
    </div>
  );
}

/* ── Floating sparks ── */
function Sparks() {
  const sparks = useRef(
    Array.from({ length: 16 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3.5 + 1,
      color: ["#7C5CFF", "#FF4FD8", "#00E0FF", "#22C55E"][i % 4],
      dur: 7 + Math.random() * 7,
      delay: Math.random() * 5,
    }))
  ).current;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {sparks.map(s => (
        <motion.div key={s.id} className="absolute rounded-full"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, background: s.color }}
          animate={{ y: [0, -50 - Math.random() * 30, 0], opacity: [0, 0.85, 0], scale: [0.3, 1.5, 0.3] }}
          transition={{ duration: s.dur, repeat: Infinity, delay: s.delay }} />
      ))}
    </div>
  );
}

/* ── Typewriter ── */
function Typewriter({ texts }) {
  const [ti, setTi] = useState(0);
  const [ci, setCi] = useState(0);
  const [del, setDel] = useState(false);

  useEffect(() => {
    const cur = texts[ti];
    const t = setTimeout(() => {
      if (!del) {
        if (ci < cur.length) setCi(c => c + 1);
        else setTimeout(() => setDel(true), 1600);
      } else {
        if (ci > 0) setCi(c => c - 1);
        else { setDel(false); setTi(t => (t + 1) % texts.length); }
      }
    }, del ? 38 : 75);
    return () => clearTimeout(t);
  }, [ci, del, ti, texts]);

  return (
    <span>
      <span className="text-transparent bg-clip-text font-bold"
        style={{ backgroundImage: "linear-gradient(135deg,#7C5CFF,#00E0FF)" }}>
        {texts[ti].slice(0, ci)}
      </span>
      <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.75, repeat: Infinity }}
        style={{ color: "#7C5CFF" }}>|</motion.span>
    </span>
  );
}

/* ── Scanning input field ── */
function ScanInput({ icon: Icon, name, type, placeholder, value, onChange, required, rightEl, accentColor = "#7C5CFF" }) {
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);

  return (
    <motion.div className="relative group" whileHover={{ scale: 1.012 }} transition={{ duration: 0.18 }}>
      {/* Glow aura */}
      <motion.div className="absolute -inset-0.5 rounded-xl pointer-events-none"
        animate={{ opacity: focused ? 0.55 : 0 }}
        style={{ background: `linear-gradient(135deg,${accentColor}55,${accentColor}22)`, filter: "blur(7px)", borderRadius: "0.75rem" }} />

      <div className="relative rounded-xl overflow-hidden"
        style={{
          border: `1px solid ${focused ? `${accentColor}75` : touched && value ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)"}`,
          background: focused ? `${accentColor}0E` : "rgba(255,255,255,0.03)",
          transition: "all 0.22s ease",
        }}>

        {/* Scanning beam on focus */}
        {focused && (
          <motion.div className="absolute inset-0 pointer-events-none"
            style={{ background: `linear-gradient(180deg, ${accentColor}15, transparent 50%, ${accentColor}08)` }}
            animate={{ opacity: [0.4, 0.9, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }} />
        )}
        {focused && (
          <motion.div className="absolute left-0 right-0 h-px pointer-events-none"
            style={{ background: `linear-gradient(90deg,transparent,${accentColor},transparent)`, boxShadow: `0 0 10px ${accentColor}` }}
            animate={{ top: ["0%", "100%", "0%"] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }} />
        )}

        {/* Top accent line */}
        <motion.div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          animate={{ opacity: focused ? 1 : 0, scaleX: focused ? 1 : 0 }}
          transition={{ duration: 0.28 }}
          style={{ background: `linear-gradient(90deg,transparent,${accentColor},transparent)`, boxShadow: `0 0 8px ${accentColor}80` }} />

        {/* Icon */}
        <motion.div className="absolute left-4 top-1/2 -translate-y-1/2"
          animate={{ color: focused ? accentColor : "#9CA3AF", scale: focused ? 1.2 : 1, rotate: focused ? 10 : 0 }}
          transition={{ duration: 0.22 }}>
          <Icon size={15} />
        </motion.div>

        <input name={name} type={type} placeholder={placeholder} value={value}
          onChange={e => { onChange(e); setTouched(true); }} required={required}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          className="w-full pl-11 pr-12 py-3.5 text-sm text-[#E6E6EB] placeholder-[#9CA3AF]/55 focus:outline-none bg-transparent cursor-text"
        />

        {rightEl && <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{rightEl}</div>}
      </div>

      {/* Bottom glow pulse */}
      <motion.div className="absolute -bottom-px left-8 right-8 h-px rounded-full pointer-events-none"
        animate={{ opacity: focused ? 1 : 0, scaleX: focused ? 1 : 0 }}
        transition={{ duration: 0.28 }}
        style={{ background: `linear-gradient(90deg,transparent,${accentColor},transparent)`, boxShadow: `0 0 12px ${accentColor}` }} />
    </motion.div>
  );
}

/* ── Spinning logo ── */
function LogoCore() {
  return (
    <div className="relative w-22 h-22 flex items-center justify-center" style={{ width: 88, height: 88 }}>
      {/* Triple rings */}
      {[0, 1, 2].map(i => (
        <motion.div key={i} className="absolute rounded-full border"
          style={{
            inset: `${i * 7}px`,
            borderColor: [`rgba(124,92,255,0.7)`, `rgba(0,224,255,0.45)`, `rgba(255,79,216,0.32)`][i],
            borderStyle: i === 1 ? "dashed" : "solid",
          }}
          animate={{ rotate: i % 2 === 0 ? 360 : -360, scale: [1, 1.04, 1] }}
          transition={{
            rotate: { duration: 4 + i * 2.5, repeat: Infinity, ease: "linear" },
            scale: { duration: 2.5 + i, repeat: Infinity, ease: "easeInOut" },
          }} />
      ))}

      {/* Orbiting dots */}
      {[
        { r: 40, color: "#7C5CFF", size: 7, dur: 3 },
        { r: 32, color: "#00E0FF", size: 5, dur: 5, rev: true },
        { r: 26, color: "#FF4FD8", size: 4, dur: 3.5 },
      ].map((dot, i) => (
        <motion.div key={i} className="absolute" style={{ width: dot.size, height: dot.size }}
          animate={{ rotate: dot.rev ? -360 : 360 }}
          transition={{ duration: dot.dur, repeat: Infinity, ease: "linear" }}>
          <motion.div className="absolute rounded-full"
            style={{ width: dot.size, height: dot.size, background: dot.color, boxShadow: `0 0 12px ${dot.color}`, top: -dot.r }}
            animate={{ scale: [1, 1.9, 1], opacity: [0.65, 1, 0.65] }}
            transition={{ duration: 1.2 + i * 0.4, repeat: Infinity }} />
        </motion.div>
      ))}

      {/* Pulsing corner dots */}
      {[0, 90, 180, 270].map((angle, i) => {
        const r = 44;
        const rad = angle * Math.PI / 180;
        return (
          <motion.div key={angle} className="absolute w-2 h-2 rounded-full"
            style={{
              background: ["#7C5CFF", "#00E0FF", "#FF4FD8", "#22C55E"][i],
              boxShadow: `0 0 8px ${["#7C5CFF", "#00E0FF", "#FF4FD8", "#22C55E"][i]}`,
              left: `calc(50% + ${r * Math.cos(rad)}px - 4px)`,
              top: `calc(50% + ${r * Math.sin(rad)}px - 4px)`,
            }}
            animate={{ scale: [1, 1.9, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }} />
        );
      })}

      {/* Core */}
      <motion.div className="w-11 h-11 rounded-2xl flex items-center justify-center relative z-10 overflow-hidden"
        style={{ background: "linear-gradient(135deg,#7C5CFF,#00E0FF)" }}
        animate={{ boxShadow: ["0 0 28px #7C5CFF65", "0 0 55px #00E0FF80", "0 0 28px #FF4FD865", "0 0 28px #7C5CFF65"] }}
        transition={{ duration: 3.5, repeat: Infinity }}>
        <motion.div className="absolute inset-0"
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
          style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.48),transparent)" }} />
        <FiCpu className="text-white relative z-10" size={20} />
      </motion.div>
    </div>
  );
}

export default function UserLoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const successMsg = location.state?.message || "";
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const sX = useSpring(mouseX, { damping: 28, stiffness: 90 });
  const sY = useSpring(mouseY, { damping: 28, stiffness: 90 });
  const bgX = useTransform(sX, [-1, 1], [-20, 20]);
  const bgY = useTransform(sY, [-1, 1], [-15, 15]);
  const cardRX = useTransform(sY, [-1, 1], [2.5, -2.5]);
  const cardRY = useTransform(sX, [-1, 1], [-2.5, 2.5]);

  useEffect(() => {
    const h = e => {
      mouseX.set((e.clientX / window.innerWidth - 0.5) * 2);
      mouseY.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener("mousemove", h);
    return () => window.removeEventListener("mousemove", h);
  }, []);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, form.email, form.password);
      setSuccess(true);
      setTimeout(() => navigate("/dashboard"), 850);
    } catch (err) {
      const c = err.code;
      if (c === "auth/user-not-found" || c === "auth/invalid-credential") setError("No account found with this email.");
      else if (c === "auth/wrong-password") setError("Incorrect password.");
      else if (c === "auth/too-many-requests") setError("Too many attempts. Try again later.");
      else setError(err.message.replace("Firebase: ", ""));
    } finally { setLoading(false); }
  };

  const saveToBackend = async (uid, name, email, provider = "google") => {
    try {
      await fetch(`${API}/users/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, name, email, provider }),
      });
    } catch {}
  };

  const handleGoogle = async () => {
    setError(""); setGoogleLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await saveToBackend(cred.user.uid, cred.user.displayName || "User", cred.user.email, "google");
      setSuccess(true);
      setTimeout(() => navigate("/dashboard"), 850);
    } catch (err) { setError(err.message.replace("Firebase: ", "")); }
    finally { setGoogleLoading(false); }
  };

  return (
    <motion.div className="min-h-screen flex items-center justify-center px-4 py-16 relative overflow-hidden"
      style={{ background: "#06060E" }}
      animate={success ? { scale: 1.06, filter: "blur(6px)", opacity: 0 } : {}}
      transition={{ duration: 0.52 }}>

      <motion.div className="absolute inset-0" style={{ x: bgX, y: bgY }}>
        <AmbientOrbs />
        <CircuitLines />
      </motion.div>
      <Sparks />

      {/* Corner blobs */}
      <motion.div className="absolute top-8 left-8 pointer-events-none"
        animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }}>
        <div style={{ width: 64, height: 64, border: "1px solid rgba(124,92,255,0.2)", borderRadius: "30% 70% 70% 30% / 30% 30% 70% 70%" }} />
      </motion.div>
      <motion.div className="absolute bottom-8 right-8 pointer-events-none"
        animate={{ rotate: -360 }} transition={{ duration: 14, repeat: Infinity, ease: "linear" }}>
        <div style={{ width: 80, height: 80, border: "1px solid rgba(0,224,255,0.16)", borderRadius: "70% 30% 30% 70% / 70% 70% 30% 30%" }} />
      </motion.div>
      <motion.div className="absolute top-1/3 right-10 pointer-events-none"
        animate={{ y: [0, -22, 0], rotate: [0, 180, 360] }} transition={{ duration: 9, repeat: Infinity }}>
        <div style={{ width: 44, height: 44, border: "1px solid rgba(255,79,216,0.14)", borderRadius: "50%" }} />
      </motion.div>

      <motion.div className="w-full max-w-md relative z-10"
        initial={{ opacity: 0, y: 50, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.78, ease: [0.22, 1, 0.36, 1] }}>

        {/* Logo */}
        <motion.div className="flex flex-col items-center gap-3 mb-7"
          initial={{ opacity: 0, y: -28 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
          <LogoCore />
          <div className="text-center">
            <div className="flex items-center gap-0.5 justify-center">
              <motion.span className="font-black text-2xl tracking-tight"
                animate={{ color: ["#7C5CFF", "#9B79FF", "#7C5CFF"] }}
                transition={{ duration: 3.5, repeat: Infinity }}>Agentic</motion.span>
              <motion.span className="font-black text-2xl tracking-tight"
                animate={{ color: ["#00E0FF", "#4DFDFF", "#00E0FF"] }}
                transition={{ duration: 3.5, repeat: Infinity, delay: 0.6 }}>IQ</motion.span>
            </div>
            <motion.p className="text-[#9CA3AF] text-[11px] font-mono mt-0.5 tracking-widest uppercase"
              animate={{ opacity: [0.55, 1, 0.55] }} transition={{ duration: 2.2, repeat: Infinity }}>
              Decision Intelligence Platform
            </motion.p>
          </div>
        </motion.div>

        {/* Typewriter tagline */}
        <motion.div className="text-center mb-7 text-sm text-[#9CA3AF]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.38 }}>
          <Typewriter texts={["Analyse your KPIs", "Simulate strategies", "Train ML models", "Make better decisions"]} />
        </motion.div>

        {/* 3D card */}
        <motion.div
          style={{ rotateX: cardRX, rotateY: cardRY, transformPerspective: 1000 }}
          className="relative rounded-3xl overflow-hidden"
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          whileHover={{ boxShadow: "0 0 130px rgba(124,92,255,0.2), 0 0 60px rgba(0,224,255,0.1)" }}>

          <div style={{
            background: "linear-gradient(145deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.012) 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(28px)",
            borderRadius: "1.5rem",
          }}>
            {/* Animated top border */}
            <div className="h-px w-full relative overflow-hidden">
              <div className="h-full" style={{ background: "linear-gradient(90deg,transparent,#7C5CFF,#00E0FF,#FF4FD8,transparent)" }} />
              <motion.div className="absolute inset-0"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.85),transparent)", width: "28%" }} />
            </div>

            <div className="p-8">
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
                <h2 className="text-2xl font-black text-white mb-1">Welcome back</h2>
                <p className="text-[#9CA3AF] text-sm mb-6">Sign in to your AgenticIQ workspace.</p>
              </motion.div>

              {/* Success banner */}
              <AnimatePresence>
                {successMsg && (
                  <motion.div initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-5 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
                    style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.28)", color: "#4ade80" }}>
                    <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 0.5 }}>
                      <FiCheck size={14} />
                    </motion.div>
                    {successMsg}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error banner */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto", x: [0, -7, 7, -5, 5, 0] }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ x: { duration: 0.35 } }}
                    className="mb-5 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
                    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.28)", color: "#f87171" }}>
                    <motion.div animate={{ scale: [1, 1.35, 1] }} transition={{ duration: 0.4 }}>
                      <FiAlertTriangle size={14} />
                    </motion.div>
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleSubmit} className="space-y-4 mb-5">
                <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.32 }}>
                  <ScanInput icon={FiMail} name="email" type="email" placeholder="Email address"
                    value={form.email} onChange={handleChange} required accentColor="#7C5CFF" />
                </motion.div>

                <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.38 }}>
                  <ScanInput icon={FiLock} name="password" type={showPass ? "text" : "password"}
                    placeholder="Password" value={form.password} onChange={handleChange} required
                    accentColor="#00E0FF"
                    rightEl={
                      <motion.button type="button" onClick={() => setShowPass(!showPass)}
                        whileHover={{ scale: 1.28, color: "#00E0FF" }} whileTap={{ scale: 0.85 }}
                        className="text-[#9CA3AF] hover:text-white transition-colors cursor-pointer">
                        <AnimatePresence mode="wait">
                          <motion.span key={showPass ? "off" : "on"}
                            initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
                            animate={{ rotate: 0, opacity: 1, scale: 1 }}
                            exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
                            transition={{ duration: 0.18 }}>
                            {showPass ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                          </motion.span>
                        </AnimatePresence>
                      </motion.button>
                    } />
                </motion.div>

                {/* Login button */}
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44 }}>
                  <motion.button type="submit" disabled={loading}
                    whileHover={{ scale: 1.025, boxShadow: "0 0 75px rgba(124,92,255,0.7), 0 0 35px rgba(0,224,255,0.35)" }}
                    whileTap={{ scale: 0.975 }}
                    className="w-full py-4 rounded-xl font-black text-white text-base relative overflow-hidden disabled:opacity-55 cursor-pointer"
                    style={{ background: "linear-gradient(135deg,#7C5CFF,#FF4FD8)" }}>
                    {/* Shimmer sweep */}
                    <motion.div className="absolute inset-0"
                      animate={{ x: ["-100%", "200%"] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                      style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)", width: "45%" }} />
                    {/* Top glow */}
                    <motion.div className="absolute inset-0 rounded-xl"
                      animate={{ opacity: [0, 0.2, 0] }}
                      transition={{ duration: 2.5, repeat: Infinity }}
                      style={{ background: "radial-gradient(circle at 50% -20%, rgba(255,255,255,0.7), transparent 65%)" }} />

                    <span className="relative flex items-center justify-center gap-2">
                      {loading ? (
                        <span className="flex items-center gap-3">
                          {[0, 1, 2].map(i => (
                            <motion.div key={i} className="w-2 h-2 rounded-full bg-white"
                              animate={{ y: [0, -9, 0] }}
                              transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.16 }} />
                          ))}
                        </span>
                      ) : success ? (
                        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 380 }}
                          className="flex items-center gap-2">
                          <FiCheck size={18} /> Signed in!
                        </motion.span>
                      ) : (
                        <span className="flex items-center gap-2">
                          Login
                          <motion.span animate={{ x: [0, 5, 0] }} transition={{ duration: 1.3, repeat: Infinity }}>
                            <FiArrowRight size={18} />
                          </motion.span>
                        </span>
                      )}
                    </span>
                  </motion.button>
                </motion.div>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-5">
                <motion.div className="flex-1 h-px bg-white/10"
                  animate={{ opacity: [0.35, 0.85, 0.35] }} transition={{ duration: 2.8, repeat: Infinity }} />
                <span className="text-[#9CA3AF] text-[11px] font-mono">or</span>
                <motion.div className="flex-1 h-px bg-white/10"
                  animate={{ opacity: [0.85, 0.35, 0.85] }} transition={{ duration: 2.8, repeat: Infinity }} />
              </div>

              {/* Google */}
              <motion.button onClick={handleGoogle} disabled={googleLoading}
                whileHover={{
                  scale: 1.025,
                  borderColor: "rgba(255,255,255,0.28)",
                  backgroundColor: "rgba(255,255,255,0.09)",
                  boxShadow: "0 4px 42px rgba(255,255,255,0.06)",
                }}
                whileTap={{ scale: 0.975 }}
                className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl border border-white/10 bg-white/4 text-[#E6E6EB] text-sm font-medium transition-all duration-250 disabled:opacity-50 cursor-pointer relative overflow-hidden">
                <motion.div className="absolute inset-0 pointer-events-none"
                  style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.05),transparent)" }}
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }} />
                {googleLoading ? (
                  <motion.div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white"
                    animate={{ rotate: 360 }} transition={{ duration: 0.75, repeat: Infinity, ease: "linear" }} />
                ) : (
                  <motion.div whileHover={{ rotate: 360, scale: 1.3 }} transition={{ duration: 0.5 }}>
                    <FcGoogle size={20} />
                  </motion.div>
                )}
                <span className="relative">Continue with Google</span>
              </motion.button>

              {/* Signup link */}
              <motion.p className="text-center text-[#9CA3AF] text-sm mt-5"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.62 }}>
                Don't have an account?{" "}
                <Link to="/signup" className="font-bold cursor-pointer relative inline-block">
                  <motion.span style={{ color: "#7C5CFF", display: "inline-block" }}
                    whileHover={{ color: "#00E0FF", y: -1 }} transition={{ duration: 0.18 }}>
                    Sign up
                    <motion.span className="absolute -bottom-0.5 left-0 right-0 h-px rounded-full"
                      style={{ background: "linear-gradient(90deg,#7C5CFF,#00E0FF)" }}
                      animate={{ scaleX: [0, 1, 0] }}
                      transition={{ duration: 2.2, repeat: Infinity }} />
                  </motion.span>{" "}
                  <motion.span style={{ color: "#7C5CFF" }}
                    animate={{ x: [0, 4, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>→</motion.span>
                </Link>
              </motion.p>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div className="flex items-center justify-center gap-8 mt-6"
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85 }}>
          {[
            { val: "25K+", label: "Sessions" },
            { val: "PKL", label: "Validated" },
            { val: "4 AI", label: "Agents" },
          ].map((s, i) => (
            <motion.div key={s.val} whileHover={{ scale: 1.14, y: -5 }} className="text-center cursor-default">
              <motion.p className="text-sm font-black"
                animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                transition={{ duration: 4, repeat: Infinity, delay: i * 0.5 }}
                style={{
                  backgroundImage: "linear-gradient(90deg,#7C5CFF,#00E0FF,#FF4FD8,#7C5CFF)",
                  backgroundSize: "200%",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}>
                {s.val}
              </motion.p>
              <p className="text-[#9CA3AF] text-[10px] font-mono">{s.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}