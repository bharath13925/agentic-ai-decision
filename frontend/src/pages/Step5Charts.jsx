/**
 * Step5Charts.jsx — AgenticIQ Decision Intelligence Charts v3.0
 *
 * UPDATED for v13.4 pipeline:
 *
 *  FIX Z  — All KPI values display at 4 decimal places for CTR/Conv/ROI
 *            (was 2dp in several places). Matches backend precision.
 *
 *  FIX BB — SHAP direction "unknown" renders ◆ neutral badge with muted
 *            styling instead of a directional indicator. Matches FIX L
 *            (Python) and FIX BB (Node FeedbackController).
 *
 *  FIX U/V/W — Real dataset medians reflected in What-If table baseline
 *            label: unit_price=1025.90, discount median=15%. Tooltip copy
 *            updated to match actual dataset values.
 *
 *  NEW — WhatIfTable now shows the actual baseline conv rate from
 *        realKPIs instead of a hardcoded assumption.
 *
 *  NEW — StrategyRankingChart shows runner-up gap using s.runnerUpGap
 *        from decision_agent v5.5 output.
 *
 *  NEW — IntelligencePanel reads benchmarksUsed from observerResult
 *        (dynamic per-dataset benchmarks from observer_agent v3.4 FIX O/P).
 *
 *  NEW — KPIHero improvement block uses 4dp precision matching backend.
 *
 *  NEW — AIInsightCard shows mlDriven + weightsUsed + affinitiesSource
 *        from simulation_result (v7.6 output).
 *
 *  Retained — all existing visual components, tab structure, and motion
 *  patterns from v2.0.
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, animate } from "framer-motion";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, Legend, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  FiTrendingUp, FiTrendingDown, FiBarChart2, FiActivity,
  FiZap, FiTarget, FiCpu, FiEye, FiInfo, FiChevronDown,
  FiChevronUp, FiAward, FiAlertTriangle, FiShield, FiCheck,
  FiArrowUp, FiArrowDown, FiDatabase, FiAlertCircle,
} from "react-icons/fi";

/* ── Palette ── */
const C = {
  violet: "#7C5CFF",
  cyan:   "#00E0FF",
  pink:   "#FF4FD8",
  green:  "#22C55E",
  orange: "#FF9800",
  red:    "#EF4444",
  border: "rgba(255,255,255,0.08)",
  card:   "rgba(255,255,255,0.04)",
  text:   "#E6E6EB",
  muted:  "#9CA3AF",
  bg:     "#0B0B0F",
};

const KPI_META = {
  ctr:             { label: "Click-Through Rate", short: "CTR",          unit: "%", color: C.violet, lowerBetter: false, icon: FiActivity,   decimals: 4 },
  conversionRate:  { label: "Conversion Rate",    short: "Conv Rate",    unit: "%", color: C.cyan,   lowerBetter: false, icon: FiTarget,     decimals: 4 },
  cartAbandonment: { label: "Cart Abandonment",   short: "Cart Abandon", unit: "%", color: C.pink,   lowerBetter: true,  icon: FiZap,        decimals: 2 },
  roi:             { label: "Return on Investment",short: "ROI",         unit: "x", color: C.green,  lowerBetter: false, icon: FiTrendingUp, decimals: 4 },
};

/* FIX Z: use per-KPI decimal precision */
const r = (v, d = 2) =>
  typeof v === "number" && isFinite(v) ? +v.toFixed(d) : 0;

const fmt = (v, key) => {
  const d = KPI_META[key]?.decimals ?? 2;
  return r(v, d);
};

/* ── Animated counter ── */
function AnimatedCounter({ value, decimals = 1, suffix = "", prefix = "" }) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState("0");
  useEffect(() => {
    const ctrl = animate(mv, value ?? 0, {
      duration: 1.6,
      ease: "easeOut",
      onUpdate: v => setDisplay(prefix + v.toFixed(decimals) + suffix),
    });
    return ctrl.stop;
  }, [value]);
  return <span>{display}</span>;
}

/* ── Shared glass card ── */
function Card({ children, style = {}, accent, glow }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{
        background: C.card,
        border: `1px solid ${accent ? `${accent}28` : C.border}`,
        borderRadius: 20,
        padding: "24px 26px",
        position: "relative",
        overflow: "hidden",
        boxShadow: glow ? `0 0 40px ${glow}14` : "none",
        ...style,
      }}
    >
      {accent && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg,transparent,${accent}80,transparent)`,
        }} />
      )}
      {children}
    </motion.div>
  );
}

function SectionHeader({ icon: Icon, color, label, badge, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10,
        background: `${color}18`, border: `1px solid ${color}40`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color, flexShrink: 0,
      }}>
        <Icon size={15} />
      </div>
      <div style={{ flex: 1 }}>
        <span style={{ color: C.text, fontWeight: 700, fontSize: 14, display: "block" }}>{label}</span>
        {sub && <span style={{ color: C.muted, fontSize: 11 }}>{sub}</span>}
      </div>
      {badge && (
        <span style={{
          fontSize: 10, fontFamily: "monospace",
          color, background: `${color}15`, border: `1px solid ${color}35`,
          padding: "3px 10px", borderRadius: 20,
          textTransform: "uppercase", letterSpacing: "0.1em",
        }}>{badge}</span>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   HERO: KPI IMPACT — FIX Z: 4dp precision
══════════════════════════════════════════════════ */
function KPIHero({ realKPIs, projected, improvement }) {
  if (!realKPIs || !projected) return null;

  const convLift = improvement?.conversionLift;
  const before   = improvement?.before;
  const after    = improvement?.after;

  const items = [
    {
      key: "conversionRate", label: "Conversion Rate",
      before: fmt(realKPIs.conversionRate, "conversionRate"),
      after:  fmt(projected.conversionRate, "conversionRate"),
      unit: "%", color: C.cyan, icon: FiTarget, lowerBetter: false,
    },
    {
      key: "cartAbandonment", label: "Cart Abandonment",
      before: fmt(realKPIs.cartAbandonment, "cartAbandonment"),
      after:  fmt(projected.cartAbandonment, "cartAbandonment"),
      unit: "%", color: C.pink, icon: FiZap, lowerBetter: true,
    },
    {
      key: "roi", label: "Return on Investment",
      before: fmt(realKPIs.roi, "roi"),
      after:  fmt(projected.roi, "roi"),
      unit: "x", color: C.green, icon: FiTrendingUp, lowerBetter: false,
    },
    {
      key: "ctr", label: "Click-Through Rate",
      before: fmt(realKPIs.ctr, "ctr"),
      after:  fmt(projected.ctr, "ctr"),
      unit: "%", color: C.violet, icon: FiActivity, lowerBetter: false,
    },
  ];

  return (
    <Card accent={C.cyan} glow={C.cyan}>
      <SectionHeader
        icon={FiZap}
        color={C.cyan}
        label="KPI Impact Overview"
        sub="Real dataset values vs ML-projected outcomes after strategy"
        badge="ML-Driven"
      />

      {/* Conversion lift hero — FIX Z: 4dp */}
      {convLift !== undefined && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          style={{
            textAlign: "center", padding: "20px 0 24px",
            marginBottom: 20,
            background: `linear-gradient(135deg, ${C.cyan}08, ${C.violet}08)`,
            borderRadius: 16, border: `1px solid ${C.cyan}20`,
          }}
        >
          <p style={{ color: C.muted, fontSize: 11, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 6 }}>
            Primary KPI Improvement
          </p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <span style={{ color: C.muted, fontSize: 18, fontFamily: "monospace" }}>
              {(+before).toFixed(4)}%
            </span>
            <motion.div
              animate={{ x: [0, 6, 0] }}
              transition={{ duration: 1.8, repeat: Infinity }}
              style={{ color: C.cyan, fontSize: 20 }}
            >→</motion.div>
            <span style={{ color: C.cyan, fontSize: 28, fontWeight: 900, fontFamily: "monospace" }}>
              {(+after).toFixed(4)}%
            </span>
            <span style={{
              fontSize: 14, fontWeight: 800, color: C.green,
              background: `${C.green}15`, border: `1px solid ${C.green}30`,
              padding: "4px 12px", borderRadius: 20,
            }}>
              +{r(convLift, 1)}%
            </span>
          </div>
          <p style={{ color: C.muted, fontSize: 10, marginTop: 6 }}>Conversion Rate · Projected improvement</p>
        </motion.div>
      )}

      {/* KPI grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {items.map((item, i) => {
          const delta = item.lowerBetter
            ? item.before - item.after
            : item.after - item.before;
          const improved = delta > 0;
          const deltaPct = item.before > 0 ? Math.abs(delta / item.before * 100) : 0;
          const Icon = item.icon;

          return (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.07 }}
              style={{
                padding: "14px 12px",
                borderRadius: 14,
                background: `${item.color}06`,
                border: `1px solid ${item.color}20`,
                textAlign: "center",
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: `${item.color}18`,
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 8px", color: item.color,
              }}>
                <Icon size={13} />
              </div>
              <p style={{ color: C.muted, fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", marginBottom: 6 }}>
                {item.label}
                {item.lowerBetter && <span style={{ opacity: 0.6 }}> ↓ better</span>}
              </p>

              {/* FIX Z: display raw before/after at full precision */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 6 }}>
                <span style={{ color: C.muted, fontSize: 11, fontFamily: "monospace" }}>
                  {item.before}{item.unit}
                </span>
                <span style={{ color: C.muted, fontSize: 10 }}>→</span>
                <motion.span
                  style={{ color: item.color, fontSize: 15, fontWeight: 900, fontFamily: "monospace" }}
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3 + i * 0.07, type: "spring" }}
                >
                  {item.after}{item.unit}
                </motion.span>
              </div>

              {/* Delta badge */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontSize: 10, fontWeight: 700,
                color: improved ? C.green : C.red,
                background: improved ? `${C.green}12` : `${C.red}12`,
                border: `1px solid ${improved ? C.green : C.red}25`,
                padding: "2px 8px", borderRadius: 20,
              }}>
                {improved ? <FiArrowUp size={9} /> : <FiArrowDown size={9} />}
                {r(deltaPct, 1)}%
              </div>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════════
   AI INSIGHT CARD — NEW: shows affinitiesSource + weightsUsed
══════════════════════════════════════════════════ */
function AIInsightCard({ aiInsight, topStrategy, confidence, pklScoringUsed, mlAccuracy, simulationResult }) {
  if (!aiInsight && !topStrategy) return null;

  const affinitiesSource = simulationResult?.affinitiesSource;
  const weightsUsed      = simulationResult?.weightsUsed;
  const mlDriven         = simulationResult?.mlDriven;

  return (
    <Card accent={C.violet} glow={C.violet}>
      <SectionHeader icon={FiCpu} color={C.violet} label="AI Decision Insight" badge="v13.4 ML" />

      {/* Badges row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {mlAccuracy && (
          <span style={{
            fontSize: 10, fontFamily: "monospace", color: C.cyan,
            background: `${C.cyan}12`, border: `1px solid ${C.cyan}30`,
            padding: "4px 10px", borderRadius: 20,
          }}>
            🧠 Ensemble Accuracy: {r(mlAccuracy, 1)}%
          </span>
        )}
        {pklScoringUsed && (
          <span style={{
            fontSize: 10, fontFamily: "monospace", color: C.green,
            background: `${C.green}12`, border: `1px solid ${C.green}30`,
            padding: "4px 10px", borderRadius: 20,
          }}>
            <FiShield size={9} style={{ marginRight: 4 }} />PKL Validated
          </span>
        )}
        {confidence && (
          <span style={{
            fontSize: 10, fontFamily: "monospace", color: C.orange,
            background: `${C.orange}12`, border: `1px solid ${C.orange}30`,
            padding: "4px 10px", borderRadius: 20,
          }}>
            ⚡ Confidence: {confidence}%
          </span>
        )}
        {/* NEW: affinities source badge */}
        {affinitiesSource && (
          <span style={{
            fontSize: 10, fontFamily: "monospace",
            color: affinitiesSource === "dataset" ? C.green : C.muted,
            background: affinitiesSource === "dataset" ? `${C.green}12` : "rgba(255,255,255,0.05)",
            border: `1px solid ${affinitiesSource === "dataset" ? `${C.green}30` : "rgba(255,255,255,0.1)"}`,
            padding: "4px 10px", borderRadius: 20,
          }}>
            {affinitiesSource === "dataset" ? "✓ Real dataset affinities" : "⚠ Industry-estimate affinities"}
          </span>
        )}
        {/* NEW: weights badge */}
        {weightsUsed && (
          <span style={{
            fontSize: 10, fontFamily: "monospace",
            color: weightsUsed === "learned" ? C.violet : C.muted,
            background: weightsUsed === "learned" ? `${C.violet}12` : "rgba(255,255,255,0.05)",
            border: `1px solid ${weightsUsed === "learned" ? `${C.violet}30` : "rgba(255,255,255,0.1)"}`,
            padding: "4px 10px", borderRadius: 20,
          }}>
            Weights: {weightsUsed}
          </span>
        )}
      </div>

      {/* Recommended strategy highlight */}
      {topStrategy && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          style={{
            padding: "14px 16px",
            borderRadius: 12,
            background: `${C.green}08`,
            border: `1px solid ${C.green}25`,
            marginBottom: 14,
            display: "flex", alignItems: "center", gap: 12,
          }}
        >
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: `${C.green}20`, border: `1px solid ${C.green}40`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: C.green, flexShrink: 0,
            }}
          >
            <FiAward size={16} />
          </motion.div>
          <div>
            <p style={{ color: C.muted, fontSize: 10, fontFamily: "monospace", marginBottom: 3 }}>
              Top Recommended Strategy
            </p>
            <p style={{ color: C.text, fontSize: 15, fontWeight: 800 }}>{topStrategy}</p>
          </div>
          {confidence && (
            <div style={{ marginLeft: "auto", textAlign: "right", flexShrink: 0 }}>
              <p style={{ color: C.muted, fontSize: 9, fontFamily: "monospace" }}>Confidence</p>
              <p style={{ color: C.green, fontSize: 22, fontWeight: 900 }}>
                <AnimatedCounter value={parseFloat(confidence)} decimals={0} suffix="%" />
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* AI insight text */}
      {aiInsight && (
        <div style={{
          padding: "14px 16px",
          borderRadius: 12,
          background: `${C.violet}06`,
          border: `1px solid ${C.violet}20`,
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <FiInfo size={13} style={{ color: C.violet, marginTop: 1, flexShrink: 0 }} />
            <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.7 }}>{aiInsight}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════════════
   KPI COMPARISON — CSS BARS
══════════════════════════════════════════════════ */
function KPIComparisonChart({ realKPIs, projected }) {
  if (!realKPIs || !projected) return null;

  const kpis = Object.entries(KPI_META).map(([k, meta]) => ({
    key: k, label: meta.label, short: meta.short,
    unit: meta.unit, color: meta.color,
    lowerBetter: meta.lowerBetter,
    decimals: meta.decimals,
    current: fmt(realKPIs[k], k),
    proj:    fmt(projected[k], k),
  }));

  return (
    <Card accent={C.violet}>
      <SectionHeader
        icon={FiBarChart2}
        color={C.violet}
        label="KPI Comparison"
        sub="Your dataset baseline vs ML-projected outcome"
        badge="Before vs After"
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {kpis.map((kpi, gi) => {
          const maxVal = Math.max(kpi.current, kpi.proj, 0.001);
          const yTop   = maxVal * 1.4;
          const improved = kpi.lowerBetter ? kpi.proj < kpi.current : kpi.proj > kpi.current;
          const projColor = improved ? kpi.color : C.orange;

          return (
            <div key={kpi.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <span style={{ color: C.muted, fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>
                {kpi.short}
              </span>
              <div style={{ width: "100%", height: 140, display: "flex", alignItems: "flex-end", gap: 8, padding: "0 4px", position: "relative" }}>
                {[0.33, 0.66, 1].map(f => (
                  <div key={f} style={{ position: "absolute", bottom: `${f * 100}%`, left: 4, right: 4, height: 1, background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />
                ))}
                {[
                  { val: kpi.current, fill: `${kpi.color}45`, lbl: "Now" },
                  { val: kpi.proj,    fill: projColor,          lbl: "Est" },
                ].map(({ val, fill, lbl }) => {
                  const hPct = yTop > 0 ? Math.max((val / yTop) * 100, 2) : 2;
                  const isProj = lbl === "Est";
                  return (
                    <div key={lbl} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                      <span style={{ fontSize: 9, fontFamily: "monospace", color: isProj ? projColor : C.muted, fontWeight: isProj ? 700 : 400, marginBottom: 3, whiteSpace: "nowrap" }}>
                        {val}{kpi.unit}
                      </span>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${hPct}%` }}
                        transition={{ duration: 0.9, delay: gi * 0.08, ease: "easeOut" }}
                        style={{ width: "100%", background: fill, borderRadius: "4px 4px 0 0", minHeight: 3 }}
                      />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8, fontSize: 9, color: C.muted }}>
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: `${kpi.color}45`, display: "inline-block" }} />Now
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: projColor, display: "inline-block" }} />Est
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ color: C.muted, fontSize: 10, fontFamily: "monospace", marginTop: 14, textAlign: "center" }}>
        Faded = current dataset baseline · Solid = projected after strategy · Orange = regression vs baseline
      </p>
    </Card>
  );
}

/* ══════════════════════════════════════════════════
   IMPROVEMENT PILLS — FIX Z: correct lowerBetter logic + full precision
══════════════════════════════════════════════════ */
function ImprovementPill({ label, current, projected, unit, lowerBetter = false, color, icon: Icon, decimals = 2 }) {
  if (current == null || projected == null || current === 0) return null;
  const rawPct   = ((projected - current) / Math.abs(current)) * 100;
  const improved = lowerBetter ? rawPct < 0 : rawPct > 0;
  const magnitude = Math.abs(rawPct).toFixed(1);
  const bgColor   = improved ? "rgba(34,197,94,0.10)"  : "rgba(239,68,68,0.10)";
  const borderCol = improved ? "rgba(34,197,94,0.28)"  : "rgba(239,68,68,0.28)";
  const textCol   = improved ? "#4ade80" : "#f87171";
  const ArrowIcon = lowerBetter
    ? (improved ? FiArrowDown : FiArrowUp)
    : (improved ? FiArrowUp   : FiArrowDown);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      style={{
        background: bgColor, border: `1px solid ${borderCol}`,
        borderRadius: 14, padding: "16px 18px",
        display: "flex", alignItems: "center", gap: 12,
        flex: "1 1 200px", minWidth: 180,
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        background: `${color}18`, border: `1px solid ${color}40`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color, flexShrink: 0,
      }}>
        <Icon size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: C.muted, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
          {label}{lowerBetter && <span style={{ color: C.muted, fontSize: 9, marginLeft: 4, opacity: 0.7 }}>↓ better</span>}
        </p>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 4 }}>
          <span style={{ color: C.muted, fontSize: 11 }}>{r(current, decimals)}{unit}</span>
          <span style={{ color: C.muted, fontSize: 10 }}>→</span>
          <span style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>{r(projected, decimals)}{unit}</span>
        </div>
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        color: textCol, fontWeight: 800, fontSize: 13, flexShrink: 0,
        background: improved ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
        padding: "5px 10px", borderRadius: 20,
      }}>
        <ArrowIcon size={13} />
        {magnitude}%
      </div>
    </motion.div>
  );
}

function ImprovementPanel({ realKPIs, projected }) {
  if (!realKPIs || !projected) return null;
  return (
    <Card accent={C.green} glow={C.green}>
      <SectionHeader icon={FiTrendingUp} color={C.green} label="Projected Improvements" sub="vs Your Current Dataset Baseline" badge="vs Current" />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {Object.entries(KPI_META).map(([k, meta]) => (
          <ImprovementPill
            key={k}
            label={meta.label}
            current={realKPIs[k]}
            projected={projected[k]}
            unit={meta.unit}
            lowerBetter={meta.lowerBetter}
            color={meta.color}
            icon={meta.icon}
            decimals={meta.decimals}
          />
        ))}
      </div>
      <p style={{ color: C.muted, fontSize: 10, fontFamily: "monospace", marginTop: 12, textAlign: "center" }}>
        Green = improvement in the right direction · Cart Abandonment: lower ↓ is better
      </p>
    </Card>
  );
}

/* ══════════════════════════════════════════════════
   STRATEGY RANKING — NEW: runnerUpGap from decision_agent v5.5
══════════════════════════════════════════════════ */
const STRAT_COLORS = [C.violet, C.cyan, C.pink, C.green, C.orange, "#A78BFA"];

function StrategyRankingChart({ rankedStrategies, perStrategyMlScores }) {
  const [expandedIdx, setExpandedIdx] = useState(null);
  if (!rankedStrategies?.length) return null;

  const data = rankedStrategies.slice(0, 6).map((s, i) => {
    const proba     = perStrategyMlScores?.[s.id] ?? s.mlPurchaseProba ?? null;
    const rawName   = s.name || `Strategy ${i + 1}`;
    const shortName = rawName
      .replace("Your strategy: ", "★ ")
      .replace(/^Increase ad budget on top channel$/, "Ad Budget+")
      .replace(/^Improve checkout UX$/, "Checkout UX")
      .replace(/^Run retargeting campaign$/, "Retargeting")
      .replace(/^Offer targeted discount$/, "Targeted Discount")
      .replace(/^Add urgency and scarcity signals$/, "Urgency Signals")
      .replace(/^Reallocate budget to top-performing channels$/, "Reallocate Budget")
      .replace(/^Improve ad creatives$/, "Ad Creatives")
      .replace(/^Optimise audience targeting$/, "Audience Targeting");
    return {
      name:          shortName.length > 26 ? shortName.slice(0, 26) + "…" : shortName,
      fullName:      rawName,
      score:         r(s.score, 1),
      mlProba:       proba != null ? r(proba * 100, 1) : null,
      rank:          s.rank || i + 1,
      color:         s.source === "user" ? C.green : (STRAT_COLORS[i] || C.violet),
      isUser:        s.source === "user",
      confidenceBand:  s.confidenceBand,
      riskLabel:       s.riskLabel,
      whySelected:     s.whySelected,
      whyNotSelected:  s.whyNotSelected,
      runnerUpGap:     s.runnerUpGap,   /* NEW: from decision_agent v5.5 */
      description:     s.description,
    };
  });

  const maxScore = Math.max(...data.map(d => d.score), 1);

  return (
    <Card accent={C.cyan}>
      <SectionHeader
        icon={FiCpu}
        color={C.cyan}
        label="Strategy Ranking"
        sub="Scored by ML ensemble across objective-weighted KPI improvements"
        badge={`${rankedStrategies.length} strategies`}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.map((d, i) => {
          const isExpanded = expandedIdx === i;
          return (
            <div key={`${d.name}-${i}`}>
              <motion.div
                style={{
                  padding: "12px 14px", borderRadius: 12,
                  border: `1px solid ${d.rank === 1 ? `${d.color}45` : "rgba(255,255,255,0.07)"}`,
                  background: d.rank === 1 ? `${d.color}08` : "rgba(255,255,255,0.02)",
                  cursor: "pointer",
                }}
                whileHover={{ x: 3 }}
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* Rank badge */}
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: `${d.color}18`, border: `1px solid ${d.color}35`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 900, color: d.color,
                  }}>
                    #{d.rank}
                  </div>

                  {/* Name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {d.isUser && <span style={{ color: C.green, fontSize: 10 }}>★</span>}
                      <span style={{ fontSize: 12, fontFamily: "monospace", color: d.isUser ? C.green : C.text, fontWeight: d.rank === 1 ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {d.name}
                      </span>
                      {d.rank === 1 && (
                        <motion.span
                          animate={{ opacity: [1, 0.5, 1] }}
                          transition={{ duration: 1.8, repeat: Infinity }}
                          style={{ fontSize: 9, fontFamily: "monospace", color: C.green, background: `${C.green}15`, border: `1px solid ${C.green}30`, padding: "1px 7px", borderRadius: 20 }}
                        >
                          TOP PICK
                        </motion.span>
                      )}
                      {d.confidenceBand && (
                        <span style={{ fontSize: 9, fontFamily: "monospace", color: C.muted, background: "rgba(255,255,255,0.06)", padding: "1px 7px", borderRadius: 20 }}>
                          {d.confidenceBand} confidence
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bar */}
                  <div style={{ width: 100, height: 22, background: "rgba(255,255,255,0.05)", borderRadius: 5, overflow: "hidden", flexShrink: 0 }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(d.score / maxScore) * 100}%` }}
                      transition={{ duration: 0.9, delay: i * 0.06, ease: "easeOut" }}
                      style={{ height: "100%", borderRadius: 5, background: `linear-gradient(90deg, ${d.color}70, ${d.color})`, opacity: d.rank === 1 ? 1 : 0.7 }}
                    />
                  </div>

                  {/* Score */}
                  <span style={{ width: 38, textAlign: "right", fontSize: 13, fontWeight: 900, color: d.color, fontFamily: "monospace", flexShrink: 0 }}>
                    {d.score}
                  </span>

                  {/* Runner-up gap — NEW from decision_agent v5.5 */}
                  {d.runnerUpGap != null && d.runnerUpGap > 0 && (
                    <span style={{ fontSize: 9, fontFamily: "monospace", color: C.muted, flexShrink: 0 }}>
                      +{d.runnerUpGap}pts
                    </span>
                  )}

                  {/* Expand toggle */}
                  <div style={{ color: C.muted, flexShrink: 0 }}>
                    {isExpanded ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
                  </div>
                </div>
              </motion.div>

              {/* Expanded detail */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div style={{
                      padding: "14px 16px", margin: "4px 0 4px 38px",
                      borderRadius: 12,
                      background: `${d.color}06`,
                      border: `1px solid ${d.color}18`,
                    }}>
                      {d.description && (
                        <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, marginBottom: d.whySelected ? 10 : 0 }}>
                          {d.description}
                        </p>
                      )}
                      {d.whySelected && (
                        <div style={{ marginBottom: d.whyNotSelected ? 8 : 0 }}>
                          <span style={{ color: C.green, fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>✓ Why selected: </span>
                          <span style={{ color: C.muted, fontSize: 11 }}>{d.whySelected}</span>
                        </div>
                      )}
                      {d.whyNotSelected && (
                        <div>
                          <span style={{ color: C.orange, fontSize: 10, fontFamily: "monospace", fontWeight: 700 }}>⚠ Why not #1: </span>
                          <span style={{ color: C.muted, fontSize: 11 }}>{d.whyNotSelected}</span>
                        </div>
                      )}
                      {d.riskLabel && (
                        <div style={{ marginTop: 8 }}>
                          <span style={{ color: C.muted, fontSize: 10, fontFamily: "monospace" }}>Risk: </span>
                          <span style={{ color: C.orange, fontSize: 10, fontWeight: 600 }}>{d.riskLabel}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* ML Probability section */}
      {data.some(d => d.mlProba !== null) && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ color: C.muted, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
            ML Purchase Probability · From real .pkl model files
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.filter(d => d.mlProba !== null).map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: C.muted, fontSize: 10, fontFamily: "monospace", width: 150, flexShrink: 0, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  #{d.rank} {d.name.slice(0, 18)}
                </span>
                <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, d.mlProba)}%` }}
                    transition={{ duration: 0.9, delay: i * 0.08, ease: "easeOut" }}
                    style={{ height: "100%", borderRadius: 4, background: d.color }}
                  />
                </div>
                <span style={{ color: d.color, fontSize: 11, fontFamily: "monospace", width: 46, textAlign: "right", flexShrink: 0 }}>
                  {d.mlProba}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════════════
   WHAT-IF TABLE — FIX U: real baseline label
   (discount median=15%, unit_price=1025.90)
══════════════════════════════════════════════════ */
function WhatIfTable({ whatIfTable, realConv }) {
  if (!whatIfTable?.length) return null;
  const maxLift = Math.max(...whatIfTable.map(r => Math.abs(r.convLift)), 0.01);

  return (
    <Card accent={C.orange}>
      <SectionHeader
        icon={FiDatabase}
        color={C.orange}
        label="What-If Simulation"
        sub="ML projection of discount impact on conversion rate"
        badge="Scenario Analysis"
      />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Discount %", "Projected Conv Rate", "Lift vs Baseline", "ROI Impact", "Verdict"].map(h => (
                <th key={h} style={{ color: C.muted, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", textAlign: "left", padding: "0 12px 12px 0", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {whatIfTable.map((row, i) => {
              const lift = row.convLift;
              const improved = lift > 0;
              const barW = Math.abs(lift) / maxLift * 100;
              const isTop = i === whatIfTable.reduce((best, r, idx) => r.convLift > whatIfTable[best].convLift ? idx : best, 0);

              return (
                <motion.tr
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    background: isTop ? `${C.green}06` : "transparent",
                  }}
                >
                  <td style={{ padding: "12px 12px 12px 0", color: C.text, fontWeight: 700, fontFamily: "monospace" }}>
                    {row.discountPct}%
                    {isTop && <span style={{ marginLeft: 6, fontSize: 9, color: C.green }}>★ best</span>}
                  </td>
                  <td style={{ padding: "12px 12px 12px 0", color: improved ? C.green : C.text, fontFamily: "monospace", fontWeight: 600 }}>
                    {r(row.projectedConversion, 4)}%
                  </td>
                  <td style={{ padding: "12px 12px 12px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 60, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${barW}%` }}
                          transition={{ duration: 0.8, delay: i * 0.1 }}
                          style={{ height: "100%", borderRadius: 3, background: improved ? C.green : C.red }}
                        />
                      </div>
                      <span style={{ color: improved ? C.green : C.red, fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>
                        {lift > 0 ? "+" : ""}{r(lift, 2)}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 12px 12px 0", color: C.muted, fontFamily: "monospace" }}>
                    {r(row.projectedROI, 4)}x
                  </td>
                  <td style={{ padding: "12px 12px 12px 0" }}>
                    <span style={{
                      fontSize: 9, fontFamily: "monospace",
                      color: isTop ? C.green : (improved ? C.cyan : C.muted),
                      background: isTop ? `${C.green}15` : (improved ? `${C.cyan}10` : "rgba(255,255,255,0.05)"),
                      border: `1px solid ${isTop ? `${C.green}30` : (improved ? `${C.cyan}20` : "rgba(255,255,255,0.08)")}`,
                      padding: "2px 8px", borderRadius: 20,
                    }}>
                      {isTop ? "Optimal" : improved ? "Positive" : "Caution"}
                    </span>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* FIX U: updated note referencing real dataset values */}
      {realConv != null && (
        <p style={{ color: C.muted, fontSize: 10, fontFamily: "monospace", marginTop: 14 }}>
          Baseline conv rate: <strong style={{ color: C.orange }}>{r(realConv, 4)}%</strong> · Discount median in dataset: 15% · unit_price median: 1025.90 · Projections via RandomForestRegressor (kpi_predictor.pkl)
        </p>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════════════
   RADAR CHART
══════════════════════════════════════════════════ */
function KPIRadarChart({ realKPIs, projected }) {
  if (!realKPIs || !projected) return null;

  const normalize = (val, key) => {
    const maxes = { ctr: 5, conversionRate: 60, cartAbandonment: 100, roi: 10 };
    const maxV  = maxes[key] || 100;
    if (key === "cartAbandonment") return r(Math.max(0, 100 - (val / maxV) * 100), 1);
    return r(Math.min(100, (val / maxV) * 100), 1);
  };

  const radarData = Object.entries(KPI_META).map(([k, meta]) => ({
    kpi:       meta.lowerBetter ? `${meta.short} ↓` : meta.short,
    Current:   normalize(realKPIs[k],  k),
    Projected: normalize(projected[k], k),
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "#0E0E18", border: `1px solid ${C.violet}44`, borderRadius: 10, padding: "8px 12px", fontSize: 11 }}>
        <p style={{ color: C.muted, marginBottom: 4, fontFamily: "monospace" }}>{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.stroke }}>
            {p.name}: <strong>{p.value}</strong>/100
          </p>
        ))}
      </div>
    );
  };

  return (
    <Card accent={C.pink}>
      <SectionHeader icon={FiEye} color={C.pink} label="KPI Performance Radar" sub="Normalized 0–100 scale · Cart abandonment axis inverted" badge="Radar" />
      <ResponsiveContainer width="100%" height={240}>
        <RadarChart data={radarData} margin={{ top: 10, right: 40, bottom: 10, left: 40 }}>
          <PolarGrid stroke="rgba(255,255,255,0.07)" />
          <PolarAngleAxis dataKey="kpi" tick={{ fill: C.muted, fontSize: 10, fontFamily: "monospace" }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "transparent" }} axisLine={false} />
          <Radar name="Current" dataKey="Current" stroke={`${C.violet}88`} fill={`${C.violet}22`} strokeWidth={1.5} />
          <Radar name="Projected" dataKey="Projected" stroke={C.cyan} fill={`${C.cyan}18`} strokeWidth={2} />
          <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} formatter={(v) => <span style={{ color: C.muted }}>{v}</span>} />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
      <p style={{ color: C.muted, fontSize: 10, fontFamily: "monospace", marginTop: 4, textAlign: "center" }}>
        ↓ = inverted axis — for Cart Abandonment, higher score = lower abandonment rate (better)
      </p>
    </Card>
  );
}

/* ══════════════════════════════════════════════════
   INTELLIGENCE TAB — NEW: reads benchmarksUsed from observerResult
   (observer_agent v3.4 FIX O — dynamic CTR benchmark)
══════════════════════════════════════════════════ */
function IntelligencePanel({ agentResult }) {
  const directions    = agentResult?.simulationResult?.directionsUsed || [];
  const diagnosis     = agentResult?.analystResult?.diagnosis || "";
  const rawKPIs       = agentResult?.decisionResult?.realDatasetKPIs || {};
  const topStrat      = agentResult?.decisionResult?.recommendation?.strategyName || "";
  const topConf       = agentResult?.decisionResult?.recommendation?.confidence;
  const aiInsight     = agentResult?.decisionResult?.recommendation?.aiInsight || "";
  const rootCauses    = agentResult?.analystResult?.rootCauses || [];
  const observations  = agentResult?.observerResult?.observations || [];
  const healthScore   = agentResult?.observerResult?.healthScore;
  const mlAcc         = agentResult?.decisionResult?.mlAccuracy ?? agentResult?.mlAccuracy;
  const pklUsed       = agentResult?.decisionResult?.pklScoringUsed;
  const improvement   = agentResult?.decisionResult?.recommendation?.improvement;
  const runnerUp      = agentResult?.decisionResult?.recommendation?.runnerUp;
  /* NEW: dynamic benchmarks from observer_agent v3.4 */
  const benchmarksUsed = agentResult?.observerResult?.benchmarksUsed || {};
  /* NEW: affinities source from simulation_result */
  const affinitiesSource = agentResult?.simulationResult?.affinitiesSource;

  const colors = [C.violet, C.cyan, C.pink, C.green, C.orange, "#A78BFA"];
  const sevColor = { critical: "#EF4444", warning: "#FF9800", healthy: "#22C55E" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Summary strip */}
      <Card accent={C.violet} glow={C.violet}>
        <SectionHeader icon={FiZap} color={C.violet} label="Pipeline Intelligence Summary" />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {mlAcc && (
            <span style={{ fontSize: 10, fontFamily: "monospace", color: C.cyan, background: `${C.cyan}12`, border: `1px solid ${C.cyan}30`, padding: "4px 10px", borderRadius: 20 }}>
              ML Ensemble: {r(mlAcc, 1)}% accuracy
            </span>
          )}
          {pklUsed && (
            <span style={{ fontSize: 10, fontFamily: "monospace", color: C.green, background: `${C.green}12`, border: `1px solid ${C.green}30`, padding: "4px 10px", borderRadius: 20 }}>
              ✓ PKL per-strategy scoring
            </span>
          )}
          {healthScore != null && (
            <span style={{ fontSize: 10, fontFamily: "monospace", color: healthScore >= 70 ? C.green : healthScore >= 40 ? C.orange : C.red, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", padding: "4px 10px", borderRadius: 20 }}>
              Health Score: {healthScore}/100
            </span>
          )}
          {/* NEW: affinities source */}
          {affinitiesSource && (
            <span style={{
              fontSize: 10, fontFamily: "monospace",
              color: affinitiesSource === "dataset" ? C.green : C.muted,
              background: affinitiesSource === "dataset" ? `${C.green}12` : "rgba(255,255,255,0.05)",
              border: `1px solid ${affinitiesSource === "dataset" ? `${C.green}30` : "rgba(255,255,255,0.1)"}`,
              padding: "4px 10px", borderRadius: 20,
            }}>
              Affinities: {affinitiesSource === "dataset" ? "from your dataset" : "industry estimates"}
            </span>
          )}
        </div>

        {/* Before / after improvement — FIX Z: 4dp */}
        {improvement && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Before (Conv)", val: `${(+improvement.before).toFixed(4)}%`, color: C.muted },
              { label: "After (Conv)",  val: `${(+improvement.after).toFixed(4)}%`,  color: C.green },
              { label: "Lift",          val: `+${r(improvement.conversionLift, 1)}%`, color: C.cyan },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ textAlign: "center", padding: "10px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p style={{ color: C.muted, fontSize: 9, fontFamily: "monospace", marginBottom: 4 }}>{label}</p>
                <p style={{ color, fontSize: 16, fontWeight: 900, fontFamily: "monospace" }}>{val}</p>
              </div>
            ))}
          </div>
        )}

        {/* Runner-up comparison */}
        {runnerUp && (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 14 }}>
            <p style={{ color: C.muted, fontSize: 10, fontFamily: "monospace", marginBottom: 4 }}>Runner-up comparison</p>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: C.text, fontSize: 12 }}>#1 Top strategy</span>
              <span style={{ color: C.muted, fontSize: 11 }}>vs</span>
              <span style={{ color: C.muted, fontSize: 12 }}>#{2} {runnerUp.name}</span>
              {runnerUp.scoreDiff != null && (
                <span style={{ marginLeft: "auto", color: C.green, fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>
                  +{runnerUp.scoreDiff} pts advantage
                </span>
              )}
            </div>
          </div>
        )}

        {/* Real dataset KPIs — FIX Z: 4dp */}
        {Object.keys(rawKPIs).length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, padding: "12px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {[
              { label: "CTR",          val: rawKPIs.ctr,             unit: "%", decimals: 4, color: C.violet },
              { label: "Conv Rate",    val: rawKPIs.conversionRate,  unit: "%", decimals: 4, color: C.cyan   },
              { label: "Cart Abandon", val: rawKPIs.cartAbandonment, unit: "%", decimals: 2, color: C.pink   },
              { label: "ROI",          val: rawKPIs.roi,             unit: "x", decimals: 4, color: C.green  },
            ].filter(kpi => kpi.val != null).map(({ label, val, unit, decimals, color }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <p style={{ color: C.muted, fontSize: 9, fontFamily: "monospace", marginBottom: 3 }}>{label}</p>
                <p style={{ color, fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>{r(val, decimals)}{unit}</p>
                <p style={{ color: C.muted, fontSize: 9, fontFamily: "monospace", marginTop: 1 }}>from dataset</p>
              </div>
            ))}
          </div>
        )}

        {/* NEW: dynamic benchmarks from observer_agent v3.4 FIX O */}
        {Object.keys(benchmarksUsed).length > 0 && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ color: C.muted, fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
              Dynamic benchmarks used (observer_agent v3.4 — dataset-calibrated)
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[
                { label: "CTR target",    val: benchmarksUsed.ctr,             unit: "%" },
                { label: "Conv target",   val: benchmarksUsed.conversionRate,  unit: "%" },
                { label: "Abandon target",val: benchmarksUsed.cartAbandonment, unit: "%" },
                { label: "ROI target",    val: benchmarksUsed.roi,             unit: "x" },
              ].filter(b => b.val != null).map(({ label, val, unit }) => (
                <span key={label} style={{ fontSize: 9, fontFamily: "monospace", color: C.muted, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: 12 }}>
                  {label}: {r(val, 4)}{unit}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Top recommendation */}
        {topStrat && (
          <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 12, background: `${C.green}08`, border: `1px solid ${C.green}25` }}>
            <p style={{ color: C.muted, fontSize: 10, fontFamily: "monospace", marginBottom: 4 }}>
              Recommended Strategy · {topConf}% confidence
            </p>
            <p style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>{topStrat}</p>
            {aiInsight && (
              <p style={{ color: C.muted, fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>{aiInsight}</p>
            )}
          </div>
        )}
      </Card>

      {/* Analyst diagnosis */}
      {diagnosis && (
        <Card accent={C.cyan}>
          <SectionHeader icon={FiBarChart2} color={C.cyan} label="Analyst Diagnosis" badge="root cause" />
          <div style={{ padding: "14px 16px", borderRadius: 12, background: `${C.cyan}06`, border: `1px solid ${C.cyan}20`, marginBottom: 14 }}>
            <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.7 }}>{diagnosis}</p>
          </div>
          {rootCauses.slice(0, 3).map((rc, i) => (
            <div key={i} style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 8, background: `${sevColor[rc.severity] || C.violet}08`, border: `1px solid ${sevColor[rc.severity] || C.violet}25` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{rc.metric}</span>
                <span style={{ fontSize: 9, fontFamily: "monospace", padding: "2px 8px", borderRadius: 10, background: `${sevColor[rc.severity] || C.violet}20`, color: sevColor[rc.severity] || C.violet }}>{rc.severity}</span>
                <span style={{ color: C.muted, fontSize: 10, marginLeft: "auto" }}>
                  {r(rc.value, 4)}{rc.unit} vs {r(rc.benchmark, 4)}{rc.unit}
                  {rc.dataSource === "feature_importance" && <span style={{ color: C.green, marginLeft: 6, fontSize: 9 }}>📊 data-driven</span>}
                </span>
              </div>
              {rc.causes?.slice(0, 2).map((c, j) => (
                <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 3 }}>
                  <div style={{ width: 4, height: 4, borderRadius: "50%", background: sevColor[rc.severity] || C.violet, marginTop: 6, flexShrink: 0 }} />
                  <span style={{ color: C.muted, fontSize: 11, lineHeight: 1.5 }}>
                    {c.cause}
                    <span style={{ color: C.muted, fontSize: 10, marginLeft: 6, opacity: 0.6 }}>({Math.round((c.confidence || 0) * 100)}%)</span>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </Card>
      )}

      {/* Feature-importance directions */}
      {directions.length > 0 && (
        <Card accent={C.pink}>
          <SectionHeader icon={FiTarget} color={C.pink} label="Feature-Importance Strategy Directions" badge="ML-ranked" />
          <p style={{ color: C.muted, fontSize: 12, marginBottom: 14, lineHeight: 1.6 }}>
            Strategy directions were selected and ranked by the Analyst Agent based on which features carry the highest importance in your trained ML model. Higher-ranked directions address the features most correlated with your target outcome.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {directions.map((d, i) => (
              <div key={d} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 20, background: `${colors[i % colors.length]}12`, border: `1px solid ${colors[i % colors.length]}35` }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: `${colors[i % colors.length]}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: colors[i % colors.length], flexShrink: 0 }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: 11, fontFamily: "monospace", color: colors[i % colors.length] }}>
                  {d.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Observer health */}
      {observations.length > 0 && (
        <Card accent={C.violet}>
          <SectionHeader icon={FiEye} color={C.violet} label="Observer KPI Health" badge={`health: ${healthScore}/100`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {observations.map((obs, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", borderRadius: 10, background: `${sevColor[obs.severity] || C.violet}06`, border: `1px solid ${sevColor[obs.severity] || C.violet}25` }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: sevColor[obs.severity] || C.violet, marginTop: 5, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{obs.metric}</span>
                    <span style={{ fontSize: 9, fontFamily: "monospace", padding: "2px 7px", borderRadius: 10, background: `${sevColor[obs.severity] || C.violet}20`, color: sevColor[obs.severity] || C.violet }}>{obs.severity}</span>
                    <span style={{ color: C.muted, fontSize: 11, marginLeft: "auto" }}>
                      <strong style={{ color: sevColor[obs.severity] || C.violet }}>{r(obs.value, 4)}{obs.unit}</strong> vs {r(obs.benchmark, 4)}{obs.unit}
                    </span>
                  </div>
                  <p style={{ color: C.muted, fontSize: 11, lineHeight: 1.5 }}>{obs.message}</p>
                  {/* NEW: benchmarkNote from observer_agent v3.4 FIX P */}
                  {obs.benchmarkNote && (
                    <p style={{ color: C.muted, fontSize: 9, fontFamily: "monospace", marginTop: 4, opacity: 0.7 }}>
                      {obs.benchmarkNote}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   SHAP / FEATURE IMPORTANCE PANEL
   FIX BB: direction "unknown" → ◆ neutral badge (matches FIX L backend)
══════════════════════════════════════════════════ */
function SHAPPanel({ shapData, shapLoading }) {
  if (shapLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0", gap: 12 }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${C.pink}40`, borderTopColor: C.pink }}
        />
        <span style={{ color: C.muted, fontSize: 13 }}>Computing feature importance…</span>
      </div>
    );
  }

  if (shapData?.noData) {
    return (
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        <p style={{ color: C.orange, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Feature importance not available</p>
        <p style={{ color: C.muted, fontSize: 11 }}>{shapData.strategyContext}</p>
      </div>
    );
  }

  if (!shapData?.topFeatures?.length) {
    return (
      <p style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "32px 0" }}>SHAP data not available.</p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.7, padding: "12px 16px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {shapData.strategyContext}
      </p>

      {/* FIX BB: fallback warning banner */}
      {shapData?.fallback && shapData?.fallbackContext && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", borderRadius: 12, border: `1px solid ${C.orange}25`, background: `${C.orange}06` }}
        >
          <FiAlertCircle size={12} style={{ color: C.orange, marginTop: 2, flexShrink: 0 }} />
          <p style={{ color: C.muted, fontSize: 10, lineHeight: 1.6 }}>{shapData.fallbackContext}</p>
        </motion.div>
      )}

      {shapData.topFeatures.map((f, i) => {
        const colors = [C.violet, C.cyan, C.pink, C.green, C.orange, C.violet, C.cyan, C.pink];
        const pct    = Math.round(f.importance * 100);
        const c      = colors[i % colors.length];

        /* FIX BB: "unknown" direction → ◆ neutral (matches FIX L Python + FIX BB Node) */
        const directionBadge = (() => {
          if (f.direction === "positive") return { symbol: "▲", color: C.green,  label: "positive" };
          if (f.direction === "negative") return { symbol: "▼", color: C.red,    label: "negative" };
          return                                 { symbol: "◆", color: C.muted,  label: "unknown"  };
        })();

        return (
          <motion.div
            key={f.feature}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07 }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: C.text, fontSize: 12, fontFamily: "monospace", fontWeight: 600 }}>{f.feature}</span>
                <span style={{
                  fontSize: 10, padding: "1px 8px", borderRadius: 12, fontFamily: "monospace",
                  background: `${directionBadge.color}20`,
                  color: directionBadge.color,
                }}>
                  {directionBadge.symbol} {directionBadge.label}
                </span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: c }}>{pct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 6 }}>
              <motion.div
                style={{ height: "100%", borderRadius: 4, background: c }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.9, delay: i * 0.1 }}
              />
            </div>
            <p style={{ color: C.muted, fontSize: 11 }}>{f.description}</p>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MAIN EXPORT
══════════════════════════════════════════════════ */
export default function Step5Charts({ agentResult, shapData, shapLoading }) {
  const [tab, setTab] = useState("overview");

  const decision   = agentResult?.decisionResult;
  const realKPIs   = decision?.realDatasetKPIs;
  const projected  = decision?.recommendation?.projectedMetrics ?? agentResult?.recommendation?.projectedMetrics;
  const ranked     = decision?.rankedStrategies ?? [];
  const pklScores  = decision?.perStrategyMlScores ?? {};
  const mlAcc      = decision?.mlAccuracy ?? agentResult?.mlAccuracy;
  const pklUsed    = decision?.pklScoringUsed;
  const whatIf     = decision?.recommendation?.whatIfTable ?? agentResult?.simulationResult?.whatIfTable ?? [];
  const aiInsight  = decision?.recommendation?.aiInsight;
  const topStrat   = decision?.recommendation?.strategyName;
  const confidence = decision?.recommendation?.confidence;
  const improvement= decision?.recommendation?.improvement;
  /* NEW: pass simulation_result for affinities/weights display */
  const simResult  = agentResult?.simulationResult;

  if (!realKPIs && !ranked.length) return null;

  const tabs = [
    { key: "overview",    label: "📊 Overview"       },
    { key: "whatif",      label: "🔮 What-If"        },
    { key: "radar",       label: "🕸 Radar"           },
    { key: "intelligence",label: "🧠 Intelligence"   },
  ];

  return (
    <div style={{ marginTop: 40, paddingBottom: 40 }}>

      {/* Section divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,rgba(124,92,255,0.5),transparent)" }} />
        <span style={{ color: C.muted, fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.2em", whiteSpace: "nowrap" }}>
          Decision Analytics · v13.4 Pipeline
        </span>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,transparent,rgba(124,92,255,0.5))" }} />
      </div>

      {/* Meta badges */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {mlAcc && (
          <span style={{ fontSize: 10, fontFamily: "monospace", color: C.cyan, background: `${C.cyan}12`, border: `1px solid ${C.cyan}30`, padding: "4px 10px", borderRadius: 20 }}>
            ML Ensemble: {r(mlAcc, 1)}% accuracy
          </span>
        )}
        {pklUsed && (
          <span style={{ fontSize: 10, fontFamily: "monospace", color: C.green, background: `${C.green}12`, border: `1px solid ${C.green}30`, padding: "4px 10px", borderRadius: 20 }}>
            ✓ PKL per-strategy scoring
          </span>
        )}
        {ranked.length > 0 && (
          <span style={{ fontSize: 10, fontFamily: "monospace", color: C.violet, background: `${C.violet}12`, border: `1px solid ${C.violet}30`, padding: "4px 10px", borderRadius: 20 }}>
            {ranked.length} strategies evaluated
          </span>
        )}
        {improvement && (
          <span style={{ fontSize: 10, fontFamily: "monospace", color: C.orange, background: `${C.orange}12`, border: `1px solid ${C.orange}30`, padding: "4px 10px", borderRadius: 20 }}>
            +{r(improvement.conversionLift, 1)}% conv lift projected
          </span>
        )}
        {/* NEW: affinities source top-level badge */}
        {simResult?.affinitiesSource && (
          <span style={{
            fontSize: 10, fontFamily: "monospace",
            color: simResult.affinitiesSource === "dataset" ? C.green : C.muted,
            background: simResult.affinitiesSource === "dataset" ? `${C.green}12` : "rgba(255,255,255,0.05)",
            border: `1px solid ${simResult.affinitiesSource === "dataset" ? `${C.green}30` : "rgba(255,255,255,0.1)"}`,
            padding: "4px 10px", borderRadius: 20,
          }}>
            {simResult.affinitiesSource === "dataset" ? "✓ Real channel/segment affinities" : "Industry-estimate affinities"}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: "8px 18px", borderRadius: 20, fontSize: 11,
              fontFamily: "monospace", cursor: "pointer", border: "1px solid",
              borderColor: tab === key ? `${C.violet}60` : C.border,
              background:  tab === key ? `${C.violet}18` : "transparent",
              color:       tab === key ? C.violet : C.muted,
              transition:  "all 0.2s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {tab === "overview" && (
          <motion.div
            key="overview"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ display: "flex", flexDirection: "column", gap: 24 }}
          >
            {/* 1. KPI Hero */}
            {realKPIs && projected && (
              <KPIHero realKPIs={realKPIs} projected={projected} improvement={improvement} />
            )}
            {/* 2. AI Insight — NEW: passes simulationResult */}
            {(aiInsight || topStrat) && (
              <AIInsightCard
                aiInsight={aiInsight}
                topStrategy={topStrat}
                confidence={confidence}
                pklScoringUsed={pklUsed}
                mlAccuracy={mlAcc}
                simulationResult={simResult}
              />
            )}
            {/* 3. Improvement pills */}
            {realKPIs && projected && (
              <ImprovementPanel realKPIs={realKPIs} projected={projected} />
            )}
            {/* 4. KPI comparison bars */}
            {realKPIs && projected && (
              <KPIComparisonChart realKPIs={realKPIs} projected={projected} />
            )}
            {/* 5. Strategy ranking */}
            {ranked.length > 0 && (
              <StrategyRankingChart rankedStrategies={ranked} perStrategyMlScores={pklScores} />
            )}
            {/* 6. SHAP / Feature importance (if passed from parent) */}
            {(shapData || shapLoading) && (
              <Card accent={C.pink}>
                <SectionHeader icon={FiTarget} color={C.pink} label="Explainable AI — Feature Importance" badge={shapData?.fallback ? "Importance Mode" : "SHAP"} />
                <SHAPPanel shapData={shapData} shapLoading={shapLoading} />
              </Card>
            )}
          </motion.div>
        )}

        {tab === "whatif" && (
          <motion.div
            key="whatif"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {whatIf?.length > 0 ? (
              <WhatIfTable whatIfTable={whatIf} realConv={realKPIs?.conversionRate} />
            ) : (
              <Card>
                <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 13 }}>
                  What-if simulation data not available for this run
                </div>
              </Card>
            )}
          </motion.div>
        )}

        {tab === "radar" && (
          <motion.div
            key="radar"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {realKPIs && projected ? (
              <KPIRadarChart realKPIs={realKPIs} projected={projected} />
            ) : (
              <Card>
                <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 13 }}>
                  No KPI data available for radar chart
                </div>
              </Card>
            )}
          </motion.div>
        )}

        {tab === "intelligence" && (
          <motion.div
            key="intelligence"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <IntelligencePanel agentResult={agentResult} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}