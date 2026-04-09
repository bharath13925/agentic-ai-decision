/**
 * UserDashboard.jsx — AgenticIQ v15.0
 *
 * Aligned with backend v15.0 (app.py v15.0, crew_pipeline.py v3.1):
 *  - All PKLs stored in MongoDB GridFS (not disk)
 *  - KPI regressor bundle passed directly to simulation_agent (not path)
 *  - crew_pipeline.run_crew_pipeline() used for agent orchestration
 *  - LangChain LCEL + Groq RAG (rag.py v4.0)
 *  - simulation_agent v8.0 ECO_FEATURES aligned (29 features)
 *  - decision_agent v5.5 dataset_stats validation + FIX Y/Z
 *  - observer_agent v3.4 dynamic CTR benchmark
 *  - Immediate reuse response (HTTP 200 + complete) handled without polling delay
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, animate } from "framer-motion";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase";
import {
  FiCpu, FiUpload, FiLogOut, FiCheck, FiAlertTriangle,
  FiEye, FiBarChart2, FiLoader, FiZap, FiTarget,
  FiCopy, FiRefreshCw, FiArrowRight, FiTrendingUp,
  FiActivity, FiInfo, FiShield, FiDatabase, FiClock,
  FiAward, FiArrowUp, FiArrowDown, FiChevronRight,
  FiStar, FiCheckCircle, FiXCircle, FiAlertCircle,
  FiMessageSquare, FiSend, FiX,
} from "react-icons/fi";

import Step5Charts from "../pages/Step5Charts";

// VITE_API_URL set in frontend/.env
// Local:  VITE_API_URL=http://localhost:5000/api
// Vercel: VITE_API_URL=https://api-agentiq.onrender.com/api  (set in Vercel dashboard)
const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
const STEP_ORDER  = ["home", "step1", "step2", "step3", "step45", "step5"];

/* ─────────────────────────────────────────────────────────────────
   FIX U: Channel conversion rates from REAL dataset (AI_DB88BC76)
   Google Ads: 22.7171%  FB: 22.1241%  IG: 22.0276%
   Email: 22.6433%  SEO: 21.6598%  Referral: 23.5984%
───────────────────────────────────────────────────────────────── */
const CHANNEL_CONV_RATE = {
  "Google Ads":   22.7171,
  "Facebook Ads": 22.1241,
  "Instagram":    22.0276,
  "Email":        22.6433,
  "SEO":          21.6598,
  "Referral":     23.5984,
};
const _meanChConv = Object.values(CHANNEL_CONV_RATE).reduce((a, b) => a + b, 0) /
                    Object.values(CHANNEL_CONV_RATE).length;   // ≈ 22.4284

const CHANNEL_EFFECTIVENESS = Object.fromEntries(
  Object.entries(CHANNEL_CONV_RATE).map(([k, v]) => [k, +(v / _meanChConv).toFixed(4)])
);

/* ─────────────────────────────────────────────────────────────────
   FIX V: Segment affinities from REAL user_type split (AI_DB88BC76)
   user_type=0 → New Customers / At Risk  (conv ratio 0.8258, abn 1.0946)
   user_type=1 → Returning / HV / Mobile  (conv ratio 1.1418, abn 0.9228)
───────────────────────────────────────────────────────────────── */
const SEGMENT_CONV_AFFINITY = {
  "All Customers":       1.1418,
  "New Customers":       0.8258,
  "Returning Customers": 1.1418,
  "High Value":          1.1418,
  "At Risk":             0.8258,
  "Mobile Users":        1.1418,
};
const SEGMENT_ABANDON_AFFINITY = {
  "All Customers":       0.9228,
  "New Customers":       1.0946,
  "Returning Customers": 0.9228,
  "High Value":          0.9228,
  "At Risk":             1.0946,
  "Mobile Users":        0.9228,
};

function getSegmentLabel(seg) {
  const conv = SEGMENT_CONV_AFFINITY[seg] ?? 1.0;
  const ab   = SEGMENT_ABANDON_AFFINITY[seg] ?? 1.0;
  const convPct = conv >= 1
    ? `+${((conv - 1) * 100).toFixed(1)}%`
    : `${((conv - 1) * 100).toFixed(1)}%`;
  const abPct = ab < 1
    ? `−${((1 - ab) * 100).toFixed(1)}%`
    : `+${((ab - 1) * 100).toFixed(1)}%`;
  return { convPct, abPct, conv, ab };
}

/* ════════════════════════════════════════════════════════════════
   DESIGN TOKENS
════════════════════════════════════════════════════════════════ */
const C = {
  violet: "#7C5CFF", cyan: "#00E0FF", pink: "#FF4FD8",
  green: "#22C55E", orange: "#FF9800", red: "#EF4444",
  yellow: "#F59E0B",
  border: "rgba(255,255,255,0.08)", card: "rgba(255,255,255,0.04)",
  text: "#E6E6EB", muted: "#9CA3AF", bg: "#0B0B0F",
};

/* ════════════════════════════════════════════════════════════════
   SHARED PRIMITIVES
════════════════════════════════════════════════════════════════ */
function FloatingParticles({ count = 25, colors = [C.violet, C.cyan, C.pink, C.green] }) {
  const particles = useRef(
    Array.from({ length: count }, (_, i) => ({
      id: i, x: Math.random() * 100, y: Math.random() * 100,
      size: Math.random() * 3 + 0.5, dur: 10 + Math.random() * 15,
      delay: Math.random() * 8, color: colors[i % colors.length],
      dx: (Math.random() - 0.5) * 30, dy: -(20 + Math.random() * 40),
    }))
  ).current;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <motion.div key={p.id} className="absolute rounded-full"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, background: p.color }}
          animate={{ x: [0, p.dx, 0], y: [0, p.dy, 0], opacity: [0, 0.6, 0], scale: [0.5, 1.2, 0.5] }}
          transition={{ duration: p.dur, repeat: Infinity, delay: p.delay, ease: "easeInOut" }} />
      ))}
    </div>
  );
}

function AnimatedNumber({ value, decimals = 1, suffix = "", prefix = "" }) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState("0");
  useEffect(() => {
    const c = animate(mv, value ?? 0, {
      duration: 1.4, ease: "easeOut",
      onUpdate: v => setDisplay(prefix + v.toFixed(decimals) + suffix),
    });
    return c.stop;
  }, [value]);
  return <span>{display}</span>;
}

function GlowOrb({ color = C.violet, size = 56, rings = 3, pulse = true }) {
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      {Array.from({ length: rings }).map((_, i) => (
        <motion.div key={i} className="absolute rounded-full border"
          style={{
            width: size + i * 18, height: size + i * 18,
            borderColor: `${color}${Math.max(8, 35 - i * 12).toString(16).padStart(2, "0")}`,
          }}
          animate={{ rotate: i % 2 === 0 ? 360 : -360, scale: pulse ? [1, 1.04, 1] : 1 }}
          transition={{
            rotate: { duration: 3 + i * 1.5, repeat: Infinity, ease: "linear" },
            scale:  { duration: 2 + i * 0.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 },
          }} />
      ))}
      <motion.div className="rounded-full flex items-center justify-center"
        style={{ width: size * 0.52, height: size * 0.52, background: `radial-gradient(circle, ${color}55, ${color}22)` }}
        animate={pulse ? { scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] } : {}}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} />
    </div>
  );
}

function DataStream({ active, color = C.violet, height = 2 }) {
  if (!active) return <div style={{ height }} className="rounded-full bg-white/5" />;
  return (
    <div style={{ height }} className="rounded-full bg-white/5 overflow-hidden relative">
      <motion.div className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: "35%", background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
        animate={{ x: ["-100%", "380%"] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
    </div>
  );
}

function NeuralNet({ active, color = C.violet }) {
  const nodes = [
    { x: 12, y: 50 }, { x: 32, y: 22 }, { x: 32, y: 50 }, { x: 32, y: 78 },
    { x: 62, y: 35 }, { x: 62, y: 65 }, { x: 85, y: 50 },
  ];
  const edges = [[0,1],[0,2],[0,3],[1,4],[2,4],[2,5],[3,5],[4,6],[5,6]];
  return (
    <div style={{ height: 72 }} className="relative w-full">
      <svg width="100%" height="72" className="absolute inset-0">
        {edges.map(([a, b], i) => (
          <motion.line key={i} x1={`${nodes[a].x}%`} y1={nodes[a].y} x2={`${nodes[b].x}%`} y2={nodes[b].y}
            stroke={color} strokeWidth={1}
            animate={active ? { strokeOpacity: [0.1, 0.5, 0.1] } : { strokeOpacity: 0.08 }}
            transition={{ duration: 1.8 + i * 0.2, repeat: Infinity, delay: i * 0.15 }} />
        ))}
        {active && edges.map(([a, b], i) => (
          <motion.circle key={`p${i}`} r={2.5} fill={color} fillOpacity={0.9}
            animate={{ cx: [`${nodes[a].x}%`, `${nodes[b].x}%`], cy: [nodes[a].y, nodes[b].y], opacity: [0, 1, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.35, ease: "easeInOut" }} />
        ))}
        {nodes.map((n, i) => (
          <motion.circle key={`n${i}`} cx={`${n.x}%`} cy={n.y} r={4.5} fill={color}
            animate={active ? { r: [3.5, 5.5, 3.5], fillOpacity: [0.5, 1, 0.5] } : { fillOpacity: 0.25 }}
            transition={{ duration: 1.2 + i * 0.12, repeat: Infinity, delay: i * 0.1 }} />
        ))}
      </svg>
    </div>
  );
}

function GlassCard({ children, className = "", accent, glow, hover = false, onClick }) {
  return (
    <motion.div
      className={`relative rounded-2xl overflow-hidden ${className}`}
      whileHover={hover ? { y: -3, boxShadow: `0 20px 60px ${accent || C.violet}18` } : {}}
      onClick={onClick}
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.01) 100%)",
        border: `1px solid ${accent ? `${accent}28` : "rgba(255,255,255,0.09)"}`,
        boxShadow: glow ? `0 0 50px ${glow}18, inset 0 1px 0 rgba(255,255,255,0.06)` : "inset 0 1px 0 rgba(255,255,255,0.04)",
        cursor: onClick ? "pointer" : undefined,
      }}>
      {accent && (
        <div className="absolute top-0 left-4 right-4 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}80, transparent)` }} />
      )}
      {children}
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   RAG CHAT CARD — replaces Resume Project on home screen
════════════════════════════════════════════════════════════════ */
function RagChatCard() {
  const [pid,        setPid]        = useState("");
  const [connected,  setConnected]  = useState(false);
  const [stats,      setStats]      = useState(null);
  const [messages,   setMessages]   = useState([]);
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [storing,    setStoring]    = useState(false);
  const [err,        setErr]        = useState("");
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const t = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const addMsg = (role, content, extra = {}) =>
    setMessages(prev => [...prev, { role, content, time: t(), ...extra }]);

  const handleConnect = async () => {
    const id = pid.trim().toUpperCase();
    if (!id) { setErr("Enter a Project ID."); return; }
    setConnecting(true); setErr("");
    try {
      const res  = await fetch(`${API}/rag/stats/${id}`);
      const data = await res.json();
      setStats(data); setConnected(true);
      if (data.exists && data.total_docs > 0) {
        addMsg("assistant", `Connected to **${id}** — ${data.total_docs} analysis chunks loaded. Ask me anything about your KPIs, strategies, or ML results!`);
      } else {
        await handleStoreContext(id);
      }
    } catch (e) { setErr(e.message || "Failed to connect."); }
    setConnecting(false);
  };

  const handleStoreContext = async (id) => {
    setStoring(true);
    try {
      const res  = await fetch(`${API}/rag/store`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id || pid.trim().toUpperCase() }),
      });
      const data = await res.json();
      const statsRes = await fetch(`${API}/rag/stats/${id || pid.trim().toUpperCase()}`);
      setStats(await statsRes.json());
      if (data.status === "success") {
        addMsg("assistant", `Loaded ${data.stored?.length || 0} analysis chunks from your ML pipeline. Ask me anything!`);
      } else {
        addMsg("assistant", data.message?.includes("No completed agent")
          ? "No agent pipeline results found. Run the Agent Decision Pipeline first."
          : "Could not load analysis context — complete the ML pipeline first.");
      }
    } catch { setErr("Could not load context. Is the Python service running?"); }
    setStoring(false);
  };

  const sendMessage = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput(""); addMsg("user", q); setLoading(true);
    try {
      const res  = await fetch(`${API}/rag/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid.trim().toUpperCase(), query: q, topK: 4 }),
      });
      const data = await res.json();
      addMsg("assistant", data.answer || "No response.", { sources: data.sources || [] });
    } catch { addMsg("assistant", "Connection error — is the Python microservice running?"); }
    setLoading(false);
  };

  const SUGGESTIONS = [
    "Why is my conversion rate low?",
    "What strategy is recommended?",
    "Which ML features matter most?",
    "How can I reduce cart abandonment?",
  ];

  /* ── Disconnected / Login State ── */
  if (!connected) {
    return (
      <GlassCard className="p-8 h-full" accent={C.cyan}>
        <motion.div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: "linear-gradient(135deg,rgba(0,224,255,0.3),rgba(124,92,255,0.2))", border: "1px solid rgba(0,224,255,0.4)" }}
          animate={{ boxShadow: ["0 0 0 0 #00E0FF30","0 0 0 14px #00E0FF00"] }} transition={{ duration: 2, repeat: Infinity }}>
          <FiMessageSquare className="text-[#00E0FF]" size={20} />
        </motion.div>
        <h2 className="text-white font-black text-xl mb-2">Project AI Assistant</h2>
        <p className="text-[#9CA3AF] text-sm leading-relaxed mb-5">
          Enter your Project ID to chat with an AI grounded in your real ML pipeline results — KPIs, strategies, and feature insights.
        </p>
        <div className="flex gap-2 mb-3">
          <input value={pid} onChange={e => setPid(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleConnect()}
            placeholder="AI_XXXXXXXX"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-[#E6E6EB] text-sm font-mono placeholder-[#9CA3AF] focus:outline-none focus:border-[#00E0FF]/50 transition-all" />
          <motion.button onClick={handleConnect} disabled={connecting}
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            className="px-4 py-2.5 rounded-xl text-[#00E0FF] text-sm font-bold border border-[#00E0FF]/30 disabled:opacity-50"
            style={{ background: "rgba(0,224,255,0.12)" }}>
            {connecting
              ? <motion.div className="w-4 h-4 rounded-full border-2 border-[#00E0FF]/40 border-t-[#00E0FF]"
                  animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
              : "Connect →"}
          </motion.button>
        </div>
        {err && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-red-400 text-xs mb-3 flex items-center gap-1">
            <FiAlertTriangle size={11} /> {err}
          </motion.p>
        )}
        <div className="mt-3">
          <p className="text-[#9CA3AF] text-[10px] font-mono uppercase tracking-widest mb-2">Sample questions</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.slice(0, 3).map(q => (
              <span key={q} className="text-[9px] px-2 py-1 rounded-lg border border-white/8 bg-white/3 text-[#9CA3AF]">{q}</span>
            ))}
          </div>
        </div>
        <div className="mt-4 p-3 rounded-xl border border-[#7C5CFF]/20 bg-[#7C5CFF]/5">
          <div className="flex gap-2">
            <FiInfo size={12} className="text-[#7C5CFF] mt-0.5 shrink-0" />
            <p className="text-[#9CA3AF] text-[10px] leading-relaxed">
              Powered by FAISS + Groq API. Set <span className="text-[#00E0FF] font-mono">GROQ_API_KEY</span> in python-microservice/.env
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  /* ── Connected / Chat State ── */
  return (
    <GlassCard className="p-0 overflow-hidden h-full flex flex-col" accent={C.cyan}>
      {/* Header */}
      <div className="p-4 border-b border-white/8 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg,#00E0FF20,#7C5CFF20)", border: "1px solid #00E0FF30" }}>
          <FiMessageSquare size={14} className="text-[#00E0FF]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-bold font-mono">{pid.trim().toUpperCase()}</p>
          <p className="text-[#9CA3AF] text-[10px] font-mono">
            {stats?.total_docs ? `${stats.total_docs} chunks · RAG ready` : "Loading context…"}
          </p>
        </div>
        <div className="flex gap-1.5">
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            onClick={() => handleStoreContext()} disabled={storing} title="Refresh context"
            style={{ width: 26, height: 26, borderRadius: 8, background: `${C.violet}15`, border: `1px solid ${C.violet}30`, cursor: "pointer", color: C.violet, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {storing
              ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}><FiRefreshCw size={10} /></motion.div>
              : <FiRefreshCw size={10} />}
          </motion.button>
          <motion.button whileHover={{ scale: 1.1 }}
            onClick={() => { setConnected(false); setMessages([]); setStats(null); setPid(""); }}
            style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", color: C.muted, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FiX size={10} />
          </motion.button>
        </div>
      </div>

      {/* Stats badges */}
      {stats && (
        <div className="px-4 py-2 border-b border-white/6 flex gap-1.5 flex-wrap">
          {[
            { label: `${stats.total_docs} chunks`, c: C.cyan },
            { label: stats.groq_available ? "Groq LLM ready" : "LLM offline", c: stats.groq_available ? C.green : C.orange },
            { label: stats.faiss_available ? "FAISS" : "cosine", c: C.violet },
          ].map(({ label, c }) => (
            <span key={label} style={{ fontSize: 9, fontFamily: "monospace", color: c, background: `${c}12`, border: `1px solid ${c}25`, padding: "2px 7px", borderRadius: 20 }}>
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 0", maxHeight: 260 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <p style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>Ask me about your analysis results</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {SUGGESTIONS.map(q => (
                <motion.button key={q} whileHover={{ x: 3 }} onClick={() => sendMessage(q)} disabled={loading}
                  style={{ background: `${C.violet}08`, border: `1px solid ${C.violet}20`, borderRadius: 10, padding: "7px 12px", cursor: "pointer", color: C.muted, fontSize: 11, textAlign: "left" }}>
                  {q}
                </motion.button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row", alignItems: "flex-start", gap: 6, marginBottom: 10 }}>
            {msg.role === "assistant" && (
              <div style={{ width: 24, height: 24, borderRadius: 7, background: `${C.cyan}20`, border: `1px solid ${C.cyan}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                <FiCpu size={11} style={{ color: C.cyan }} />
              </div>
            )}
            <div style={{ maxWidth: "82%" }}>
              <div style={{ background: msg.role === "user" ? `linear-gradient(135deg,${C.violet}25,${C.violet}10)` : "rgba(255,255,255,0.04)", border: `1px solid ${msg.role === "user" ? `${C.violet}30` : C.border}`, borderRadius: msg.role === "user" ? "14px 4px 14px 14px" : "4px 14px 14px 14px", padding: "9px 12px", color: C.text, fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {msg.content.split(/\*\*(.*?)\*\*/g).map((part, j) =>
                  j % 2 === 1 ? <strong key={j} style={{ color: "#fff" }}>{part}</strong> : part
                )}
              </div>
              {msg.sources?.length > 0 && (
                <p style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", marginTop: 3 }}>
                  {msg.sources.length} source{msg.sources.length > 1 ? "s" : ""} · {msg.time}
                </p>
              )}
            </div>
          </motion.div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <div style={{ width: 24, height: 24, borderRadius: 7, background: `${C.cyan}20`, border: `1px solid ${C.cyan}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FiCpu size={11} style={{ color: C.cyan }} />
            </div>
            <div style={{ padding: "9px 12px", borderRadius: "4px 14px 14px 14px", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, display: "flex", gap: 4 }}>
              {[0,1,2].map(i => (
                <motion.div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: C.cyan }}
                  animate={{ opacity: [0.3,1,0.3], scale: [0.8,1.2,0.8] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i*0.18 }} />
              ))}
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()} disabled={loading}
            placeholder="Ask about KPIs, strategies, ML features…"
            style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 12px", color: C.text, fontSize: 12, outline: "none", fontFamily: "inherit" }} />
          <motion.button onClick={() => sendMessage()} disabled={loading || !input.trim()}
            whileHover={!loading && input.trim() ? { scale: 1.06 } : {}}
            style={{ width: 36, height: 36, borderRadius: 10, border: "none", cursor: !loading && input.trim() ? "pointer" : "not-allowed", background: !loading && input.trim() ? `linear-gradient(135deg,${C.violet},${C.cyan})` : "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
            {loading
              ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}><FiLoader size={13} /></motion.div>
              : <FiSend size={13} />}
          </motion.button>
        </div>
      </div>
    </GlassCard>
  );
}

/* ════════════════════════════════════════════════════════════════
   STEP BREADCRUMB
════════════════════════════════════════════════════════════════ */
function StepBreadcrumb({ current }) {
  const steps = [
    { id: "step1",  label: "Upload",    icon: FiUpload   },
    { id: "step2",  label: "Objective", icon: FiTarget   },
    { id: "step3",  label: "Simulate",  icon: FiActivity },
    { id: "step45", label: "Train ML",  icon: FiCpu      },
    { id: "step5",  label: "Decide",    icon: FiZap      },
  ];
  const currentIdx = steps.findIndex(s => s.id === current);
  const pct = currentIdx < 0 ? 0 : Math.round((currentIdx / (steps.length - 1)) * 100);
  return (
    <div className="mb-7">
      <div className="h-0.5 rounded-full bg-white/6 overflow-hidden mb-4">
        <motion.div className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg,#7C5CFF,#FF4FD8,#00E0FF)" }}
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
      </div>
      <div className="flex items-center justify-between">
        {steps.map((s, i) => {
          const done = i < currentIdx; const active = i === currentIdx;
          const Icon = s.icon;
          return (
            <React.Fragment key={s.id}>
              <motion.div className="flex flex-col items-center gap-1.5"
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}>
                <motion.div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border relative transition-all ${
                    active ? "bg-[#7C5CFF]/20 border-[#7C5CFF]/60" :
                    done   ? "bg-[#22C55E]/15 border-[#22C55E]/40" : "bg-white/3 border-white/8"
                  }`}
                  animate={active ? { boxShadow: ["0 0 0 0 #7C5CFF30","0 0 0 10px #7C5CFF00","0 0 0 0 #7C5CFF30"] } : {}}
                  transition={{ duration: 2.2, repeat: Infinity }}>
                  {done   ? <FiCheck size={13} className="text-[#22C55E]" /> :
                   active ? <Icon size={13}   className="text-[#7C5CFF]"  /> :
                             <Icon size={13}   className="text-white/20"   />}
                  {active && (
                    <motion.span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#7C5CFF]"
                      animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }}
                      transition={{ duration: 1.4, repeat: Infinity }} />
                  )}
                </motion.div>
                <span className={`text-[9px] font-mono tracking-wide hidden sm:block ${
                  active ? "text-[#7C5CFF]" : done ? "text-[#22C55E]" : "text-white/18"
                }`}>{s.label}</span>
              </motion.div>
              {i < steps.length - 1 && (
                <motion.div className="flex-1 h-px mx-1"
                  style={{ background: i < currentIdx ? "#22C55E" : "rgba(255,255,255,0.06)" }}
                  animate={i === currentIdx - 1 ? { opacity: [0.4, 1, 0.4] } : {}}
                  transition={{ duration: 2, repeat: Infinity }} />
              )}
            </React.Fragment>
          );
        })}
        <span className="text-[10px] font-mono text-white/25 ml-2">
          {Math.max(0, currentIdx + 1)}/{steps.length}
        </span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   BADGE COMPONENTS
════════════════════════════════════════════════════════════════ */
function KpiPredictorBadge({ path }) {
  if (!path) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-full border border-red-500/30 bg-red-500/10 text-red-400">
      <FiAlertTriangle size={9} /> KPI Regressor: missing
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-full border border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]">
      <FiShield size={9} /> KPI Regressor: ✓ ready
    </span>
  );
}

function MlDrivenBadge({ mlDriven, weightsUsed }) {
  if (!mlDriven) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-full border border-[#7C5CFF]/35 bg-[#7C5CFF]/10 text-[#7C5CFF]">
        <FiCpu size={9} /> ML-Driven projection
      </span>
      <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-full border border-[#00E0FF]/30 bg-[#00E0FF]/8 text-[#00E0FF]">
        <FiDatabase size={9} /> weights: {weightsUsed ?? "default"}
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   STEP 3 — SIMULATION MODE
   FIX W: preview badges use REAL channel/segment affinities (AI_DB88BC76)
════════════════════════════════════════════════════════════════ */
function Step3SimulationMode({ project, currentObjective, firebaseUser, onNext, onBack }) {
  const [mode,     setMode]     = useState(null);
  const [adBudget, setAdBudget] = useState(10);
  const [discount, setDiscount] = useState(5);
  const [channel,  setChannel]  = useState("Google Ads");
  const [segment,  setSegment]  = useState("All Customers");
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");

  const channels = Object.keys(CHANNEL_EFFECTIVENESS);
  const segments = Object.keys(SEGMENT_CONV_AFFINITY);

  const chConvRate = CHANNEL_CONV_RATE[channel] ?? _meanChConv;
  const chEff      = CHANNEL_EFFECTIVENESS[channel] ?? 1.0;
  const segEff     = SEGMENT_CONV_AFFINITY[segment]   ?? 1.0;
  const segAb      = SEGMENT_ABANDON_AFFINITY[segment] ?? 1.0;
  const { convPct, abPct } = getSegmentLabel(segment);

  const convDir    = segEff >= 1.0 ? "up" : "down";
  const abandonDir = segAb  <= 1.0 ? "down" : "up";
  const roiDir     = (adBudget * 0.35 * chEff - discount * 0.60) >= 0 ? "up" : "down";

  const handleSave = async () => {
    if (!mode) { setErr("Please select a mode."); return; }
    setSaving(true); setErr("");
    try {
      const body = {
        uid: firebaseUser.uid, simulationMode: mode,
        strategyInput: mode === "mode1"
          ? { adBudgetIncrease: adBudget, discount, channel, customerSegment: segment }
          : {},
      };
      const res  = await fetch(`${API}/projects/simulation-mode/${project.projectId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      scrollToTop();
      onNext({ simulationMode: mode, strategyInput: body.strategyInput });
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <motion.div key="step3"
      initial={{ opacity: 0, x: 40, filter: "blur(5px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, x: -40, filter: "blur(5px)" }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}>
      <div className="max-w-4xl mx-auto">
        <GlassCard className="p-7">
          <StepBreadcrumb current="step3" />
          <div className="flex items-center gap-3 mb-2">
            <motion.div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#FF4FD8,#7C5CFF)" }}
              animate={{ rotate: [0, 8, -8, 0] }} transition={{ duration: 5, repeat: Infinity }}>
              <FiActivity size={16} className="text-white" />
            </motion.div>
            <div>
              <span className="text-[10px] font-mono text-[#FF4FD8] uppercase tracking-widest">Step 3 of 5</span>
              <h2 className="text-2xl font-black text-white">Strategy Simulation</h2>
            </div>
          </div>
          <p className="text-[#9CA3AF] text-sm mb-7">
            Project: <span className="text-[#7C5CFF] font-semibold">{project.projectName}</span>
            {" · "}Objective: <span className="text-[#00E0FF] font-semibold">
              {currentObjective?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
            </span>
          </p>

          {/* Mode cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {[
              {
                id: "mode1", label: "Mode 1 — User Defined", sub: "I have a strategy in mind",
                icon: FiActivity, color: C.violet,
                desc: "Define your ad budget, discount, channel, and target segment. Projections calibrated from your dataset via KPI regressor.",
              },
              {
                id: "mode2", label: "Mode 2 — Auto AI", sub: "Let AI decide everything",
                icon: FiCpu, color: C.cyan,
                desc: "AI agents analyse your real KPI gaps and autonomously generate 3–5 feature-importance-driven strategies ranked by ML-projected ROI.",
              },
            ].map(({ id, label, sub, icon: Icon, color, desc }) => (
              <motion.div key={id} onClick={() => setMode(id)}
                whileHover={{ scale: 1.025, y: -2 }} whileTap={{ scale: 0.975 }}
                className="p-5 rounded-2xl border cursor-pointer transition-all relative overflow-hidden"
                style={{
                  borderColor: mode === id ? `${color}70` : "rgba(255,255,255,0.08)",
                  background:  mode === id ? `${color}0C`  : "rgba(255,255,255,0.02)",
                }}>
                {mode === id && (
                  <motion.div className="absolute inset-0"
                    style={{ background: `radial-gradient(circle at 20% 50%, ${color}12, transparent 70%)` }}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
                )}
                <div className="flex items-center gap-3 mb-3 relative z-10">
                  <motion.div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: mode === id ? `${color}28` : "rgba(255,255,255,0.06)" }}
                    animate={mode === id ? { boxShadow: [`0 0 0 0 ${color}40`, `0 0 0 10px ${color}00`] } : {}}
                    transition={{ duration: 1.8, repeat: Infinity }}>
                    <Icon size={17} style={{ color: mode === id ? color : "#9CA3AF" }} />
                  </motion.div>
                  <div className="flex-1">
                    <p className="text-white font-bold text-sm">{label}</p>
                    <p className="text-[#9CA3AF] text-xs">{sub}</p>
                  </div>
                  <AnimatePresence>
                    {mode === id && (
                      <motion.div className="w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ background: color }}
                        initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                        transition={{ type: "spring", bounce: 0.5 }}>
                        <FiCheck size={12} className="text-white" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <p className="text-[#9CA3AF] text-xs leading-relaxed relative z-10">{desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Mode 1 params */}
          <AnimatePresence>
            {mode === "mode1" && (
              <motion.div initial={{ opacity: 0, height: 0, y: -8 }} animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-6">
                <GlassCard className="p-5" accent={C.violet}>
                  <p className="text-[#9CA3AF] text-[10px] font-mono uppercase tracking-widest mb-5">Your Strategy Parameters</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                      { label: "Ad Budget Increase", val: `+${adBudget}%`, color: C.violet, min: 0, max: 50, value: adBudget, onChange: v => setAdBudget(v) },
                      { label: "Discount Offer",      val: `${discount}%`,  color: C.pink,   min: 0, max: 30, value: discount, onChange: v => setDiscount(v)  },
                    ].map(({ label, val, color, min, max, value, onChange }) => (
                      <div key={label}>
                        <div className="flex justify-between mb-3">
                          <label className="text-[#E6E6EB] text-sm font-semibold">{label}</label>
                          <motion.span className="font-black text-sm" style={{ color }}
                            key={value} initial={{ scale: 1.4 }} animate={{ scale: 1 }} transition={{ duration: 0.18 }}>
                            {val}
                          </motion.span>
                        </div>
                        <input type="range" min={min} max={max} value={value}
                          onChange={e => onChange(Number(e.target.value))}
                          className="w-full h-1.5" style={{ accentColor: color }} />
                        <div className="flex justify-between text-[10px] text-[#9CA3AF] mt-1">
                          <span>{min}%</span><span>{max}%</span>
                        </div>
                      </div>
                    ))}

                    {/* Channel selector */}
                    <div>
                      <label className="text-[#E6E6EB] text-sm font-semibold block mb-2">Marketing Channel</label>
                      <select value={channel} onChange={e => setChannel(e.target.value)}
                        className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-[#E6E6EB] text-sm focus:outline-none focus:border-[#7C5CFF]/60 transition-all">
                        {channels.map(c => <option key={c} value={c} className="bg-[#0E0E18]">{c}</option>)}
                      </select>
                      <div className="mt-1.5 flex gap-3">
                        <p className="text-[#9CA3AF] text-[10px]">
                          Real conv rate: <span className="font-bold text-[#00E0FF]">{chConvRate.toFixed(4)}%</span>
                        </p>
                        <p className="text-[#9CA3AF] text-[10px]">
                          Eff: <span className={`font-bold ${chEff >= 1 ? "text-[#22C55E]" : "text-[#FF9800]"}`}>
                            {chEff >= 1 ? "+" : ""}{((chEff - 1) * 100).toFixed(1)}% vs avg
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Segment selector */}
                    <div>
                      <label className="text-[#E6E6EB] text-sm font-semibold block mb-2">Customer Segment</label>
                      <select value={segment} onChange={e => setSegment(e.target.value)}
                        className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-[#E6E6EB] text-sm focus:outline-none focus:border-[#7C5CFF]/60 transition-all">
                        {segments.map(s => <option key={s} value={s} className="bg-[#0E0E18]">{s}</option>)}
                      </select>
                      <div className="flex gap-3 mt-1.5">
                        <span className="text-[#9CA3AF] text-[10px]">
                          Conv: <span className={`font-bold ${segEff >= 1 ? "text-[#22C55E]" : "text-[#FF9800]"}`}>{convPct}</span>
                        </span>
                        <span className="text-[#9CA3AF] text-[10px]">
                          Abandon: <span className={`font-bold ${segAb <= 1 ? "text-[#22C55E]" : "text-[#FF9800]"}`}>{abPct}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Impact preview */}
                  <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { label: "CTR",        val: adBudget > 0 ? "▲ Budget" : "─ Flat",                         color: C.violet },
                      { label: "Conversion", val: `${convDir === "up" ? "▲" : "▼"} ${convPct}`,                 color: convDir === "up"    ? C.green : C.orange },
                      { label: "Abandon",    val: `${abandonDir === "down" ? "▼" : "▲"} ${abPct}`,              color: abandonDir === "down" ? C.green : C.orange },
                      { label: "ROI",        val: roiDir === "up" ? "▲ Positive" : "▼ Cost",                    color: roiDir === "up" ? C.green : C.orange },
                    ].map(({ label, val, color }) => (
                      <motion.div key={label} className="p-3 rounded-xl text-center border"
                        style={{ background: `${color}08`, borderColor: `${color}25` }}
                        whileHover={{ scale: 1.05, borderColor: `${color}55` }}>
                        <p className="text-[#9CA3AF] text-[9px] uppercase mb-1">{label}</p>
                        <p className="text-xs font-bold" style={{ color }}>{val}</p>
                      </motion.div>
                    ))}
                  </div>
                  <p className="text-[#9CA3AF] text-[9px] mt-3 font-mono">
                    ⓘ Channel/segment affinities sourced from your uploaded dataset · Referral typically shows highest conversion rate
                  </p>
                </GlassCard>
              </motion.div>
            )}

            {/* Mode 2 info */}
            {mode === "mode2" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-6">
                <GlassCard className="p-5" accent={C.cyan}>
                  <NeuralNet active={true} color={C.cyan} />
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {[
                      { label: "Observer Agent",   color: C.violet, desc: "KPI gap detection"                   },
                      { label: "Analyst Agent",    color: C.cyan,   desc: "Feature-importance root causes"      },
                      { label: "Simulation Agent", color: C.pink,   desc: "KPI regressor ML projection"         },
                      { label: "Decision Agent",   color: C.green,  desc: "PKL validation & ranking"            },
                    ].map(({ label, color, desc }, i) => (
                      <motion.div key={label} className="flex items-center gap-2 p-2.5 rounded-xl border"
                        style={{ borderColor: `${color}20`, background: `${color}08` }}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.07 }}>
                        <motion.div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }}
                          animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }}
                          transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.3 }} />
                        <div>
                          <p className="text-white text-[11px] font-semibold">{label}</p>
                          <p className="text-[#9CA3AF] text-[9px]">{desc}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <div className="mt-3 p-2.5 rounded-xl border border-[#7C5CFF]/20 bg-[#7C5CFF]/5 flex items-start gap-2">
                    <FiInfo size={12} className="text-[#7C5CFF] mt-0.5 shrink-0" />
                    <p className="text-[#9CA3AF] text-[10px] leading-relaxed">
                      Simulation Agent uses a <span className="text-[#7C5CFF] font-semibold">RandomForestRegressor (kpi_predictor.pkl)</span> trained
                      on your real data using 29 ML features — PKLs stored in MongoDB GridFS (v15.0). KPI Regressor projects strategy outcomes.
                    </p>
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>

          {err && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
              <FiAlertTriangle size={14} /> {err}
            </motion.div>
          )}
          <div className="flex gap-3">
            <button onClick={onBack}
              className="px-5 py-3 rounded-xl border border-white/10 text-[#9CA3AF] hover:text-white hover:border-white/25 hover:bg-white/4 text-sm transition-all">
              ← Back
            </button>
            <motion.button onClick={handleSave} disabled={saving || !mode}
              whileHover={!saving && mode ? { scale: 1.02, boxShadow: "0 0 35px rgba(124,92,255,0.5)" } : {}}
              whileTap={{ scale: 0.97 }}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white relative overflow-hidden disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#7C5CFF,#FF4FD8)" }}>
              <motion.div className="absolute inset-0"
                animate={{ x: ["-100%", "100%"] }} transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
                style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)" }} />
              <span className="relative flex items-center gap-2">
                {saving ? (
                  <><motion.div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white"
                    animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }} /> Saving…</>
                ) : (
                  <><FiArrowRight size={16} /> Save & Continue</>
                )}
              </span>
            </motion.button>
          </div>
        </GlassCard>
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   STEP 4+5 AUTO PIPELINE
   FIX X: strict single-fire guard via trainingStartedRef
════════════════════════════════════════════════════════════════ */
function Step4And5Auto({ project, currentObjective, savedSimMode, firebaseUser, onBack, onDone }) {
  const [phase,        setPhase]        = useState("training_ml");
  const [mlResult,     setMlResult]     = useState(null);
  const [agentResult,  setAgentResult]  = useState(null);
  const [errMsg,       setErrMsg]       = useState("");
  const [requiresRetrain, setRequiresRetrain] = useState(false);
  const [activeAgent,  setActiveAgent]  = useState(0);
  const [dots,         setDots]         = useState(1);
  const mlPollRef        = useRef(null);
  const agentPollRef     = useRef(null);
  const agentStartedRef  = useRef(false);
  const mlDoneRef        = useRef(false);
  const trainingStartedRef = useRef(false);

  useEffect(() => {
    if (trainingStartedRef.current) return;
    trainingStartedRef.current = true;
    startMLTraining();
    const dotsTimer = setInterval(() => setDots(d => (d % 3) + 1), 550);
    return () => {
      if (mlPollRef.current)    clearInterval(mlPollRef.current);
      if (agentPollRef.current) clearInterval(agentPollRef.current);
      clearInterval(dotsTimer);
    };
  }, []);

  const startMLTraining = async () => {
    try {
      const res  = await fetch(`${API}/ml/train/${project.projectId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: firebaseUser.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      // FIX: When models are reused (HTTP 200 with status "complete"),
      // fetch the MLResult immediately and proceed to agent pipeline
      // without polling — avoids 3s+ delay waiting on a "training" event
      // that will never come.
      if (res.status === 200 && data.status === "complete" && data.reusedModels) {
        if (mlDoneRef.current) return;
        mlDoneRef.current = true;
        // Fetch the full MLResult doc from DB
        const mlRes  = await fetch(`${API}/ml/result/${project.projectId}`);
        const mlData = await mlRes.json();
        if (mlData.mlResult?.status === "complete") {
          setMlResult(mlData.mlResult);
          startAgentPipeline(mlData.mlResult);
        } else {
          // Fallback to polling in case of timing edge-case
          pollMLResult();
        }
        return;
      }

      // HTTP 202 — training started asynchronously, poll for completion
      pollMLResult();
    } catch (err) { setErrMsg(err.message); setPhase("error"); }
  };

  const pollMLResult = () => {
    mlPollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${API}/ml/result/${project.projectId}`);
        const data = await res.json();
        if (data.mlResult?.status === "complete") {
          clearInterval(mlPollRef.current); mlPollRef.current = null;
          if (mlDoneRef.current) return;
          mlDoneRef.current = true;
          setMlResult(data.mlResult);
          startAgentPipeline(data.mlResult);
        } else if (data.mlResult?.status === "error") {
          clearInterval(mlPollRef.current);
          setErrMsg(data.mlResult.errorMessage || "ML training failed.");
          setPhase("error");
        }
      } catch {}
    }, 3000);
  };

  const startAgentPipeline = async (trainedMlResult) => {
    if (agentStartedRef.current) return;
    agentStartedRef.current = true;
    setPhase("running_agents"); setActiveAgent(0); scrollToTop();
    let step = 0;
    const stepTimer = setInterval(() => { step = Math.min(step + 1, 3); setActiveAgent(step); }, 2500);
    try {
      const res  = await fetch(`${API}/ml/agent/${project.projectId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: firebaseUser.uid }),
      });
      const data = await res.json();
      if (!res.ok && data.requiresRetrain) {
        clearInterval(stepTimer); agentStartedRef.current = false;
        setRequiresRetrain(true);
        setErrMsg(data.message || "Retrain required.");
        setPhase("error"); return;
      }
      if (!res.ok) throw new Error(data.message);
      let agentDone = false;
      agentPollRef.current = setInterval(async () => {
        if (agentDone) return;
        try {
          const r = await fetch(`${API}/ml/agent-result/${project.projectId}`);
          const d = await r.json();
          if (d.agentResult?.status === "complete") {
            agentDone = true;
            clearInterval(agentPollRef.current); agentPollRef.current = null;
            clearInterval(stepTimer);
            setAgentResult(d.agentResult); setActiveAgent(4); setPhase("complete"); scrollToTop();
            if (onDone) onDone(d.agentResult, trainedMlResult || mlResult);
          } else if (d.agentResult?.status === "error") {
            agentDone = true;
            clearInterval(agentPollRef.current); agentPollRef.current = null;
            clearInterval(stepTimer);
            setErrMsg(d.agentResult.errorMessage || "Agent pipeline failed."); setPhase("error");
          }
        } catch {}
      }, 3000);
    } catch (err) { clearInterval(stepTimer); setErrMsg(err.message); setPhase("error"); }
  };

  const handleRetry = () => {
    agentStartedRef.current = false; mlDoneRef.current = false;
    trainingStartedRef.current = false;
    setErrMsg(""); setRequiresRetrain(false); setPhase("training_ml");
    setMlResult(null); setAgentResult(null); setActiveAgent(0);
    startMLTraining();
  };

  const AGENT_STEPS = [
    { label: "Observer",   desc: "Detecting KPI gaps vs benchmarks",   color: C.violet, icon: FiEye       },
    { label: "Analyst",    desc: "Feature-importance root causes",      color: C.cyan,   icon: FiBarChart2 },
    { label: "Simulation", desc: "KPI regressor ML projection",         color: C.pink,   icon: FiLoader    },
    { label: "Decision",   desc: "PKL-validated final ranking",         color: C.green,  icon: FiZap       },
  ];
  const modelColors = { randomForest: C.violet, xgboost: C.cyan, lightgbm: C.pink };
  const modelLabels = { randomForest: "Random Forest", xgboost: "XGBoost", lightgbm: "LightGBM" };
  const isProcessing = phase === "training_ml" || phase === "running_agents";
  const phaseColor   = phase === "training_ml"    ? C.cyan   :
                       phase === "running_agents" ? C.violet :
                       phase === "complete"        ? C.green  : C.red;

  return (
    <motion.div key="step45"
      initial={{ opacity: 0, x: 40, filter: "blur(5px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, x: -40, filter: "blur(5px)" }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}>
      <div className="max-w-4xl mx-auto flex flex-col gap-5">
        <GlassCard className="p-7 relative overflow-hidden" accent={phaseColor} glow={isProcessing ? phaseColor : undefined}>
          {isProcessing && <FloatingParticles count={18} />}
          <StepBreadcrumb current={phase === "complete" ? "step5" : "step45"} />

          <div className="flex items-center gap-4 mb-7 relative z-10">
            <div className="relative">
              {isProcessing && <GlowOrb color={phaseColor} size={54} rings={3} />}
              {phase === "complete" && (
                <motion.div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: "rgba(34,197,94,0.18)", border: "1px solid rgba(34,197,94,0.4)" }}
                  initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", bounce: 0.5 }}>
                  <FiCheck size={26} className="text-[#22C55E]" />
                </motion.div>
              )}
              {phase === "error" && (
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}>
                  <FiAlertTriangle size={24} className="text-red-400" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <motion.span className="text-[10px] font-mono uppercase tracking-widest block" style={{ color: phaseColor }}>
                {phase === "training_ml"    ? "Step 4 of 5 — ML Training"    :
                 phase === "running_agents" ? "Step 5 of 5 — Agent Pipeline" :
                 phase === "complete"        ? "Pipeline Complete"            : "Error"}
              </motion.span>
              <h2 className="text-2xl font-black text-white flex items-center gap-1">
                {phase === "training_ml"    ? <>Training ML + KPI Regressor<span style={{ color: phaseColor }}>{".".repeat(dots)}</span></> :
                 phase === "running_agents" ? <>Running Agent Pipeline<span style={{ color: phaseColor }}>{".".repeat(dots)}</span></> :
                 phase === "complete"        ? "Analysis Complete ✅" : "Something Went Wrong"}
              </h2>
            </div>
          </div>

          {/* Progress steps */}
          <div className="space-y-3 mb-5 relative z-10">
            {[
              {
                key: "ml", done: !!mlResult, active: phase === "training_ml",
                color: C.cyan,
                label: "ML Ensemble + KPI Regressor (RF + XGBoost + LightGBM + kpi_predictor.pkl)",
                activeHint: "Training 3 classifiers + 1 KPI regressor with quantity & discount_amount…",
                doneDetail: mlResult
                  ? `Accuracy: ${mlResult.ensemble?.avgAccuracy?.toFixed(1)}% · KPI Regressor: ${mlResult.kpiPredictorPath ? "✓" : "✗"}`
                  : "",
              },
              {
                key: "agent", done: phase === "complete", active: phase === "running_agents",
                color: C.violet,
                label: "Agent Decision Pipeline (Observer → Analyst → Simulation → Decision)",
                activeHint: `${AGENT_STEPS[Math.min(activeAgent, 3)].label}: ${AGENT_STEPS[Math.min(activeAgent, 3)].desc}…`,
                doneDetail: agentResult
                  ? `Confidence: ${agentResult.decisionResult?.recommendation?.confidence}% · ${agentResult.decisionResult?.totalStrategies} strategies`
                  : "",
              },
            ].map(({ key, done, active, color, label, activeHint, doneDetail }) => (
              <motion.div key={key} className="rounded-xl border p-4 transition-all"
                style={{
                  borderColor: done ? "#22C55E30" : active ? `${color}35` : "rgba(255,255,255,0.07)",
                  background:  done ? "rgba(34,197,94,0.05)" : active ? `${color}08` : "rgba(255,255,255,0.02)",
                }}
                animate={active ? { borderColor: [`${color}18`, `${color}55`, `${color}18`] } : {}}
                transition={{ duration: 2, repeat: Infinity }}>
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: done ? "rgba(34,197,94,0.2)" : active ? `${color}18` : "rgba(255,255,255,0.05)" }}>
                    {done ? <FiCheck size={13} className="text-[#22C55E]" /> :
                     active ? (
                       <motion.div className="w-3.5 h-3.5 rounded-full border-2"
                         style={{ borderColor: `${color}50`, borderTopColor: color }}
                         animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
                     ) : <div className="w-2 h-2 rounded-full bg-white/20" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: done ? "#22C55E" : active ? "#fff" : "#9CA3AF" }}>{label}</p>
                    {active && <p className="text-[#9CA3AF] text-xs mt-0.5">{activeHint}</p>}
                    {done && doneDetail && <p className="text-xs mt-0.5 font-mono" style={{ color: "#22C55E" }}>{doneDetail}</p>}
                    {active && <div className="mt-2"><DataStream active={true} color={color} /></div>}
                  </div>
                  {done && (
                    <span className="text-[10px] font-mono px-2 py-1 rounded-full shrink-0"
                      style={{ background: "rgba(34,197,94,0.12)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.3)" }}>
                      Done ✓
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {mlResult && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 relative z-10">
              <KpiPredictorBadge path={mlResult.kpiPredictorPath} />
            </motion.div>
          )}

          {phase === "running_agents" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 flex-wrap mb-4 relative z-10">
              {AGENT_STEPS.map((agent, i) => {
                const isDone   = activeAgent > i;
                const isActive = activeAgent === i;
                const Icon     = agent.icon;
                return (
                  <React.Fragment key={agent.label}>
                    <motion.div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-mono"
                      style={{
                        borderColor: isDone ? "#22C55E40" : isActive ? `${agent.color}55` : "rgba(255,255,255,0.08)",
                        background:  isDone ? "rgba(34,197,94,0.08)" : isActive ? `${agent.color}12` : "rgba(255,255,255,0.02)",
                        color:       isDone ? "#22C55E" : isActive ? "#fff" : "#9CA3AF",
                      }}
                      animate={isActive ? { borderColor: [`${agent.color}30`, `${agent.color}70`, `${agent.color}30`] } : {}}
                      transition={{ duration: 1.5, repeat: Infinity }}>
                      {isDone ? <FiCheck size={10} /> :
                       isActive ? <motion.div className="w-2.5 h-2.5 rounded-full border-2"
                         style={{ borderColor: `${agent.color}50`, borderTopColor: agent.color }}
                         animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} /> :
                       <Icon size={10} className="opacity-40" />}
                      <Icon size={10} /> {agent.label}
                    </motion.div>
                    {i < 3 && <span className="text-white/15 text-[10px]">→</span>}
                  </React.Fragment>
                );
              })}
            </motion.div>
          )}

          {phase === "running_agents" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 relative z-10">
              <NeuralNet active={true} color={AGENT_STEPS[Math.min(activeAgent, 3)].color} />
            </motion.div>
          )}

          {phase === "complete" && agentResult && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative z-10">
              <motion.button
                whileHover={{ scale: 1.02, boxShadow: "0 0 45px rgba(34,197,94,0.5)" }} whileTap={{ scale: 0.97 }}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-white text-base relative overflow-hidden"
                style={{ background: "linear-gradient(135deg,#22C55E,#00E0FF)" }}>
                <motion.div className="absolute inset-0"
                  animate={{ x: ["-100%", "100%"] }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)" }} />
                <FiCheck size={18} className="relative" />
                <span className="relative">Results Ready — View Decision →</span>
              </motion.button>
            </motion.div>
          )}

          {phase === "error" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 relative z-10">
              {requiresRetrain ? (
                <div className="px-4 py-3 rounded-xl bg-[#FF9800]/10 border border-[#FF9800]/30 text-[#FF9800] text-sm">
                  <div className="flex items-center gap-2 mb-1 font-semibold"><FiShield size={14} /> Retrain Required</div>
                  <p className="text-xs leading-relaxed">{errMsg}</p>
                </div>
              ) : (
                <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
                  <FiAlertTriangle size={14} /> {errMsg}
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={onBack}
                  className="px-5 py-3 rounded-xl border border-white/10 text-[#9CA3AF] hover:text-white hover:bg-white/4 text-sm transition-all">
                  ← Back
                </button>
                {!requiresRetrain && (
                  <motion.button onClick={handleRetry} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    className="flex-1 py-3 rounded-xl font-semibold text-white text-sm flex items-center justify-center gap-2"
                    style={{ background: "rgba(239,68,68,0.5)" }}>
                    <FiRefreshCw size={14} /> Retry
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}

          {isProcessing && (
            <p className="text-[#9CA3AF] text-xs text-center mt-4 relative z-10">Auto-refreshing every 3 seconds…</p>
          )}
        </GlassCard>

        {/* ML Model Cards */}
        {mlResult && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(mlResult.models || {}).map(([key, m], mi) => {
                const c = modelColors[key];
                return (
                  <motion.div key={key}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: mi * 0.1 }}
                    whileHover={{ y: -4, boxShadow: `0 16px 48px ${c}22` }}>
                    <GlassCard className="p-5 h-full" accent={c}>
                      <div className="flex items-center gap-2 mb-4">
                        <motion.div className="w-2.5 h-2.5 rounded-full" style={{ background: c, boxShadow: `0 0 10px ${c}` }}
                          animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 2, repeat: Infinity, delay: mi * 0.3 }} />
                        <p className="text-white font-bold text-sm">{modelLabels[key]}</p>
                      </div>
                      {[["Accuracy", m.accuracy], ["Precision", m.precision], ["Recall", m.recall], ["F1 Score", m.f1Score]].map(([label, val], vi) => (
                        <div key={label} className="mb-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-[#9CA3AF]">{label}</span>
                            <span className="font-bold" style={{ color: c }}>{val?.toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                            <motion.div className="h-full rounded-full"
                              style={{ background: `linear-gradient(90deg,${c}70,${c})` }}
                              initial={{ width: 0 }} animate={{ width: `${val}%` }}
                              transition={{ duration: 1, delay: mi * 0.15 + vi * 0.08, ease: "easeOut" }} />
                          </div>
                        </div>
                      ))}
                      {m.trainTime && <p className="text-[#9CA3AF] text-[10px] mt-2 font-mono">⏱ {m.trainTime?.toFixed(1)}s</p>}
                    </GlassCard>
                  </motion.div>
                );
              })}
            </div>

            <GlassCard className="p-6" accent={C.green} glow={C.green}>
              <div className="flex items-center gap-2 mb-5">
                <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 3.5, repeat: Infinity }}>
                  <FiZap className="text-[#22C55E]" size={20} />
                </motion.div>
                <h3 className="text-white font-bold text-base">Weighted Ensemble Result</h3>
                <KpiPredictorBadge path={mlResult.kpiPredictorPath} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {[
                  { label: "Ensemble Accuracy", val: mlResult.ensemble?.avgAccuracy,  color: C.green  },
                  { label: "Avg Precision",     val: mlResult.ensemble?.avgPrecision, color: C.violet },
                  { label: "Avg Recall",        val: mlResult.ensemble?.avgRecall,    color: C.cyan   },
                  { label: "Avg F1 Score",      val: mlResult.ensemble?.avgF1Score,   color: C.pink   },
                ].map(({ label, val, color }, ci) => (
                  <motion.div key={label} className="rounded-xl p-4 text-center border"
                    style={{ background: `${color}06`, borderColor: `${color}20` }}
                    initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.5 + ci * 0.07 }} whileHover={{ scale: 1.05 }}>
                    <p className="text-[#9CA3AF] text-[10px] mb-1.5">{label}</p>
                    <p className="text-2xl font-black" style={{ color }}>
                      <AnimatedNumber value={val} decimals={1} suffix="%" />
                    </p>
                  </motion.div>
                ))}
              </div>

              {mlResult.featureImportance?.length > 0 && (
                <div>
                  <p className="text-[#9CA3AF] text-[10px] font-mono uppercase tracking-widest mb-3">
                    Top Features — drive strategy directions
                  </p>
                  {mlResult.featureImportance.slice(0, 5).map((f, i) => {
                    const cs = [C.violet, C.cyan, C.pink, C.green, C.orange];
                    const c  = cs[i]; const pct = Math.round(f.importance * 100);
                    return (
                      <motion.div key={f.feature} className="mb-2.5"
                        initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6 + i * 0.07 }}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[#E6E6EB] font-mono">{f.feature}</span>
                          <span className="font-bold" style={{ color: c }}>{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                          <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg,${c}60,${c})` }}
                            initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                            transition={{ duration: 1, delay: 0.7 + i * 0.08, ease: "easeOut" }} />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </GlassCard>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   STEP 5 — DECISION & REVIEW
════════════════════════════════════════════════════════════════ */
function Step5AgentPipeline({
  project, currentObjective, savedSimMode,
  mlResult: initialMlResult, agentResult: initialAgentResult,
  firebaseUser, onBack,
}) {
  const [phase,        setPhase]        = useState(initialAgentResult ? "complete" : "idle");
  const [agentResult,  setAgentResult]  = useState(initialAgentResult || null);
  const [mlResultLocal,setMlResultLocal]= useState(initialMlResult    || null);
  const [pipelineErr,  setPipelineErr]  = useState("");
  const [requiresRetrain, setRequiresRetrain] = useState(false);
  const [activeStep,   setActiveStep]   = useState(0);
  const pollRef           = useRef(null);
  const [currentStratIdx, setCurrentStratIdx] = useState(0);
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [rejectReason,    setRejectReason]    = useState("");
  const [actionLoading,   setActionLoading]   = useState(false);
  const [actionMsg,       setActionMsg]       = useState(null);
  const [shapData,        setShapData]        = useState(null);
  const [shapLoading,     setShapLoading]     = useState(false);
  const [feedbackHistory, setFeedbackHistory] = useState([]);

  useEffect(() => {
    if (!initialAgentResult && project?.status === "complete") fetchExistingResults();
  }, []);

  const fetchExistingResults = async () => {
    try {
      setPhase("loading");
      const [agentRes, mlRes] = await Promise.all([
        fetch(`${API}/ml/agent-result/${project.projectId}`).then(r => r.json()),
        fetch(`${API}/ml/result/${project.projectId}`).then(r => r.json()),
      ]);
      if (agentRes.agentResult?.status === "complete") {
        setAgentResult(agentRes.agentResult); setPhase("complete");
      } else setPhase("idle");
      if (mlRes.mlResult?.status === "complete") setMlResultLocal(mlRes.mlResult);
    } catch { setPhase("idle"); }
  };

  useEffect(() => { if (phase === "complete" && agentResult) { loadSHAP(0); loadFeedbackHistory(); } }, [phase, agentResult]);
  useEffect(() => { if (initialAgentResult && !agentResult) { setAgentResult(initialAgentResult); setPhase("complete"); } }, [initialAgentResult]);
  useEffect(() => { if (initialMlResult && !mlResultLocal) setMlResultLocal(initialMlResult); }, [initialMlResult]);
  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const AGENT_STEPS = [
    { label: "Observer",   desc: "KPI health detection",           color: C.violet, icon: FiEye       },
    { label: "Analyst",    desc: "Feature-importance root causes", color: C.cyan,   icon: FiBarChart2 },
    { label: "Simulation", desc: "KPI regressor ML projection",    color: C.pink,   icon: FiLoader    },
    { label: "Decision",   desc: "PKL-validated ranking",          color: C.green,  icon: FiZap       },
  ];

  const startPolling = () => {
    let si = 0;
    const sI = setInterval(() => { si = Math.min(si + 1, 3); setActiveStep(si); }, 2000);
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${API}/ml/agent-result/${project.projectId}`);
        const data = await res.json();
        if (data.agentResult?.status === "complete") {
          setAgentResult(data.agentResult); setPhase("complete"); setActiveStep(4);
          clearInterval(pollRef.current); clearInterval(sI);
        } else if (data.agentResult?.status === "error") {
          setPipelineErr(data.agentResult.errorMessage || "Agent pipeline failed.");
          setPhase("error"); clearInterval(pollRef.current); clearInterval(sI);
        }
      } catch {}
    }, 3000);
  };

  const handleRunPipeline = async () => {
    setPipelineErr(""); setRequiresRetrain(false); setPhase("running"); setActiveStep(0);
    try {
      const res  = await fetch(`${API}/ml/agent/${project.projectId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: firebaseUser.uid }),
      });
      const data = await res.json();
      if (!res.ok && data.requiresRetrain) {
        setRequiresRetrain(true); setPipelineErr(data.message || "Retrain required."); setPhase("error"); return;
      }
      if (!res.ok) throw new Error(data.message);
      startPolling();
    } catch (err) { setPipelineErr(err.message); setPhase("error"); }
  };

  const loadSHAP = async (idx) => {
    if (!agentResult) return;
    setShapLoading(true); setShapData(null);
    try {
      const res = await fetch(`${API}/feedback/shap`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.projectId, agentResultId: agentResult._id, strategyIndex: idx }),
      });
      setShapData(await res.json());
    } catch {}
    setShapLoading(false);
  };

  const loadFeedbackHistory = async () => {
    try {
      const res  = await fetch(`${API}/feedback/${project.projectId}`);
      const data = await res.json();
      setFeedbackHistory(data.feedbacks || []);
    } catch {}
  };

  const handleApprove = async () => {
    if (!agentResult?._id) { setActionMsg({ type: "error", text: "Agent result not ready." }); return; }
    setActionLoading(true);
    try {
      const res  = await fetch(`${API}/feedback/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: firebaseUser.uid, projectId: project.projectId,
          agentResultId: agentResult._id, strategyIndex: currentStratIdx,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setActionMsg({ type: "approved", text: "Strategy approved! Project complete ✅" });
      loadFeedbackHistory();
    } catch (err) { setActionMsg({ type: "error", text: err.message }); }
    setActionLoading(false);
  };

  const handleReject = async () => {
    if (!agentResult?._id) { setActionMsg({ type: "error", text: "Agent result not ready." }); return; }
    setActionLoading(true);
    try {
      const res  = await fetch(`${API}/feedback/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: firebaseUser.uid, projectId: project.projectId,
          agentResultId: agentResult._id, strategyIndex: currentStratIdx,
          reason: rejectReason || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setShowReasonInput(false); setRejectReason(""); loadFeedbackHistory();
      if (data.nextAction === "exhausted") {
        setActionMsg({ type: "exhausted", text: "All strategies rejected. Adjust inputs and re-run." });
      } else {
        const nextIdx = data.nextIndex;
        setCurrentStratIdx(nextIdx);
        setActionMsg({ type: "rejected", text: `Strategy rejected. Showing #${nextIdx + 1}.` });
        setShapData(null); loadSHAP(nextIdx);
        setTimeout(() => setActionMsg(null), 3500);
      }
    } catch (err) { setActionMsg({ type: "error", text: err.message }); }
    setActionLoading(false);
  };

  const rankedStrats   = agentResult?.decisionResult?.rankedStrategies     || [];
  const currentStrat   = rankedStrats[currentStratIdx];
  const observations   = agentResult?.observerResult?.observations         || [];
  const diagnosis      = agentResult?.analystResult?.diagnosis             || "";
  const healthScore    = agentResult?.observerResult?.healthScore          || 0;
  const userEval       = agentResult?.decisionResult?.userStrategyEvaluation || null;
  const isMode1        = savedSimMode?.simulationMode === "mode1";
  const simResult      = agentResult?.simulationResult                     || {};
  const mlDriven       = simResult.mlDriven;
  const weightsUsed    = simResult.weightsUsed;
  const directionsUsed = simResult.directionsUsed                          || [];
  const featureImpUsed = agentResult?.analystResult?.featureImportanceUsed;
  const improvement    = agentResult?.decisionResult?.recommendation?.improvement;
  const realKPIs       = agentResult?.decisionResult?.realDatasetKPIs      || {};
  const aiInsight      = agentResult?.decisionResult?.recommendation?.aiInsight || "";
  const topConf        = agentResult?.decisionResult?.recommendation?.confidence;
  const mlAcc          = agentResult?.decisionResult?.mlAccuracy || agentResult?.mlAccuracy;
  const pklUsed        = agentResult?.decisionResult?.pklScoringUsed;

  const sevColor = { critical: "#EF4444", warning: "#FF9800", healthy: "#22C55E" };

  return (
    <motion.div key="step5"
      initial={{ opacity: 0, x: 40, filter: "blur(5px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, x: -40, filter: "blur(5px)" }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}>
      <div className="max-w-4xl mx-auto flex flex-col gap-5">
        <GlassCard className="p-7" accent={C.violet}>
          <StepBreadcrumb current="step5" />
          <div className="flex items-center gap-3 mb-2">
            <motion.div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#7C5CFF,#00E0FF)" }}
              animate={{ boxShadow: ["0 0 0 0 #7C5CFF30","0 0 0 14px #7C5CFF00"] }}
              transition={{ duration: 2.2, repeat: Infinity }}>
              <FiZap size={18} className="text-white" />
            </motion.div>
            <div>
              <span className="text-[10px] font-mono text-[#7C5CFF] uppercase tracking-widest">Step 5 of 5</span>
              <h2 className="text-2xl font-black text-white">Agent Decision Pipeline</h2>
            </div>
          </div>
          <p className="text-[#9CA3AF] text-sm mb-5 flex flex-wrap gap-x-2 items-center">
            <span className="text-[#7C5CFF] font-semibold">{project.projectName}</span>
            <span className="text-white/15">·</span>
            <span className="text-[#00E0FF] font-semibold">
              {currentObjective?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
            </span>
            <span className="text-white/15">·</span>
            <span className="text-[#FF4FD8] font-semibold">
              {savedSimMode?.simulationMode === "mode1" ? "User Defined" : "Auto AI"}
            </span>
            {mlAcc && (
              <><span className="text-white/15">·</span>
              <span className="text-[#22C55E] font-semibold">ML {mlAcc?.toFixed(1)}%</span></>
            )}
          </p>

          <div className="flex items-center gap-2 flex-wrap mb-5">
            {AGENT_STEPS.map((agent, i) => {
              const isDone   = phase === "complete" || activeStep > i;
              const isActive = phase === "running" && activeStep === i;
              const Icon     = agent.icon;
              return (
                <React.Fragment key={agent.label}>
                  <motion.div className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono"
                    style={{
                      borderColor: isDone ? "#22C55E40" : isActive ? `${agent.color}55` : "rgba(255,255,255,0.08)",
                      background:  isDone ? "rgba(34,197,94,0.08)" : isActive ? `${agent.color}10` : "rgba(255,255,255,0.02)",
                      color:       isDone ? "#22C55E" : isActive ? "#fff" : "#9CA3AF",
                    }}
                    animate={isActive ? { borderColor: [`${agent.color}30`, `${agent.color}70`, `${agent.color}30`] } : {}}
                    transition={{ duration: 1.5, repeat: Infinity }}>
                    {isDone ? <FiCheck size={11} /> :
                     isActive ? <motion.div className="w-2.5 h-2.5 rounded-full border-2"
                       style={{ borderColor: `${agent.color}50`, borderTopColor: agent.color }}
                       animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} /> :
                     <Icon size={11} className="opacity-40" />}
                    <Icon size={10} /> {agent.label}
                  </motion.div>
                  {i < 3 && <span className="text-white/15 text-xs">→</span>}
                </React.Fragment>
              );
            })}
          </div>

          {phase === "loading" && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-[#7C5CFF]/8 border border-[#7C5CFF]/20">
              <motion.div className="w-5 h-5 rounded-full border-2 border-[#7C5CFF] border-t-transparent"
                animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
              <p className="text-white text-sm font-semibold">Loading existing results…</p>
            </div>
          )}
          {pipelineErr && requiresRetrain && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-[#FF9800]/10 border border-[#FF9800]/30 text-[#FF9800] text-sm">
              <div className="flex items-center gap-2 mb-1 font-semibold"><FiShield size={14} /> Retrain Required</div>
              <p className="text-xs leading-relaxed">{pipelineErr}</p>
            </div>
          )}
          {pipelineErr && !requiresRetrain && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
              <FiAlertTriangle size={14} /> {pipelineErr}
            </div>
          )}
          {phase === "idle" && (
            <div className="flex gap-3">
              <button onClick={onBack}
                className="px-5 py-3 rounded-xl border border-white/10 text-[#9CA3AF] hover:text-white hover:bg-white/4 text-sm transition-all">
                ← Back
              </button>
              <motion.button onClick={handleRunPipeline}
                whileHover={{ scale: 1.02, boxShadow: "0 0 35px rgba(124,92,255,0.55)" }} whileTap={{ scale: 0.97 }}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white relative overflow-hidden"
                style={{ background: "linear-gradient(135deg,#7C5CFF,#00E0FF)" }}>
                <motion.div className="absolute inset-0" animate={{ x: ["-100%", "100%"] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)" }} />
                <FiZap size={16} className="relative" />
                <span className="relative">Run Agent Decision Pipeline</span>
              </motion.button>
            </div>
          )}
          {phase === "running" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-[#7C5CFF]/8 border border-[#7C5CFF]/20">
                <GlowOrb color={C.violet} size={36} rings={2} />
                <div>
                  <p className="text-white text-sm font-semibold">{AGENT_STEPS[Math.min(activeStep, 3)].label} Agent…</p>
                  <p className="text-[#9CA3AF] text-xs">{AGENT_STEPS[Math.min(activeStep, 3)].desc}</p>
                </div>
              </div>
              <NeuralNet active={true} color={AGENT_STEPS[Math.min(activeStep, 3)].color} />
              <DataStream active={true} color={C.violet} />
              <p className="text-[#9CA3AF] text-xs text-center">Auto-refreshing every 3 seconds…</p>
            </div>
          )}
          {phase === "error" && (
            <div className="flex gap-3 mt-2">
              <button onClick={onBack}
                className="px-5 py-3 rounded-xl border border-white/10 text-[#9CA3AF] hover:text-white hover:bg-white/4 text-sm transition-all">
                ← Back
              </button>
              {!requiresRetrain && (
                <motion.button
                  onClick={() => { setPhase("idle"); setPipelineErr(""); setRequiresRetrain(false); }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  className="flex-1 py-3 rounded-xl font-semibold text-white text-sm"
                  style={{ background: "rgba(239,68,68,0.55)" }}>
                  Retry Pipeline
                </motion.button>
              )}
            </div>
          )}
        </GlassCard>

        {phase === "complete" && agentResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-5">
            {(aiInsight || improvement) && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <GlassCard className="p-6" accent={C.cyan} glow={C.cyan}>
                  <div className="flex items-center gap-2 mb-4">
                    <motion.div className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ background: `${C.cyan}20`, border: `1px solid ${C.cyan}40` }}
                      animate={{ boxShadow: [`0 0 0 0 ${C.cyan}30`, `0 0 0 12px ${C.cyan}00`] }}
                      transition={{ duration: 2, repeat: Infinity }}>
                      <FiCpu size={14} style={{ color: C.cyan }} />
                    </motion.div>
                    <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: C.cyan }}>AI Decision Insight</span>
                    {pklUsed && (
                      <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full border"
                        style={{ borderColor: `${C.green}30`, background: `${C.green}10`, color: C.green }}>
                        ✓ PKL Validated
                      </span>
                    )}
                    {mlAcc && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                        style={{ borderColor: `${C.violet}30`, background: `${C.violet}10`, color: C.violet }}>
                        🧠 {mlAcc?.toFixed(1)}% Accuracy
                      </span>
                    )}
                  </div>

                  {improvement && (
                    <div className="flex items-center justify-center gap-6 py-5 mb-5 rounded-2xl"
                      style={{ background: `linear-gradient(135deg, ${C.cyan}08, ${C.violet}08)`, border: `1px solid ${C.cyan}20` }}>
                      <div className="text-center">
                        <p className="text-[#9CA3AF] text-[10px] font-mono mb-1">BEFORE</p>
                        <p className="text-2xl font-black" style={{ color: C.muted }}>{(+improvement.before).toFixed(4)}%</p>
                        <p className="text-[9px] text-[#9CA3AF]">Conversion Rate</p>
                      </div>
                      <motion.div animate={{ x: [0, 6, 0] }} transition={{ duration: 1.8, repeat: Infinity }}
                        style={{ color: C.cyan, fontSize: 24 }}>→</motion.div>
                      <div className="text-center">
                        <p className="text-[#9CA3AF] text-[10px] font-mono mb-1">AFTER</p>
                        <p className="text-3xl font-black" style={{ color: C.cyan }}>{(+improvement.after).toFixed(4)}%</p>
                        <p className="text-[9px] text-[#9CA3AF]">Projected</p>
                      </div>
                      <div className="text-center">
                        <motion.div className="flex items-center gap-1 px-3 py-1.5 rounded-full"
                          style={{ background: `${C.green}15`, border: `1px solid ${C.green}30` }}
                          animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                          <FiArrowUp size={12} style={{ color: C.green }} />
                          <span className="text-base font-black" style={{ color: C.green }}>
                            +{(+improvement.conversionLift).toFixed(1)}%
                          </span>
                        </motion.div>
                        <p className="text-[9px] text-[#9CA3AF] mt-1">Projected lift</p>
                      </div>
                    </div>
                  )}

                  {Object.keys(realKPIs).length > 0 && (
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      {[
                        { label: "CTR",           val: realKPIs.ctr,             unit: "%", decimals: 4, color: C.violet },
                        { label: "Conv Rate",     val: realKPIs.conversionRate,  unit: "%", decimals: 4, color: C.cyan   },
                        { label: "Cart Abandon",  val: realKPIs.cartAbandonment, unit: "%", decimals: 2, color: C.pink   },
                        { label: "ROI",           val: realKPIs.roi,             unit: "x", decimals: 4, color: C.green  },
                      ].filter(kpi => kpi.val != null).map(({ label, val, unit, decimals, color }) => (
                        <div key={label} className="text-center p-3 rounded-xl border"
                          style={{ background: `${color}06`, borderColor: `${color}20` }}>
                          <p className="text-[#9CA3AF] text-[9px] font-mono mb-1">{label}</p>
                          <p className="font-black text-sm" style={{ color }}>{(+val).toFixed(decimals)}{unit}</p>
                          <p className="text-[8px] text-[#9CA3AF] mt-0.5">from dataset</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {aiInsight && (
                    <div className="p-3 rounded-xl border" style={{ background: `${C.violet}06`, borderColor: `${C.violet}20` }}>
                      <div className="flex gap-2">
                        <FiInfo size={12} style={{ color: C.violet, marginTop: 2, flexShrink: 0 }} />
                        <p className="text-[#9CA3AF] text-xs leading-relaxed">{aiInsight}</p>
                      </div>
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            )}

            {/* Observer */}
            <GlassCard className="p-6" accent={C.violet}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <motion.div animate={{ rotate: [0, 12, -12, 0] }} transition={{ duration: 4.5, repeat: Infinity }}>
                    <FiEye className="text-[#7C5CFF]" size={18} />
                  </motion.div>
                  <h3 className="text-white font-bold">Observer Agent — KPI Health</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#9CA3AF]">Health Score</span>
                  <motion.span className="text-xl font-black"
                    style={{ color: healthScore >= 70 ? C.green : healthScore >= 40 ? C.orange : C.red }}
                    initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>
                    {healthScore}/100
                  </motion.span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {observations.map((obs, i) => (
                  <motion.div key={i} className="flex items-start gap-3 p-3 rounded-xl border"
                    style={{ borderColor: `${sevColor[obs.severity]}30`, background: `${sevColor[obs.severity]}06` }}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }} whileHover={{ scale: 1.01 }}>
                    <motion.div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: sevColor[obs.severity] }}
                      animate={{ scale: [1, 1.6, 1] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white text-xs font-semibold">{obs.metric}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                          style={{ background: `${sevColor[obs.severity]}20`, color: sevColor[obs.severity] }}>
                          {obs.severity}
                        </span>
                      </div>
                      <p className="text-[#9CA3AF] text-xs mt-1 leading-relaxed">{obs.message}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs font-bold" style={{ color: sevColor[obs.severity] }}>{obs.value}{obs.unit}</span>
                        <span className="text-[#9CA3AF] text-xs">vs {obs.benchmark}{obs.unit}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </GlassCard>

            {/* Analyst */}
            <GlassCard className="p-6" accent={C.cyan}>
              <div className="flex items-center gap-2 mb-3">
                <motion.div animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 2.5, repeat: Infinity }}>
                  <FiBarChart2 className="text-[#00E0FF]" size={18} />
                </motion.div>
                <h3 className="text-white font-bold">Analyst Agent — Root Cause Diagnosis</h3>
                {featureImpUsed && (
                  <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full border border-[#00E0FF]/30 bg-[#00E0FF]/8 text-[#00E0FF]">
                    feat-importance driven
                  </span>
                )}
              </div>
              {diagnosis && (
                <div className="p-4 rounded-xl bg-[#00E0FF]/6 border border-[#00E0FF]/20 mb-3 relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-px"
                    style={{ background: "linear-gradient(90deg,transparent,#00E0FF,transparent)" }} />
                  <p className="text-[#E6E6EB] text-sm leading-relaxed">{diagnosis}</p>
                </div>
              )}
              {agentResult.analystResult?.rootCauses?.slice(0, 2).map((rc, i) => (
                <motion.div key={i} className="mt-3 p-3 rounded-xl bg-white/3 border border-white/6"
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[#9CA3AF] text-[10px] font-mono uppercase tracking-widest">{rc.metric} — causes</p>
                    {rc.dataSource && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full border border-white/10 bg-white/5 text-[#9CA3AF]">
                        {rc.dataSource === "feature_importance" ? "📊 data-driven" : "📋 fallback"}
                      </span>
                    )}
                  </div>
                  {rc.causes.map((c, j) => (
                    <div key={j} className="flex items-center gap-2 mb-1.5">
                      <motion.div className="w-1.5 h-1.5 rounded-full bg-[#00E0FF] shrink-0"
                        animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.8, repeat: Infinity, delay: j * 0.2 }} />
                      <p className="text-[#E6E6EB] text-xs flex-1">{c.cause}</p>
                      <span className="text-[#9CA3AF] text-[10px] font-mono">{Math.round(c.confidence * 100)}%</span>
                    </div>
                  ))}
                </motion.div>
              ))}
            </GlassCard>

            {/* Simulation */}
            <GlassCard className="p-6" accent={C.pink}>
              <div className="flex items-center gap-2 mb-2">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 7, repeat: Infinity, ease: "linear" }}>
                  <FiLoader className="text-[#FF4FD8]" size={18} />
                </motion.div>
                <h3 className="text-white font-bold">Simulation Agent — Strategy Evaluation</h3>
                <span className="ml-auto text-xs text-[#9CA3AF]">{rankedStrats.length} strategies</span>
              </div>
              <MlDrivenBadge mlDriven={mlDriven} weightsUsed={weightsUsed} />
              {directionsUsed.length > 0 && (
                <div className="mt-2 mb-4 flex flex-wrap gap-1.5">
                  {directionsUsed.map(d => (
                    <span key={d} className="text-[9px] font-mono px-1.5 py-0.5 rounded-md border border-[#FF4FD8]/20 bg-[#FF4FD8]/6 text-[#FF4FD8]">
                      {d.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-3 mt-3">
                {rankedStrats.map((strat, i) => {
                  const cs = [C.green, C.violet, C.cyan, C.orange]; const c = cs[i % cs.length];
                  const isCurrent = i === currentStratIdx;
                  return (
                    <motion.div key={strat.id} className="flex items-start gap-4 p-4 rounded-xl border transition-all"
                      style={{
                        borderColor: isCurrent ? `${c}60` : "rgba(255,255,255,0.06)",
                        background:  isCurrent ? `${c}08` : "rgba(255,255,255,0.02)",
                      }}
                      initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.07 }} whileHover={{ x: 4 }}>
                      <motion.div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 text-xs font-black"
                        style={{ background: `${c}18`, color: c }}
                        animate={isCurrent ? { boxShadow: [`0 0 0 0 ${c}40`, `0 0 0 8px ${c}00`] } : {}}
                        transition={{ duration: 1.8, repeat: Infinity }}>
                        #{strat.rank}
                      </motion.div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-white text-sm font-semibold">{strat.name}</p>
                          {isCurrent && (
                            <motion.span className="px-2 py-0.5 text-[9px] font-mono rounded-full"
                              style={{ background: `${C.green}20`, color: C.green, border: `1px solid ${C.green}30` }}
                              animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1.8, repeat: Infinity }}>
                              Current
                            </motion.span>
                          )}
                          {strat.source === "user" && (
                            <span className="px-2 py-0.5 text-[9px] font-mono rounded-full"
                              style={{ background: `${C.violet}20`, color: C.violet, border: `1px solid ${C.violet}30` }}>
                              Your strategy
                            </span>
                          )}
                        </div>
                        <p className="text-[#9CA3AF] text-xs">{strat.description}</p>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {[
                            ["Conv", `${(+(strat.projectedMetrics?.conversionRate ?? 0)).toFixed(4)}%`],
                            ["ROI",  `${(+(strat.projectedMetrics?.roi ?? 0)).toFixed(4)}x`],
                            ["Rev",  `+${strat.projectedMetrics?.revenueLift ?? 0}%`],
                          ].map(([l, v]) => (
                            <div key={l} className="flex items-center gap-1 text-xs">
                              <span className="text-[#9CA3AF]">{l}:</span>
                              <span className="font-semibold" style={{ color: c }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-[#9CA3AF]">Score</p>
                        <motion.p className="text-xl font-black" style={{ color: c }}
                          initial={{ scale: 0 }} animate={{ scale: 1 }}
                          transition={{ delay: i * 0.07 + 0.2, type: "spring" }}>
                          {strat.score}%
                        </motion.p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </GlassCard>

            <Step5Charts agentResult={agentResult} shapData={shapData} shapLoading={shapLoading} />

            {/* Approve / Reject */}
            {currentStrat && actionMsg?.type !== "approved" && actionMsg?.type !== "exhausted" && (
              <motion.div key={`decision-${currentStratIdx}`}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-7 border border-[#22C55E]/35 relative overflow-hidden"
                style={{ background: "radial-gradient(ellipse at top right, #22C55E0A, transparent 55%), linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))" }}>
                <div className="absolute top-0 left-0 right-0 h-px"
                  style={{ background: "linear-gradient(90deg,transparent,#22C55E,transparent)" }} />
                <div className="flex items-center gap-2 mb-4">
                  <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.8, repeat: Infinity }}>
                    <FiZap className="text-[#22C55E]" size={20} />
                  </motion.div>
                  <h3 className="text-white font-black text-lg">Decision Agent — Recommendation</h3>
                  <span className="ml-auto px-3 py-1 rounded-full text-[10px] font-mono"
                    style={{ background: `${C.green}12`, color: C.green, border: `1px solid ${C.green}30` }}>
                    #{currentStratIdx + 1} of {rankedStrats.length}
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-[#22C55E]/20 mb-5 relative overflow-hidden" style={{ background: `${C.green}06` }}>
                  <p className="text-[#9CA3AF] text-[10px] font-mono uppercase tracking-widest mb-1">
                    {currentStratIdx === 0 ? "Recommended Strategy" : `Alternative #${currentStratIdx + 1}`}
                  </p>
                  <p className="text-white font-black text-xl mb-1">{currentStrat.name}</p>
                  <p className="text-[#9CA3AF] text-sm">{currentStrat.description}</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: "Revenue Lift",    value: `+${currentStrat.projectedMetrics?.revenueLift ?? 0}%`,                                color: C.green  },
                    { label: "Conversion Rate", value: `${(+(currentStrat.projectedMetrics?.conversionRate ?? 0)).toFixed(4)}%`,               color: C.violet },
                    { label: "Cart Abandon",    value: `${(+(currentStrat.projectedMetrics?.cartAbandonment ?? 0)).toFixed(2)}%`,              color: C.pink   },
                    { label: "ROI",             value: `${(+(currentStrat.projectedMetrics?.roi ?? 0)).toFixed(4)}x`,                         color: C.cyan   },
                  ].map(({ label, value, color }, ki) => (
                    <motion.div key={label} className="rounded-xl p-4 text-center border"
                      style={{ background: `${color}06`, borderColor: `${color}20` }}
                      initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: ki * 0.07 }} whileHover={{ scale: 1.05, borderColor: `${color}55` }}>
                      <p className="text-[#9CA3AF] text-[10px] mb-1">{label}</p>
                      <p className="text-base font-black" style={{ color }}>{value}</p>
                    </motion.div>
                  ))}
                </div>

                {actionMsg?.type === "rejected" && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                    className="mb-4 px-4 py-3 rounded-xl bg-[#FF9800]/10 border border-[#FF9800]/30 text-[#FF9800] text-sm flex items-center gap-2">
                    <FiAlertTriangle size={14} /> {actionMsg.text}
                  </motion.div>
                )}
                {actionMsg?.type === "error" && (
                  <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
                    <FiAlertTriangle size={14} /> {actionMsg.text}
                  </div>
                )}

                <AnimatePresence>
                  {showReasonInput && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }} className="mb-4 overflow-hidden">
                      <input type="text" placeholder="Why rejecting? (optional)"
                        value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                        className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-[#E6E6EB] placeholder-[#9CA3AF] focus:outline-none focus:border-[#FF4FD8]/60 transition-all" />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-3">
                  <motion.button onClick={handleApprove} disabled={actionLoading}
                    whileHover={{ scale: 1.03, boxShadow: "0 0 35px rgba(34,197,94,0.5)" }} whileTap={{ scale: 0.97 }}
                    className="flex-1 py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 relative overflow-hidden disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#22C55E,#00E0FF)" }}>
                    <motion.div className="absolute inset-0" animate={{ x: ["-100%", "100%"] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)" }} />
                    {actionLoading ? (
                      <motion.div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white relative"
                        animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }} />
                    ) : <><FiCheck size={18} className="relative" /> <span className="relative">Approve Strategy</span></>}
                  </motion.button>
                  {!showReasonInput ? (
                    <motion.button onClick={() => setShowReasonInput(true)} disabled={actionLoading}
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      className="px-6 py-4 rounded-xl font-bold border border-white/15 text-[#9CA3AF] hover:text-white hover:border-red-500/40 flex items-center gap-2 transition-all disabled:opacity-50">
                      <FiAlertTriangle size={16} /> Reject
                    </motion.button>
                  ) : (
                    <motion.button onClick={handleReject} disabled={actionLoading}
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      className="px-6 py-4 rounded-xl font-bold text-white flex items-center gap-2 disabled:opacity-50"
                      style={{ background: "rgba(239,68,68,0.55)" }}>
                      {actionLoading ? (
                        <motion.div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white"
                          animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }} />
                      ) : <><FiAlertTriangle size={16} /> Confirm Reject</>}
                    </motion.button>
                  )}
                </div>
              </motion.div>
            )}

            {actionMsg?.type === "approved" && (
              <motion.div initial={{ opacity: 0, scale: 0.93 }} animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl p-12 text-center border border-[#22C55E]/45 relative overflow-hidden"
                style={{ background: "radial-gradient(circle at 50% 0%, #22C55E18, transparent 65%), linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))" }}>
                <FloatingParticles count={15} colors={[C.green, C.cyan]} />
                <motion.div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 relative z-10"
                  style={{ background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.4)" }}
                  animate={{ boxShadow: ["0 0 0 0 #22C55E30","0 0 0 20px #22C55E00"] }}
                  transition={{ duration: 2, repeat: Infinity }}>
                  <FiCheck className="text-[#22C55E]" size={32} />
                </motion.div>
                <h3 className="text-white font-black text-2xl mb-2 relative z-10">Strategy Approved! ✅</h3>
                <p className="text-[#9CA3AF] text-sm relative z-10">{actionMsg.text}</p>
              </motion.div>
            )}

            {actionMsg?.type === "exhausted" && (
              <motion.div initial={{ opacity: 0, scale: 0.93 }} animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl p-12 text-center border border-[#FF9800]/30 relative overflow-hidden"
                style={{ background: "linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))" }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: "rgba(255,152,0,0.12)", border: "1px solid rgba(255,152,0,0.3)" }}>
                  <FiAlertTriangle className="text-[#FF9800]" size={32} />
                </div>
                <h3 className="text-white font-black text-2xl mb-2">No Better Strategy Available</h3>
                <p className="text-[#9CA3AF] text-sm mb-6">{actionMsg.text}</p>
                <motion.button onClick={onBack} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className="px-8 py-3.5 rounded-xl font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#7C5CFF,#FF4FD8)" }}>
                  ← Adjust Simulation Inputs
                </motion.button>
              </motion.div>
            )}

            {/* SHAP */}
            <GlassCard className="p-6" accent={C.pink}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <motion.div animate={{ rotate: [0, 15, 0, -15, 0] }} transition={{ duration: 4, repeat: Infinity }}>
                    <FiTarget className="text-[#FF4FD8]" size={18} />
                  </motion.div>
                  <h3 className="text-white font-bold">Explainable AI — Feature Importance</h3>
                </div>
                {shapData?.fallback && !shapData?.noData && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-[#9CA3AF]">
                    Importance Mode
                  </span>
                )}
              </div>
              {shapLoading ? (
                <div className="flex items-center justify-center py-8 gap-3">
                  <GlowOrb color={C.pink} size={36} rings={2} />
                  <p className="text-[#9CA3AF] text-sm">Computing feature importance…</p>
                </div>
              ) : shapData?.noData ? (
                <div className="text-center py-8">
                  <p className="text-[#FF9800] text-sm font-semibold mb-1">Feature importance not available</p>
                  <p className="text-[#9CA3AF] text-xs">{shapData.strategyContext}</p>
                </div>
              ) : shapData?.topFeatures?.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <p className="text-[#9CA3AF] text-xs leading-relaxed mb-2 p-3 rounded-xl bg-white/3 border border-white/8">
                    {shapData.strategyContext}
                  </p>
                  {shapData?.fallback && shapData?.fallbackContext && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-[#FF9800]/25 bg-[#FF9800]/6 mb-1">
                      <FiAlertCircle size={12} className="text-[#FF9800] mt-0.5 shrink-0" />
                      <p className="text-[#9CA3AF] text-[10px] leading-relaxed">{shapData.fallbackContext}</p>
                    </motion.div>
                  )}
                  {shapData.topFeatures.map((f, i) => {
                    const colors = [C.violet, C.cyan, C.pink, C.green, C.orange, C.violet, C.cyan, C.pink];
                    const pct = Math.round(f.importance * 100);
                    const c = colors[i % colors.length];
                    const directionBadge = (() => {
                      if (f.direction === "positive") return { symbol: "▲", color: C.green, label: "positive" };
                      if (f.direction === "negative") return { symbol: "▼", color: C.red,   label: "negative" };
                      return                                 { symbol: "◆", color: C.muted, label: "unknown"  };
                    })();
                    return (
                      <motion.div key={f.feature}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.07 }}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[#E6E6EB] text-xs font-mono font-semibold">{f.feature}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono"
                              style={{ background: `${directionBadge.color}20`, color: directionBadge.color }}>
                              {directionBadge.symbol} {directionBadge.label}
                            </span>
                          </div>
                          <span className="text-xs font-bold" style={{ color: c }}>{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/8 overflow-hidden mb-1">
                          <motion.div className="h-full rounded-full" style={{ background: c }}
                            initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.9, delay: i * 0.1 }} />
                        </div>
                        <p className="text-[#9CA3AF] text-xs">{f.description}</p>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[#9CA3AF] text-sm text-center py-4">SHAP data not available.</p>
              )}
            </GlassCard>

            {/* Feedback History */}
            {feedbackHistory.length > 0 && (
              <GlassCard className="p-6" accent={C.violet}>
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <FiCheck size={15} className="text-[#7C5CFF]" /> Decision Feedback History
                </h3>
                <div className="flex flex-col gap-2">
                  {feedbackHistory.map(fb => (
                    <motion.div key={fb._id} className="flex items-center gap-3 p-3 rounded-xl border border-white/8 bg-white/2"
                      whileHover={{ x: 3 }}>
                      <div className={`w-2 h-2 rounded-full shrink-0 ${fb.decision === "approved" ? "bg-[#22C55E]" : "bg-red-400"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[#E6E6EB] text-xs font-semibold truncate">{fb.strategyName}</p>
                        {fb.reason && <p className="text-[#9CA3AF] text-xs mt-0.5">"{fb.reason}"</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                          fb.decision === "approved" ? "bg-[#22C55E]/15 text-[#22C55E]" : "bg-red-500/15 text-red-400"
                        }`}>{fb.decision}</span>
                        <p className="text-[#9CA3AF] text-[10px] mt-1">Score: {fb.confidence?.toFixed(1)}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </GlassCard>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MAIN DASHBOARD
════════════════════════════════════════════════════════════════ */
export default function UserDashboard() {
  const navigate = useNavigate();
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [userName,     setUserName]     = useState("");
  const [authLoading,  setAuthLoading]  = useState(true);
  const [view,         setView]         = useState("home");
  const [navDirection, setNavDirection] = useState("forward");

  const navigateTo = useCallback((nextView) => {
    const ci = STEP_ORDER.indexOf(view); const ni = STEP_ORDER.indexOf(nextView);
    setNavDirection(ni >= ci ? "forward" : "back");
    setView(nextView);
    requestAnimationFrame(() => scrollToTop());
  }, [view]);

  const [project,          setProject]          = useState(null);
  const [currentObjective, setCurrentObjective] = useState(null);
  const [savedSimMode,     setSavedSimMode]     = useState(null);
  const [agentResultState, setAgentResultState] = useState(null);
  const [mlResultState,    setMlResultState]    = useState(null);
  const [projectName,      setProjectName]      = useState("");
  const [files,            setFiles]            = useState({ ecommerce: null, marketing: null, advertising: null });
  const [uploading,        setUploading]        = useState(false);
  const [uploadErr,        setUploadErr]        = useState("");
  const [uploadedProject,  setUploadedProject]  = useState(null);
  const [reusedDatasets,   setReusedDatasets]   = useState(false);
  const [copied,           setCopied]           = useState(false);
  const [projectStatus,    setProjectStatus]    = useState(null);
  const pollStatusRef = useRef(null);
  const [selectedObjective, setSelectedObjective] = useState(null);
  const [savingObjective,   setSavingObjective]   = useState(false);
  const [objectiveErr,      setObjectiveErr]      = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { navigate("/login"); return; }
      setFirebaseUser(user);
      try {
        const res  = await fetch(`${API}/users/${user.uid}`);
        const data = await res.json();
        setUserName(data.user?.name || user.displayName || "User");
      } catch { setUserName(user.displayName || "User"); }
      setAuthLoading(false);
    });
    return unsub;
  }, [navigate]);

  const startStatusPoll = (projectId) => {
    if (pollStatusRef.current) clearInterval(pollStatusRef.current);
    pollStatusRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${API}/projects/status/${projectId}`);
        const data = await res.json();
        if (data.project) {
          setProject(prev => ({ ...prev, ...data.project }));
          setProjectStatus(data.project.status);
          if (["engineered","ml_complete","complete","error"].includes(data.project.status)) {
            clearInterval(pollStatusRef.current);
          }
        }
      } catch {}
    }, 3000);
  };

  useEffect(() => { return () => { if (pollStatusRef.current) clearInterval(pollStatusRef.current); }; }, []);

  const handleLogout = async () => { await signOut(auth); navigate("/login"); };

  const handleUpload = async () => {
    if (!projectName.trim())     { setUploadErr("Please enter a project name."); return; }
    if (!files.ecommerce || !files.marketing || !files.advertising) {
      setUploadErr("Please upload all 3 CSV files."); return;
    }
    setUploading(true); setUploadErr("");
    try {
      const fd = new FormData();
      fd.append("projectName", projectName); fd.append("uid", firebaseUser.uid);
      fd.append("ecommerce",   files.ecommerce);
      fd.append("marketing",   files.marketing);
      fd.append("advertising", files.advertising);
      const res  = await fetch(`${API}/projects/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed.");
      const pid    = data.project?.projectId  ?? data.projectId;
      const pname  = data.project?.projectName ?? data.projectName ?? projectName;
      const pstatus= data.project?.status      ?? data.status      ?? "uploaded";
      const reused = data.reusedDatasets === true;
      if (!pid) throw new Error(`Unexpected response: ${JSON.stringify(data)}`);
      const projectObj = { projectId: pid, projectName: pname, status: pstatus, kpiSummary: data.project?.kpiSummary ?? null };
      setUploadedProject({ projectId: pid, projectName: pname });
      setProjectStatus(pstatus); setProject(projectObj); setReusedDatasets(reused);
      if (reused) { setTimeout(() => navigateTo("step2"), 1800); }
      else        { startStatusPoll(pid); }
    } catch (e) { setUploadErr(e.message); }
    setUploading(false);
  };

  const handleSaveObjective = async () => {
    if (!selectedObjective) { setObjectiveErr("Please select an objective."); return; }
    setSavingObjective(true); setObjectiveErr("");
    try {
      const res  = await fetch(`${API}/projects/objective/${project.projectId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: firebaseUser.uid, objective: selectedObjective }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setCurrentObjective(selectedObjective); navigateTo("step3");
    } catch (e) { setObjectiveErr(e.message); }
    setSavingObjective(false);
  };

  const copyProjectId = (id) => {
    try { navigator.clipboard.writeText(id); } catch {
      const el = document.createElement("textarea");
      el.value = id; document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el);
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const objectives = [
    { id: "increase_revenue",        label: "Increase Revenue",        icon: FiTrendingUp, color: C.green  },
    { id: "reduce_cart_abandonment", label: "Reduce Cart Abandonment", icon: FiActivity,   color: C.orange },
    { id: "improve_conversion_rate", label: "Improve Conversion Rate", icon: FiTarget,     color: C.violet },
    { id: "optimize_marketing_roi",  label: "Optimize Marketing ROI",  icon: FiBarChart2,  color: C.cyan   },
  ];

  const statusSteps = [
    { key: "uploaded",    label: "Files Uploaded"       },
    { key: "cleaning",    label: "Cleaning Data"        },
    { key: "cleaned",     label: "Data Cleaned"         },
    { key: "engineering", label: "Engineering Features" },
    { key: "engineered",  label: "Features Ready"       },
  ];
  const statusOrder = ["uploaded","cleaning","cleaned","engineering","engineered","analyzing","ml_complete","complete"];
  const stepLabels  = {
    home: null, step1: "Upload Datasets", step2: "Business Objective",
    step3: "Strategy Simulation", step45: "ML Training & Agents", step5: "Decision & Review",
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-5">
          <GlowOrb color={C.violet} size={60} rings={3} />
          <div className="text-center">
            <p className="text-white font-bold text-sm">AgenticIQ</p>
            <p className="text-[#9CA3AF] text-xs mt-1">Loading your workspace…</p>
          </div>
        </motion.div>
      </div>
    );
  }

  const PAGE_TRANSITION_OPTS = { duration: 0.38, ease: [0.22, 1, 0.36, 1] };
  const pageVariants = {
    forward: { initial: { opacity: 0, x: 40,  filter: "blur(5px)" }, animate: { opacity: 1, x: 0, filter: "blur(0px)" }, exit: { opacity: 0, x: -40, filter: "blur(5px)" } },
    back:    { initial: { opacity: 0, x: -40, filter: "blur(5px)" }, animate: { opacity: 1, x: 0, filter: "blur(0px)" }, exit: { opacity: 0, x: 40,  filter: "blur(5px)" } },
  };
  const pv = pageVariants[navDirection] || pageVariants.forward;

  return (
    <div className="min-h-screen" style={{
      background: `radial-gradient(ellipse at 15% 10%, ${C.violet}07, transparent 45%), radial-gradient(ellipse at 85% 90%, ${C.cyan}06, transparent 45%), ${C.bg}`,
    }}>
      {/* ── TOPBAR ── */}
      <div className="sticky top-0 z-50 backdrop-blur-2xl border-b border-white/6" style={{ background: "rgba(11,11,15,0.82)" }}>
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div className="relative w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#7C5CFF,#00E0FF)" }}
              whileHover={{ scale: 1.1, rotate: 5 }}>
              <FiCpu size={15} className="text-white relative z-10" />
            </motion.div>
            <div>
              <span className="text-white font-black text-base leading-none tracking-tight">AgenticIQ</span>
              {stepLabels[view] && (
                <motion.span key={stepLabels[view]} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className="text-[10px] font-mono text-[#7C5CFF]/80 leading-none mt-0.5 block">
                  {stepLabels[view]}
                </motion.span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline-flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded-full border border-[#7C5CFF]/25 bg-[#7C5CFF]/8 text-[#7C5CFF]">
              v15.0 · GridFS + LangChain RAG
            </span>
            <span className="text-[#9CA3AF] text-sm hidden md:block">
              <span className="text-white/40">Hi, </span><span className="text-white font-semibold">{userName}</span>
            </span>
            <motion.button onClick={handleLogout}
              whileHover={{ scale: 1.04, backgroundColor: "rgba(255,255,255,0.07)" }} whileTap={{ scale: 0.96 }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/8 text-[#9CA3AF] hover:text-white text-sm transition-colors">
              <FiLogOut size={13} /> Logout
            </motion.button>
          </div>
        </div>
        {view !== "home" && (
          <div className="h-px w-full overflow-hidden">
            <motion.div className="h-full" style={{ background: "linear-gradient(90deg,#7C5CFF,#FF4FD8,#00E0FF)" }}
              initial={{ scaleX: 0, originX: 0 }} animate={{ scaleX: 1 }}
              transition={{ duration: 0.9, ease: "easeOut" }} />
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">

          {/* ════════ HOME ════════ */}
          {view === "home" && (
            <motion.div key="home"
              initial={{ opacity: 0, y: 24, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -20, filter: "blur(4px)" }}
              transition={PAGE_TRANSITION_OPTS}>

              <motion.div className="mb-10" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <motion.span className="text-xs font-mono px-2.5 py-1 rounded-full border border-[#7C5CFF]/30 bg-[#7C5CFF]/10 text-[#7C5CFF]"
                    animate={{ boxShadow: ["0 0 0 0 #7C5CFF30","0 0 0 8px #7C5CFF00"] }}
                    transition={{ duration: 2, repeat: Infinity }}>AI-Powered</motion.span>
                  <span className="text-xs font-mono px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-[#9CA3AF]">5-Step Pipeline</span>
                  <span className="text-xs font-mono px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-[#9CA3AF]">PKL-Validated</span>
                  <span className="text-xs font-mono px-2.5 py-1 rounded-full border border-[#00E0FF]/20 bg-[#00E0FF]/8 text-[#00E0FF]">v15.0 · GridFS + LangChain LCEL + Groq</span>
                </div>
                <h1 className="text-4xl md:text-5xl font-black text-white mb-2 leading-tight">
                  Welcome back,{" "}
                  <span className="text-transparent bg-clip-text"
                    style={{ backgroundImage: "linear-gradient(135deg,#7C5CFF,#FF4FD8,#00E0FF)" }}>
                    {userName}
                  </span>
                </h1>
                <p className="text-[#9CA3AF] text-sm max-w-xl">
                  Upload your business datasets and let AI agents diagnose KPI gaps, simulate strategies
                  with a ML-trained KPI regressor (quantity + discount_amount features), and recommend the
                  optimal action — validated by real ensemble models. Chat with your results via the Project AI Assistant.
                </p>
              </motion.div>

              {/* Home grid: Start New Project + RagChatCard */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
                  <GlassCard className="p-8 cursor-pointer h-full" accent={C.violet} hover={true} glow={C.violet}
                    onClick={() => navigateTo("step1")}>
                    <div className="relative overflow-hidden">
                      <motion.div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
                        style={{ background: "linear-gradient(135deg,rgba(124,92,255,0.35),rgba(124,92,255,0.12))", border: "1px solid rgba(124,92,255,0.35)" }}
                        whileHover={{ scale: 1.12, rotate: 5 }}>
                        <FiUpload className="text-[#7C5CFF]" size={20} />
                      </motion.div>
                      <h2 className="text-white font-black text-xl mb-2">Start New Project</h2>
                      <p className="text-[#9CA3AF] text-sm leading-relaxed mb-6">
                        Upload ecommerce, marketing & advertising CSVs. Trains 3 classifiers + 1 KPI regressor
                        with quantity & discount_amount features for ML-driven strategy projections.
                      </p>
                      <div className="flex items-center gap-2 text-[#7C5CFF] text-sm font-semibold">
                        Upload Datasets
                        <motion.div animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                          <FiArrowRight size={14} />
                        </motion.div>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>

                {/* ── RAG CHAT CARD — replaces Resume Project ── */}
                <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
                  <RagChatCard />
                </motion.div>
              </div>

              {/* Pipeline overview */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
                <GlassCard className="p-6" accent={C.violet}>
                  <p className="text-[#9CA3AF] text-[10px] font-mono uppercase tracking-widest mb-5">Pipeline Overview — v15.0</p>
                  <div className="flex items-stretch gap-0 flex-wrap md:flex-nowrap">
                    {[
                      { n: "01", label: "Upload",     desc: "3 CSV datasets",          color: C.violet, icon: FiUpload    },
                      { n: "02", label: "Objective",  desc: "Set business goal",        color: C.pink,   icon: FiTarget    },
                      { n: "03", label: "Simulation", desc: "Define strategy",          color: C.cyan,   icon: FiActivity  },
                      { n: "04", label: "ML + KPI",   desc: "RF+XGB+LGB+Regressor",     color: C.orange, icon: FiCpu       },
                      { n: "05", label: "Decision",   desc: "Approve + AI Chat",        color: C.green,  icon: FiZap       },
                    ].map((step, i) => {
                      const Icon = step.icon;
                      return (
                        <React.Fragment key={step.n}>
                          <motion.div className="flex-1 min-w-0 text-center px-3 py-2"
                            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.35 + i * 0.07 }} whileHover={{ y: -3 }}>
                            <motion.div className="w-8 h-8 rounded-xl flex items-center justify-center mx-auto mb-2"
                              style={{ background: `${step.color}18`, border: `1px solid ${step.color}30` }}
                              whileHover={{ boxShadow: `0 0 20px ${step.color}40` }}>
                              <Icon size={14} style={{ color: step.color }} />
                            </motion.div>
                            <div className="text-[10px] font-black mb-0.5" style={{ color: step.color }}>{step.n}</div>
                            <div className="text-white text-xs font-semibold mb-0.5">{step.label}</div>
                            <div className="text-[#9CA3AF] text-[10px]">{step.desc}</div>
                          </motion.div>
                          {i < 4 && (
                            <div className="text-white/10 text-xs hidden md:flex items-center pt-1">
                              <motion.span animate={{ opacity: [0.2, 0.8, 0.2] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}>→</motion.span>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                  <div className="mt-5 pt-4 border-t border-white/6">
                    <div className="flex flex-wrap gap-2">
                      {[
                        { icon: FiShield,       label: "KPI regressor required (29 features, GridFS PKL storage v15.0)", color: C.violet },
                        { icon: FiDatabase,     label: "Real KPIs computed from your uploaded dataset (CTR, Conv Rate, Cart Abandon, ROI)",    color: C.cyan   },
                        { icon: FiMessageSquare,label: "FAISS + Ollama RAG — chat with your ML results via AI Assistant",       color: C.pink   },
                      ].map(({ icon: Icon, label, color }) => (
                        <div key={label} className="flex items-center gap-1.5 text-[10px] font-mono text-[#9CA3AF]">
                          <Icon size={10} style={{ color }} />
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            </motion.div>
          )}

          {/* ════════ STEP 1 — UPLOAD ════════ */}
          {view === "step1" && (
            <motion.div key="step1" initial={pv.initial} animate={pv.animate} exit={pv.exit} transition={PAGE_TRANSITION_OPTS}>
              <div className="max-w-4xl mx-auto">
                <GlassCard className="p-7">
                  <StepBreadcrumb current="step1" />
                  <div className="flex items-center gap-3 mb-2">
                    <motion.div className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg,#7C5CFF,#00E0FF)" }}
                      animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2.5, repeat: Infinity }}>
                      <FiUpload size={16} className="text-white" />
                    </motion.div>
                    <div>
                      <span className="text-[10px] font-mono text-[#7C5CFF] uppercase tracking-widest">Step 1 of 5</span>
                      <h2 className="text-2xl font-black text-white">Upload Datasets</h2>
                    </div>
                  </div>
                  <p className="text-[#9CA3AF] text-sm mb-6">Upload your ecommerce, marketing & advertising CSV files to get started.</p>

                  {uploadedProject && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                      className="mb-6 p-5 rounded-2xl border border-[#22C55E]/40 bg-[#22C55E]/6">
                      <div className="flex items-center gap-2 mb-2">
                        <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1, repeat: 3 }}>
                          <FiCheck className="text-[#22C55E]" size={16} />
                        </motion.div>
                        <p className="text-[#22C55E] font-bold text-sm">
                          {reusedDatasets ? "Datasets recognised — skipping processing!" : "Upload successful!"}
                        </p>
                      </div>
                      {reusedDatasets && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className="mb-3 p-3 rounded-xl bg-[#7C5CFF]/10 border border-[#7C5CFF]/30 flex items-start gap-2">
                          <FiZap className="text-[#7C5CFF] shrink-0 mt-0.5" size={14} />
                          <div>
                            <p className="text-[#7C5CFF] text-xs font-semibold">Datasets processed before — reusing engineered files</p>
                            <p className="text-[#9CA3AF] text-xs mt-0.5">Redirecting to objective selection…</p>
                          </div>
                        </motion.div>
                      )}
                      <p className="text-[#9CA3AF] text-xs mb-3">⚠️ Save your Project ID — shown only once.</p>
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-white/4 border border-white/10">
                        <span className="text-[#E6E6EB] font-mono font-bold text-lg tracking-widest flex-1">
                          {uploadedProject.projectId}
                        </span>
                        <motion.button onClick={() => copyProjectId(uploadedProject.projectId)}
                          whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 border border-white/10 text-xs text-[#9CA3AF] hover:text-white transition-all">
                          <FiCopy size={12} /> {copied ? "Copied!" : "Copy"}
                        </motion.button>
                      </div>

                      {!reusedDatasets && (
                        <div className="mt-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            {statusSteps.map((s, i) => {
                              const currentIdx = statusOrder.indexOf(projectStatus);
                              const stepIdx    = statusOrder.indexOf(s.key);
                              const done   = currentIdx > stepIdx;
                              const active = currentIdx === stepIdx;
                              return (
                                <React.Fragment key={s.key}>
                                  <motion.div
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all ${
                                      done   ? "bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30" :
                                      active ? "bg-[#7C5CFF]/15 text-white border border-[#7C5CFF]/40" :
                                               "bg-white/3 text-[#9CA3AF] border border-white/8"
                                    }`}
                                    animate={active ? { borderColor: ["rgba(124,92,255,0.4)","rgba(124,92,255,0.8)","rgba(124,92,255,0.4)"] } : {}}
                                    transition={{ duration: 1.5, repeat: Infinity }}>
                                    {done   ? <FiCheck size={9} /> :
                                     active ? <motion.div className="w-2 h-2 rounded-full border border-current border-t-transparent"
                                       animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} /> :
                                     <div className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />}
                                    {s.label}
                                  </motion.div>
                                  {i < statusSteps.length - 1 && <span className="text-white/15 text-xs">→</span>}
                                </React.Fragment>
                              );
                            })}
                          </div>
                          {["cleaning","engineering"].includes(projectStatus) && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
                              <p className="text-[#9CA3AF] text-xs mb-2 font-mono">
                                {projectStatus === "cleaning" ? "🧹 Cleaning your data…" : "⚙️ Engineering features (quantity + discount_amount)…"}
                              </p>
                              <DataStream active={true} color={C.violet} height={3} />
                              <NeuralNet active={true} color={C.violet} />
                            </motion.div>
                          )}
                        </div>
                      )}

                      {(projectStatus === "engineered" || reusedDatasets) && project?.kpiSummary && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                          <p className="text-[#9CA3AF] text-[10px] font-mono uppercase tracking-widest mb-3">
                            {reusedDatasets ? "KPIs (previous run)" : "Computed KPIs (from your dataset)"}
                          </p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                            {[
                              { label: "Avg CTR",         val: project.kpiSummary.avgCTR,             decimals: 4, suffix: "%", color: C.violet },
                              { label: "Conversion Rate", val: project.kpiSummary.avgConversionRate,  decimals: 4, suffix: "%", color: C.cyan   },
                              { label: "Cart Abandon",    val: project.kpiSummary.avgCartAbandonment, decimals: 2, suffix: "%", color: C.pink   },
                              { label: "Avg ROI",         val: project.kpiSummary.avgROI,             decimals: 4, suffix: "x", color: C.green  },
                            ].map(({ label, val, decimals, suffix, color }) => (
                              <motion.div key={label} className="rounded-xl p-3 text-center border"
                                style={{ background: `${color}06`, borderColor: `${color}20` }}
                                whileHover={{ scale: 1.04 }}>
                                <p className="text-[#9CA3AF] text-xs mb-1">{label}</p>
                                <p className="font-black text-sm" style={{ color }}>
                                  <AnimatedNumber value={val} decimals={decimals} suffix={suffix} />
                                </p>
                              </motion.div>
                            ))}
                          </div>
                          {!reusedDatasets && (
                            <motion.button onClick={() => navigateTo("step2")}
                              whileHover={{ scale: 1.02, boxShadow: "0 0 35px rgba(124,92,255,0.45)" }} whileTap={{ scale: 0.97 }}
                              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white relative overflow-hidden"
                              style={{ background: "linear-gradient(135deg,#7C5CFF,#00E0FF)" }}>
                              <motion.div className="absolute inset-0" animate={{ x: ["-100%","100%"] }}
                                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)" }} />
                              <span className="relative">Step 2: Select Objective →</span>
                            </motion.button>
                          )}
                        </motion.div>
                      )}

                      {projectStatus === "error" && (
                        <div className="mt-3 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                          Processing error. Please try uploading again.
                        </div>
                      )}
                    </motion.div>
                  )}

                  {!uploadedProject && (
                    <>
                      <div className="mb-5">
                        <label className="text-[#E6E6EB] text-sm font-semibold block mb-2">Project Name</label>
                        <input value={projectName} onChange={e => setProjectName(e.target.value)}
                          placeholder="e.g. Q1 2026 Campaign Analysis"
                          className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-[#E6E6EB] text-sm placeholder-[#9CA3AF] focus:outline-none focus:border-[#7C5CFF]/60 transition-all" />
                      </div>
                      {[
                        { key: "ecommerce",   label: "Customer / Ecommerce Dataset",   hint: "customer_id, revenue, purchased, cart_abandoned, quantity…" },
                        { key: "marketing",   label: "Marketing Campaign Dataset",      hint: "Campaign_ID, ROI, Clicks, Impressions…"                    },
                        { key: "advertising", label: "Advertising Performance Dataset", hint: "campaign_number, clicks, displays, cost…"                   },
                      ].map(({ key, label, hint }) => (
                        <div key={key} className="mb-4">
                          <label className="text-[#E6E6EB] text-sm font-semibold block mb-2">{label}</label>
                          <motion.div
                            className={`relative border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer ${
                              files[key]
                                ? "border-[#22C55E]/50 bg-[#22C55E]/5"
                                : "border-white/12 bg-white/2 hover:border-[#7C5CFF]/40 hover:bg-[#7C5CFF]/5"
                            }`}
                            whileHover={!files[key] ? { scale: 1.01 } : {}}>
                            <input type="file" accept=".csv"
                              onChange={e => setFiles(prev => ({ ...prev, [key]: e.target.files[0] }))}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                            {files[key] ? (
                              <div className="flex items-center justify-center gap-2">
                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
                                  <FiCheck className="text-[#22C55E]" size={16} />
                                </motion.div>
                                <span className="text-[#22C55E] text-sm font-semibold">{files[key].name}</span>
                              </div>
                            ) : (
                              <>
                                <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                                  <FiUpload className="text-[#9CA3AF] mx-auto mb-2" size={20} />
                                </motion.div>
                                <p className="text-[#9CA3AF] text-sm">Drop CSV or click to browse</p>
                                <p className="text-[#9CA3AF] text-xs mt-1 font-mono">{hint}</p>
                              </>
                            )}
                          </motion.div>
                        </div>
                      ))}
                      {uploadErr && (
                        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                          className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
                          <FiAlertTriangle size={14} /> {uploadErr}
                        </motion.div>
                      )}
                      <div className="flex gap-3">
                        <button onClick={() => navigateTo("home")}
                          className="px-5 py-3 rounded-xl border border-white/10 text-[#9CA3AF] hover:text-white hover:border-white/25 hover:bg-white/4 text-sm transition-all">
                          ← Back
                        </button>
                        <motion.button onClick={handleUpload} disabled={uploading}
                          whileHover={{ scale: 1.02, boxShadow: "0 0 35px rgba(124,92,255,0.45)" }} whileTap={{ scale: 0.97 }}
                          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white relative overflow-hidden disabled:opacity-50"
                          style={{ background: "linear-gradient(135deg,#7C5CFF,#00E0FF)" }}>
                          <motion.div className="absolute inset-0" animate={{ x: ["-100%","100%"] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)" }} />
                          <span className="relative flex items-center gap-2">
                            {uploading ? (
                              <><motion.div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white"
                                animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }} /> Uploading…</>
                            ) : (
                              <><FiUpload size={16} /> Upload Data & Create Project</>
                            )}
                          </span>
                        </motion.button>
                      </div>
                    </>
                  )}
                </GlassCard>
              </div>
            </motion.div>
          )}

          {/* ════════ STEP 2 — OBJECTIVE ════════ */}
          {view === "step2" && (
            <motion.div key="step2" initial={pv.initial} animate={pv.animate} exit={pv.exit} transition={PAGE_TRANSITION_OPTS}>
              <div className="max-w-4xl mx-auto">
                <GlassCard className="p-7">
                  <StepBreadcrumb current="step2" />
                  <div className="flex items-center gap-3 mb-2">
                    <motion.div className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg,#00E0FF,#7C5CFF)" }}
                      animate={{ rotate: [0, 360] }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }}>
                      <FiTarget size={16} className="text-white" />
                    </motion.div>
                    <div>
                      <span className="text-[10px] font-mono text-[#00E0FF] uppercase tracking-widest">Step 2 of 5</span>
                      <h2 className="text-2xl font-black text-white">Business Objective</h2>
                    </div>
                  </div>
                  <p className="text-[#9CA3AF] text-sm mb-2">
                    What do you want to improve?&nbsp;
                    Project: <span className="text-[#7C5CFF] font-semibold">{project?.projectName}</span>
                  </p>
                  <div className="mb-6 p-3 rounded-xl border border-[#FF9800]/20 bg-[#FF9800]/5 flex items-start gap-2">
                    <FiInfo size={12} className="text-[#FF9800] mt-0.5 shrink-0" />
                    <p className="text-[#9CA3AF] text-[10px] leading-relaxed">
                      The objective you select must match what you train models for. Changing objectives after training
                      requires a <span className="text-[#FF9800] font-semibold">full retrain</span> — the KPI regressor is objective-specific.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {objectives.map(({ id, label, icon: Icon, color }, oi) => (
                      <motion.div key={id} onClick={() => setSelectedObjective(id)}
                        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: oi * 0.07 }} whileHover={{ scale: 1.025, y: -2 }} whileTap={{ scale: 0.975 }}
                        className="p-5 rounded-2xl border cursor-pointer transition-all relative overflow-hidden"
                        style={{
                          borderColor: selectedObjective === id ? `${color}65` : "rgba(255,255,255,0.08)",
                          background:  selectedObjective === id ? `${color}0C`  : "rgba(255,255,255,0.02)",
                        }}>
                        {selectedObjective === id && (
                          <motion.div className="absolute inset-0"
                            style={{ background: `radial-gradient(circle at 15% 50%, ${color}12, transparent 65%)` }}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
                        )}
                        <div className="flex items-center gap-3 relative z-10">
                          <motion.div className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ background: selectedObjective === id ? `${color}25` : "rgba(255,255,255,0.05)" }}
                            animate={selectedObjective === id ? { boxShadow: [`0 0 0 0 ${color}40`, `0 0 0 10px ${color}00`] } : {}}
                            transition={{ duration: 1.8, repeat: Infinity }}>
                            <Icon size={18} style={{ color: selectedObjective === id ? color : "#9CA3AF" }} />
                          </motion.div>
                          <p className="text-white font-bold text-sm flex-1">{label}</p>
                          <AnimatePresence>
                            {selectedObjective === id && (
                              <motion.div className="w-6 h-6 rounded-full flex items-center justify-center"
                                style={{ background: color }}
                                initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                                transition={{ type: "spring", bounce: 0.5 }}>
                                <FiCheck size={12} className="text-white" />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  {objectiveErr && (
                    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                      className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
                      <FiAlertTriangle size={14} /> {objectiveErr}
                    </motion.div>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => navigateTo("step1")}
                      className="px-5 py-3 rounded-xl border border-white/10 text-[#9CA3AF] hover:text-white hover:border-white/25 hover:bg-white/4 text-sm transition-all">
                      ← Back
                    </button>
                    <motion.button onClick={handleSaveObjective} disabled={savingObjective || !selectedObjective}
                      whileHover={{ scale: 1.02, boxShadow: "0 0 35px rgba(0,224,255,0.45)" }} whileTap={{ scale: 0.97 }}
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white relative overflow-hidden disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#00E0FF,#7C5CFF)" }}>
                      <motion.div className="absolute inset-0" animate={{ x: ["-100%","100%"] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)" }} />
                      <span className="relative flex items-center gap-2">
                        {savingObjective ? (
                          <><motion.div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white"
                            animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }} /> Saving…</>
                        ) : "Save Objective & Continue →"}
                      </span>
                    </motion.button>
                  </div>
                </GlassCard>
              </div>
            </motion.div>
          )}

          {/* ════════ STEP 3 ════════ */}
          {view === "step3" && project && (
            <Step3SimulationMode key="step3"
              project={project} currentObjective={currentObjective} firebaseUser={firebaseUser}
              onNext={(simMode) => { setSavedSimMode(simMode); navigateTo("step45"); }}
              onBack={() => navigateTo("step2")} />
          )}

          {/* ════════ STEP 4+5 ════════ */}
          {view === "step45" && project && (
            <Step4And5Auto key="step45"
              project={project} currentObjective={currentObjective} savedSimMode={savedSimMode}
              firebaseUser={firebaseUser}
              onBack={() => navigateTo("step3")}
              onDone={(ar, mlr) => { setAgentResultState(ar); setMlResultState(mlr); navigateTo("step5"); }} />
          )}

          {/* ════════ STEP 5 ════════ */}
          {view === "step5" && project && (
            <Step5AgentPipeline key="step5"
              project={project} currentObjective={currentObjective} savedSimMode={savedSimMode}
              mlResult={mlResultState} agentResult={agentResultState}
              firebaseUser={firebaseUser} onBack={() => navigateTo("step45")} />
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}