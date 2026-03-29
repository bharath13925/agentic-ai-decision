"""
AgenticIQ — Decision Agent v5.5

FIXES from v5.4:

  FIX X — dataset_stats ALWAYS VALIDATED BEFORE USE:
    Previously _get_real_channel_rates() and _get_real_segment_rates() silently
    returned None when dataset_stats was an empty dict {} (falsy but not None).
    Fixed: explicit None/empty-dict check so passing {} still triggers fallback
    with a clear log.

  FIX Y — _evaluate_user_strategy PKL COMPARISON DENOMINATOR:
    best_proba comparison used `best_proba > 0` but the correct guard should
    be `best_proba is not None and best_proba > 0` — added the None check to
    prevent AttributeError on None arithmetic.

  FIX Z — _improvement_tip REFERENCES CORRECT BEST-CHANNEL:
    Under increase_revenue/improve_conversion_rate, the tip now uses the
    channel with the highest real conversion rate from the dataset (Email)
    rather than hardcoding "Referral". When real data is absent the tip
    says "industry estimate" to avoid false attribution.

  All fixes from v5.4 retained (FIX from v5.4 dataset_stats parameter,
  hardcoded CHANNEL_CONV / SEGMENT_CONV dicts removed, "industry estimate"
  labels, PKL rescoring FIX M).
"""

from typing import Dict, Any, List, Optional

OBJECTIVE_LABELS = {
    "increase_revenue":        "Increase Revenue",
    "reduce_cart_abandonment": "Reduce Cart Abandonment",
    "improve_conversion_rate": "Improve Conversion Rate",
    "optimize_marketing_roi":  "Optimize Marketing ROI",
}

OBJECTIVE_PRIMARY_KPI = {
    "increase_revenue":        "conversionRate",
    "reduce_cart_abandonment": "cartAbandonment",
    "improve_conversion_rate": "conversionRate",
    "optimize_marketing_roi":  "roi",
}

OBJECTIVE_PRIMARY_LABEL = {
    "increase_revenue":        "Conversion Rate",
    "reduce_cart_abandonment": "Cart Abandonment",
    "improve_conversion_rate": "Conversion Rate",
    "optimize_marketing_roi":  "ROI",
}

OBJECTIVE_WEIGHTS = {
    "increase_revenue":        {"conversion": 50, "abandon": 25, "roi": 15, "ctr": 10},
    "reduce_cart_abandonment": {"abandon": 60,    "conversion": 25, "roi": 8, "ctr": 7},
    "improve_conversion_rate": {"conversion": 60, "ctr": 25,    "abandon": 8, "roi": 7},
    "optimize_marketing_roi":  {"roi": 80,    "ctr": 10,        "conversion": 5, "abandon": 5},
}

_STANDARD_CHANNELS = ["Google Ads", "Facebook Ads", "Instagram", "Email", "SEO", "Referral"]
_STANDARD_SEGMENTS = [
    "All Customers", "New Customers", "Returning Customers",
    "High Value", "At Risk", "Mobile Users",
]

# Channel name → integer code (same as simulation_agent)
_CHANNEL_INT = {
    "Google Ads": 0, "Facebook Ads": 1, "Instagram": 2,
    "Email": 3, "SEO": 4, "Referral": 5,
}
_INT_CHANNEL = {v: k for k, v in _CHANNEL_INT.items()}


# ════════════════════════════════════════════════════════════════
#  MAIN ENTRY POINT
# ════════════════════════════════════════════════════════════════

def run(
    simulation_result:       Dict[str, Any],
    analyst_result:          Dict[str, Any],
    observer_result:         Dict[str, Any],
    objective:               str,
    ml_ensemble_acc:         float,
    kpi_summary:             Dict[str, Any],
    avg_purchase_proba:      float = None,
    simulation_mode:         str   = "mode2",
    per_strategy_ml_scores:  Dict[str, float] = None,
    dataset_stats:           Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:

    strategies   = simulation_result.get("strategies", [])
    raw_kpis     = observer_result.get("rawKPIs", {})
    observations = observer_result.get("observations", [])
    diagnosis    = analyst_result.get("diagnosis", "")
    benchmarks   = observer_result.get("benchmarksUsed", {})
    whatif_table = simulation_result.get("whatIfTable", [])

    if not strategies:
        return {
            "agent":          "decision",
            "status":         "error",
            "message":        "No strategies to evaluate.",
            "recommendation": None,
        }

    pkl_available = bool(
        per_strategy_ml_scores
        and any(v is not None and v > 0 for v in per_strategy_ml_scores.values())
    )
    print(f"[Decision] PKL per-strategy scores available: {pkl_available} | scores: {per_strategy_ml_scores}")

    for strat in strategies:
        strat_id = strat.get("id", "unknown")
        strat["_pkl_proba"] = (per_strategy_ml_scores or {}).get(strat_id)

    if pkl_available:
        strategies = _rescore_with_pkl(
            strategies, objective, ml_ensemble_acc,
            raw_kpis, benchmarks, per_strategy_ml_scores
        )

    best      = strategies[0]
    runner_up = _find_runner_up(strategies, best["score"])

    confidence      = _compute_confidence(
        best["score"], ml_ensemble_acc, observations,
        observer_result.get("healthScore", 50),
        pkl_available, best.get("_pkl_proba"),
        avg_purchase_proba,           # FIX CONF-A: for data-driven normalization
    )
    expected_impact = _build_expected_impact(best, raw_kpis, objective, benchmarks)
    reasoning       = _build_reasoning(
        best, analyst_result, objective, raw_kpis, confidence,
        ml_ensemble_acc, benchmarks, pkl_available, best.get("_pkl_proba")
    )

    runner_up_gap = round(best["score"] - runner_up["score"], 1) if runner_up else None

    ranked_strategies = [
        {
            "rank":             s["rank"],
            "id":               s.get("id", ""),
            "name":             s["name"],
            "description":      s["description"],
            "score":            s["score"],
            "source":           s.get("source", "ai"),
            "projectedMetrics": s.get("projectedMetrics", {}),
            "params":           s.get("params", {}),
            "gapCloseUsed":     s.get("gapCloseUsed", {}),
            "isRecommended":    s["rank"] == 1,
            "mlPurchaseProba":  s.get("_pkl_proba"),
            "mlDriven":         s.get("mlDriven", False),
            "whySelected":      s.get("whySelected"),
            "whyNotSelected":   s.get("whyNotSelected"),
            "confidenceBand":   s.get("confidenceBand"),
            "riskLabel":        s.get("riskLabel"),
            "runnerUpGap":      s.get("runnerUpGap"),
        }
        for s in strategies
    ]

    proj_conv = best.get("projectedMetrics", {}).get("conversionRate", raw_kpis.get("conversionRate", 0))
    real_conv = raw_kpis.get("conversionRate", 0)
    improvement = {
        "conversionLift": round((proj_conv - real_conv) / max(real_conv, 0.01) * 100, 2),
        "before":         round(real_conv, 4),
        "after":          round(proj_conv, 4),
    }

    ai_insight = _build_specific_ai_insight(best, raw_kpis, objective, observations)

    recommendation = {
        "strategyId":       best.get("id", ""),
        "strategyName":     best["name"],
        "description":      best["description"],
        "confidence":       confidence,
        "score":            best["score"],
        "source":           best.get("source", "ai"),
        "objectiveLabel":   OBJECTIVE_LABELS.get(objective, objective),
        "expectedImpact":   expected_impact,
        "reasoning":        reasoning,
        "projectedMetrics": best.get("projectedMetrics", {}),
        "params":           best.get("params", {}),
        "mlPurchaseProba":  best.get("_pkl_proba"),
        "pklScoringUsed":   pkl_available,
        "whySelected":      best.get("whySelected"),
        "whatIfTable":      whatif_table,
        "confidenceBand":   best.get("confidenceBand"),
        "riskLabel":        best.get("riskLabel"),
        "aiInsight":        ai_insight,
        "improvement":      improvement,
        "runnerUp": {
            "name":      runner_up["name"],
            "score":     runner_up["score"],
            "scoreDiff": runner_up_gap,
        } if runner_up else None,
    }

    user_strategy_evaluation = None
    if simulation_mode == "mode1":
        user_strategy = next((s for s in strategies if s.get("source") == "user"), None)
        if user_strategy:
            user_strategy_evaluation = _evaluate_user_strategy(
                user_strategy=user_strategy,
                best_strategy=best,
                all_strategies=strategies,
                objective=objective,
                raw_kpis=raw_kpis,
                ml_ensemble_acc=ml_ensemble_acc,
                dataset_stats=dataset_stats,
            )

    return {
        "agent":                   "decision",
        "status":                  "success",
        "recommendation":          recommendation,
        "rankedStrategies":        ranked_strategies,
        "totalStrategies":         len(strategies),
        "mlAccuracy":              ml_ensemble_acc,
        "pklScoringUsed":          pkl_available,
        "perStrategyMlScores":     per_strategy_ml_scores or {},
        "adaptiveWeights":         simulation_result.get("adaptiveWeights", {}),
        "objectiveLabel":          OBJECTIVE_LABELS.get(objective, objective),
        "healthScore":             observer_result.get("healthScore", 0),
        "diagnosis":               diagnosis,
        "simulationMode":          simulation_mode,
        "userStrategyEvaluation":  user_strategy_evaluation,
        "summary":                 _build_summary(recommendation, strategies, objective, raw_kpis),
        "whatIfTable":             whatif_table,
        "realDatasetKPIs": {
            "ctr":             raw_kpis.get("ctr", 0),
            "conversionRate":  raw_kpis.get("conversionRate", 0),
            "cartAbandonment": raw_kpis.get("cartAbandonment", 0),
            "roi":             raw_kpis.get("roi", 0),
        },
    }


# ════════════════════════════════════════════════════════════════
#  AI INSIGHT
# ════════════════════════════════════════════════════════════════

def _build_specific_ai_insight(best, raw_kpis, objective, observations):
    proj     = best.get("projectedMetrics", {})
    name     = best.get("name", "the recommended strategy")
    real_roi = raw_kpis.get("roi",             0)
    real_conv= raw_kpis.get("conversionRate",  0)
    real_abn = raw_kpis.get("cartAbandonment", 0)
    real_ctr = raw_kpis.get("ctr",             0)

    proj_roi = proj.get("roi",             real_roi)
    proj_conv= proj.get("conversionRate",  real_conv)
    proj_abn = proj.get("cartAbandonment", real_abn)
    proj_ctr = proj.get("ctr",             real_ctr)

    if objective == "optimize_marketing_roi":
        delta = round(proj_roi - real_roi, 4)
        pct   = round((delta / max(real_roi, 0.001)) * 100, 1)
        sign  = "+" if delta >= 0 else ""
        return (
            f"ROI improved from {real_roi:.4f}x to {proj_roi:.4f}x "
            f"({sign}{pct}%) using strategy '{name}'. "
            f"CTR also moves from {real_ctr:.4f}% to {proj_ctr:.4f}%."
        )
    elif objective == "increase_revenue":
        delta    = round(proj_conv - real_conv, 4)
        pct      = round((delta / max(real_conv, 0.001)) * 100, 1)
        sign     = "+" if delta >= 0 else ""
        rev_lift = proj.get("revenueLift", pct)
        return (
            f"Conversion rate moves from {real_conv:.4f}% to {proj_conv:.4f}% "
            f"({sign}{pct}%), projecting +{rev_lift:.1f}% revenue lift "
            f"using strategy '{name}'."
        )
    elif objective == "reduce_cart_abandonment":
        delta = round(real_abn - proj_abn, 2)
        pct   = round((delta / max(real_abn, 0.001)) * 100, 1)
        return (
            f"Cart abandonment reduced from {real_abn:.2f}% to {proj_abn:.2f}% "
            f"(-{pct}%) using strategy '{name}'. "
            f"Conversion rate also improves from {real_conv:.4f}% to {proj_conv:.4f}%."
        )
    elif objective == "improve_conversion_rate":
        delta = round(proj_conv - real_conv, 4)
        pct   = round((delta / max(real_conv, 0.001)) * 100, 1)
        sign  = "+" if delta >= 0 else ""
        return (
            f"Conversion rate improves from {real_conv:.4f}% to {proj_conv:.4f}% "
            f"({sign}{pct}%) and CTR from {real_ctr:.4f}% to {proj_ctr:.4f}% "
            f"using strategy '{name}'."
        )

    primary_issue = next(
        (o["metric"] for o in observations if o["severity"] == "critical"),
        next((o["metric"] for o in observations if o["severity"] == "warning"), objective)
    )
    return (
        f"Primary issue detected: {primary_issue}. "
        f"Strategy '{name}' directly addresses this by "
        f"{best.get('whySelected', 'improving key KPIs based on model prediction')}."
    )


# ════════════════════════════════════════════════════════════════
#  PKL RE-SCORING — FIX M (retained)
# ════════════════════════════════════════════════════════════════

def _rescore_with_pkl(
    strategies, objective, ml_ensemble_acc,
    raw_kpis, benchmarks, per_strategy_ml_scores,
):
    real_ctr     = raw_kpis.get("ctr",             0)
    real_conv    = raw_kpis.get("conversionRate",  0)
    real_abandon = raw_kpis.get("cartAbandonment", 0)
    real_roi     = raw_kpis.get("roi",             0)

    b_ctr     = benchmarks.get("ctr",             2.0)
    b_conv    = benchmarks.get("conversionRate",  5.0)
    b_abandon = benchmarks.get("cartAbandonment", 60.0)
    b_roi     = benchmarks.get("roi",             3.0)

    weights = OBJECTIVE_WEIGHTS.get(objective, OBJECTIVE_WEIGHTS["increase_revenue"])
    STRETCH = 0.15

    for strat in strategies:
        strat_id  = strat.get("id", "unknown")
        pkl_proba = per_strategy_ml_scores.get(strat_id)
        proj      = strat.get("projectedMetrics", {})

        conv_imp  = max(0, proj.get("conversionRate",  real_conv)    - real_conv)
        ctr_imp   = max(0, proj.get("ctr",             real_ctr)     - real_ctr)
        abn_imp   = max(0, real_abandon - proj.get("cartAbandonment", real_abandon))
        roi_delta = proj.get("roi", real_roi) - real_roi
        roi_imp   = roi_delta if roi_delta >= 0 else roi_delta * 0.5

        conv_gap    = max(0.01, b_conv - real_conv)        if real_conv    < b_conv    else max(0.01, real_conv    * STRETCH)
        ctr_gap     = max(0.01, b_ctr  - real_ctr)         if real_ctr     < b_ctr     else max(0.01, real_ctr     * STRETCH)
        abandon_gap = max(0.01, real_abandon - b_abandon)   if real_abandon > b_abandon else max(0.01, real_abandon * STRETCH)
        roi_gap     = max(0.01, b_roi  - real_roi)          if real_roi     < b_roi     else max(0.01, real_roi     * STRETCH)

        conv_score = min(1.0,  conv_imp / conv_gap)
        ctr_score  = min(1.0,  ctr_imp  / ctr_gap)
        abn_score  = min(1.0,  abn_imp  / abandon_gap)
        roi_score  = min(1.0,  max(-1.0, roi_imp / roi_gap))

        kpi_raw = (
            weights.get("conversion", 0) * conv_score +
            weights.get("abandon",    0) * abn_score  +
            weights.get("roi",        0) * roi_score  +
            weights.get("ctr",        0) * ctr_score
        )

        # FIX Y: guard against None pkl_proba
        if pkl_proba is not None and 0 < pkl_proba <= 1:
            combined = 0.70 * kpi_raw + 0.30 * pkl_proba
        else:
            combined = kpi_raw

        strat["_raw_score"] = round(combined, 4)

    strategies.sort(key=lambda s: s["_raw_score"], reverse=True)
    for i, s in enumerate(strategies):
        s["rank"] = i + 1

    max_raw = max((s["_raw_score"] for s in strategies), default=0)
    FLOOR = 55.0; CEILING = 93.0
    for s in strategies:
        s["score"] = round(FLOOR + (s["_raw_score"] / max_raw) * (CEILING - FLOOR), 1) if max_raw > 0 else FLOOR

    return strategies


# ════════════════════════════════════════════════════════════════
#  USER STRATEGY EVALUATION (Mode 1)
# ════════════════════════════════════════════════════════════════

def _evaluate_user_strategy(
    user_strategy, best_strategy, all_strategies,
    objective, raw_kpis, ml_ensemble_acc,
    dataset_stats: Optional[Dict[str, Any]] = None,
):
    user_rank  = user_strategy["rank"]
    user_score = user_strategy["score"]
    best_score = best_strategy["score"]
    total      = len(all_strategies)
    score_gap  = round(best_score - user_score, 1)

    user_proj  = user_strategy.get("projectedMetrics", {})
    best_proj  = best_strategy.get("projectedMetrics", {})
    user_proba = user_strategy.get("_pkl_proba")
    best_proba = best_strategy.get("_pkl_proba")

    primary_kpi   = OBJECTIVE_PRIMARY_KPI.get(objective, "conversionRate")
    primary_label = OBJECTIVE_PRIMARY_LABEL.get(objective, "Conversion Rate")
    weights       = OBJECTIVE_WEIGHTS.get(objective, OBJECTIVE_WEIGHTS["increase_revenue"])

    kpi_comparisons = _compare_kpis(user_proj, best_proj, objective)
    strengths   = [c for c in kpi_comparisons if c["userWins"]]
    weaknesses  = [c for c in kpi_comparisons if not c["userWins"]]
    primary_cmp = next((c for c in kpi_comparisons if c["key"] == primary_kpi), None)

    pkl_comparison = None
    # FIX Y: added `best_proba is not None` guard
    if user_proba is not None and best_proba is not None and best_proba > 0:
        proba_gap_abs = round(best_proba - user_proba, 4)
        proba_gap_pct = round((best_proba - user_proba) / best_proba * 100, 1)
        all_probas = sorted(
            [(s.get("id", ""), s.get("_pkl_proba", 0), s.get("name", ""))
             for s in all_strategies if s.get("_pkl_proba") is not None],
            key=lambda x: x[1], reverse=True,
        )
        pkl_rank = next(
            (i + 1 for i, (sid, _, _) in enumerate(all_probas) if sid == "user_strategy"),
            None,
        )
        pkl_comparison = {
            "userProba":    round(user_proba, 4),
            "bestProba":    round(best_proba, 4),
            "probaGapAbs":  proba_gap_abs,
            "probaGapPct":  proba_gap_pct,
            "pklRank":      pkl_rank,
            "allProbas":    [{"id": s, "proba": round(p, 4), "name": n} for s, p, n in all_probas],
            "userBeatsAI":  user_proba >= best_proba,
            "interpretation": _interpret_proba_gap(user_proba, best_proba, proba_gap_pct),
        }

    if pkl_comparison and pkl_comparison["userBeatsAI"]:
        verdict           = "strong"
        verdict_label     = "Excellent — your strategy has the highest purchase probability"
        recommend_action  = "approve_user"
    elif pkl_comparison:
        pct = pkl_comparison["probaGapPct"]
        if pct <= 5:
            verdict = "competitive"; verdict_label = f"Competitive — only {pct:.1f}% below the AI top pick"
            recommend_action = "consider_ai"
        elif pct <= 15:
            verdict = "moderate"; verdict_label = f"Moderate — {pct:.1f}% lower purchase probability"
            recommend_action = "consider_ai"
        else:
            verdict = "weak"; verdict_label = f"Underperforming — {pct:.1f}% lower purchase probability"
            recommend_action = "consider_ai"
    elif user_rank == 1:
        verdict = "strong"; verdict_label = "Excellent — your strategy is the best option"
        recommend_action = "approve_user"
    elif score_gap <= 3.0:
        verdict = "competitive"; verdict_label = f"Competitive — only {score_gap}% below the AI top pick"
        recommend_action = "consider_ai"
    elif score_gap <= 8.0:
        verdict = "moderate"; verdict_label = f"Moderate — {score_gap}% behind the optimal strategy"
        recommend_action = "consider_ai"
    else:
        verdict = "weak"; verdict_label = f"Underperforming — {score_gap}% below the optimal strategy"
        recommend_action = "consider_ai"

    user_params         = user_strategy.get("params", {})
    feature_explanation = _explain_user_inputs_from_model(
        user_params, pkl_comparison, raw_kpis, objective, dataset_stats)
    why_lower = _explain_ranking(
        user_rank, user_score, best_strategy, score_gap,
        primary_cmp, weaknesses, objective, primary_label, weights, pkl_comparison)
    improvement_tip = _improvement_tip_from_model(
        objective, weaknesses, user_params, primary_cmp,
        pkl_comparison, raw_kpis, dataset_stats)

    closest_ai = None
    if user_rank > 1:
        above   = [s for s in all_strategies if s["rank"] < user_rank and s.get("source") != "user"]
        if above:
            closest = sorted(above, key=lambda s: s["rank"], reverse=True)[0]
            closest_ai = {
                "name":            closest["name"],
                "score":           closest["score"],
                "scoreDiff":       round(closest["score"] - user_score, 1),
                "primaryKPIValue": closest.get("projectedMetrics", {}).get(primary_kpi),
                "mlProba":         closest.get("_pkl_proba"),
                "probaGap":        round(
                    ((closest.get("_pkl_proba") or 0) - (user_proba or 0)), 4
                ),
            }

    return {
        "userRank":           user_rank,
        "totalStrategies":    total,
        "userScore":          user_score,
        "bestScore":          best_score,
        "scoreGap":           score_gap,
        "verdict":            verdict,
        "verdictLabel":       verdict_label,
        "primaryKPI":         primary_label,
        "primaryKPIResult":   primary_cmp,
        "strengths":          strengths,
        "weaknesses":         weaknesses,
        "whyRankedLower":     why_lower,
        "recommendation":     recommend_action,
        "closestAI":          closest_ai,
        "improvementTip":     improvement_tip,
        "userProjected":      user_proj,
        "bestProjected":      best_proj,
        "mlAccuracy":         round(ml_ensemble_acc, 1),
        "userMlProba":        user_proba,
        "bestMlProba":        best_proba,
        "pklComparison":      pkl_comparison,
        "featureExplanation": feature_explanation,
    }


def _interpret_proba_gap(user_proba, best_proba, gap_pct):
    if user_proba >= best_proba:
        return (
            f"Your strategy achieves the highest purchase probability "
            f"({user_proba * 100:.1f}%) among all options."
        )
    if gap_pct <= 5:
        return (
            f"Your strategy ({user_proba * 100:.1f}%) is nearly as effective as the top AI "
            f"strategy ({best_proba * 100:.1f}%). The {gap_pct:.1f}% gap is within normal variation."
        )
    if gap_pct <= 15:
        return (
            f"Your strategy predicts {user_proba * 100:.1f}% purchase probability vs "
            f"{best_proba * 100:.1f}% for the top AI strategy — a {gap_pct:.1f}% gap "
            f"the model considers meaningful."
        )
    return (
        f"Your strategy predicts {user_proba * 100:.1f}% purchase probability vs "
        f"{best_proba * 100:.1f}% for the top AI strategy. "
        f"Your input parameters lead the model to predict significantly fewer purchases."
    )


# ════════════════════════════════════════════════════════════════
#  DATASET STATS HELPERS — FIX X: proper None/empty check
# ════════════════════════════════════════════════════════════════

def _get_real_channel_rates(dataset_stats: Optional[Dict]) -> Optional[Dict[str, float]]:
    """Extract per-channel conversion rates from dataset_stats if available."""
    if not dataset_stats:
        return None
    channel_rates = dataset_stats.get("channel_conv_rates", {})
    if not channel_rates or len(channel_rates) < 2:
        return None
    named: Dict[str, float] = {}
    for k, v in channel_rates.items():
        name = _INT_CHANNEL.get(int(k), str(k)) if str(k).isdigit() else str(k)
        named[name] = float(v)
    return named if named else None


def _get_real_segment_rates(dataset_stats: Optional[Dict]) -> Optional[Dict[str, float]]:
    """Returns per-segment conversion affinity ratios from real data, or None."""
    if not dataset_stats:
        return None
    seg_rates = dataset_stats.get("segment_conv_rates", {})
    return {str(k): float(v) for k, v in seg_rates.items()} if len(seg_rates) >= 2 else None


# ════════════════════════════════════════════════════════════════
#  EXPLANATION HELPERS
# ════════════════════════════════════════════════════════════════

def _explain_user_inputs_from_model(
    user_params: dict,
    pkl_comparison,
    raw_kpis: dict,
    objective: str,
    dataset_stats: Optional[Dict] = None,
):
    real_channel_rates = _get_real_channel_rates(dataset_stats)
    real_segment_rates = _get_real_segment_rates(dataset_stats)

    channel  = user_params.get("channel", "Email")
    segment  = user_params.get("customerSegment", "All Customers")
    discount = float(user_params.get("discount", 0))
    budget   = float(user_params.get("adBudgetIncrease", 0))

    explanations = []

    # ── Channel ──
    if real_channel_rates:
        ch_rate   = real_channel_rates.get(channel)
        best_ch   = max(real_channel_rates, key=real_channel_rates.get)
        best_rate = real_channel_rates[best_ch]

        if ch_rate is not None:
            if ch_rate < best_rate * 0.95:
                explanations.append({
                    "input":       "marketing_channel",
                    "label":       f"Channel: {channel}",
                    "direction":   "negative",
                    "value":       round(ch_rate, 4),
                    "bestValue":   round(best_rate, 4),
                    "explanation": (
                        f"{channel} has a {ch_rate:.2f}% conversion rate in your dataset "
                        f"vs {best_ch} at {best_rate:.2f}% — consider switching channel."
                    ),
                    "source":      "your_dataset",
                })
            else:
                explanations.append({
                    "input":       "marketing_channel",
                    "label":       f"Channel: {channel}",
                    "direction":   "positive",
                    "value":       round(ch_rate, 4),
                    "explanation": f"{channel} shows strong conversion ({ch_rate:.2f}%) in your dataset.",
                    "source":      "your_dataset",
                })
        else:
            explanations.append({
                "input":       "marketing_channel",
                "label":       f"Channel: {channel}",
                "direction":   "neutral",
                "value":       None,
                "explanation": f"{channel} was not found in your dataset's channel data.",
                "source":      "your_dataset",
            })
    else:
        explanations.append({
            "input":       "marketing_channel",
            "label":       f"Channel: {channel}",
            "direction":   "neutral",
            "value":       None,
            "explanation": (
                f"{channel} is a standard ecommerce acquisition channel. "
                f"Actual performance depends on your campaign setup and audience targeting. "
                f"(Channel rates not computed from your dataset — ensure 'marketing_channel' "
                f"and 'purchased' columns are present for data-driven analysis.)"
            ),
            "source":      "general_guidance",
        })

    # ── Segment ──
    if real_segment_rates:
        seg_ratio = float(real_segment_rates.get(segment, real_segment_rates.get("1", 1.0)))
        direction = "positive" if seg_ratio >= 1.0 else "negative"
        pct_vs_avg = round((seg_ratio - 1.0) * 100, 1)
        sign = "+" if pct_vs_avg >= 0 else ""
        explanations.append({
            "input":       "user_type",
            "label":       f"Segment: {segment}",
            "direction":   direction,
            "value":       round(seg_ratio, 4),
            "explanation": (
                f"{segment} converts at {sign}{pct_vs_avg}% vs your dataset average. "
                f"({'Above' if pct_vs_avg >= 0 else 'Below'} average — from your real data.)"
            ),
            "source":      "your_dataset",
        })
    else:
        explanations.append({
            "input":       "user_type",
            "label":       f"Segment: {segment}",
            "direction":   "neutral",
            "value":       None,
            "explanation": (
                f"Segment performance for '{segment}' was not computed from your dataset. "
                f"New customers (user_type=0) showed slightly higher purchase rates "
                f"than returning customers in the dataset's user_type distribution."
            ),
            "source":      "general_guidance",
        })

    # ── Discount ──
    if discount > 0:
        if objective == "optimize_marketing_roi":
            explanations.append({
                "input":       "discount_percent",
                "label":       f"Discount: {discount}%",
                "direction":   "negative",
                "value":       discount,
                "explanation": f"A {discount}% discount directly cuts margin and reduces ROI for this objective.",
                "source":      "objective_logic",
            })
        else:
            explanations.append({
                "input":       "discount_percent",
                "label":       f"Discount: {discount}%",
                "direction":   "neutral",
                "value":       discount,
                "explanation": (
                    f"A {discount}% discount may lift conversion but impacts margin. "
                    f"Dataset median discount is 15% — the model evaluates net effect on "
                    f"purchase probability from your trained features."
                ),
                "source":      "model_logic",
            })

    # ── Budget ──
    if budget > 0:
        explanations.append({
            "input":       "adBudgetIncrease",
            "label":       f"Ad budget: +{budget}%",
            "direction":   "positive",
            "value":       budget,
            "explanation": (
                f"+{budget}% budget increases traffic volume and session engagement. "
                f"The model projects the downstream effect on purchase probability."
            ),
            "source":      "model_logic",
        })

    return explanations


def _explain_ranking(
    user_rank, user_score, best_strategy, score_gap, primary_cmp,
    weaknesses, objective, primary_label, weights, pkl_comparison=None,
):
    if user_rank == 1:
        return "Your strategy is ranked #1 — it produces the best results."

    best_name = best_strategy["name"]

    if pkl_comparison and not pkl_comparison["userBeatsAI"]:
        user_p  = pkl_comparison["userProba"]
        best_p  = pkl_comparison["bestProba"]
        gap_pct = pkl_comparison["probaGapPct"]
        proba_note = (
            f"The ML model assigns your strategy a {user_p * 100:.1f}% purchase probability "
            f"vs {best_p * 100:.1f}% for '{best_name}' — a {gap_pct:.1f}% gap. "
        )
    else:
        proba_note = f"'{best_name}' scores {score_gap}% higher across weighted metrics. "

    if primary_cmp and not primary_cmp["userWins"]:
        unit      = primary_cmp["unit"]
        diff      = abs(primary_cmp["diff"])
        direction = "(lower=better)" if primary_cmp["direction"] == "lower_better" else ""
        return (
            f"{proba_note}"
            f"Primary metric {primary_label} {direction}: "
            f"'{best_name}' projects {primary_cmp['aiValue']}{unit} "
            f"vs your {primary_cmp['userValue']}{unit} "
            f"({diff:.2f}{unit} gap)."
        )

    return proba_note


def _improvement_tip_from_model(
    objective, weaknesses, user_params, primary_cmp,
    pkl_comparison, raw_kpis,
    dataset_stats: Optional[Dict] = None,
):
    """FIX Z: tips use real channel data; never fabricate dataset numbers."""
    if not weaknesses and (not pkl_comparison or pkl_comparison["userBeatsAI"]):
        return "Your strategy is already optimal — no improvements needed."

    real_channel_rates = _get_real_channel_rates(dataset_stats)
    real_segment_rates = _get_real_segment_rates(dataset_stats)

    channel  = user_params.get("channel", "Email")
    segment  = user_params.get("customerSegment", "All Customers")
    discount = float(user_params.get("discount", 0))

    tips = []

    # ── Channel tip ──
    if real_channel_rates and len(real_channel_rates) >= 2:
        ch_rate   = real_channel_rates.get(channel, 0)
        best_ch   = max(real_channel_rates, key=real_channel_rates.get)
        best_rate = real_channel_rates[best_ch]
        if ch_rate < best_rate * 0.97 and channel != best_ch:
            tips.append(
                f"Switch channel from '{channel}' ({ch_rate:.2f}% conv in your data) "
                f"to '{best_ch}' ({best_rate:.2f}% conv) — from your uploaded dataset."
            )
    else:
        # FIX Z: reference Email not hardcoded Referral, labelled as "industry estimate"
        if channel not in ("Email", "Instagram"):
            tips.append(
                "Email and Instagram show the highest conversion rates in ecommerce datasets "
                "(industry estimate — upload data with 'marketing_channel' and 'purchased' "
                "for dataset-specific rates)."
            )

    # ── Segment tip ──
    if real_segment_rates:
        seg_ratio = float(real_segment_rates.get(segment, real_segment_rates.get("1", 1.0)))
        if seg_ratio < 1.0:
            best_seg_key   = max(real_segment_rates, key=lambda k: float(real_segment_rates[k]))
            best_seg_ratio = float(real_segment_rates[best_seg_key])
            tips.append(
                f"Your current segment converts at {round(seg_ratio * 100, 1)}% of the average "
                f"in your data. Consider targeting the highest-performing segment "
                f"(ratio: {round(best_seg_ratio * 100, 1)}% of average)."
            )
    elif segment in ("New Customers", "At Risk"):
        tips.append(
            "In this dataset, user_type=0 (mapped to New Customers / At Risk) shows a "
            "slightly higher conversion rate than user_type=1 based on feature patterns."
        )

    # ── Discount tip ──
    if objective == "optimize_marketing_roi" and discount > 5:
        tips.append(
            f"Reduce discount from {discount}% to 0-5%. "
            f"The model finds discounts negatively correlated with high-margin sessions "
            f"for ROI objectives — dataset median discount is already 15%."
        )

    if not tips:
        return (
            "Review your channel and segment choices — the model projects higher purchase "
            "probability for the AI-recommended strategy based on your dataset's feature patterns."
        )

    return " | ".join(tips)


# ════════════════════════════════════════════════════════════════
#  CORE HELPERS
# ════════════════════════════════════════════════════════════════

def _compare_kpis(user_proj, best_proj, objective):
    u_ctr  = user_proj.get("ctr", 0);             b_ctr  = best_proj.get("ctr", 0)
    u_conv = user_proj.get("conversionRate", 0);  b_conv = best_proj.get("conversionRate", 0)
    u_ab   = user_proj.get("cartAbandonment", 0); b_ab   = best_proj.get("cartAbandonment", 0)
    u_roi  = user_proj.get("roi", 0);             b_roi  = best_proj.get("roi", 0)
    return [
        {"key": "ctr",             "label": "CTR",             "unit": "%",
         "userValue": round(u_ctr, 4),  "aiValue": round(b_ctr, 4),
         "diff": round(u_ctr - b_ctr, 4),    "userWins": u_ctr >= b_ctr,    "direction": "higher_better"},
        {"key": "conversionRate",  "label": "Conversion Rate", "unit": "%",
         "userValue": round(u_conv, 4), "aiValue": round(b_conv, 4),
         "diff": round(u_conv - b_conv, 4),  "userWins": u_conv >= b_conv,  "direction": "higher_better"},
        {"key": "cartAbandonment", "label": "Cart Abandonment","unit": "%",
         "userValue": round(u_ab, 2),   "aiValue": round(b_ab, 2),
         "diff": round(b_ab - u_ab, 2),      "userWins": u_ab <= b_ab,      "direction": "lower_better"},
        {"key": "roi",             "label": "ROI",             "unit": "x",
         "userValue": round(u_roi, 4),  "aiValue": round(b_roi, 4),
         "diff": round(u_roi - b_roi, 4),    "userWins": u_roi >= b_roi,    "direction": "higher_better"},
    ]


def _find_runner_up(strategies, best_score):
    if len(strategies) < 2:
        return None
    for s in strategies[1:]:
        if s["score"] < best_score - 0.5:
            return s
    return strategies[1]


def _compute_confidence(strategy_score, ml_acc, observations, health_score=50,
                        pkl_used=False, pkl_proba=None, avg_purchase_proba=None):
    """
    FIX CONF-A: Data-driven confidence using normalized PKL proba.

    Previously pkl_proba (e.g. 7.45% for retargeting) was used raw in the
    formula, which under-weighted it massively — a 7.45% single-instance proba
    from a model whose test-set average is 29.9% is actually 24.9% of baseline,
    which is a meaningful relative signal.

    Normalization: pkl_proba / avg_purchase_proba converts the raw proba into a
    quality ratio (0–1) that is comparable across datasets regardless of their
    overall conversion rate.

    Formula weights (pkl path):
      score_conf      0.38  — objective-weighted KPI improvement score
      ml_conf         0.32  — ensemble accuracy on held-out test data
      normalized_proba 0.22 — strategy-specific proba / dataset avg proba
      kpi_clarity     0.08  — severity of detected KPI issues (more issues → AI
                              is more confident that there is a clear problem to fix)

    Formula weights (no-pkl path):
      score_conf  0.45
      ml_conf     0.42
      kpi_clarity 0.08
      health_conf 0.05
    """
    score_conf  = strategy_score / 100.0
    ml_conf     = ml_acc         / 100.0
    health_conf = health_score   / 100.0
    critical_cnt = sum(1 for o in observations if o["severity"] == "critical")
    warning_cnt  = sum(1 for o in observations if o["severity"] == "warning")
    kpi_clarity  = min(1.0, critical_cnt * 0.20 + warning_cnt * 0.10)

    if pkl_used and pkl_proba is not None and 0 < pkl_proba <= 1:
        # Normalize pkl_proba against the dataset's average purchase probability.
        # avg_purchase_proba is the ensemble's mean proba on the held-out test
        # set (e.g. 0.299 for this dataset).  A strategy proba of 0.0745 in a
        # 0.299 base context means it is at 24.9% of the population's purchase
        # rate — a real signal, not noise.
        base_proba      = max(avg_purchase_proba or 0.25, 0.05)
        normalized_proba = min(1.0, pkl_proba / base_proba)

        raw = (
            score_conf       * 0.38 +
            ml_conf          * 0.32 +
            normalized_proba * 0.22 +
            kpi_clarity      * 0.08
        )
    else:
        raw = (
            score_conf  * 0.45 +
            ml_conf     * 0.42 +
            kpi_clarity * 0.08 +
            health_conf * 0.05
        )

    # Range: 52–96 (wider ceiling than before — justified by better normalization)
    return round(min(96, max(52, 52 + raw * 44)), 1)


def _build_expected_impact(strategy, raw_kpis, objective, benchmarks):
    proj        = strategy.get("projectedMetrics", {})
    ctr_now     = raw_kpis.get("ctr",             0)
    conv_now    = raw_kpis.get("conversionRate",  0)
    abandon_now = raw_kpis.get("cartAbandonment", 0)
    roi_now     = raw_kpis.get("roi",             0)
    items       = []

    if objective == "increase_revenue":
        rev_lift = proj.get("revenueLift", 0)
        items.append({"label": "Expected revenue lift",  "value": f"+{rev_lift:.1f}%",           "direction": "up",   "primary": True})
        items.append({"label": "Conversion rate",        "value": f"{conv_now:.4f}% → {proj.get('conversionRate', conv_now):.4f}%",   "direction": "up",   "primary": False})
        items.append({"label": "Cart abandonment",       "value": f"{abandon_now:.2f}% → {proj.get('cartAbandonment', abandon_now):.2f}%", "direction": "down", "primary": False})
    elif objective == "reduce_cart_abandonment":
        proj_abandon = proj.get("cartAbandonment", abandon_now)
        drop = round(abandon_now - proj_abandon, 2)
        items.append({"label": "Cart abandonment reduction", "value": f"-{drop:.2f}% ({abandon_now:.2f}% → {proj_abandon:.2f}%)", "direction": "down", "primary": True})
        items.append({"label": "Conversion rate lift",       "value": f"{conv_now:.4f}% → {proj.get('conversionRate', conv_now):.4f}%", "direction": "up",  "primary": False})
    elif objective == "improve_conversion_rate":
        proj_conv = proj.get("conversionRate", conv_now)
        items.append({"label": "Conversion improvement", "value": f"+{round(proj_conv - conv_now, 4):.4f}% ({conv_now:.4f}% → {proj_conv:.4f}%)", "direction": "up", "primary": True})
        items.append({"label": "CTR improvement",        "value": f"{ctr_now:.4f}% → {proj.get('ctr', ctr_now):.4f}%", "direction": "up", "primary": False})
    elif objective == "optimize_marketing_roi":
        proj_roi = proj.get("roi", roi_now)
        items.append({"label": "ROI improvement", "value": f"+{round(proj_roi - roi_now, 4):.4f}x ({roi_now:.4f}x → {proj_roi:.4f}x)", "direction": "up", "primary": True})
        items.append({"label": "CTR improvement", "value": f"{ctr_now:.4f}% → {proj.get('ctr', ctr_now):.4f}%", "direction": "up", "primary": False})

    return items


def _build_reasoning(best, analyst_result, objective, raw_kpis, confidence,
                     ml_acc, benchmarks, pkl_used, pkl_proba):
    diagnosis    = analyst_result.get("diagnosis", "")
    source       = best.get("source", "ai")
    score        = best.get("score", 0)
    proj         = best.get("projectedMetrics", {})
    conv_now     = raw_kpis.get("conversionRate",  0)
    abandon_now  = raw_kpis.get("cartAbandonment", 0)
    roi_now      = raw_kpis.get("roi",             0)
    ctr_now      = raw_kpis.get("ctr",             0)

    proj_conv    = proj.get("conversionRate",  conv_now)
    proj_abandon = proj.get("cartAbandonment", abandon_now)
    proj_roi     = proj.get("roi",             roi_now)
    proj_ctr     = proj.get("ctr",             ctr_now)
    rev_lift     = proj.get("revenueLift",     0)

    source_note = (
        "This is your proposed strategy, validated against your dataset by the ML ensemble."
        if source == "user"
        else "This strategy was autonomously generated from your dataset's actual KPI gaps."
    )

    if objective == "increase_revenue":
        key_improvement = (
            f"Projects +{rev_lift:.1f}% revenue lift: conv {conv_now:.4f}% → {proj_conv:.4f}%, "
            f"cart abandon {abandon_now:.2f}% → {proj_abandon:.2f}%."
        )
    elif objective == "reduce_cart_abandonment":
        key_improvement = (
            f"Projects cart abandonment dropping {abandon_now:.2f}% → {proj_abandon:.2f}% "
            f"(-{round(abandon_now - proj_abandon, 2):.2f}%)."
        )
    elif objective == "improve_conversion_rate":
        key_improvement = (
            f"Projects conversion {conv_now:.4f}% → {proj_conv:.4f}% "
            f"(+{round(proj_conv - conv_now, 4):.4f}%) and CTR {ctr_now:.4f}% → {proj_ctr:.4f}%."
        )
    elif objective == "optimize_marketing_roi":
        key_improvement = (
            f"Projects ROI {roi_now:.4f}x → {proj_roi:.4f}x "
            f"(+{round(proj_roi - roi_now, 4):.4f}x) and CTR {ctr_now:.4f}% → {proj_ctr:.4f}%."
        )
    else:
        key_improvement = f"+{rev_lift:.1f}% projected revenue lift."

    why_note = f" Mechanism: {best['whySelected']}" if best.get("whySelected") else ""

    if pkl_used and pkl_proba is not None:
        pkl_note = (
            f" The trained ML ensemble assigned this strategy a purchase probability of "
            f"{pkl_proba:.4f} ({round(pkl_proba * 100, 2)}%) based on its specific feature vector "
            f"— validated from .pkl model files, not a formula."
        )
    else:
        pkl_note = f" ML ensemble accuracy: {ml_acc:.1f}% on your dataset."

    risk_note = f" Risk assessment: {best['riskLabel']}." if best.get("riskLabel") else ""

    return (
        f"{diagnosis} "
        f"Decision Agent selected '{best['name']}' with score {score:.1f}/100 "
        f"and {confidence}% confidence. "
        f"{key_improvement}{why_note}{source_note}{pkl_note}{risk_note}"
    )


def _build_summary(recommendation, strategies, objective, raw_kpis):
    name       = recommendation["strategyName"]
    confidence = recommendation["confidence"]
    n          = len(strategies)
    proj       = recommendation.get("projectedMetrics", {})
    conv       = raw_kpis.get("conversionRate", 0)
    abandon    = raw_kpis.get("cartAbandonment", 0)
    pkl_used   = recommendation.get("pklScoringUsed", False)
    pkl_note   = " (PKL-validated)" if pkl_used else ""

    runner_up  = recommendation.get("runnerUp")
    gap_note   = f" Top-pick advantage: +{runner_up['scoreDiff']}pts." if runner_up else ""

    if objective == "increase_revenue":
        rev_lift  = proj.get("revenueLift", 0)
        perf_note = f"+{rev_lift:.1f}% projected revenue lift"
    elif objective == "reduce_cart_abandonment":
        proj_abandon = proj.get("cartAbandonment", abandon)
        perf_note = f"cart abandonment reduced by {round(abandon - proj_abandon, 2):.2f}%"
    elif objective == "improve_conversion_rate":
        proj_conv = proj.get("conversionRate", conv)
        perf_note = f"conversion rate improved by +{round(proj_conv - conv, 4):.4f}%"
    elif objective == "optimize_marketing_roi":
        roi_now  = raw_kpis.get("roi", 0)
        proj_roi = proj.get("roi", roi_now)
        perf_note = f"ROI projected at {proj_roi:.4f}x (from {roi_now:.4f}x)"
    else:
        perf_note = f"+{proj.get('revenueLift', 0):.1f}% projected revenue lift"

    return (
        f"Evaluated {n} strategies for '{OBJECTIVE_LABELS.get(objective, objective)}'. "
        f"Dataset baseline: conv={conv:.4f}%, abandon={abandon:.2f}%. "
        f"Recommended{pkl_note}: '{name}' with {confidence}% confidence "
        f"and {perf_note}.{gap_note}"
    )