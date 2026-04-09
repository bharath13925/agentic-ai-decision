/**
 * RagChat.jsx — AgenticIQ AI Chat Widget v2.1
 *
 * Floating chat panel powered by FAISS + LangChain LCEL + Groq API RAG pipeline.
 * Aligned with rag.py v4.0 (LangChain 1.2.15 + LCEL) and app.py v15.0.
 *
 * Backend endpoints (Node /api/rag → Python /rag-*):
 *   POST   /api/rag/chat            → ask questions grounded in FAISS ML context
 *   POST   /api/rag/store           → (re)store agent context into FAISS
 *   GET    /api/rag/stats/:projectId → metadata about the per-project FAISS store
 *   DELETE /api/rag/clear/:projectId → clear FAISS store for a project
 *
 * Props:
 *   projectId   {string}   — Required. Scopes the FAISS context store.
 *   agentResult {object}   — Optional. If provided, shows context health badge.
 *   className   {string}   — Optional extra class for the trigger button container.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiMessageSquare, FiX, FiSend, FiLoader, FiRefreshCw,
  FiDatabase, FiCpu, FiAlertCircle, FiCheck, FiChevronDown,
  FiZap, FiInfo, FiTrash2,
} from "react-icons/fi";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const C = {
  violet: "#7C5CFF",
  cyan:   "#00E0FF",
  pink:   "#FF4FD8",
  green:  "#22C55E",
  orange: "#FF9800",
  red:    "#EF4444",
  text:   "#E6E6EB",
  muted:  "#9CA3AF",
  bg:     "#0B0B0F",
  card:   "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.09)",
};

const SUGGESTED_QUESTIONS = [
  "Why is conversion rate low?",
  "What is the top recommended strategy?",
  "What are the main root causes?",
  "How confident is the AI recommendation?",
  "What KPI improvements are projected?",
  "Which marketing channel performs best?",
];

/* ── Message Bubble ── */
function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      style={{ display: "flex", flexDirection: isUser ? "row-reverse" : "row", alignItems: "flex-start", gap: 8, marginBottom: 12 }}
    >
      <div style={{ width: 28, height: 28, borderRadius: 8, background: isUser ? `${C.violet}30` : `${C.cyan}20`, border: `1px solid ${isUser ? C.violet : C.cyan}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, color: isUser ? C.violet : C.cyan, fontWeight: 700, fontFamily: "monospace" }}>
        {isUser ? "U" : <FiCpu size={12} />}
      </div>
      <div style={{ maxWidth: "80%", minWidth: 40 }}>
        <div style={{ background: isUser ? `linear-gradient(135deg, ${C.violet}25, ${C.violet}10)` : C.card, border: `1px solid ${isUser ? `${C.violet}30` : C.border}`, borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px", padding: "10px 14px", color: C.text, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {msg.content}
        </div>
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <SourcesAccordion sources={msg.sources} />
        )}
        <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", marginTop: 3, textAlign: isUser ? "right" : "left" }}>
          {msg.time}
        </div>
      </div>
    </motion.div>
  );
}

function SourcesAccordion({ sources }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 6 }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: C.muted, fontSize: 10, fontFamily: "monospace", padding: 0 }}>
        <FiDatabase size={9} />
        {sources.length} source{sources.length > 1 ? "s" : ""}
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}><FiChevronDown size={9} /></motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ paddingTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {sources.map((src, i) => (
                <div key={i} style={{ padding: "6px 10px", borderRadius: 8, background: `${C.cyan}08`, border: `1px solid ${C.cyan}18`, fontSize: 10, color: C.muted, fontFamily: "monospace" }}>
                  <span style={{ color: C.cyan, marginRight: 6 }}>[{src.type?.toUpperCase()}]</span>
                  {src.preview}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${C.cyan}20`, border: `1px solid ${C.cyan}40`, display: "flex", alignItems: "center", justifyContent: "center", color: C.cyan, flexShrink: 0 }}>
        <FiCpu size={12} />
      </div>
      <div style={{ padding: "10px 16px", borderRadius: "4px 16px 16px 16px", background: C.card, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 4 }}>
        {[0, 1, 2].map(i => (
          <motion.div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: C.cyan }}
            animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }}
          />
        ))}
      </div>
    </div>
  );
}

export default function RagChat({ projectId, agentResult, className = "" }) {
  const [isOpen,           setIsOpen]           = useState(false);
  const [messages,         setMessages]         = useState([]);
  const [input,            setInput]            = useState("");
  const [loading,          setLoading]          = useState(false);
  const [stats,            setStats]            = useState(null);
  const [statsLoading,     setStatsLoading]     = useState(false);
  const [storeLoading,     setStoreLoading]     = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [error,            setError]            = useState("");
  const [hasContext,       setHasContext]       = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
      if (!stats) fetchStats();
    }
  }, [isOpen]);

  const fetchStats = useCallback(async () => {
    if (!projectId) return;
    setStatsLoading(true);
    try {
      const res  = await fetch(`${API}/rag/stats/${projectId}`);
      const data = await res.json();
      setStats(data);
      setHasContext(data.exists && data.total_docs > 0);
    } catch { setStats(null); }
    setStatsLoading(false);
  }, [projectId]);

  const handleStoreContext = async () => {
    setStoreLoading(true);
    setError("");
    try {
      const res  = await fetch(`${API}/rag/store`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (data.status === "success") {
        await fetchStats();
        addSystemMessage(`✅ Context refreshed — ${data.stored?.length || 0} analysis chunks loaded into memory.`);
      } else {
        setError(data.message || "Failed to store context.");
      }
    } catch (err) { setError(err.message); }
    setStoreLoading(false);
  };

  const handleClearContext = async () => {
    if (!showClearConfirm) {
      setShowClearConfirm(true);
      setTimeout(() => setShowClearConfirm(false), 4000);
      return;
    }
    setShowClearConfirm(false);
    try {
      await fetch(`${API}/rag/clear/${projectId}`, { method: "DELETE" });
      setStats(null); setHasContext(false); setMessages([]);
      addSystemMessage("Context cleared. Re-store to enable AI chat.");
    } catch (err) { setError(err.message); }
  };

  const addSystemMessage = (text) => {
    setMessages(prev => [...prev, {
      role: "system", content: text,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }]);
  };

  const sendMessage = async (text) => {
    const query = (text || input).trim();
    if (!query || loading) return;

    setInput(""); setError("");
    const userMsg = { role: "user", content: query, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res  = await fetch(`${API}/rag/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, query, topK: 4 }),
      });
      const data = await res.json();
      const aiMsg = {
        role:    "assistant",
        content: data.answer || "No answer returned.",
        sources: data.sources || [],
        method:  data.retrieval_method,
        time:    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages(prev => [...prev, aiMsg]);
      if (!hasContext && data.total_docs > 0) setHasContext(true);
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant", content: "Failed to get a response. Is the Python microservice running?",
        sources: [], time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const unreadCount = messages.filter(m => m.role === "assistant").length;

  return (
    <>
      {/* Floating trigger */}
      <div className={className} style={{ position: "fixed", bottom: 24, right: 24, zIndex: 1000 }}>
        <motion.button
          whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}
          onClick={() => setIsOpen(o => !o)}
          style={{ width: 56, height: 56, borderRadius: 18, background: `linear-gradient(135deg, ${C.violet}, ${C.cyan})`, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", position: "relative", boxShadow: `0 8px 32px ${C.violet}50` }}
          animate={{ boxShadow: [`0 8px 32px ${C.violet}50`, `0 8px 32px ${C.cyan}50`, `0 8px 32px ${C.violet}50`] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <AnimatePresence mode="wait">
            {isOpen
              ? <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}><FiX size={22} /></motion.div>
              : <motion.div key="chat" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}><FiMessageSquare size={20} /></motion.div>
            }
          </AnimatePresence>

          {!isOpen && unreadCount > 0 && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: C.pink, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {unreadCount}
            </motion.div>
          )}

          <motion.div
            style={{ position: "absolute", bottom: -4, right: -4, width: 12, height: 12, borderRadius: "50%", background: hasContext ? C.green : C.orange, border: `2px solid ${C.bg}` }}
            animate={{ scale: hasContext ? [1, 1.3, 1] : 1 }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </motion.button>

        {!isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
            style={{ position: "absolute", right: 64, top: "50%", transform: "translateY(-50%)", background: "#0E0E18", border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 12px", fontSize: 11, color: C.muted, fontFamily: "monospace", whiteSpace: "nowrap", pointerEvents: "none" }}
          >
            Ask AI about your analysis
          </motion.div>
        )}
      </div>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.92 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: "fixed", bottom: 92, right: 24, zIndex: 999, width: 400, maxWidth: "calc(100vw - 32px)", height: 580, maxHeight: "calc(100vh - 120px)", background: "linear-gradient(145deg, #0E0E18, #0B0B12)", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 24, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: `0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px ${C.violet}20` }}
          >
            <div style={{ height: 2, background: `linear-gradient(90deg, ${C.violet}, ${C.pink}, ${C.cyan})` }} />

            {/* Header */}
            <div style={{ padding: "14px 18px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 4, repeat: Infinity }}
                style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.violet}30, ${C.cyan}20)`, border: `1px solid ${C.violet}40`, display: "flex", alignItems: "center", justifyContent: "center", color: C.cyan, flexShrink: 0 }}>
                <FiZap size={16} />
              </motion.div>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.text, fontWeight: 800, fontSize: 13 }}>AgenticIQ AI Chat</div>
                <div style={{ color: C.muted, fontSize: 10, fontFamily: "monospace" }}>
                  {statsLoading ? "Checking context…" : hasContext ? `${stats?.total_docs || 0} chunks · RAG (LangChain LCEL + Groq)` : "No context — store analysis first"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={handleStoreContext} disabled={storeLoading} title="Refresh context"
                  style={{ width: 28, height: 28, borderRadius: 8, background: `${C.violet}15`, border: `1px solid ${C.violet}30`, cursor: "pointer", color: C.violet, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {storeLoading
                    ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}><FiRefreshCw size={11} /></motion.div>
                    : <FiRefreshCw size={11} />}
                </motion.button>
                {hasContext && (
                  <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={handleClearContext} title={showClearConfirm ? "Click again to confirm" : "Clear context"}
                    style={{ width: 28, height: 28, borderRadius: 8, background: showClearConfirm ? `${C.red}30` : `${C.red}12`, border: `1px solid ${showClearConfirm ? C.red : `${C.red}25`}`, cursor: "pointer", color: C.red, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {showClearConfirm ? "✓?" : <FiTrash2 size={11} />}
                  </motion.button>
                )}
              </div>
            </div>

            {/* Context status banner */}
            {!hasContext && !storeLoading && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                style={{ margin: "10px 14px 0", padding: "10px 14px", borderRadius: 12, background: `${C.orange}08`, border: `1px solid ${C.orange}25`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <FiAlertCircle size={13} style={{ color: C.orange, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ color: C.orange, fontSize: 11, fontWeight: 600, margin: 0 }}>No analysis context stored</p>
                  <p style={{ color: C.muted, fontSize: 10, margin: "2px 0 0" }}>Click refresh to load from agent pipeline.</p>
                </div>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={handleStoreContext} disabled={storeLoading}
                  style={{ padding: "4px 10px", borderRadius: 8, background: C.orange, border: "none", cursor: "pointer", color: "#fff", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                  Load
                </motion.button>
              </motion.div>
            )}

            {/* Stats bar */}
            {hasContext && stats && (
              <div style={{ padding: "6px 14px", display: "flex", flexWrap: "wrap", gap: 6, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                {[
                  { label: `${stats.total_docs} chunks`,          color: C.cyan   },
                  { label: stats.embedding_model || "keyword-hash", color: C.violet },
                  { label: stats.faiss_available ? "FAISS" : "cosine", color: C.green },
                  { label: stats.groq_available ? "Groq LLM ready" : "LLM offline", color: stats.groq_available ? C.green : C.orange },
                  { label: stats.langchain_rag ? "LangChain LCEL" : "fallback", color: stats.langchain_rag ? C.violet : C.muted },
                ].map(({ label, color }) => (
                  <span key={label} style={{ fontSize: 9, fontFamily: "monospace", color, background: `${color}12`, border: `1px solid ${color}25`, padding: "2px 7px", borderRadius: 20 }}>{label}</span>
                ))}
              </div>
            )}

            {/* Error bar */}
            {error && (
              <div style={{ margin: "8px 14px 0", padding: "8px 12px", borderRadius: 10, background: `${C.red}10`, border: `1px solid ${C.red}25`, color: C.red, fontSize: 11, flexShrink: 0, display: "flex", gap: 6, alignItems: "center" }}>
                <FiAlertCircle size={12} /> {error}
              </div>
            )}

            {/* Messages area */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 0", scrollbarWidth: "thin", scrollbarColor: `${C.violet}30 transparent` }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2.5, repeat: Infinity }} style={{ marginBottom: 12 }}>
                    <FiMessageSquare size={32} style={{ color: `${C.violet}60` }} />
                  </motion.div>
                  <p style={{ color: C.muted, fontSize: 13, fontWeight: 600, margin: "0 0 4px" }}>Ask about your analysis</p>
                  <p style={{ color: `${C.muted}80`, fontSize: 11, margin: "0 0 16px" }}>Get grounded answers from your ML pipeline results</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {SUGGESTED_QUESTIONS.slice(0, 4).map((q, i) => (
                      <motion.button key={q} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                        whileHover={{ x: 3, borderColor: `${C.violet}60` }} onClick={() => sendMessage(q)} disabled={loading}
                        style={{ background: `${C.violet}08`, border: `1px solid ${C.violet}20`, borderRadius: 10, padding: "8px 12px", cursor: "pointer", color: C.muted, fontSize: 11, textAlign: "left", transition: "all 0.15s" }}>
                        {q}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => {
                if (msg.role === "system") {
                  return (
                    <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      style={{ textAlign: "center", padding: "6px 12px", margin: "6px 0", borderRadius: 10, background: `${C.green}08`, border: `1px solid ${C.green}20`, color: C.green, fontSize: 10, fontFamily: "monospace" }}>
                      <FiCheck size={9} style={{ marginRight: 4 }} /> {msg.content}
                    </motion.div>
                  );
                }
                return <MessageBubble key={i} msg={msg} />;
              })}

              {loading && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div style={{ padding: "12px 14px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
              {messages.length > 0 && messages.length < 6 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {SUGGESTED_QUESTIONS.slice(4).map(q => (
                    <motion.button key={q} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => sendMessage(q)} disabled={loading}
                      style={{ background: `${C.cyan}08`, border: `1px solid ${C.cyan}20`, borderRadius: 20, padding: "3px 10px", cursor: "pointer", color: C.muted, fontSize: 9, fontFamily: "monospace" }}>
                      {q}
                    </motion.button>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} disabled={loading}
                  placeholder={hasContext ? "Ask about your analysis… (Enter to send)" : "Load context first, then ask questions…"}
                  rows={1}
                  style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", color: C.text, fontSize: 12, resize: "none", outline: "none", lineHeight: 1.5, fontFamily: "inherit", transition: "border-color 0.15s", maxHeight: 80, overflowY: "auto" }}
                  onFocus={e => (e.target.style.borderColor = `${C.violet}60`)}
                  onBlur={e  => (e.target.style.borderColor = C.border)}
                />
                <motion.button whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} onClick={() => sendMessage()} disabled={!input.trim() || loading}
                  style={{ width: 40, height: 40, borderRadius: 12, background: !input.trim() || loading ? "rgba(255,255,255,0.05)" : `linear-gradient(135deg, ${C.violet}, ${C.cyan})`, border: "none", cursor: !input.trim() || loading ? "not-allowed" : "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, alignSelf: "flex-end", transition: "background 0.2s" }}>
                  {loading
                    ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}><FiLoader size={14} /></motion.div>
                    : <FiSend size={14} />}
                </motion.button>
              </div>
              <p style={{ color: `${C.muted}60`, fontSize: 9, fontFamily: "monospace", textAlign: "center", marginTop: 6 }}>
                Powered by FAISS + LangChain LCEL + Groq API · Grounded in your ML results
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}