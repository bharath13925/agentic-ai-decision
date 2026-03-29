import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import { createUserWithEmailAndPassword, signInWithPopup, updateProfile } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import {
  FiCpu, FiMail, FiLock, FiUser, FiEye, FiEyeOff,
  FiArrowRight, FiAlertTriangle, FiCheck, FiZap, FiShield,
} from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/* ── Hex grid background ── */
function HexGrid() {
  const hexes = Array.from({ length: 48 }, (_, i) => ({
    id: i,
    col: i % 8,
    row: Math.floor(i / 8),
    delay: Math.random() * 4,
    dur: 3 + Math.random() * 4,
    color: ["#7C5CFF", "#FF4FD8", "#00E0FF", "#22C55E", "#FF9800"][i % 5],
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
      <svg width="100%" height="100%" className="absolute inset-0">
        <defs>
          <pattern id="hex" x="0" y="0" width="60" height="52" patternUnits="userSpaceOnUse">
            <polygon points="30,2 58,17 58,47 30,62 2,47 2,17"
              fill="none" stroke="rgba(124,92,255,0.12)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hex)" />
      </svg>
      {hexes.slice(0, 12).map(h => (
        <motion.div key={h.id} className="absolute w-3 h-3 rounded-full"
          style={{
            left: `${(h.col / 8) * 100 + (h.row % 2) * 6}%`,
            top: `${(h.row / 6) * 100}%`,
            background: h.color, filter: "blur(1px)",
          }}
          animate={{ opacity: [0, 0.8, 0], scale: [0.5, 1.5, 0.5] }}
          transition={{ duration: h.dur, repeat: Infinity, delay: h.delay }} />
      ))}
    </div>
  );
}

/* ── Ambient orbs ── */
function AmbientOrbs() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {[
        { x: "15%", y: "20%", color: "#7C5CFF", size: 300, dur: 9 },
        { x: "80%", y: "15%", color: "#FF4FD8", size: 240, dur: 11 },
        { x: "60%", y: "75%", color: "#00E0FF", size: 280, dur: 8 },
        { x: "8%",  y: "70%", color: "#22C55E", size: 200, dur: 13 },
        { x: "90%", y: "55%", color: "#FF9800", size: 180, dur: 7 },
      ].map((orb, i) => (
        <motion.div key={i} className="absolute rounded-full"
          style={{
            left: orb.x, top: orb.y,
            width: orb.size, height: orb.size,
            background: orb.color,
            filter: "blur(90px)",
            transform: "translate(-50%,-50%)",
            opacity: 0.07,
          }}
          animate={{ x: [0, 30, -20, 15, 0], y: [0, -25, 20, -10, 0], scale: [1, 1.15, 0.92, 1.08, 1] }}
          transition={{ duration: orb.dur, repeat: Infinity, ease: "easeInOut", delay: i * 0.8 }} />
      ))}
    </div>
  );
}

/* ── Floating particles ── */
function Sparks({ count = 18 }) {
  const sparks = useRef(
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 1,
      color: ["#7C5CFF", "#FF4FD8", "#00E0FF", "#22C55E"][i % 4],
      dur: 6 + Math.random() * 8,
      delay: Math.random() * 5,
    }))
  ).current;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {sparks.map(s => (
        <motion.div key={s.id} className="absolute rounded-full"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, background: s.color }}
          animate={{
            y: [0, -60 - Math.random() * 40, 0],
            x: [0, (Math.random() - 0.5) * 40, 0],
            opacity: [0, 0.9, 0],
            scale: [0.3, 1.4, 0.3],
          }}
          transition={{ duration: s.dur, repeat: Infinity, delay: s.delay, ease: "easeInOut" }} />
      ))}
    </div>
  );
}

/* ── Password strength ── */
function PasswordStrength({ password }) {
  const getScore = (p) => {
    if (!p) return 0;
    let s = 0;
    if (p.length >= 6) s++;
    if (p.length >= 10) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  };
  const score = getScore(password);
  const levels = [
    { label: "Weak", color: "#EF4444", glow: "#EF4444" },
    { label: "Fair", color: "#FF9800", glow: "#FF9800" },
    { label: "Good", color: "#FFD700", glow: "#FFD700" },
    { label: "Strong", color: "#22C55E", glow: "#22C55E" },
    { label: "Max", color: "#00E0FF", glow: "#00E0FF" },
  ];
  const cur = levels[Math.max(0, Math.min(score - 1, 4))];
  if (!password) return null;
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-1.5 overflow-hidden">
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/8">
            <motion.div className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: i < score ? "100%" : "0%", boxShadow: i < score ? `0 0 8px ${cur?.glow}` : "none" }}
              style={{ background: cur?.color }}
              transition={{ duration: 0.3, delay: i * 0.06 }} />
          </div>
        ))}
      </div>
      <motion.p className="text-[11px] font-mono" style={{ color: cur?.color }}
        animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 1.8, repeat: Infinity }}>
        ⚡ {cur?.label} password
      </motion.p>
    </motion.div>
  );
}

/* ── Laser input field ── */
function LaserInput({ icon: Icon, name, type, placeholder, value, onChange, required, rightEl, borderColor, accentColor = "#7C5CFF" }) {
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);

  return (
    <motion.div className="relative" whileHover={{ scale: 1.015 }} transition={{ duration: 0.18 }}>
      {/* Outer glow layer */}
      <motion.div className="absolute -inset-px rounded-xl pointer-events-none"
        animate={{ opacity: focused ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        style={{
          background: `linear-gradient(135deg, ${accentColor}60, ${accentColor}20)`,
          filter: "blur(6px)",
          borderRadius: "0.75rem",
        }} />

      {/* Main field */}
      <div className="relative rounded-xl overflow-hidden"
        style={{
          border: `1px solid ${borderColor || (focused ? `${accentColor}80` : touched && value ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.09)")}`,
          background: focused ? `${accentColor}0D` : "rgba(255,255,255,0.03)",
          transition: "all 0.25s ease",
        }}>
        {/* Laser sweep on focus */}
        {focused && (
          <motion.div className="absolute inset-0 pointer-events-none"
            style={{ background: `linear-gradient(90deg, transparent, ${accentColor}08, transparent)` }}
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
        )}

        {/* Top shimmer line */}
        {focused && (
          <motion.div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
            initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
            transition={{ duration: 0.35 }} />
        )}

        <motion.div className="absolute left-4 top-1/2 -translate-y-1/2"
          animate={{
            color: focused ? accentColor : "#9CA3AF",
            scale: focused ? 1.18 : 1,
            rotate: focused ? 8 : 0,
          }}
          transition={{ duration: 0.22 }}>
          <Icon size={15} />
        </motion.div>

        <input
          name={name} type={type} placeholder={placeholder} value={value}
          onChange={e => { onChange(e); setTouched(true); }} required={required}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          className="w-full pl-11 pr-12 py-3.5 text-sm text-[#E6E6EB] placeholder-[#9CA3AF]/60 focus:outline-none bg-transparent cursor-text"
        />

        {rightEl && <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{rightEl}</div>}
      </div>

      {/* Bottom laser line */}
      <motion.div className="absolute bottom-0 left-6 right-6 h-px rounded-full pointer-events-none"
        animate={{ scaleX: focused ? 1 : 0, opacity: focused ? 1 : 0 }}
        style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`, boxShadow: `0 0 8px ${accentColor}` }}
        transition={{ duration: 0.3 }} />
    </motion.div>
  );
}

/* ── Spinning logo ── */
function LogoOrbit() {
  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      {/* Outer rings */}
      {[0, 1, 2].map(i => (
        <motion.div key={i} className="absolute rounded-full border"
          style={{
            inset: `${i * 7}px`,
            borderColor: [`rgba(124,92,255,0.65)`, `rgba(255,79,216,0.4)`, `rgba(0,224,255,0.3)`][i],
            borderStyle: i === 1 ? "dashed" : "solid",
          }}
          animate={{ rotate: i % 2 === 0 ? 360 : -360, scale: [1, 1.04, 1] }}
          transition={{
            rotate: { duration: 5 + i * 2.5, repeat: Infinity, ease: "linear" },
            scale: { duration: 2.5 + i, repeat: Infinity, ease: "easeInOut" },
          }} />
      ))}

      {/* Orbiting dots */}
      {[
        { r: 44, color: "#7C5CFF", size: 6, dur: 3 },
        { r: 36, color: "#FF4FD8", size: 5, dur: 5, rev: true },
        { r: 28, color: "#00E0FF", size: 4, dur: 4 },
      ].map((dot, i) => (
        <motion.div key={i} className="absolute flex items-center justify-center"
          style={{ width: dot.size, height: dot.size }}
          animate={{ rotate: dot.rev ? -360 : 360 }}
          transition={{ duration: dot.dur, repeat: Infinity, ease: "linear" }}
          transformOrigin={`${dot.r / 2}px 0`}>
          <motion.div className="rounded-full"
            style={{ width: dot.size, height: dot.size, background: dot.color, boxShadow: `0 0 10px ${dot.color}` }}
            animate={{ scale: [1, 1.8, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 1.2 + i * 0.4, repeat: Infinity }} />
        </motion.div>
      ))}

      {/* Core */}
      <motion.div className="w-12 h-12 rounded-2xl flex items-center justify-center relative z-10 overflow-hidden"
        style={{ background: "linear-gradient(135deg,#7C5CFF,#FF4FD8)" }}
        animate={{ boxShadow: ["0 0 30px #7C5CFF60", "0 0 60px #FF4FD880", "0 0 30px #00E0FF60", "0 0 30px #7C5CFF60"] }}
        transition={{ duration: 3, repeat: Infinity }}>
        <motion.div className="absolute inset-0"
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
          style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)" }} />
        <FiCpu className="text-white relative z-10" size={20} />
      </motion.div>
    </div>
  );
}

export default function UserSignupForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const sX = useSpring(mouseX, { damping: 28, stiffness: 90 });
  const sY = useSpring(mouseY, { damping: 28, stiffness: 90 });
  const bgX = useTransform(sX, [-1, 1], [-22, 22]);
  const bgY = useTransform(sY, [-1, 1], [-18, 18]);
  const cardRotX = useTransform(sY, [-1, 1], [2, -2]);
  const cardRotY = useTransform(sX, [-1, 1], [-2, 2]);

  useEffect(() => {
    const h = (e) => {
      mouseX.set((e.clientX / window.innerWidth - 0.5) * 2);
      mouseY.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener("mousemove", h);
    return () => window.removeEventListener("mousemove", h);
  }, []);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const saveToBackend = async (uid, name, email, provider = "email") => {
    try {
      await fetch(`${API}/users/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, name, email, provider }),
      });
    } catch {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) { setError("Passwords do not match."); return; }
    if (form.password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await updateProfile(cred.user, { displayName: form.name });
      await saveToBackend(cred.user.uid, form.name, form.email, "email");
      setSuccess(true);
      setTimeout(() => navigate("/login", { state: { message: "Account created! Please login." } }), 1300);
    } catch (err) {
      const code = err.code;
      if (code === "auth/email-already-in-use") setError("This email is already registered.");
      else if (code === "auth/invalid-email") setError("Invalid email address.");
      else setError(err.message.replace("Firebase: ", ""));
    } finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    setError(""); setGoogleLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await saveToBackend(cred.user.uid, cred.user.displayName || "User", cred.user.email, "google");
      setSuccess(true);
      setTimeout(() => navigate("/dashboard"), 900);
    } catch (err) { setError(err.message.replace("Firebase: ", "")); }
    finally { setGoogleLoading(false); }
  };

  const passwordMatch = form.confirm && form.password === form.confirm;
  const passwordMismatch = form.confirm && form.password !== form.confirm;
  const filled = [form.name, form.email, form.password, passwordMatch].filter(Boolean).length;
  const progress = (filled / 4) * 100;

  return (
    <motion.div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden"
      style={{ background: "#06060E" }}
      animate={success ? { scale: 1.06, filter: "blur(6px)", opacity: 0 } : {}}
      transition={{ duration: 0.55 }}>

      <motion.div className="absolute inset-0" style={{ x: bgX, y: bgY }}>
        <AmbientOrbs />
        <HexGrid />
      </motion.div>
      <Sparks count={20} />

      {/* Corner decorations */}
      <motion.div className="absolute top-10 right-10 pointer-events-none"
        animate={{ rotate: 360 }} transition={{ duration: 22, repeat: Infinity, ease: "linear" }}>
        <div style={{ width: 72, height: 72, border: "1px solid rgba(255,79,216,0.18)", borderRadius: "38% 62% 63% 37% / 41% 44% 56% 59%" }} />
      </motion.div>
      <motion.div className="absolute bottom-10 left-10 pointer-events-none"
        animate={{ rotate: -360 }} transition={{ duration: 16, repeat: Infinity, ease: "linear" }}>
        <div style={{ width: 56, height: 56, border: "1px solid rgba(0,224,255,0.18)", borderRadius: "66% 34% 27% 73% / 47% 62% 38% 53%" }} />
      </motion.div>

      <motion.div className="w-full max-w-md relative z-10"
        initial={{ opacity: 0, y: 48, scale: 0.93 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}>

        {/* Logo */}
        <motion.div className="flex flex-col items-center gap-3 mb-6"
          initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <LogoOrbit />
          <div className="text-center">
            <div className="flex items-center gap-0.5 justify-center">
              <motion.span className="font-black text-2xl tracking-tight"
                animate={{ color: ["#7C5CFF", "#9B79FF", "#7C5CFF"] }}
                transition={{ duration: 3.5, repeat: Infinity }}>Agentic</motion.span>
              <motion.span className="font-black text-2xl tracking-tight"
                animate={{ color: ["#FF4FD8", "#FF80E8", "#FF4FD8"] }}
                transition={{ duration: 3.5, repeat: Infinity, delay: 0.6 }}>IQ</motion.span>
            </div>
            <p className="text-[#9CA3AF] text-[11px] font-mono mt-0.5 tracking-widest uppercase">Create your workspace</p>
          </div>
        </motion.div>

        {/* Progress bar */}
        <motion.div className="mb-5 px-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
          <div className="flex justify-between text-[10px] font-mono text-[#9CA3AF] mb-1.5">
            <span>Profile completion</span>
            <motion.span key={Math.round(progress)}
              initial={{ scale: 1.3, color: "#FF4FD8" }}
              animate={{ scale: 1, color: progress === 100 ? "#22C55E" : "#7C5CFF" }}
              transition={{ duration: 0.25 }}>
              {Math.round(progress)}%
            </motion.span>
          </div>
          <div className="h-1.5 bg-white/6 rounded-full overflow-hidden">
            <motion.div className="h-full rounded-full relative overflow-hidden"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              style={{ background: "linear-gradient(90deg,#7C5CFF,#FF4FD8,#00E0FF)", boxShadow: "0 0 12px #7C5CFF80" }}>
              <motion.div className="absolute inset-0"
                animate={{ x: ["-100%", "150%"] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)", width: "40%" }} />
            </motion.div>
          </div>
        </motion.div>

        {/* Card with 3D tilt */}
        <motion.div className="relative rounded-3xl overflow-hidden"
          style={{ rotateX: cardRotX, rotateY: cardRotY, transformPerspective: 1000 }}
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          whileHover={{ boxShadow: "0 0 120px rgba(124,92,255,0.18), 0 0 60px rgba(255,79,216,0.1)" }}>

          {/* Animated border gradient */}
          <motion.div className="absolute inset-0 rounded-3xl pointer-events-none"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 3, repeat: Infinity }}
            style={{
              background: "linear-gradient(135deg,#7C5CFF20,#FF4FD820,#00E0FF20,#7C5CFF20)",
              padding: "1px",
              borderRadius: "1.5rem",
            }} />

          <div style={{
            background: "linear-gradient(145deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.012) 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(28px)",
            borderRadius: "1.5rem",
          }}>
            {/* Animated top border */}
            <div className="h-px w-full relative overflow-hidden">
              <div className="h-full" style={{ background: "linear-gradient(90deg,transparent,#7C5CFF,#FF4FD8,#00E0FF,transparent)" }} />
              <motion.div className="absolute inset-0"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
                style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.9),transparent)", width: "28%" }} />
            </div>

            <div className="p-8 pb-5">
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
                <h2 className="text-2xl font-black text-white mb-1">Create account</h2>
                <p className="text-[#9CA3AF] text-sm mb-6">Join AgenticIQ — your AI decision platform.</p>
              </motion.div>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto", x: [0, -7, 7, -5, 5, 0] }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ x: { duration: 0.35 } }}
                    className="mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
                    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.28)", color: "#f87171" }}>
                    <motion.div animate={{ rotate: [0, 18, -18, 0] }} transition={{ duration: 0.45 }}>
                      <FiAlertTriangle size={14} />
                    </motion.div>
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleSubmit} className="space-y-3.5 mb-5">
                {/* Name */}
                <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.32 }}>
                  <LaserInput icon={FiUser} name="name" type="text" placeholder="Full name"
                    value={form.name} onChange={handleChange} required accentColor="#7C5CFF" />
                </motion.div>

                {/* Email */}
                <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.38 }}>
                  <LaserInput icon={FiMail} name="email" type="email" placeholder="Email address"
                    value={form.email} onChange={handleChange} required accentColor="#00E0FF" />
                </motion.div>

                {/* Password */}
                <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.44 }}
                  className="space-y-2">
                  <LaserInput icon={FiLock} name="password" type={showPass ? "text" : "password"}
                    placeholder="Password (min 6 chars)" value={form.password} onChange={handleChange} required
                    accentColor="#FF4FD8"
                    rightEl={
                      <motion.button type="button" onClick={() => setShowPass(!showPass)}
                        whileHover={{ scale: 1.25, color: "#FF4FD8" }} whileTap={{ scale: 0.85 }}
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
                  <AnimatePresence>
                    {form.password && <PasswordStrength password={form.password} />}
                  </AnimatePresence>
                </motion.div>

                {/* Confirm password */}
                <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}
                  className="space-y-1">
                  <LaserInput icon={FiShield} name="confirm" type={showConfirm ? "text" : "password"}
                    placeholder="Re-enter password" value={form.confirm} onChange={handleChange} required
                    accentColor={passwordMatch ? "#22C55E" : passwordMismatch ? "#EF4444" : "#7C5CFF"}
                    borderColor={passwordMatch ? "rgba(34,197,94,0.55)" : passwordMismatch ? "rgba(239,68,68,0.55)" : undefined}
                    rightEl={
                      <motion.button type="button" onClick={() => setShowConfirm(!showConfirm)}
                        whileHover={{ scale: 1.25 }} whileTap={{ scale: 0.85 }}
                        className="text-[#9CA3AF] hover:text-white transition-colors cursor-pointer">
                        <AnimatePresence mode="wait">
                          <motion.span key={showConfirm ? "off" : "on"}
                            initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
                            {showConfirm ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                          </motion.span>
                        </AnimatePresence>
                      </motion.button>
                    } />
                  <AnimatePresence>
                    {form.confirm && (
                      <motion.p initial={{ opacity: 0, y: -4, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className={`text-[11px] flex items-center gap-1.5 ${passwordMatch ? "text-[#22C55E]" : "text-red-400"}`}>
                        <motion.span
                          animate={passwordMatch ? { rotate: [0, 360], scale: [1, 1.4, 1] } : { x: [-2, 2, -2, 2, 0] }}
                          transition={{ duration: 0.4 }}>
                          {passwordMatch ? <FiCheck size={11} /> : <FiAlertTriangle size={11} />}
                        </motion.span>
                        {passwordMatch ? "Passwords match ✓" : "Passwords do not match"}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Submit */}
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.56 }}>
                  <motion.button type="submit" disabled={loading || success}
                    whileHover={{ scale: 1.025, boxShadow: "0 0 70px rgba(124,92,255,0.65), 0 0 30px rgba(255,79,216,0.4)" }}
                    whileTap={{ scale: 0.975 }}
                    className="w-full py-4 rounded-xl font-black text-white text-base relative overflow-hidden disabled:opacity-55 cursor-pointer mt-1"
                    style={{ background: "linear-gradient(135deg,#7C5CFF,#FF4FD8)" }}>
                    {/* Shimmer */}
                    <motion.div className="absolute inset-0"
                      animate={{ x: ["-100%", "200%"] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                      style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)", width: "45%" }} />
                    {/* Inner glow pulse */}
                    <motion.div className="absolute inset-0 rounded-xl"
                      animate={{ opacity: [0, 0.18, 0] }}
                      transition={{ duration: 2.2, repeat: Infinity }}
                      style={{ background: "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.8), transparent 60%)" }} />

                    <span className="relative flex items-center justify-center gap-2">
                      {loading ? (
                        <span className="flex items-center gap-3">
                          {[0, 1, 2].map(i => (
                            <motion.div key={i} className="w-2 h-2 rounded-full bg-white"
                              animate={{ y: [0, -10, 0], opacity: [0.5, 1, 0.5] }}
                              transition={{ duration: 0.55, repeat: Infinity, delay: i * 0.18 }} />
                          ))}
                          <span className="text-sm font-semibold">Creating account…</span>
                        </span>
                      ) : success ? (
                        <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: "spring", stiffness: 400 }}
                          className="flex items-center gap-2">
                          <FiCheck size={20} /> Account Created! 🎉
                        </motion.span>
                      ) : (
                        <span className="flex items-center gap-2">
                          Create Account
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
              <div className="flex items-center gap-3 mb-4">
                <motion.div className="flex-1 h-px bg-white/10"
                  animate={{ opacity: [0.4, 0.9, 0.4] }} transition={{ duration: 2.5, repeat: Infinity }} />
                <span className="text-[#9CA3AF] text-[11px] font-mono">or sign up with</span>
                <motion.div className="flex-1 h-px bg-white/10"
                  animate={{ opacity: [0.9, 0.4, 0.9] }} transition={{ duration: 2.5, repeat: Infinity }} />
              </div>

              {/* Google */}
              <motion.button onClick={handleGoogle} disabled={googleLoading}
                whileHover={{
                  scale: 1.025,
                  borderColor: "rgba(255,255,255,0.3)",
                  backgroundColor: "rgba(255,255,255,0.09)",
                  boxShadow: "0 4px 40px rgba(255,255,255,0.07)",
                }}
                whileTap={{ scale: 0.975 }}
                className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl border border-white/10 bg-white/4 text-[#E6E6EB] text-sm font-medium transition-all duration-250 disabled:opacity-50 cursor-pointer relative overflow-hidden">
                <motion.div className="absolute inset-0 pointer-events-none"
                  style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.04),transparent)" }}
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }} />
                {googleLoading ? (
                  <motion.div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white"
                    animate={{ rotate: 360 }} transition={{ duration: 0.75, repeat: Infinity, ease: "linear" }} />
                ) : (
                  <motion.div whileHover={{ rotate: 360, scale: 1.25 }} transition={{ duration: 0.5 }}>
                    <FcGoogle size={20} />
                  </motion.div>
                )}
                <span className="relative">Continue with Google</span>
              </motion.button>

              {/* Login link */}
              <motion.p className="text-center text-[#9CA3AF] text-sm mt-5"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
                Already have an account?{" "}
                <Link to="/login" className="font-bold cursor-pointer relative inline-block">
                  <motion.span style={{ color: "#7C5CFF", display: "inline-block" }}
                    whileHover={{ color: "#FF4FD8", y: -1 }} transition={{ duration: 0.18 }}>
                    Login
                  </motion.span>{" "}
                  <motion.span style={{ color: "#7C5CFF" }}
                    animate={{ x: [0, 4, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>→</motion.span>
                </Link>
              </motion.p>
            </div>

            {/* Feature chips */}
            <div className="px-8 pb-7 pt-1">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: FiZap, text: "5-step AI pipeline", color: "#7C5CFF" },
                  { icon: FiShield, text: "Secure & encrypted", color: "#22C55E" },
                  { icon: FiCpu, text: "4 autonomous agents", color: "#00E0FF" },
                  { icon: FiCheck, text: "Real ML training", color: "#FF4FD8" },
                ].map(({ icon: Icon, text, color }, i) => (
                  <motion.div key={text}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.78 + i * 0.07 }}
                    whileHover={{ scale: 1.04, x: 3, borderColor: `${color}40`, background: `${color}0A` }}
                    className="flex items-center gap-2 p-2.5 rounded-xl cursor-default transition-all"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <motion.div animate={{ scale: [1, 1.25, 1], rotate: [0, 8, 0] }}
                      transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.5 }}>
                      <Icon size={12} style={{ color }} />
                    </motion.div>
                    <span className="text-[10px] text-[#9CA3AF] font-mono">{text}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Trust stats */}
        <motion.div className="flex items-center justify-center gap-8 mt-5"
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.88 }}>
          {[
            { val: "25K+", label: "Sessions" },
            { val: "3 ML", label: "Models" },
            { val: "SHAP", label: "Explainable" },
          ].map((s, i) => (
            <motion.div key={s.val} whileHover={{ scale: 1.12, y: -4 }} className="text-center cursor-default">
              <motion.p className="text-sm font-black"
                animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                transition={{ duration: 4, repeat: Infinity, delay: i * 0.5 }}
                style={{
                  backgroundImage: "linear-gradient(90deg,#7C5CFF,#FF4FD8,#00E0FF,#7C5CFF)",
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