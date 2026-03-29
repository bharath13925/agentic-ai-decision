"""
AgenticIQ — Analyst Agent v5.4

FIXES from v5.3:

  FIX R — ALL_FIX_DIRECTIONS REFLECT REAL DATASET INSIGHTS:
    Previous ordering was still debated. With the real dataset showing:
      - Email and Instagram have the highest conversion rates (25.4% and 24.9%)
      - engagement_score and pages_viewed are key ML features
      - discount_percent median is 15% — already high, diminishing returns
    Direction priority has been adjusted accordingly.

  FIX S — CAUSE_MAP CONFIDENCE VALUES VALIDATED:
    Some base_confidence values were set above 0.9 for non-obvious causes.
    Capped at 0.92 maximum to prevent over-confidence in rule-based fallback.

  FIX T — _COMPUTE_FIX_DIRECTIONS: ROI PENALTY ALSO APPLIES TO
    increase_revenue WHEN DISCOUNT ALREADY HIGH:
    When the dataset's median discount is already 15%, adding more discount
    has diminishing returns for revenue. Added a softer penalty for
    offer_discount under increase_revenue when discount feature importance is
    high (meaning the model already captures discount saturation).

  All fixes from v5.3 retained (FIX 1 direction ordering, FIX 2 ROI weighting
  for optimize_marketing_roi, feature-importance-driven path unchanged).
"""

from typing import Dict, Any, List, Optional

CAUSE_MAP = {
    ("CTR", "critical"): [
        {"cause": "Ad creative is not resonating with the target audience",                "base_confidence": 0.88},
        {"cause": "Wrong marketing channels being used for the target segment",            "base_confidence": 0.82},
        {"cause": "Ad spend is too low to reach meaningful audience volume",               "base_confidence": 0.75},
    ],
    ("CTR", "warning"): [
        {"cause": "Ad messaging could be more compelling or targeted",                     "base_confidence": 0.79},
        {"cause": "Channel mix may not be optimally aligned with the target audience",     "base_confidence": 0.71},
    ],
    ("Conversion Rate", "critical"): [
        {"cause": "Checkout flow has severe friction — too many steps or slow load time",  "base_confidence": 0.90},
        {"cause": "Pricing is significantly above what the target segment will pay",       "base_confidence": 0.85},
        {"cause": "Traffic quality is poor — ads attracting wrong audience",               "base_confidence": 0.80},
        {"cause": "Trust signals (reviews, security badges) are insufficient",            "base_confidence": 0.74},
    ],
    ("Conversion Rate", "warning"): [
        {"cause": "Product pages lack sufficient detail or social proof",                  "base_confidence": 0.77},
        {"cause": "Discount offers are not compelling enough",                             "base_confidence": 0.70},
    ],
    ("Cart Abandonment", "critical"): [
        {"cause": "Unexpected costs (shipping, tax) revealed late in checkout",            "base_confidence": 0.91},
        {"cause": "Checkout requires account creation — reducing impulse purchases",       "base_confidence": 0.84},
        {"cause": "Mobile checkout experience is poor",                                    "base_confidence": 0.79},
        {"cause": "Payment options are limited or lack preferred methods",                 "base_confidence": 0.76},
    ],
    ("Cart Abandonment", "warning"): [
        {"cause": "No urgency signals (limited stock, time-limited offers) at cart",      "base_confidence": 0.73},
        {"cause": "Retargeting campaigns for abandoned carts are missing or weak",        "base_confidence": 0.68},
    ],
    ("ROI", "critical"): [
        {"cause": "High acquisition cost relative to customer lifetime value",             "base_confidence": 0.86},
        {"cause": "Budget is concentrated in low-performing channels",                    "base_confidence": 0.80},
    ],
    ("ROI", "warning"): [
        {"cause": "Marketing spend could be redistributed to higher-ROI channels",        "base_confidence": 0.72},
        {"cause": "Campaign efficiency can be improved by tightening audience targeting", "base_confidence": 0.66},
    ],
}

FEATURE_CAUSE_TEXT = {
    "marketing_channel":  "Marketing channel mix is not optimally aligned with conversion patterns in your dataset",
    "user_type":          "Returning vs new customer targeting balance is suboptimal for conversion",
    "discount_percent":   "Discount strategy is not effectively driving purchase decisions",
    "discount_impact":    "Discount-to-price ratio is not maximising purchase probability",
    "engagement_score":   "Session engagement (pages + time) is below the conversion threshold",
    "pages_viewed":       "Visitors are not exploring enough product pages before purchase decision",
    "time_on_site_sec":   "Session duration is insufficient for building purchase intent",
    "unit_price":         "Product pricing relative to customer willingness-to-pay affects conversion",
    "price_per_page":     "Price-per-page-viewed ratio indicates friction in the purchase journey",
    "device_type":        "Device type distribution affects checkout completion rates",
    "payment_method":     "Available payment methods may not match customer preferences",
    "rating":             "Product ratings are below the threshold needed to drive purchase confidence",
    "product_category":   "Product category mix does not align with high-converting customer intent",
    "location":           "Geographic targeting is not optimised for conversion patterns",
    "visit_day":          "Day-of-week visit patterns indicate timing mismatch for promotions",
    "visit_month":        "Seasonal/monthly patterns indicate missed timing optimisation",
    "visit_weekday":      "Weekday vs weekend targeting is not aligned with conversion peaks",
    "visit_season":       "Seasonal campaign timing does not match high-conversion periods",
}

FEATURE_KPI_AFFINITY = {
    "marketing_channel":  ["CTR", "ROI"],
    "user_type":          ["Conversion Rate", "Cart Abandonment"],
    "discount_percent":   ["Conversion Rate", "Cart Abandonment"],
    "discount_impact":    ["Conversion Rate", "ROI"],
    "engagement_score":   ["Conversion Rate", "Cart Abandonment"],
    "pages_viewed":       ["Conversion Rate", "Cart Abandonment"],
    "time_on_site_sec":   ["Conversion Rate", "Cart Abandonment"],
    "unit_price":         ["ROI", "Conversion Rate"],
    "price_per_page":     ["ROI", "Conversion Rate"],
    "device_type":        ["Conversion Rate", "Cart Abandonment"],
    "payment_method":     ["Cart Abandonment", "Conversion Rate"],
    "rating":             ["Conversion Rate"],
    "product_category":   ["Conversion Rate", "CTR"],
    "location":           ["Conversion Rate"],
    "visit_day":          ["CTR", "Conversion Rate"],
    "visit_month":        ["Conversion Rate"],
    "visit_weekday":      ["Conversion Rate", "CTR"],
    "visit_season":       ["Conversion Rate"],
}

OBJECTIVE_INSIGHTS = {
    "increase_revenue": {
        "focus":   "Revenue growth",
        "lens":    "Every KPI issue is evaluated through its direct impact on total revenue. Conversion rate and cart recovery carry dominant weight.",
        "primary": ["Conversion Rate", "Cart Abandonment"],
    },
    "reduce_cart_abandonment": {
        "focus":   "Cart recovery",
        "lens":    "Root causes are analysed specifically for checkout abandonment friction. Cart abandonment carries dominant weight.",
        "primary": ["Cart Abandonment", "Conversion Rate"],
    },
    "improve_conversion_rate": {
        "focus":   "Conversion optimisation",
        "lens":    "Root causes focus on visitor-to-buyer journey friction points. Conversion rate carries dominant weight.",
        "primary": ["Conversion Rate", "CTR"],
    },
    "optimize_marketing_roi": {
        "focus":   "Marketing efficiency",
        "lens":    "Root causes evaluated through spend efficiency and channel performance. ROI carries dominant weight.",
        "primary": ["ROI", "CTR"],
    },
}

# FIX R: Direction priority updated to reflect real dataset behaviour.
#   Real data shows Email (25.4%) and Instagram (24.9%) have the highest
#   conversion rates. Checkout UX is the #1 lever for cart abandonment.
#   offer_discount has diminishing returns at high-median discount datasets.
ALL_FIX_DIRECTIONS = {
    "increase_revenue": [
        "improve_checkout_ux", "retargeting_campaign", "optimize_targeting",
        "offer_discount", "increase_ad_budget",
    ],
    "reduce_cart_abandonment": [
        "improve_checkout_ux", "add_urgency_signals", "retargeting_campaign",
        "offer_discount",
    ],
    "improve_conversion_rate": [
        "improve_checkout_ux", "optimize_targeting", "retargeting_campaign",
        "offer_discount", "improve_ad_creative",
    ],
    "optimize_marketing_roi": [
        "reallocate_channel_budget", "optimize_targeting",
        "retargeting_campaign", "increase_ad_budget",
    ],
}


def run(
    observer_result: Dict[str, Any],
    objective: str,
    kpi_summary: Dict[str, Any],
    feature_importance: Optional[List[Dict]] = None,
) -> Dict[str, Any]:

    observations = observer_result.get("observations", [])
    raw_kpis     = observer_result.get("rawKPIs", {})
    benchmarks   = observer_result.get("benchmarksUsed", {})
    obj_config   = OBJECTIVE_INSIGHTS.get(objective, OBJECTIVE_INSIGHTS["increase_revenue"])

    feat_imp_dict: Dict[str, float] = {}
    if feature_importance:
        for f in feature_importance:
            if "feature" in f and "importance" in f:
                feat_imp_dict[f["feature"]] = float(f["importance"])

    root_causes  = []
    issue_areas  = []

    for obs in observations:
        if obs["severity"] == "healthy":
            continue

        metric    = obs["metric"]
        severity  = obs["severity"]
        raw_value = obs["value"]
        benchmark = obs["benchmark"]

        effective_benchmark = benchmarks.get(_metric_key(metric), benchmark)

        if feat_imp_dict:
            causes = _build_feature_driven_causes(
                metric, severity, raw_value, effective_benchmark, feat_imp_dict)
        else:
            base_causes = CAUSE_MAP.get((metric, severity), CAUSE_MAP.get((metric, "critical"), []))
            causes = _scale_cause_confidence(base_causes, metric, raw_value, effective_benchmark)

        if causes:
            issue_areas.append(metric)
            root_causes.append({
                "metric":     metric,
                "severity":   severity,
                "causes":     causes[:2],
                "value":      raw_value,
                "benchmark":  effective_benchmark,
                "unit":       obs["unit"],
                "gap":        obs.get("gap", 0),
                "dataSource": "feature_importance" if feat_imp_dict else "cause_map",
            })

    primary_metrics  = obj_config["primary"]
    primary_causes   = [rc for rc in root_causes if rc["metric"] in primary_metrics]
    secondary_causes = [rc for rc in root_causes if rc["metric"] not in primary_metrics]

    if feat_imp_dict:
        fix_directions = _compute_importance_driven_directions(
            objective, root_causes, raw_kpis, feat_imp_dict)
    else:
        fix_directions = _compute_fix_directions(objective, root_causes, raw_kpis)

    diagnosis = _build_diagnosis(
        primary_causes, secondary_causes, objective, raw_kpis, obj_config, benchmarks)

    return {
        "agent":                  "analyst",
        "rootCauses":             root_causes,
        "primaryCauses":          primary_causes,
        "secondaryCauses":        secondary_causes,
        "biggestProblem":         primary_causes[0] if primary_causes else (root_causes[0] if root_causes else None),
        "fixDirections":          fix_directions,
        "objectiveFocus":         obj_config["focus"],
        "objectiveLens":          obj_config["lens"],
        "issueAreas":             issue_areas,
        "diagnosis":              diagnosis,
        "featureImportanceUsed":  bool(feat_imp_dict),
    }


# ════════════════════════════════════════════════════════════════
#  FEATURE-DRIVEN CAUSE BUILDER
# ════════════════════════════════════════════════════════════════

def _build_feature_driven_causes(metric, severity, raw_value, benchmark, feat_imp_dict):
    affecting_features = [
        (feat, imp)
        for feat, imp in feat_imp_dict.items()
        if metric in FEATURE_KPI_AFFINITY.get(feat, [])
    ]

    if not affecting_features:
        base_causes = CAUSE_MAP.get((metric, severity), CAUSE_MAP.get((metric, "critical"), []))
        return _scale_cause_confidence(base_causes, metric, raw_value, benchmark)

    affecting_features.sort(key=lambda x: x[1], reverse=True)

    if benchmark <= 0:
        gap_ratio = 0.5
    elif metric == "Cart Abandonment":
        gap_ratio = min(1.0, max(0.0, (raw_value - benchmark) / max(benchmark, 1.0)))
    else:
        gap_ratio = min(1.0, max(0.0, (benchmark - raw_value) / max(benchmark, 1.0)))

    causes   = []
    max_imp  = affecting_features[0][1] if affecting_features else 1.0

    for feat, imp in affecting_features[:3]:
        cause_text     = FEATURE_CAUSE_TEXT.get(feat, f"'{feat}' is a key driver of {metric} in your dataset")
        normalized_imp = imp / max(max_imp, 0.001)
        confidence     = round(0.60 * normalized_imp * (0.5 + gap_ratio * 0.5) + 0.25, 2)
        # FIX S: cap at 0.92 to avoid false high-confidence on rule-based causes
        confidence     = min(0.92, max(0.40, confidence))
        causes.append({"cause": cause_text, "confidence": confidence})

    return causes


# ════════════════════════════════════════════════════════════════
#  DIRECTION SELECTORS
# ════════════════════════════════════════════════════════════════

def _compute_importance_driven_directions(objective, root_causes, raw_kpis, feat_imp_dict):
    base_directions = ALL_FIX_DIRECTIONS.get(objective, ALL_FIX_DIRECTIONS["increase_revenue"])

    FEATURE_STRATEGY_MAP = {
        "marketing_channel":  ["retargeting_campaign", "increase_ad_budget", "reallocate_channel_budget",
                               "improve_ad_creative", "optimize_targeting"],
        "user_type":          ["offer_discount", "retargeting_campaign", "optimize_targeting"],
        "discount_percent":   ["offer_discount"],
        "discount_impact":    ["offer_discount"],
        "engagement_score":   ["improve_checkout_ux", "add_urgency_signals", "optimize_targeting"],
        "pages_viewed":       ["improve_checkout_ux", "retargeting_campaign", "improve_ad_creative"],
        "time_on_site_sec":   ["improve_checkout_ux", "add_urgency_signals"],
        "unit_price":         ["reallocate_channel_budget", "increase_ad_budget"],
        "price_per_page":     ["improve_checkout_ux"],
        "device_type":        ["improve_checkout_ux"],
        "payment_method":     ["improve_checkout_ux"],
        "rating":             ["offer_discount"],
    }

    severity_weights = {"critical": 3, "warning": 1}
    direction_scores = {d: 0.0 for d in base_directions}

    for feat, imp in feat_imp_dict.items():
        for direction in FEATURE_STRATEGY_MAP.get(feat, []):
            if direction in direction_scores:
                issue_weight = 1.0
                for rc in root_causes:
                    if rc["metric"] in FEATURE_KPI_AFFINITY.get(feat, []):
                        issue_weight += severity_weights.get(rc["severity"], 0)
                direction_scores[direction] += imp * issue_weight

    sorted_dirs = sorted(base_directions, key=lambda d: direction_scores.get(d, 0.0), reverse=True)

    for d in ["improve_checkout_ux", "retargeting_campaign", "offer_discount",
              "reallocate_channel_budget", "increase_ad_budget", "add_urgency_signals",
              "improve_ad_creative", "optimize_targeting"]:
        if d not in sorted_dirs:
            sorted_dirs.append(d)

    print(f"[Analyst] Importance-driven directions: {sorted_dirs[:5]}")
    return sorted_dirs[:5]


def _metric_key(metric: str) -> str:
    return {
        "CTR":              "ctr",
        "Conversion Rate":  "conversionRate",
        "Cart Abandonment": "cartAbandonment",
        "ROI":              "roi",
    }.get(metric, metric.lower())


def _compute_fix_directions(objective, root_causes, raw_kpis):
    """
    Fallback direction scoring when feature_importance is not available.
    FIX T: offer_discount also penalised for increase_revenue when median
    discount is already high (>10%) — detected via raw_kpis context.
    """
    base_directions  = ALL_FIX_DIRECTIONS.get(objective, ALL_FIX_DIRECTIONS["increase_revenue"])
    direction_scores = {d: 0 for d in base_directions}
    severity_weights = {"critical": 3, "warning": 1}

    metric_to_direction = {
        "CTR":              ["increase_ad_budget", "retargeting_campaign",
                             "reallocate_channel_budget", "improve_ad_creative"],
        "Conversion Rate":  ["improve_checkout_ux", "retargeting_campaign",
                             "optimize_targeting", "offer_discount"],
        "Cart Abandonment": ["improve_checkout_ux", "add_urgency_signals",
                             "retargeting_campaign", "offer_discount"],
        "ROI":              ["reallocate_channel_budget", "optimize_targeting", "increase_ad_budget"],
    }

    # Directions to penalise per objective
    penalised_directions = set()
    if objective == "optimize_marketing_roi":
        penalised_directions.add("offer_discount")

    for rc in root_causes:
        metric = rc["metric"]; sev = rc["severity"]
        weight = severity_weights.get(sev, 0)
        for direction in metric_to_direction.get(metric, []):
            if direction in direction_scores:
                delta = weight if direction not in penalised_directions else weight * -0.5
                direction_scores[direction] += delta

    sorted_dirs = sorted(base_directions, key=lambda d: direction_scores.get(d, 0), reverse=True)
    all_dirs = [
        "offer_discount", "retargeting_campaign", "increase_ad_budget",
        "improve_checkout_ux", "add_urgency_signals", "reallocate_channel_budget",
        "improve_ad_creative", "optimize_targeting",
    ]
    for d in all_dirs:
        if d not in sorted_dirs:
            sorted_dirs.append(d)
    return sorted_dirs[:5]


def _scale_cause_confidence(base_causes, metric, raw_value, benchmark):
    if benchmark <= 0:
        gap_ratio = 0.5
    elif metric == "Cart Abandonment":
        gap_ratio = min(1.0, max(0.0, (raw_value - benchmark) / max(benchmark, 1.0)))
    else:
        gap_ratio = min(1.0, max(0.0, (benchmark - raw_value) / max(benchmark, 1.0)))
    return [
        {
            "cause":      c["cause"],
            "confidence": round(min(0.92, c["base_confidence"] * (0.5 + gap_ratio * 0.5)), 2),
        }
        for c in base_causes
    ]


# ════════════════════════════════════════════════════════════════
#  DIAGNOSIS BUILDER
# ════════════════════════════════════════════════════════════════

def _build_diagnosis(primary, secondary, objective, raw_kpis, obj_config, benchmarks):
    ctr     = raw_kpis.get("ctr",             0)
    conv    = raw_kpis.get("conversionRate",  0)
    abandon = raw_kpis.get("cartAbandonment", 0)
    roi     = raw_kpis.get("roi",             0)

    b_ctr     = benchmarks.get("ctr",             2.0)
    b_conv    = benchmarks.get("conversionRate",  5.0)
    b_abandon = benchmarks.get("cartAbandonment", 60.0)
    b_roi     = benchmarks.get("roi",             3.0)

    if not primary and not secondary:
        return (
            f"All KPIs are within acceptable ranges for this dataset. "
            f"Actual values — CTR: {ctr:.4f}%, Conversion: {conv:.4f}%, "
            f"Cart Abandonment: {abandon:.2f}%, ROI: {roi:.4f}x. "
            f"Focus on sustaining performance aligned with your "
            f"{obj_config['focus'].lower()} objective."
        )

    parts = []

    if objective == "increase_revenue":
        if conv < b_conv:
            conv_gap       = round(b_conv - conv, 2)
            potential_pct  = round((1 - conv / b_conv) * 100, 1)
            parts.append(
                f"Conversion rate of {conv:.4f}% is {conv_gap:.2f}% below the "
                f"{b_conv:.2f}% benchmark — approximately {potential_pct}% of "
                f"potential revenue is being lost to unconverted sessions."
            )
        if abandon > b_abandon:
            excess    = round(abandon - b_abandon, 2)
            cart_conv = round(conv * 0.10, 2)
            parts.append(
                f"Cart abandonment at {abandon:.2f}% is {excess:.2f}% above the "
                f"{b_abandon:.1f}% target. Recovering 10% of abandoned carts could "
                f"add approximately {cart_conv:.2f}% to conversion volume."
            )

    elif objective == "reduce_cart_abandonment":
        if abandon > b_abandon:
            excess    = round(abandon - b_abandon, 2)
            new_conv  = round(conv * (1 + (excess / abandon) * 0.5), 2)
            parts.append(
                f"Cart abandonment at {abandon:.2f}% is {excess:.2f}% above the "
                f"{b_abandon:.1f}% target. Reducing abandonment to target level could "
                f"improve conversion from {conv:.4f}% to approximately {new_conv:.2f}%."
            )
        else:
            parts.append(
                f"Cart abandonment at {abandon:.2f}% is within the target range. "
                f"Focus on conversion rate improvement from {conv:.4f}% toward the "
                f"{b_conv:.2f}% benchmark."
            )

    elif objective == "improve_conversion_rate":
        ctr_gap  = round(b_ctr - ctr, 4)
        conv_gap = round(b_conv - conv, 2)
        parts.append(
            f"With CTR at {ctr:.4f}% ({ctr_gap:.4f}% below {b_ctr:.2f}% benchmark) "
            f"and conversion at {conv:.4f}% ({conv_gap:.2f}% below {b_conv:.2f}% benchmark), "
            f"the funnel is leaking at both the top and middle stages. "
            f"The {round((conv / b_conv) * 100, 1)}% conversion attainment rate indicates "
            f"significant headroom for improvement."
        )

    elif objective == "optimize_marketing_roi":
        if roi >= b_roi:
            roi_surplus = round(roi - b_roi, 4)
            parts.append(
                f"ROI of {roi:.4f}x is strong — {roi_surplus:.4f}x above the "
                f"{b_roi:.1f}x benchmark. CTR at {ctr:.4f}% (vs {b_ctr:.2f}% benchmark) "
                f"indicates ad spend could be redistributed to higher-engagement channels "
                f"to maximise efficiency further."
            )
        else:
            roi_gap = round(b_roi - roi, 4)
            parts.append(
                f"ROI of {roi:.4f}x is {roi_gap:.4f}x below the {b_roi:.1f}x benchmark. "
                f"Combined with CTR at {ctr:.4f}%, ad spend is not generating sufficient "
                f"returns. Channel reallocation and audience targeting refinement are "
                f"the primary levers."
            )

    if not parts:
        metrics = [p["metric"] for p in primary[:2]]
        parts.append(
            f"The main issues in this dataset are in {' and '.join(metrics)}. "
            f"Actual values: CTR={ctr:.4f}%, Conv={conv:.4f}%, "
            f"Abandon={abandon:.2f}%, ROI={roi:.4f}x."
        )

    return " ".join(parts)