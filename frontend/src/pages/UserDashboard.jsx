import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase";
import {
  FiCpu, FiUpload, FiLogOut, FiUser, FiCheck,
  FiAlertTriangle, FiCopy, FiTarget, FiKey,
  FiEye, FiBarChart2, FiZap, FiLoader, FiArrowRight,
  FiTrendingUp, FiShoppingCart, FiDollarSign,
} from "react-icons/fi";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: "easeOut" },
});

/* ── Status config ── */
const STATUS = {
  uploaded:    { label: "Uploaded",    color: "#9CA3AF", pulse: false },
  cleaning:    { label: "Cleaning…",   color: "#FF9800", pulse: true  },
  cleaned:     { label: "Cleaned",     color: "#00E0FF", pulse: false },
  engineering: { label: "Engineering…",color: "#FF4FD8", pulse: true  },
  engineered:  { label: "Ready ✓",     color: "#22C55E", pulse: false },
  analyzing:   { label: "Analyzing…",  color: "#7C5CFF", pulse: true  },
  complete:    { label: "Complete ✓",  color: "#00E0FF", pulse: false },
  error:       { label: "Error",       color: "#EF4444", pulse: false },
};

const OBJECTIVES = [
  {
    val:   "increase_revenue",
    label: "Increase Revenue",
    icon:  <FiTrendingUp size={18} />,
    color: "#7C5CFF",
    desc:  "Maximize total sales and customer lifetime value.",
  },
  {
    val:   "reduce_cart_abandonment",
    label: "Reduce Cart Abandonment",
    icon:  <FiShoppingCart size={18} />,
    color: "#00E0FF",
    desc:  "Recover lost sales from abandoned checkout flows.",
  },
  {
    val:   "improve_conversion_rate",
    label: "Improve Conversion Rate",
    icon:  <FiTarget size={18} />,
    color: "#FF4FD8",
    desc:  "Turn more visitors into paying customers.",
  },
  {
    val:   "optimize_marketing_roi",
    label: "Optimize Marketing ROI",
    icon:  <FiDollarSign size={18} />,
    color: "#22C55E",
    desc:  "Get more value from every marketing dollar spent.",
  },
];

/* ── File upload card ── */
function FileCard({ label, hint, name, file, onChange, color }) {
  return (
    <motion.label
      whileHover={{ scale: 1.02 }}
      className="flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-all duration-300"
      style={{
        borderColor: file ? `${color}70` : "rgba(255,255,255,0.12)",
        background:  file ? `${color}0D` : "rgba(255,255,255,0.02)",
      }}
    >
      <input type="file" accept=".csv" name={name} onChange={onChange} className="hidden" />
      <div className="w-11 h-11 rounded-xl flex items-center justify-center"
        style={{ background: `${color}20`, color }}>
        {file ? <FiCheck size={20} /> : <FiUpload size={20} />}
      </div>
      <div className="text-center">
        <p className="text-[#E6E6EB] text-sm font-semibold">{label}</p>
        <p className="text-[#9CA3AF] text-xs mt-1">{file ? file.name : "Click to upload CSV"}</p>
        {!file && <p className="text-[#9CA3AF]/50 text-[10px] mt-1">{hint}</p>}
      </div>
    </motion.label>
  );
}

/* ── KPI mini card ── */
function KPIBadge({ label, value, color }) {
  return (
    <div className="bg-[#0B0B0F] border border-white/10 rounded-xl p-4">
      <p className="text-[#9CA3AF] text-xs mb-1">{label}</p>
      <p className="text-xl font-black" style={{ color }}>{value ?? "—"}</p>
    </div>
  );
}

/* ════════════════════════════════════════════
   MAIN DASHBOARD
════════════════════════════════════════════ */
export default function UserDashboard() {
  const navigate = useNavigate();

  /* ── Auth ── */
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [backendUser,  setBackendUser]  = useState(null);
  const [authLoading,  setAuthLoading]  = useState(true);

  /* ── Active step: "upload" | "resume" | "status" | "objective" ── */
  const [view, setView] = useState("upload"); // default: show upload form

  /* ── Upload form ── */
  const [projectName, setProjectName] = useState("");
  const [files, setFiles] = useState({ ecommerce: null, marketing: null, advertising: null });
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");

  /* ── Active project state ── */
  const [project,     setProject]     = useState(null); // full project object
  const [copied,      setCopied]      = useState(false);

  /* ── Resume by ID ── */
  const [resumeId,    setResumeId]    = useState("");
  const [resumeErr,   setResumeErr]   = useState("");
  const [resumeLoading, setResumeLoading] = useState(false);

  /* ── Objective ── */
  const [objective,   setObjective]   = useState("increase_revenue");
  const [savingObj,   setSavingObj]   = useState(false);
  const [objErr,      setObjErr]      = useState("");

  /* ── Polling ── */
  const pollRef = useRef(null);

  /* ── Auth guard ── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setFirebaseUser(u);
        try {
          const res = await fetch(`${API}/users/${u.uid}`);
          if (res.ok) setBackendUser((await res.json()).user);
        } catch {}
      } else {
        navigate("/login");
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, [navigate]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const displayName =
    backendUser?.name || firebaseUser?.displayName ||
    firebaseUser?.email?.split("@")[0] || "User";

  const handleLogout = async () => { await signOut(auth); navigate("/login"); };
  const handleFile   = (e) =>
    setFiles((p) => ({ ...p, [e.target.name]: e.target.files[0] || null }));

  /* ── Poll status until terminal state ── */
  const startPolling = (pid) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${API}/projects/status/${pid}`);
        const data = await res.json();
        if (data.project) {
          setProject(data.project);
          if (["engineered", "complete", "error"].includes(data.project.status)) {
            clearInterval(pollRef.current);
          }
        }
      } catch {}
    }, 3000);
  };

  /* ── Upload handler ── */
  const handleUpload = async () => {
    setUploadErr("");
    if (!projectName.trim()) { setUploadErr("Please enter a project name."); return; }
    if (!files.ecommerce || !files.marketing || !files.advertising) {
      setUploadErr("Please upload all 3 CSV files."); return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("uid",         firebaseUser.uid);
      fd.append("projectName", projectName.trim());
      fd.append("ecommerce",   files.ecommerce);
      fd.append("marketing",   files.marketing);
      fd.append("advertising", files.advertising);

      const res  = await fetch(`${API}/projects/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed.");

      setProject({ projectId: data.projectId, projectName: data.projectName, status: "uploaded" });
      setView("status");
      startPolling(data.projectId);
    } catch (err) {
      setUploadErr(err.message);
    } finally {
      setUploading(false);
    }
  };

  /* ── Resume by Project ID ── */
  const handleResume = async () => {
    setResumeErr("");
    if (!resumeId.trim()) { setResumeErr("Please enter your Project ID."); return; }
    setResumeLoading(true);
    try {
      const res  = await fetch(`${API}/projects/resume/${resumeId.trim()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Project not found.");

      setProject(data.project);

      /* ── Status-gated navigation ── */
      const s = data.project.status;
      if (["uploaded", "cleaning", "cleaned", "engineering", "error"].includes(s)) {
        setView("status");
        if (["cleaning", "engineering"].includes(s)) startPolling(data.project.projectId);
      } else if (s === "engineered") {
        // If objective already saved, go to step3, else go to objective
        if (data.project.objective) {
          setView("step3");
        } else {
          setView("objective");
        }
      } else if (["analyzing", "complete"].includes(s)) {
        setView("step3"); // step4 coming in future chunk
      }
    } catch (err) {
      setResumeErr(err.message);
    } finally {
      setResumeLoading(false);
    }
  };

  /* ── Save objective ── */
  const handleSaveObjective = async () => {
    setObjErr("");
    setSavingObj(true);
    try {
      const res  = await fetch(`${API}/projects/objective/${project.projectId}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ objective }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setProject(data.project);
      setView("step3"); // ← navigate to Step 3 placeholder
    } catch (err) {
      setObjErr(err.message);
    } finally {
      setSavingObj(false);
    }
  };

  const sc = project ? (STATUS[project.status] || STATUS.uploaded) : null;

  /* ── Loading ── */
  if (authLoading) return (
    <div className="min-h-screen bg-[#0B0B0F] flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-2 border-[#7C5CFF] border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen text-[#E6E6EB] pt-20 pb-16 px-4 md:px-6"
      style={{ background: "radial-gradient(circle at 15% 20%, #7c5cff14, transparent 50%), radial-gradient(circle at 85% 80%, #00e0ff0a, transparent 50%), #0B0B0F" }}>
      <div className="max-w-5xl mx-auto">

        {/* ══ TOP BAR ══ */}
        <motion.div {...fadeUp(0)} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-linear-to-br from-[#7C5CFF] to-[#00E0FF] flex items-center justify-center">
                <FiCpu className="text-white text-xs" />
              </div>
              <span className="font-bold text-white">
                <span className="text-[#7C5CFF]">Agentic</span><span className="text-[#00E0FF]">IQ</span>
              </span>
            </div>
            <h1 className="text-2xl font-black text-white">
              Welcome, <span style={{ background: "linear-gradient(90deg,#7C5CFF,#00E0FF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{displayName}</span> 👋
            </h1>
            <p className="text-[#9CA3AF] text-sm">{firebaseUser?.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/5">
              <FiUser size={13} className="text-[#7C5CFF]" />
              <span className="text-[#E6E6EB] text-sm">{displayName}</span>
            </div>
            <motion.button onClick={handleLogout} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
              <FiLogOut size={13} /> Logout
            </motion.button>
          </div>
        </motion.div>

        {/* ══ AGENT PIPELINE PREVIEW ══ */}
        <motion.div {...fadeUp(0.05)} className="flex items-center justify-center gap-2 flex-wrap mb-8">
          {[
            { label: "Observer",   color: "#7C5CFF", icon: <FiEye size={12} /> },
            { label: "Analyst",    color: "#00E0FF", icon: <FiBarChart2 size={12} /> },
            { label: "Simulation", color: "#FF4FD8", icon: <FiLoader size={12} /> },
            { label: "Decision",   color: "#22C55E", icon: <FiZap size={12} /> },
          ].map((a, i) => (
            <React.Fragment key={a.label}>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border"
                style={{ background: `${a.color}12`, color: a.color, borderColor: `${a.color}30` }}>
                {a.icon} {a.label}
              </div>
              {i < 3 && <span className="text-white/20 text-xs">→</span>}
            </React.Fragment>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">

          {/* ════════════════════════════════════════
              VIEW: UPLOAD or RESUME selection
          ════════════════════════════════════════ */}
          {view === "upload" && (
            <motion.div key="upload-view" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}>

              {/* ── Tab switcher ── */}
              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => setView("upload")}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all bg-[#7C5CFF]/15 border-[#7C5CFF]/50 text-white">
                  <FiUpload size={14} /> New Project
                </button>
                <button
                  onClick={() => setView("resume")}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-white/15 text-[#9CA3AF] hover:text-white hover:border-white/30 transition-all">
                  <FiKey size={14} /> Resume Project
                </button>
              </div>

              {/* ── Upload form ── */}
              <div className="bg-[#111118] border border-white/10 rounded-2xl p-8">
                <span className="text-xs font-mono text-[#7C5CFF] uppercase tracking-widest">Step 1 of 4</span>
                <h2 className="text-2xl font-black text-white mt-1 mb-1">Upload Your Datasets</h2>
                <p className="text-[#9CA3AF] text-sm mb-6">
                  Upload 3 CSV files. Python microservice will auto-clean null values before analysis.
                </p>

                <div className="mb-6">
                  <label className="text-[#E6E6EB] text-sm font-medium mb-2 block">
                    Project Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text" placeholder="e.g. Q1 2026 Campaign Analysis"
                    value={projectName} onChange={(e) => setProjectName(e.target.value)}
                    className="w-full max-w-md bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-[#E6E6EB] placeholder-[#9CA3AF] focus:outline-none focus:border-[#7C5CFF]/60 focus:bg-[#7C5CFF]/5 transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
                  <FileCard label="E-Commerce Dataset"  hint="customer_id, revenue, cart_abandoned…" name="ecommerce"   file={files.ecommerce}   onChange={handleFile} color="#7C5CFF" />
                  <FileCard label="Marketing Campaign"  hint="Campaign_ID, ROI, Conversion_Rate…"   name="marketing"   file={files.marketing}   onChange={handleFile} color="#00E0FF" />
                  <FileCard label="Advertising Data"    hint="clicks, displays, cost, revenue…"     name="advertising" file={files.advertising} onChange={handleFile} color="#FF4FD8" />
                </div>

                <div className="flex items-start gap-3 p-4 rounded-xl bg-[#7C5CFF]/8 border border-[#7C5CFF]/20 mb-6">
                  <FiAlertTriangle className="text-[#7C5CFF] shrink-0 mt-0.5" size={14} />
                  <p className="text-[#9CA3AF] text-xs leading-relaxed">
                    After upload, data is sent to the Python microservice (FastAPI / uvicorn) for cleaning.
                    Feature engineering (CTR, ROI, Conversion Rate, Cart Abandonment) runs automatically after cleaning.
                  </p>
                </div>

                {uploadErr && (
                  <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
                    <FiAlertTriangle size={14} /> {uploadErr}
                  </div>
                )}

                <motion.button onClick={handleUpload} disabled={uploading}
                  whileHover={{ scale: 1.03, boxShadow: "0 0 30px rgba(124,92,255,0.5)" }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-white bg-linear-to-r from-[#7C5CFF] to-[#00E0FF] shadow-[0_0_20px_rgba(124,92,255,0.35)] transition-all disabled:opacity-50">
                  {uploading ? (
                    <><div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Uploading…</>
                  ) : (
                    <><FiUpload size={15} /> Upload Data</>
                  )}
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════
              VIEW: RESUME BY PROJECT ID
          ════════════════════════════════════════ */}
          {view === "resume" && (
            <motion.div key="resume-view" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}>

              <div className="flex gap-3 mb-6">
                <button onClick={() => setView("upload")}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-white/15 text-[#9CA3AF] hover:text-white hover:border-white/30 transition-all">
                  <FiUpload size={14} /> New Project
                </button>
                <button
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border bg-[#7C5CFF]/15 border-[#7C5CFF]/50 text-white transition-all">
                  <FiKey size={14} /> Resume Project
                </button>
              </div>

              <div className="bg-[#111118] border border-white/10 rounded-2xl p-8 max-w-lg">
                <span className="text-xs font-mono text-[#00E0FF] uppercase tracking-widest">Resume</span>
                <h2 className="text-2xl font-black text-white mt-1 mb-1">Enter Project ID</h2>
                <p className="text-[#9CA3AF] text-sm mb-6">
                  Already uploaded your datasets? Enter your Project ID to continue from where you left off.
                </p>

                <div className="flex gap-3 mb-5">
                  <input
                    type="text" placeholder="AI_XXXXXXXX"
                    value={resumeId} onChange={(e) => setResumeId(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && handleResume()}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-[#E6E6EB] placeholder-[#9CA3AF] font-mono focus:outline-none focus:border-[#7C5CFF]/60 focus:bg-[#7C5CFF]/5 transition-all tracking-widest"
                  />
                  <motion.button onClick={handleResume} disabled={resumeLoading}
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                    className="px-5 py-3 rounded-xl font-semibold text-white bg-linear-to-r from-[#7C5CFF] to-[#00E0FF] transition-all disabled:opacity-50">
                    {resumeLoading ? <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <FiArrowRight size={16} />}
                  </motion.button>
                </div>

                {resumeErr && (
                  <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
                    <FiAlertTriangle size={14} /> {resumeErr}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════
              VIEW: STATUS (after upload or resume)
          ════════════════════════════════════════ */}
          {view === "status" && project && (
            <motion.div key="status-view" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>

              {/* Project ID card */}
              <div className="bg-[#111118] border border-[#7C5CFF]/40 rounded-2xl p-7 mb-5 relative overflow-hidden"
                style={{ background: "radial-gradient(circle at 0% 0%, #7c5cff15, transparent 50%), #111118" }}>
                <div className="absolute top-0 right-0 w-40 h-40 bg-[#7C5CFF]/8 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <FiCheck className="text-[#7C5CFF]" size={14} />
                    <span className="text-[#7C5CFF] text-xs font-mono uppercase tracking-widest font-semibold">
                      Project Created
                    </span>
                  </div>
                  <p className="text-[#9CA3AF] text-sm mb-1">{project.projectName}</p>
                  <h2 className="text-white font-black text-xl mb-3">Your Project ID</h2>
                  <div className="flex items-start gap-2 mb-4">
                    <FiAlertTriangle className="text-yellow-400 shrink-0 mt-0.5" size={13} />
                    <p className="text-yellow-400/90 text-xs font-medium">
                      Displayed <span className="underline">only once</span>. Copy and save it to resume later.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="px-5 py-3 rounded-xl border font-mono text-lg font-black tracking-widest text-[#E6E6EB] select-all"
                      style={{ background: "rgba(124,92,255,0.12)", borderColor: "rgba(124,92,255,0.4)" }}>
                      {project.projectId}
                    </span>
                    <motion.button onClick={() => { navigator.clipboard.writeText(project.projectId); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl border border-white/15 bg-white/5 text-sm text-[#E6E6EB] hover:bg-white/10 transition-all">
                      {copied ? <><FiCheck size={13} className="text-green-400" /> Copied!</> : <><FiCopy size={13} /> Copy</>}
                    </motion.button>
                  </div>
                </div>
              </div>

              {/* Pipeline status card */}
              <div className="bg-[#111118] border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-white font-bold">Pipeline Status</h3>
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-semibold flex items-center gap-1.5"
                    style={{ background: `${sc.color}15`, color: sc.color, border: `1px solid ${sc.color}30` }}>
                    {sc.pulse && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: sc.color }} />}
                    {sc.label}
                  </span>
                </div>

                {/* Step indicators */}
                <div className="flex flex-col gap-3 mb-5">
                  {[
                    { step: "Files Uploaded",       desc: "3 CSV files saved to backend.",              done: true,                                                    color: "#22C55E" },
                    { step: "Data Cleaning",         desc: "Python removes nulls, duplicates, invalid rows.", done: ["cleaned","engineering","engineered","complete"].includes(project.status), active: project.status === "cleaning",    color: "#00E0FF" },
                    { step: "Feature Engineering",   desc: "Computing CTR, ROI, Conversion Rate, Cart Abandonment.", done: ["engineered","complete"].includes(project.status), active: project.status === "engineering", color: "#FF4FD8" },
                    { step: "Ready for Analysis",    desc: "Select business objective to proceed.",       done: ["engineered","complete"].includes(project.status),      color: "#7C5CFF" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl"
                      style={{ background: item.done ? `${item.color}08` : "rgba(255,255,255,0.02)" }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: item.done ? `${item.color}25` : "rgba(255,255,255,0.05)", color: item.done ? item.color : "#9CA3AF" }}>
                        {item.active
                          ? <div className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                          : item.done ? <FiCheck size={13} /> : <span className="text-xs font-bold">{i + 1}</span>}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${item.done ? "text-white" : "text-[#9CA3AF]"}`}>{item.step}</p>
                        <p className="text-[#9CA3AF] text-xs mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* KPI preview after engineering */}
                {project.kpiSummary && ["engineered","complete"].includes(project.status) && (
                  <div className="mb-5">
                    <p className="text-[#9CA3AF] text-xs font-mono uppercase tracking-widest mb-3">Computed KPIs</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <KPIBadge label="Avg CTR"            value={project.kpiSummary.avgCTR            != null ? `${project.kpiSummary.avgCTR}%`    : "—"} color="#00E0FF" />
                      <KPIBadge label="Conversion Rate"    value={project.kpiSummary.avgConversionRate  != null ? `${project.kpiSummary.avgConversionRate}%`  : "—"} color="#7C5CFF" />
                      <KPIBadge label="Cart Abandonment"   value={project.kpiSummary.avgCartAbandonment != null ? `${project.kpiSummary.avgCartAbandonment}%` : "—"} color="#FF4FD8" />
                      <KPIBadge label="Avg ROI"            value={project.kpiSummary.avgROI             != null ? `${project.kpiSummary.avgROI}x`    : "—"} color="#22C55E" />
                    </div>
                  </div>
                )}

                {/* Error */}
                {project.status === "error" && (
                  <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    {project.errorMessage || "Check your Python microservice is running on port 8000."}
                  </div>
                )}

                {/* Manual retry if stuck at cleaned */}
                {project.status === "cleaned" && (
                  <div className="mb-4 p-4 rounded-xl bg-[#FF4FD8]/8 border border-[#FF4FD8]/25">
                    <p className="text-[#FF4FD8] text-sm font-semibold mb-1">Feature Engineering not started</p>
                    <p className="text-[#9CA3AF] text-xs mb-3">
                      Data cleaning is done but feature engineering hasn't started yet. Click below to trigger it manually.
                    </p>
                    <motion.button
                      onClick={async () => {
                        try {
                          await fetch(`${API}/projects/engineer/${project.projectId}`, { method: "POST" });
                          startPolling(project.projectId);
                        } catch {}
                      }}
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl font-semibold text-white text-sm bg-linear-to-r from-[#FF4FD8] to-[#7C5CFF] transition-all"
                    >
                      <FiZap size={13} /> Run Feature Engineering
                    </motion.button>
                  </div>
                )}

                {/* CTA when ready */}
                {["engineered","complete"].includes(project.status) && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between p-4 rounded-xl border border-[#22C55E]/30 bg-[#22C55E]/8">
                    <div>
                      <p className="text-[#22C55E] text-sm font-semibold">✓ Features engineered. All KPIs computed.</p>
                      <p className="text-[#9CA3AF] text-xs mt-0.5">Proceed to Step 2 — Select your business objective.</p>
                    </div>
                    <motion.button onClick={() => setView("objective")} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white text-sm bg-linear-to-r from-[#7C5CFF] to-[#00E0FF] shrink-0 ml-4">
                      <FiTarget size={14} /> Step 2 →
                    </motion.button>
                  </motion.div>
                )}

                {["cleaning","engineering"].includes(project.status) && (
                  <p className="text-[#9CA3AF] text-xs text-center mt-3">Auto-refreshing every 3 seconds…</p>
                )}
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════
              VIEW: OBJECTIVE (Step 2)
          ════════════════════════════════════════ */}
          {view === "objective" && project && (
            <motion.div key="objective-view" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.4 }}>
              <div className="bg-[#111118] border border-white/10 rounded-2xl p-8 max-w-2xl mx-auto">
                <div className="flex items-center gap-2 mb-1">
                  <button onClick={() => setView("status")} className="text-[#9CA3AF] hover:text-white text-xs transition-colors">← Back</button>
                </div>
                <span className="text-xs font-mono text-[#00E0FF] uppercase tracking-widest">Step 2 of 4</span>
                <h2 className="text-2xl font-black text-white mt-1 mb-1">Business Objective</h2>
                <p className="text-[#9CA3AF] text-sm mb-2">Project: <span className="text-[#7C5CFF] font-semibold">{project.projectName}</span></p>
                <p className="text-[#9CA3AF] text-sm mb-6">
                  What do you want to improve? The Decision Agent will prioritize metrics accordingly.
                </p>

                <div className="flex flex-col gap-3 mb-7">
                  {OBJECTIVES.map((opt) => (
                    <motion.button key={opt.val} onClick={() => setObjective(opt.val)}
                      whileHover={{ scale: 1.01 }}
                      className={`flex items-start gap-4 p-4 rounded-xl border text-left transition-all duration-200 ${
                        objective === opt.val
                          ? "border-[#7C5CFF]/60 bg-[#7C5CFF]/10"
                          : "border-white/10 bg-white/2 hover:border-white/20"
                      }`}>
                      <div className="w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                        style={{ borderColor: objective === opt.val ? opt.color : "rgba(255,255,255,0.3)", background: objective === opt.val ? opt.color : "transparent" }}>
                        {objective === opt.val && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span style={{ color: opt.color }}>{opt.icon}</span>
                          <p className="text-[#E6E6EB] font-semibold text-sm">{opt.label}</p>
                        </div>
                        <p className="text-[#9CA3AF] text-xs mt-1">{opt.desc}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>

                {/* KPI reminder */}
                {project.kpiSummary && (
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <KPIBadge label="Avg CTR"          value={`${project.kpiSummary.avgCTR}%`}             color="#00E0FF" />
                    <KPIBadge label="Conversion Rate"  value={`${project.kpiSummary.avgConversionRate}%`}  color="#7C5CFF" />
                    <KPIBadge label="Cart Abandonment" value={`${project.kpiSummary.avgCartAbandonment}%`} color="#FF4FD8" />
                    <KPIBadge label="Avg ROI"          value={`${project.kpiSummary.avgROI}x`}             color="#22C55E" />
                  </div>
                )}

                {objErr && (
                  <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    {objErr}
                  </div>
                )}

                <motion.button onClick={handleSaveObjective} disabled={savingObj}
                  whileHover={{ scale: 1.03, boxShadow: "0 0 30px rgba(124,92,255,0.5)" }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-3.5 rounded-xl font-bold text-white bg-linear-to-r from-[#7C5CFF] to-[#00E0FF] shadow-[0_0_20px_rgba(124,92,255,0.35)] transition-all disabled:opacity-50">
                  {savingObj
                    ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Saving…</span>
                    : "Save Objective & Continue →"
                  }
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════
              VIEW: STEP 3 PLACEHOLDER
              (Strategy Simulation — built in next chunk)
          ════════════════════════════════════════ */}
          {view === "step3" && project && (
            <motion.div key="step3-view"
              initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.4 }}>

              <div className="bg-[#111118] border border-white/10 rounded-2xl p-8 max-w-2xl mx-auto">

                {/* Step breadcrumb */}
                <div className="flex items-center gap-2 mb-6 flex-wrap">
                  {[
                    { label: "Upload",    step: "status",    done: true  },
                    { label: "Objective", step: "objective", done: true  },
                    { label: "Simulation",step: "step3",     done: false, active: true },
                    { label: "Analysis",  step: "step4",     done: false },
                  ].map((s, i) => (
                    <React.Fragment key={s.label}>
                      <button
                        onClick={() => s.done && setView(s.step)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          s.active
                            ? "bg-[#7C5CFF]/20 border border-[#7C5CFF]/50 text-white"
                            : s.done
                            ? "bg-green-500/10 border border-green-500/30 text-green-400 cursor-pointer"
                            : "bg-white/5 border border-white/10 text-[#9CA3AF] cursor-default"
                        }`}
                      >
                        {s.done && !s.active && <FiCheck size={11} />}
                        {s.label}
                      </button>
                      {i < 3 && <span className="text-white/20 text-xs">→</span>}
                    </React.Fragment>
                  ))}
                </div>

                <span className="text-xs font-mono text-[#FF4FD8] uppercase tracking-widest">Step 3 of 4</span>
                <h2 className="text-2xl font-black text-white mt-1 mb-1">Strategy Simulation</h2>
                <p className="text-[#9CA3AF] text-sm mb-6">
                  Project: <span className="text-[#7C5CFF] font-semibold">{project.projectName}</span>
                  &nbsp;·&nbsp;
                  Objective: <span className="text-[#00E0FF] font-semibold">
                    {project.objective?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                </p>

                {/* Objective + KPI saved confirmation */}
                <div className="p-4 rounded-xl bg-green-500/8 border border-green-500/25 mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <FiCheck className="text-green-400" size={14} />
                    <p className="text-green-400 text-sm font-semibold">Objective saved to database ✓</p>
                  </div>
                  {project.kpiSummary && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <KPIBadge label="CTR"              value={`${project.kpiSummary.avgCTR}%`}             color="#00E0FF" />
                      <KPIBadge label="Conversion"       value={`${project.kpiSummary.avgConversionRate}%`}  color="#7C5CFF" />
                      <KPIBadge label="Cart Abandon"     value={`${project.kpiSummary.avgCartAbandonment}%`} color="#FF4FD8" />
                      <KPIBadge label="ROI"              value={`${project.kpiSummary.avgROI}x`}             color="#22C55E" />
                    </div>
                  )}
                </div>

                {/* Coming next banner */}
                <div className="p-6 rounded-xl border border-dashed border-[#7C5CFF]/30 bg-[#7C5CFF]/5 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 flex items-center justify-center mx-auto mb-3">
                    <FiZap className="text-[#7C5CFF]" size={22} />
                  </div>
                  <p className="text-white font-bold mb-1">Strategy Simulation — Coming Next</p>
                  <p className="text-[#9CA3AF] text-sm leading-relaxed max-w-sm mx-auto">
                    In the next chunk you will set simulation parameters
                    (Ad Budget %, Discount %, Channel, Segment) and the
                    ML Ensemble (RF + XGBoost + LightGBM) will predict outcomes.
                  </p>

                  <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
                    {["Random Forest", "XGBoost", "LightGBM"].map((m) => (
                      <span key={m} className="px-3 py-1 text-xs font-mono rounded-full border border-[#7C5CFF]/30 text-[#7C5CFF] bg-[#7C5CFF]/10">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Back button */}
                <button
                  onClick={() => setView("objective")}
                  className="mt-5 text-[#9CA3AF] hover:text-white text-sm transition-colors flex items-center gap-1"
                >
                  ← Back to Objective
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}