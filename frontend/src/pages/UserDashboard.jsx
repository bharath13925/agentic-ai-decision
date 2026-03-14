import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase";
import {
  FiCpu, FiEye, FiBarChart2, FiZap,
  FiLogOut, FiUser, FiActivity, FiTrendingUp, FiDatabase,
} from "react-icons/fi";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: "easeOut" },
});

const agentCards = [
  { icon: <FiEye size={20} />,       title: "Observer Agent",   status: "Active",  color: "#7C5CFF", desc: "Monitoring data streams" },
  { icon: <FiBarChart2 size={20} />, title: "Analyst Agent",    status: "Ready",   color: "#00E0FF", desc: "XGBoost model loaded" },
  { icon: <FiCpu size={20} />,       title: "Simulation Agent", status: "Standby", color: "#FF4FD8", desc: "Awaiting analysis output" },
  { icon: <FiZap size={20} />,       title: "Decision Agent",   status: "Standby", color: "#7C5CFF", desc: "Ready to generate strategy" },
];

const stats = [
  { icon: <FiActivity size={18} />,   label: "Decisions Made",  value: "0",  color: "#7C5CFF" },
  { icon: <FiTrendingUp size={18} />, label: "Accuracy Score",  value: "—",  color: "#00E0FF" },
  { icon: <FiDatabase size={18} />,   label: "Datasets Loaded", value: "0",  color: "#FF4FD8" },
  { icon: <FiBarChart2 size={18} />,  label: "Models Run",      value: "0",  color: "#7C5CFF" },
];

export default function UserDashboard() {
  const navigate = useNavigate();
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [backendUser, setBackendUser] = useState(null);  // fetched from MongoDB
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setFirebaseUser(u);
        // Fetch user profile from backend using Firebase UID
        try {
          const res = await fetch(`${API}/users/${u.uid}`);
          if (res.ok) {
            const data = await res.json();
            setBackendUser(data.user);
          }
        } catch (err) {
          console.error("Failed to fetch user from backend:", err.message);
        }
      } else {
        navigate("/login");
      }
      setLoading(false);
    });
    return () => unsub();
  }, [navigate]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  // Display name priority: backend name → Firebase displayName → email prefix
  const displayName =
    backendUser?.name ||
    firebaseUser?.displayName ||
    firebaseUser?.email?.split("@")[0] ||
    "User";

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0B0F] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-[#7C5CFF] border-t-transparent animate-spin" />
          <p className="text-[#9CA3AF] text-sm">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-[#E6E6EB] pt-20 pb-12 px-6"
      style={{
        background: `
          radial-gradient(circle at 20% 20%, #7c5cff15, transparent 50%),
          radial-gradient(circle at 80% 80%, #00e0ff10, transparent 50%),
          #0B0B0F
        `,
      }}
    >
      <div className="max-w-6xl mx-auto">

        {/* ── Header ── */}
        <motion.div
          {...fadeUp(0)}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10"
        >
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg bg-linear-to-br from-[#7C5CFF] to-[#00E0FF] flex items-center justify-center">
                <FiCpu className="text-white text-sm" />
              </div>
              <span className="text-white font-bold text-lg">
                <span className="text-[#7C5CFF]">Agentic</span>
                <span className="text-[#00E0FF]">IQ</span>
              </span>
            </div>

            {/* Welcome with backend name */}
            <h1 className="text-2xl md:text-3xl font-black text-white">
              Welcome back,{" "}
              <span
                style={{
                  background: "linear-gradient(90deg, #7C5CFF, #00E0FF)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {displayName}
              </span>{" "}
              👋
            </h1>
            <p className="text-[#9CA3AF] text-sm mt-1">{firebaseUser?.email}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5">
              <FiUser size={14} className="text-[#7C5CFF]" />
              <span className="text-[#E6E6EB] text-sm">{displayName}</span>
            </div>
            <motion.button
              onClick={handleLogout}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm transition-all"
            >
              <FiLogOut size={14} />
              Logout
            </motion.button>
          </div>
        </motion.div>

        {/* ── Stats Row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              {...fadeUp(i * 0.08)}
              className="bg-[#111118] border border-white/10 rounded-2xl p-5 flex flex-col gap-2"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: `${s.color}20`, color: s.color }}
              >
                {s.icon}
              </div>
              <div className="text-2xl font-black text-white">{s.value}</div>
              <div className="text-xs text-[#9CA3AF]">{s.label}</div>
            </motion.div>
          ))}
        </div>

        {/* ── Agent Cards ── */}
        <motion.h2 {...fadeUp(0.2)} className="text-lg font-bold text-white mb-4">
          Agent Pipeline
        </motion.h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {agentCards.map((a, i) => (
            <motion.div
              key={a.title}
              {...fadeUp(0.1 + i * 0.08)}
              whileHover={{ scale: 1.03, boxShadow: `0 0 30px ${a.color}22` }}
              className="bg-[#111118] border border-white/10 rounded-2xl p-5 cursor-pointer transition-all duration-300"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-white"
                style={{ background: `${a.color}25`, boxShadow: `0 0 15px ${a.color}33` }}
              >
                {a.icon}
              </div>
              <h3 className="text-[#E6E6EB] font-semibold text-sm mb-1">{a.title}</h3>
              <p className="text-[#9CA3AF] text-xs mb-3">{a.desc}</p>
              <span
                className="inline-block text-xs px-2 py-0.5 rounded-full font-mono"
                style={{ background: `${a.color}20`, color: a.color }}
              >
                {a.status}
              </span>
            </motion.div>
          ))}
        </div>

        {/* ── CTA ── */}
        <motion.div
          {...fadeUp(0.4)}
          className="bg-[#111118] border border-[#7C5CFF]/30 rounded-2xl p-8 text-center"
          style={{ background: "radial-gradient(circle at 50% 0%, #7c5cff10, transparent 60%), #111118" }}
        >
          <h3 className="text-xl font-black text-white mb-2">
            Start Your First Analysis, {displayName.split(" ")[0]}!
          </h3>
          <p className="text-[#9CA3AF] text-sm mb-6 max-w-md mx-auto">
            Upload a business dataset and let the multi-agent pipeline generate
            explainable decision recommendations.
          </p>
          <motion.button
            whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(124,92,255,0.5)" }}
            whileTap={{ scale: 0.97 }}
            className="px-8 py-3 rounded-xl font-semibold text-white bg-linear-to-r from-[#7C5CFF] to-[#00E0FF] shadow-[0_0_20px_rgba(124,92,255,0.35)] transition-all"
          >
            Upload Dataset →
          </motion.button>
        </motion.div>

      </div>
    </div>
  );
}