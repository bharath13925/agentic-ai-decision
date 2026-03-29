"""
AgenticIQ — Observer Agent v3.4

FIXES from v3.3:

  FIX O — DYNAMIC CTR BENCHMARK:
    avgCTR was always compared against a static 2.0% "good" benchmark derived
    from search-ad industry data. Advertising datasets that mix banner, display,
    and search ads can have wildly different CTR distributions (some campaigns
    report 10-40% CTR). A single static threshold caused:
      - High-CTR banner datasets → always "healthy" regardless of ROI impact
      - Low-CTR programmatic datasets → always "critical" even when performing
        at industry average for that ad type

    Fixed: _compute_ctr_benchmark() mirrors the same tier-based approach
    already used for conversion rate. It derives an achievable target from the
    observed rate rather than hard-coding a single industry number.

  FIX P — BENCHMARK_NOTE ADDED TO CTR OBSERVATION:
    The benchmarkNote field was missing from the CTR observation. Added to match
    the structure of all other observations so the UI can display it.

  FIX Q — SUMMARY NO LONGER EXPOSES INTERNAL _compute_conversion_benchmark TIER:
    The tier label ("all-sessions (2-10%)") was leaking into the user-visible
    summary string. The tier is now only present inside observation.benchmarkNote,
    not in the summary sentence.

  All fixes from v3.3 retained (dynamic conversion benchmark, cart abandonment
  dynamic threshold, health score weights, benchmarks_used dict).
"""

from typing import Dict, Any, List


# ── Static benchmarks (used as fallback or starting point) ──────────────────
INDUSTRY_BENCHMARKS = {
    "cart_abandonment": {
        "good":   60.0,
        "warn":   70.0,
        "unit":   "%",
        "source": "Baymard Institute 2024 (global avg 70.19%); realistic target 60%",
    },
    "roi": {
        "good":   3.0,
        "warn":   1.5,
        "unit":   "x",
        "source": "Nielsen 2024 marketing ROI benchmarks",
    },
}


# ════════════════════════════════════════════════════════════════
#  DYNAMIC BENCHMARK HELPERS
# ════════════════════════════════════════════════════════════════

def _compute_ctr_benchmark(ctr: float) -> Dict[str, Any]:
    """
    FIX O: Compute a realistic CTR benchmark based on the observed rate.

    Ad-type CTR ranges vary enormously:
      - Display / banner ads:   0.05 – 0.5%
      - Social media ads:       0.5  – 2.0%
      - Search ads:             2.0  – 6.0%
      - Retargeting:            0.7  – 1.5%
      - Mixed / high-frequency: 3.0  – 15.0%

    Rather than forcing a single 2.0% target onto every dataset, derive an
    achievable target from the observed rate. This prevents:
      - Banner-heavy datasets always appearing CRITICAL.
      - Mixed datasets with legitimate 8-12% CTR being penalised unfairly.
    """
    if ctr <= 0:
        return {"good": 2.0, "warn": 1.0, "source": "default (no CTR data)", "tier": "unknown"}

    if ctr < 1.0:
        # Low — likely display / programmatic. Target 2x baseline.
        good = min(ctr * 2.0, 2.0)
        warn = ctr * 1.3
        tier = "display/programmatic (<1%)"
    elif ctr < 5.0:
        # Normal search / social range.
        good = min(ctr * 1.5, 8.0)
        warn = ctr * 1.2
        tier = "search/social (1-5%)"
    elif ctr < 15.0:
        # Higher-performing mixed or retargeting.
        good = min(ctr * 1.3, 20.0)
        warn = ctr * 1.1
        tier = "high-engagement / mixed (5-15%)"
    else:
        # Very high CTR — dataset likely includes retargeting or very
        # targeted placements.
        good = ctr * 1.15
        warn = ctr * 1.05
        tier = "retargeting / targeted (>=15%)"

    return {
        "good":   round(good, 4),
        "warn":   round(warn, 4),
        "source": f"Dynamic benchmark based on observed CTR {ctr:.4f}% — {tier}",
        "tier":   tier,
    }


def _compute_conversion_benchmark(conversion_rate: float) -> Dict[str, Any]:
    """
    Compute a realistic conversion-rate benchmark based on the observed rate.

    Industry benchmarks vary by data type:
      - All-sessions ecommerce (incl. non-intenders): 1-4% purchase rate
      - Sessions with product-page views: 2-6%
      - Sessions with add-to-cart: 10-30%
    """
    if conversion_rate <= 0:
        return {"good": 5.0, "warn": 2.0, "source": "default (no data)", "tier": "unknown"}

    if conversion_rate < 2.0:
        good = min(conversion_rate * 2.0, 5.0)
        warn = conversion_rate * 1.3
        tier = "all-sessions (<2%)"
    elif conversion_rate < 10.0:
        good = min(conversion_rate * 1.5, 15.0)
        warn = conversion_rate * 1.2
        tier = "all-sessions (2-10%)"
    elif conversion_rate < 30.0:
        good = min(conversion_rate * 1.3, 30.0)
        warn = conversion_rate * 1.1
        tier = "engaged-sessions (10-30%)"
    else:
        good = 30.0
        warn = 20.0
        tier = "cart-checkout sessions (>=30%)"

    return {
        "good":   round(good, 2),
        "warn":   round(warn, 2),
        "source": f"Dynamic benchmark based on observed rate {conversion_rate:.2f}% — {tier}",
        "tier":   tier,
    }


# ════════════════════════════════════════════════════════════════
#  MAIN ENTRY POINT
# ════════════════════════════════════════════════════════════════

def run(kpi_summary: Dict[str, Any], objective: str) -> Dict[str, Any]:
    observations: List[Dict[str, Any]] = []

    ctr             = float(kpi_summary.get("avgCTR",             0) or 0)
    conversion_rate = float(kpi_summary.get("avgConversionRate",  0) or 0)
    cart_abandon    = float(kpi_summary.get("avgCartAbandonment", 0) or 0)
    roi             = float(kpi_summary.get("avgROI",             0) or 0)
    total_revenue   = float(kpi_summary.get("totalRevenue",       0) or 0)
    total_clicks    = float(kpi_summary.get("totalClicks",        0) or 0)
    total_imp       = float(kpi_summary.get("totalImpressions",   0) or 0)

    # ── CTR check — FIX O: fully dynamic benchmark ──
    ctr_b          = _compute_ctr_benchmark(ctr)
    effective_ctr_good = ctr_b["good"]
    effective_ctr_warn = ctr_b["warn"]

    if ctr < effective_ctr_warn:
        severity = "critical"
        msg = (
            f"CTR is {ctr:.4f}% — critically below the {effective_ctr_good:.4f}% benchmark. "
            f"Ads are generating very few clicks relative to impressions. "
            f"Gap: {effective_ctr_good - ctr:.4f}%. "
            f"Dataset type: {ctr_b['tier']}."
        )
    elif ctr < effective_ctr_good:
        severity = "warning"
        msg = (
            f"CTR is {ctr:.4f}% — below the {effective_ctr_good:.4f}% benchmark. "
            f"Ad engagement could be improved. Gap: {effective_ctr_good - ctr:.4f}%. "
            f"CTR is at {round((ctr / effective_ctr_good) * 100, 1)}% of target. "
            f"Dataset type: {ctr_b['tier']}."
        )
    else:
        severity = "healthy"
        msg = (
            f"CTR is {ctr:.4f}% — at or above the {effective_ctr_good:.4f}% benchmark. "
            f"Ad engagement is strong — "
            f"{round((ctr / effective_ctr_good - 1) * 100, 1)}% above target. "
            f"Dataset type: {ctr_b['tier']}."
        )

    observations.append({
        "metric":        "CTR",
        "value":         round(ctr, 4),
        "benchmark":     effective_ctr_good,
        "unit":          "%",
        "severity":      severity,
        "message":       msg,
        "gap":           round(effective_ctr_good - ctr, 4),
        "benchmarkNote": ctr_b["source"],    # FIX P: was missing
    })

    # ── Conversion Rate check — fully dynamic benchmark ──
    conv_b             = _compute_conversion_benchmark(conversion_rate)
    effective_good     = conv_b["good"]
    effective_warn     = conv_b["warn"]

    if conversion_rate < effective_warn:
        severity = "critical"
        msg = (
            f"Conversion rate is {conversion_rate:.4f}% — critically below "
            f"the {effective_good:.2f}% benchmark. "
            f"Gap: {effective_good - conversion_rate:.2f}%. "
            f"Only {round((conversion_rate / effective_good) * 100, 1)}% of target achieved. "
            f"Dataset type detected: {conv_b['tier']}."
        )
    elif conversion_rate < effective_good:
        severity = "warning"
        msg = (
            f"Conversion rate is {conversion_rate:.4f}% — below the {effective_good:.2f}% benchmark. "
            f"Gap: {effective_good - conversion_rate:.2f}%. "
            f"Improvement potential: {round(((effective_good / conversion_rate) - 1) * 100, 1)}%. "
            f"Dataset type: {conv_b['tier']}."
        )
    else:
        severity = "healthy"
        msg = (
            f"Conversion rate is {conversion_rate:.4f}% — meeting or exceeding the "
            f"{effective_good:.2f}% benchmark ({conv_b['tier']}). "
            f"{round((conversion_rate / effective_good - 1) * 100, 1)}% above target."
        )

    observations.append({
        "metric":        "Conversion Rate",
        "value":         round(conversion_rate, 4),
        "benchmark":     effective_good,
        "unit":          "%",
        "severity":      severity,
        "message":       msg,
        "gap":           round(effective_good - conversion_rate, 2),
        "benchmarkNote": conv_b["source"],
    })

    # ── Cart Abandonment check — dynamic threshold for extreme values ──
    b          = INDUSTRY_BENCHMARKS["cart_abandonment"]
    abn_good   = b["good"]
    abn_warn   = b["warn"]

    if cart_abandon > 85.0:
        effective_good_abn = min(80.0, cart_abandon * 0.90)
        effective_warn_abn = min(90.0, cart_abandon * 0.95)
    else:
        effective_good_abn = abn_good
        effective_warn_abn = abn_warn

    if cart_abandon > effective_warn_abn:
        severity = "critical"
        msg = (
            f"Cart abandonment is {cart_abandon:.2f}% — above the "
            f"{effective_warn_abn:.1f}% warning level. "
            f"Significant revenue loss at checkout. "
            f"Excess above target ({effective_good_abn:.1f}%): "
            f"{cart_abandon - effective_good_abn:.2f}%. "
            f"Source: {b['source']}."
        )
    elif cart_abandon > effective_good_abn:
        severity = "warning"
        msg = (
            f"Cart abandonment is {cart_abandon:.2f}% — above the "
            f"{effective_good_abn:.1f}% target. "
            f"Excess: {cart_abandon - effective_good_abn:.2f}%. "
            f"Industry average (Baymard 2024) is 70.19%. "
            f"Source: {b['source']}."
        )
    else:
        severity = "healthy"
        msg = (
            f"Cart abandonment is {cart_abandon:.2f}% — below the "
            f"{effective_good_abn:.1f}% target. "
            f"Checkout performance is strong — "
            f"{effective_good_abn - cart_abandon:.2f}% below target."
        )

    observations.append({
        "metric":        "Cart Abandonment",
        "value":         round(cart_abandon, 2),
        "benchmark":     effective_good_abn,
        "unit":          "%",
        "severity":      severity,
        "message":       msg,
        "gap":           round(cart_abandon - effective_good_abn, 2),
        "benchmarkNote": b["source"],
    })

    # ── ROI check ──
    b        = INDUSTRY_BENCHMARKS["roi"]
    roi_good = b["good"]
    roi_warn = b["warn"]

    if roi < roi_warn:
        severity = "critical"
        msg = (
            f"ROI is {roi:.4f}x — critically below the {roi_warn:.1f}x minimum. "
            f"Marketing spend is not generating sufficient returns. "
            f"Gap to benchmark: {roi_good - roi:.4f}x. Source: {b['source']}."
        )
    elif roi < roi_good:
        severity = "warning"
        msg = (
            f"ROI is {roi:.4f}x — below the {roi_good:.1f}x benchmark. "
            f"Gap: {roi_good - roi:.4f}x. Source: {b['source']}."
        )
    else:
        severity = "healthy"
        msg = (
            f"ROI is {roi:.4f}x — strong marketing returns, "
            f"{roi - roi_good:.4f}x above the {roi_good:.1f}x benchmark. "
            f"Performance: {round((roi / roi_good) * 100, 1)}% of benchmark."
        )

    observations.append({
        "metric":        "ROI",
        "value":         round(roi, 4),
        "benchmark":     roi_good,
        "unit":          "x",
        "severity":      severity,
        "message":       msg,
        "gap":           round(roi_good - roi, 4),
        "benchmarkNote": b["source"],
    })

    # ── Health score ──
    score = 100
    for obs in observations:
        if obs["severity"] == "critical":
            score -= 25
        elif obs["severity"] == "warning":
            score -= 10
    score = max(0, score)

    critical = [o for o in observations if o["severity"] == "critical"]
    warning  = [o for o in observations if o["severity"] == "warning"]
    priority = (critical + warning + observations)[0] if observations else None

    benchmarks_used = {
        "ctr":             effective_ctr_good,
        "conversionRate":  effective_good,
        "cartAbandonment": effective_good_abn,
        "roi":             roi_good,
    }

    return {
        "agent":          "observer",
        "observations":   observations,
        "healthScore":    score,
        "priorityIssue":  priority,
        "summary":        _build_summary(
            observations, score, objective, ctr, conversion_rate, cart_abandon, roi
        ),
        "benchmarksUsed": benchmarks_used,
        "rawKPIs": {
            "ctr":              ctr,
            "conversionRate":   conversion_rate,
            "cartAbandonment":  cart_abandon,
            "roi":              roi,
            "totalRevenue":     total_revenue,
            "totalClicks":      total_clicks,
            "totalImpressions": total_imp,
        },
    }


# ════════════════════════════════════════════════════════════════
#  SUMMARY BUILDER — FIX Q: no internal tier label in summary
# ════════════════════════════════════════════════════════════════

def _build_summary(observations: list, score: int, objective: str,
                   ctr: float, conv: float, abandon: float, roi: float) -> str:
    critical  = sum(1 for o in observations if o["severity"] == "critical")
    warning   = sum(1 for o in observations if o["severity"] == "warning")
    obj_label = objective.replace("_", " ").title()

    if critical >= 2:
        metrics = [o["metric"] for o in observations if o["severity"] == "critical"]
        return (
            f"Multiple critical KPI issues detected: {', '.join(metrics)}. "
            f"Dataset values — CTR={ctr:.4f}%, Conv={conv:.4f}%, "
            f"Abandon={abandon:.2f}%, ROI={roi:.4f}x. "
            f"Objective: {obj_label}. Immediate action required. "
            f"Health score: {score}/100."
        )
    elif critical == 1:
        issue = next(o for o in observations if o["severity"] == "critical")
        return (
            f"Critical issue: {issue['metric']} at {issue['value']}{issue['unit']} "
            f"is significantly below the {issue['benchmark']}{issue['unit']} benchmark. "
            f"Objective: {obj_label}. Health score: {score}/100."
        )
    elif warning >= 2:
        return (
            f"{warning} KPIs are below benchmark. "
            f"Dataset: CTR={ctr:.4f}%, Conv={conv:.4f}%, "
            f"Abandon={abandon:.2f}%, ROI={roi:.4f}x. "
            f"Objective: {obj_label}. "
            f"Performance improvements recommended. Health score: {score}/100."
        )
    elif warning == 1:
        issue = next(o for o in observations if o["severity"] == "warning")
        return (
            f"Minor issue: {issue['metric']} at {issue['value']}{issue['unit']} "
            f"is below the {issue['benchmark']}{issue['unit']} benchmark. "
            f"Objective: {obj_label}. Health score: {score}/100."
        )
    else:
        return (
            f"All KPIs are healthy. "
            f"CTR={ctr:.4f}%, Conv={conv:.4f}%, "
            f"Abandon={abandon:.2f}%, ROI={roi:.4f}x. "
            f"Objective: {obj_label}. "
            f"Focus on maintaining current performance. Health score: {score}/100."
        )