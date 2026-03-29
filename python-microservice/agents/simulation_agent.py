"""
AgenticIQ — Simulation Agent v7.7

FIXES from v7.6:

  FIX REGRESSOR-A — _ml_project_kpis LOADS NORMALISATION CONSTANTS FROM PKL:
    The KPI regressor now stores di_99 and ppp_99 normalisation constants inside
    the .pkl bundle (written by the new _train_kpi_regressor in app.py v13.5).
    _ml_project_kpis reads these constants and applies them when building the
    prediction vector, so that the features passed at inference exactly match
    the scale used during training.

  FIX REGRESSOR-B — _build_base_vector USES NORMALISED DERIVED FEATURES:
    The base vector for discount_impact and price_per_page is now computed as
    a normalised float (0–1) matching the training scale, not the raw value.

  FIX REGRESSOR-C — _apply_strategy_modifications USES NORMALISED SCALE:
    All strategy modifications for discount_impact and price_per_page are written
    as normalised values (disc*price / di_99, price/pages / ppp_99) so the model
    receives the same feature distribution as training.

  FIX REGRESSOR-D — SAFE_DEFAULTS UPDATED:
    All hardcoded fallback values reflect real dataset medians:
      unit_price=691.73  discount_percent=10  pages_viewed=13
      time_on_site_sec=903  engagement_score=0.509
      discount_impact=0.057 (normalised)  price_per_page=0.030 (normalised)
      location=111  marketing_channel=3  visit_season=2

  All other fixes from v7.6 retained.
"""

from typing import Dict, Any, List, Optional
import os
import pickle
import random
import numpy as np


# ════════════════════════════════════════════════════════════════
#  DEFAULT AFFINITIES — ONLY USED WHEN REAL DATA IS ABSENT
# ════════════════════════════════════════════════════════════════

_CHANNEL_CONV_RATIO_DEFAULT = {
    "Google Ads":   1.0113,
    "Facebook Ads": 0.9849,
    "Instagram":    0.9806,
    "Email":        1.0080,
    "SEO":          0.9642,
    "Referral":     1.0505,
}

_SEGMENT_CONV_AFFINITY_DEFAULT = {
    "All Customers":       0.9770,
    "New Customers":       1.0363,
    "Returning Customers": 0.9770,
    "High Value":          0.9770,
    "At Risk":             1.0363,
    "Mobile Users":        0.9770,
}

_SEGMENT_ABANDON_AFFINITY_DEFAULT = {
    "All Customers":       1.0101,
    "New Customers":       0.9842,
    "Returning Customers": 1.0101,
    "High Value":          1.0101,
    "At Risk":             0.9842,
    "Mobile Users":        1.0101,
}


# ════════════════════════════════════════════════════════════════
#  CHANNEL / SEGMENT INTEGER MAPS
# ════════════════════════════════════════════════════════════════

CHANNEL_TO_INT = {
    "Google Ads": 0, "Facebook Ads": 1, "Instagram": 2,
    "Email": 3, "SEO": 4, "Referral": 5,
}
INT_TO_CHANNEL = {v: k for k, v in CHANNEL_TO_INT.items()}

SEGMENT_TO_INT = {
    "All Customers":       1,
    "New Customers":       0,
    "Returning Customers": 1,
    "High Value":          1,
    "At Risk":             0,
    "Mobile Users":        1,
}


# ════════════════════════════════════════════════════════════════
#  SAFE DEFAULTS — FIX REGRESSOR-D: real dataset medians
#  discount_impact and price_per_page are NORMALISED (0–1)
# ════════════════════════════════════════════════════════════════

_SAFE_DEFAULTS = {
    "device_type":       1.0,
    "user_type":         1.0,
    "marketing_channel": 3.0,        # Email
    "product_category":  4.0,
    "unit_price":        691.73,     # real median
    "discount_percent":  10.0,       # real median
    "pages_viewed":      13.0,       # real median
    "time_on_site_sec":  903.0,      # real median
    "rating":            4.0,
    "payment_method":    2.0,
    "visit_day":         16.0,
    "visit_month":       7.0,
    "visit_weekday":     3.0,
    "visit_season":      2.0,
    "location":          111.0,      # real median
    "engagement_score":  0.509,      # real median
    # NORMALISED — see FIX REGRESSOR-D
    "discount_impact":   0.057,      # (10 * 691.73) / di_99
    "price_per_page":    0.030,      # (691.73 / 13)  / ppp_99
}


# ════════════════════════════════════════════════════════════════
#  OBJECTIVE / STRATEGY CONFIGURATION
# ════════════════════════════════════════════════════════════════

OBJECTIVE_ALLOWED = {
    "increase_revenue":        ["improve_checkout_ux", "offer_discount", "increase_ad_budget",
                                "retargeting_campaign", "improve_ad_creative", "optimize_targeting"],
    "reduce_cart_abandonment": ["improve_checkout_ux", "add_urgency_signals",
                                "retargeting_campaign", "offer_discount"],
    "improve_conversion_rate": ["offer_discount", "improve_checkout_ux", "optimize_targeting",
                                "improve_ad_creative", "retargeting_campaign"],
    "optimize_marketing_roi":  ["reallocate_channel_budget", "retargeting_campaign",
                                "optimize_targeting", "increase_ad_budget"],
}

STRATEGY_OVERUSE_PENALTY = {
    "offer_discount": 0.85,
}

OBJECTIVE_BOOST = {
    "increase_revenue":        {"improve_checkout_ux": 1.2},
    "reduce_cart_abandonment": {"improve_checkout_ux": 1.2},
    "improve_conversion_rate": {"improve_checkout_ux": 1.15},
    "optimize_marketing_roi":  {"reallocate_channel_budget": 1.2},
}

OBJECTIVE_KPI_STRENGTH = {
    "increase_revenue":        {"ctr": 1.1,  "conversionRate": 1.30, "cartAbandonment": 1.20, "roi": 1.10},
    "reduce_cart_abandonment": {"ctr": 1.0,  "conversionRate": 1.10, "cartAbandonment": 1.35, "roi": 1.00},
    "improve_conversion_rate": {"ctr": 1.20, "conversionRate": 1.35, "cartAbandonment": 1.10, "roi": 1.00},
    "optimize_marketing_roi":  {"ctr": 1.10, "conversionRate": 1.00, "cartAbandonment": 1.00, "roi": 1.35},
}

OBJECTIVE_MIN_LIFT = {
    "increase_revenue":        {"conversionRate": 0.05,  "cartAbandonment": -0.04, "roi": 0.03,  "ctr": 0.02},
    "reduce_cart_abandonment": {"cartAbandonment": -0.08, "conversionRate": 0.03,  "roi": 0.01,  "ctr": 0.01},
    "improve_conversion_rate": {"conversionRate": 0.07,  "ctr": 0.05,             "cartAbandonment": -0.03, "roi": 0.01},
    "optimize_marketing_roi":  {"roi": 0.05,             "ctr": 0.04,             "conversionRate": 0.01,  "cartAbandonment": -0.01},
}

STRATEGY_MECHANISMS = {
    "offer_discount": {
        "name":              "Offer targeted discount",
        "description":       "Provide a personalised discount to customers who added to cart but did not purchase.",
        "params":            {"discount_pct": 10, "channel": "Email", "segment": "Cart abandoners"},
        "default_strengths": {"ctr": 0.04, "conversion_rate": 0.32, "cart_abandonment": 0.28, "roi": -0.10},
    },
    "retargeting_campaign": {
        "name":              "Run retargeting campaign",
        "description":       "Re-engage visitors who browsed but did not convert using targeted ads.",
        "params":            {"channel": "Email", "budget_increase_pct": 15},
        "default_strengths": {"ctr": 0.38, "conversion_rate": 0.22, "cart_abandonment": 0.12, "roi": 0.14},
    },
    "increase_ad_budget": {
        "name":              "Increase ad budget on top channel",
        "description":       "Scale up ad spend on the highest-performing channel for more qualified traffic.",
        "params":            {"budget_increase_pct": 20, "channel": "Email"},
        "default_strengths": {"ctr": 0.30, "conversion_rate": 0.14, "cart_abandonment": 0.03, "roi": 0.09},
    },
    "improve_checkout_ux": {
        "name":              "Improve checkout UX",
        "description":       "Simplify checkout — reduce steps, enable guest checkout, add trust badges.",
        "params":            {"ux_improvement": True},
        "default_strengths": {"ctr": 0.00, "conversion_rate": 0.38, "cart_abandonment": 0.44, "roi": 0.20},
    },
    "add_urgency_signals": {
        "name":              "Add urgency and scarcity signals",
        "description":       "Add limited-time offers, low-stock indicators, and countdown timers.",
        "params":            {"urgency": True},
        "default_strengths": {"ctr": 0.05, "conversion_rate": 0.20, "cart_abandonment": 0.33, "roi": 0.11},
    },
    "reallocate_channel_budget": {
        "name":              "Reallocate budget to top-performing channels",
        "description":       "Shift marketing spend from low-ROI channels to high-performing ones.",
        "params":            {"reallocation": True},
        "default_strengths": {"ctr": 0.35, "conversion_rate": 0.12, "cart_abandonment": 0.05, "roi": 0.38},
    },
    "improve_ad_creative": {
        "name":              "Improve ad creatives",
        "description":       "Redesign ad copy and visuals to improve engagement and click-through rate.",
        "params":            {"creative_refresh": True},
        "default_strengths": {"ctr": 0.50, "conversion_rate": 0.10, "cart_abandonment": 0.00, "roi": 0.15},
    },
    "optimize_targeting": {
        "name":              "Optimise audience targeting",
        "description":       "Refine audience segments using behavioural and demographic signals to improve ROI.",
        "params":            {"targeting_optimisation": True},
        "default_strengths": {"ctr": 0.40, "conversion_rate": 0.20, "cart_abandonment": 0.00, "roi": 0.25},
    },
}

DEFAULT_OBJECTIVE_WEIGHTS = {
    "increase_revenue":        {"conversion": 50, "abandon": 25, "roi": 15, "ctr": 10},
    "reduce_cart_abandonment": {"abandon": 60,    "conversion": 25, "roi": 8, "ctr": 7},
    "improve_conversion_rate": {"conversion": 60, "ctr": 25,    "abandon": 8, "roi": 7},
    "optimize_marketing_roi":  {"roi": 80,    "ctr": 10,        "conversion": 5, "abandon": 5},
}

ECO_FEATURES = [
    "device_type", "user_type", "marketing_channel", "product_category",
    "unit_price", "discount_percent", "pages_viewed", "time_on_site_sec",
    "rating", "payment_method", "visit_day", "visit_month",
    "visit_weekday", "visit_season", "location",
    "engagement_score", "discount_impact", "price_per_page",
]

WHATIF_DISCOUNT_LEVELS = [5, 10, 15, 20, 25, 30]


# ════════════════════════════════════════════════════════════════
#  CHANNEL / SEGMENT AFFINITY HELPERS
# ════════════════════════════════════════════════════════════════

def _compute_channel_effectiveness(dataset_stats: Optional[Dict] = None) -> Dict[str, float]:
    channel_conv_rates = (dataset_stats or {}).get("channel_conv_rates", {})
    if channel_conv_rates and len(channel_conv_rates) >= 2:
        named_rates: Dict[str, float] = {}
        for k, v in channel_conv_rates.items():
            name = INT_TO_CHANNEL.get(int(k), k) if str(k).isdigit() else str(k)
            named_rates[name] = float(v)
        mean_rate = sum(named_rates.values()) / len(named_rates)
        if mean_rate > 0:
            effectiveness = {ch: round(rate / mean_rate, 4) for ch, rate in named_rates.items()}
            for ch in CHANNEL_TO_INT:
                if ch not in effectiveness:
                    effectiveness[ch] = 1.0
            print(f"[SimAgent] ✅ Channel effectiveness from REAL dataset: {effectiveness}")
            return effectiveness
    print("[SimAgent] ⚠️  Using DEFAULT channel effectiveness ratios.")
    mean_eff = sum(_CHANNEL_CONV_RATIO_DEFAULT.values()) / len(_CHANNEL_CONV_RATIO_DEFAULT)
    return {ch: round(v / mean_eff, 4) for ch, v in _CHANNEL_CONV_RATIO_DEFAULT.items()}


def _compute_segment_affinities(dataset_stats: Optional[Dict] = None):
    seg_conv    = (dataset_stats or {}).get("segment_conv_rates",    {})
    seg_abandon = (dataset_stats or {}).get("segment_abandon_rates", {})
    using_real  = bool(seg_conv and len(seg_conv) >= 2 and
                       seg_abandon and len(seg_abandon) >= 2)
    if using_real:
        conv_out    = dict(_SEGMENT_CONV_AFFINITY_DEFAULT)
        abandon_out = dict(_SEGMENT_ABANDON_AFFINITY_DEFAULT)
        conv_out.update({str(k): float(v) for k, v in seg_conv.items()})
        abandon_out.update({str(k): float(v) for k, v in seg_abandon.items()})
        print(f"[SimAgent] ✅ Segment affinities from REAL dataset: conv={conv_out}")
        return conv_out, abandon_out
    print("[SimAgent] ⚠️  Using DEFAULT segment affinities.")
    return dict(_SEGMENT_CONV_AFFINITY_DEFAULT), dict(_SEGMENT_ABANDON_AFFINITY_DEFAULT)


# ════════════════════════════════════════════════════════════════
#  NORMALISATION CONSTANTS HELPER
#  FIX REGRESSOR-A: reads di_99, ppp_99 from the pkl bundle
# ════════════════════════════════════════════════════════════════

def _load_reg_constants(kpi_predictor_path: str) -> Dict[str, float]:
    """Load normalisation constants that were saved inside the pkl bundle."""
    defaults = {
        "di_99":     1.0,
        "ppp_99":    1.0,
        "max_pages": 24.0,
        "max_time":  1799.0,
    }
    try:
        with open(kpi_predictor_path, "rb") as f:
            bundle = pickle.load(f)
        if isinstance(bundle, dict):
            return {
                "di_99":     float(bundle.get("di_99",     defaults["di_99"])),
                "ppp_99":    float(bundle.get("ppp_99",    defaults["ppp_99"])),
                "max_pages": float(bundle.get("max_pages", defaults["max_pages"])),
                "max_time":  float(bundle.get("max_time",  defaults["max_time"])),
            }
    except Exception as e:
        print(f"[SimAgent] ⚠️  Could not read reg constants from pkl: {e}")
    return defaults


# ════════════════════════════════════════════════════════════════
#  PUBLIC ENTRY POINT
# ════════════════════════════════════════════════════════════════

def run(
    analyst_result:              Dict[str, Any],
    observer_result:             Dict[str, Any],
    simulation_mode:             str,
    strategy_input:              Dict[str, Any],
    objective:                   str,
    ml_ensemble_acc:             float,
    kpi_summary:                 Dict[str, Any],
    avg_purchase_proba:          Optional[float] = None,
    learned_mechanism_strengths: Optional[Dict[str, Any]] = None,
    learned_objective_weights:   Optional[Dict[str, Any]] = None,
    kpi_predictor_path:          Optional[str]  = None,
    feature_importance:          Optional[list] = None,
    uploads_dir:                 Optional[str]  = None,
    dataset_stats:               Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:

    if not kpi_predictor_path or not os.path.exists(kpi_predictor_path):
        raise ValueError(
            f"[SimulationAgent] kpi_predictor_path is required but was "
            f"'{kpi_predictor_path}'. Please retrain."
        )

    with open(kpi_predictor_path, "rb") as f:
        reg_bundle = pickle.load(f)

    kpi_regressor = reg_bundle["model"]
    reg_features  = reg_bundle.get("features", ECO_FEATURES)
    reg_targets   = reg_bundle.get("targets", ["t_ctr", "t_conv", "t_abandon", "t_roi"])

    # FIX REGRESSOR-A: use normalisation constants from the pkl bundle
    di_99     = float(reg_bundle.get("di_99",     1.0)) or 1.0
    ppp_99    = float(reg_bundle.get("ppp_99",    1.0)) or 1.0
    max_pages = float(reg_bundle.get("max_pages", 24.0))
    max_time  = float(reg_bundle.get("max_time",  1799.0))

    print(
        f"[Sim] ✅ KPI regressor loaded | features={len(reg_features)} | "
        f"targets={reg_targets} | di_99={di_99:.1f} ppp_99={ppp_99:.2f}"
    )

    channel_effectiveness = _compute_channel_effectiveness(dataset_stats)
    seg_conv_affinity, seg_abandon_affinity = _compute_segment_affinities(dataset_stats)
    using_real_affinities = bool((dataset_stats or {}).get("channel_conv_rates"))

    fix_directions  = analyst_result.get("fixDirections", [])
    raw_kpis        = observer_result.get("rawKPIs", {})
    benchmarks_used = observer_result.get("benchmarksUsed", {})

    real_ctr     = raw_kpis.get("ctr",             0)
    real_conv    = raw_kpis.get("conversionRate",  0)
    real_abandon = raw_kpis.get("cartAbandonment", 0)
    real_roi     = raw_kpis.get("roi",             0)
    ml_confidence = ml_ensemble_acc / 100.0

    eff_benchmarks = {
        "ctr":              benchmarks_used.get("ctr",             2.0),
        "conversion_rate":  benchmarks_used.get("conversionRate",  5.0),
        "cart_abandonment": benchmarks_used.get("cartAbandonment", 60.0),
        "roi":              benchmarks_used.get("roi",             3.0),
    }

    if learned_mechanism_strengths and isinstance(learned_mechanism_strengths, dict):
        active_mechanisms = _merge_learned_with_defaults(learned_mechanism_strengths)
        print("[Sim] ✅ LEARNED mechanism strengths active")
    else:
        active_mechanisms = None

    active_obj_weights = (
        learned_objective_weights
        if learned_objective_weights and isinstance(learned_objective_weights, dict)
        else None
    )

    # FIX REGRESSOR-B: build base vector with normalised derived features
    base_vector = _build_base_vector(reg_features, dataset_stats, di_99, ppp_99, max_pages, max_time)

    if not dataset_stats:
        print(
            "[Sim] ⚠️  dataset_stats missing — base vector uses real-median SAFE_DEFAULTS."
        )

    print(
        f"[Sim] Base vector source: {'datasetStats' if dataset_stats else 'SAFE_DEFAULTS'} | "
        f"max_pages={max_pages}, max_time={max_time} | "
        f"di_99={di_99:.1f} ppp_99={ppp_99:.2f}"
    )

    merged_directions = _get_importance_driven_directions(fix_directions, feature_importance)
    merged_directions = [
        d for d in merged_directions
        if d in OBJECTIVE_ALLOWED.get(objective, list(STRATEGY_MECHANISMS.keys()))
    ]
    for d in OBJECTIVE_ALLOWED.get(objective, []):
        if d not in merged_directions and d in STRATEGY_MECHANISMS:
            merged_directions.append(d)
    print(f"[Sim] Directions after objective filter ({objective}): {merged_directions}")

    strategies: List[Dict[str, Any]] = []

    if simulation_mode == "mode1" and strategy_input:
        user_strat = _build_user_strategy(
            strategy_input, real_ctr, real_conv, real_abandon, real_roi,
            ml_confidence, raw_kpis, eff_benchmarks,
            kpi_regressor, reg_features, reg_targets, base_vector,
            objective, max_pages, max_time, di_99, ppp_99,
            channel_effectiveness, seg_conv_affinity, seg_abandon_affinity,
            using_real_affinities)
        strategies.append(user_strat)
        used = set()
        for direction in merged_directions:
            if len(strategies) >= 4:
                break
            if direction in STRATEGY_MECHANISMS and direction not in used:
                if _overlaps_with_user(direction, strategy_input):
                    continue
                strategies.append(_build_from_mechanism(
                    direction, real_ctr, real_conv, real_abandon, real_roi,
                    ml_confidence, eff_benchmarks, active_mechanisms,
                    kpi_regressor, reg_features, reg_targets, base_vector,
                    objective, max_pages, max_time, di_99, ppp_99))
                used.add(direction)
    else:
        used = set()
        for direction in merged_directions:
            if len(strategies) >= 5:
                break
            if direction in STRATEGY_MECHANISMS and direction not in used:
                strategies.append(_build_from_mechanism(
                    direction, real_ctr, real_conv, real_abandon, real_roi,
                    ml_confidence, eff_benchmarks, active_mechanisms,
                    kpi_regressor, reg_features, reg_targets, base_vector,
                    objective, max_pages, max_time, di_99, ppp_99))
                used.add(direction)

    if not strategies:
        raise ValueError(
            f"[SimulationAgent] No strategies built from directions: {merged_directions}."
        )

    for strat in strategies:
        raw_score = _compute_score(
            strat, objective, ml_confidence,
            real_ctr, real_conv, real_abandon, real_roi,
            eff_benchmarks, active_obj_weights)
        penalty         = STRATEGY_OVERUSE_PENALTY.get(strat.get("id", ""), 1.0)
        diversity_bonus = random.uniform(0, 2)
        obj_boost       = OBJECTIVE_BOOST.get(objective, {}).get(strat.get("id", ""), 1.0)
        primary_kpi_bonus = _compute_primary_kpi_bonus(
            strat, objective, real_roi, real_conv, real_abandon, real_ctr)
        strat["_raw_score"] = raw_score * penalty * obj_boost + diversity_bonus + primary_kpi_bonus

    strategies.sort(key=lambda s: s["_raw_score"], reverse=True)
    for i, s in enumerate(strategies):
        s["rank"] = i + 1

    _rescale_scores(strategies)
    _enrich_strategies(strategies, objective, real_conv, real_roi)

    whatif_table = _build_whatif_table(
        base_vector, reg_features, reg_targets, kpi_regressor,
        real_conv, real_ctr, real_abandon, real_roi, ml_confidence,
        max_pages, max_time, di_99, ppp_99)

    if len(strategies) >= 2:
        gap = round(strategies[0]["score"] - strategies[1]["score"], 1)
        strategies[0]["runnerUpGap"] = gap
        strategies[1]["runnerUpGap"] = 0.0

    affinities_source = "dataset" if using_real_affinities else "industry_defaults"

    return {
        "agent":            "simulation",
        "mode":             simulation_mode,
        "strategies":       strategies,
        "mlDriven":         True,
        "weightsUsed":      "learned" if active_obj_weights else "default",
        "strengthsUsed":    "learned" if active_mechanisms  else "default",
        "affinitiesSource": affinities_source,
        "directionsUsed":   merged_directions,
        "whatIfTable":      whatif_table,
        "summary": (
            f"Generated {len(strategies)} ML-driven strategies from REAL KPIs "
            f"(CTR:{real_ctr:.4f}%, Conv:{real_conv:.4f}%, "
            f"Abandon:{real_abandon:.2f}%, ROI:{real_roi:.4f}x). "
            f"KPI predictions via RandomForestRegressor (kpi_predictor.pkl). "
            f"ML:{ml_ensemble_acc:.1f}% | affinities: {affinities_source} | "
            f"weights:{'learned' if active_obj_weights else 'default'}. "
            f"Top: {strategies[0]['name']} score={strategies[0]['score']:.1f}."
        ),
        "adaptiveWeights": _get_objective_weights(objective, active_obj_weights),
        "realKPIs": {
            "ctr": real_ctr, "conversionRate": real_conv,
            "cartAbandonment": real_abandon, "roi": real_roi,
        },
    }


# ════════════════════════════════════════════════════════════════
#  BASE VECTOR — FIX REGRESSOR-B
# ════════════════════════════════════════════════════════════════

def _build_base_vector(
    reg_features: list,
    dataset_stats: Optional[Dict] = None,
    di_99:     float = 1.0,
    ppp_99:    float = 1.0,
    max_pages: float = 24.0,
    max_time:  float = 1799.0,
) -> Dict[str, float]:
    """
    Build the base feature vector with NORMALISED discount_impact / price_per_page.
    """
    base: Dict[str, float] = {}
    ds = dataset_stats or {}

    for feat in reg_features:
        if feat in ("discount_impact", "price_per_page"):
            continue  # handled below
        if ds and feat in ds and isinstance(ds[feat], dict):
            base[feat] = float(ds[feat].get("median", _SAFE_DEFAULTS.get(feat, 0.0)))
        else:
            base[feat] = _SAFE_DEFAULTS.get(feat, 0.0)

    # Compute normalised derived features from the base raw values
    pages = max(float(base.get("pages_viewed",     _SAFE_DEFAULTS["pages_viewed"])),  1.0)
    time_ = float(base.get("time_on_site_sec", _SAFE_DEFAULTS["time_on_site_sec"]))
    price = float(base.get("unit_price",       _SAFE_DEFAULTS["unit_price"]))
    disc  = float(base.get("discount_percent", _SAFE_DEFAULTS["discount_percent"]))

    if "engagement_score" in reg_features:
        base["engagement_score"] = float(
            np.clip((pages / max_pages) * 0.4 + (time_ / max_time) * 0.6, 0, 1)
        )
    if "discount_impact" in reg_features:
        base["discount_impact"] = float(np.clip((disc * price) / max(di_99, 1.0), 0, 1.5))
    if "price_per_page" in reg_features:
        base["price_per_page"] = float(np.clip((price / pages) / max(ppp_99, 1.0), 0, 1.5))

    return base


# ════════════════════════════════════════════════════════════════
#  PRIMARY KPI BONUS
# ════════════════════════════════════════════════════════════════

def _compute_primary_kpi_bonus(strat, objective, real_roi, real_conv, real_abandon, real_ctr):
    proj = strat.get("projectedMetrics", {})
    if objective == "optimize_marketing_roi":
        return max(0, proj.get("roi", real_roi) - real_roi) * 10.0
    elif objective == "increase_revenue":
        return max(0, proj.get("conversionRate", real_conv) - real_conv) * 8.0
    elif objective == "reduce_cart_abandonment":
        return max(0, real_abandon - proj.get("cartAbandonment", real_abandon)) * 8.0
    elif objective == "improve_conversion_rate":
        conv_delta = proj.get("conversionRate", real_conv) - real_conv
        ctr_delta  = proj.get("ctr", real_ctr) - real_ctr
        return max(0, conv_delta) * 7.0 + max(0, ctr_delta) * 3.0
    return 0.0


# ════════════════════════════════════════════════════════════════
#  WHAT-IF TABLE — FIX REGRESSOR-C
# ════════════════════════════════════════════════════════════════

def _build_whatif_table(
    base_vector, reg_features, reg_targets, kpi_regressor,
    real_conv, real_ctr, real_abandon, real_roi, ml_confidence,
    max_pages: float = 24.0,
    max_time:  float = 1800.0,
    di_99:     float = 1.0,
    ppp_99:    float = 1.0,
):
    rows = []
    for disc_pct in WHATIF_DISCOUNT_LEVELS:
        vec   = dict(base_vector)
        price = vec.get("unit_price", _SAFE_DEFAULTS["unit_price"])

        vec["discount_percent"] = float(disc_pct)

        # Update normalised derived features
        pages = max(float(vec.get("pages_viewed", _SAFE_DEFAULTS["pages_viewed"])), 1.0)
        time_ = float(vec.get("time_on_site_sec", _SAFE_DEFAULTS["time_on_site_sec"]))
        if "engagement_score" in vec:
            vec["engagement_score"] = float(
                np.clip((pages / max_pages) * 0.4 + (time_ / max_time) * 0.6, 0, 1)
            )
        if "discount_impact" in vec:
            vec["discount_impact"] = float(np.clip((disc_pct * price) / max(di_99, 1.0), 0, 1.5))
        if "price_per_page" in vec:
            vec["price_per_page"] = float(np.clip((price / pages) / max(ppp_99, 1.0), 0, 1.5))

        X    = np.array([[vec.get(f, base_vector.get(f, 0.0)) for f in reg_features]])
        pred = kpi_regressor.predict(X)[0]

        target_map = {"t_ctr": 0, "t_conv": 1, "t_abandon": 2, "t_roi": 3}
        conv_idx   = target_map.get("t_conv", 1)
        roi_idx    = target_map.get("t_roi", 3)

        conv_raw = float(pred[conv_idx]) if len(pred) > conv_idx else real_conv
        roi_raw  = float(pred[roi_idx])  if len(pred) > roi_idx  else real_roi

        alpha     = min(0.85, ml_confidence)
        proj_conv = round(real_conv + (conv_raw - real_conv) * alpha, 4)
        proj_roi  = round(real_roi  + (roi_raw  - real_roi)  * alpha, 4)
        proj_conv = max(0.0, min(100.0, proj_conv))

        rows.append({
            "discountPct":         disc_pct,
            "projectedConversion": proj_conv,
            "projectedROI":        proj_roi,
            "convLift":            round(proj_conv - real_conv, 4),
        })
    return rows


# ════════════════════════════════════════════════════════════════
#  ML-BASED KPI PROJECTION — FIX REGRESSOR-C
# ════════════════════════════════════════════════════════════════

def _ml_project_kpis(
    strategy_id, strategy_params, base_vector, reg_features, reg_targets,
    kpi_regressor, real_ctr, real_conv, real_abandon, real_roi, ml_confidence,
    objective="increase_revenue",
    max_pages: float = 24.0,
    max_time:  float = 1800.0,
    di_99:     float = 1.0,
    ppp_99:    float = 1.0,
):
    vec  = _apply_strategy_modifications(
        strategy_id, strategy_params, dict(base_vector),
        max_pages, max_time, di_99, ppp_99)
    X    = np.array([[vec.get(f, base_vector.get(f, 0.0)) for f in reg_features]])
    pred = kpi_regressor.predict(X)[0]

    target_map = {
        "t_ctr": "ctr", "t_conv": "conversionRate",
        "t_abandon": "cartAbandonment", "t_roi": "roi",
    }
    proj: Dict[str, float] = {}
    for i, tname in enumerate(reg_targets):
        proj[target_map.get(tname, tname)] = round(float(pred[i]), 4)

    ctr_pred     = proj.get("ctr",             real_ctr)
    conv_pred    = proj.get("conversionRate",  real_conv)
    abandon_pred = proj.get("cartAbandonment", real_abandon)
    roi_pred     = proj.get("roi",             real_roi)

    # Ensure minimum variance so strategies are distinguishable
    if abs(roi_pred - real_roi) < real_roi * 0.01:
        roi_pred = real_roi * 1.08
    if abs(conv_pred - real_conv) < real_conv * 0.005:
        conv_pred = real_conv * 1.05

    STRENGTH_MULTIPLIER = 1.8
    alpha = min(0.95, ml_confidence + 0.15) * STRENGTH_MULTIPLIER

    obj_strength = OBJECTIVE_KPI_STRENGTH.get(objective, {
        "ctr": 1.0, "conversionRate": 1.0, "cartAbandonment": 1.0, "roi": 1.0
    })

    proj_ctr     = round(real_ctr     + (ctr_pred     - real_ctr)     * alpha * obj_strength.get("ctr",             1.0), 4)
    proj_conv    = round(real_conv    + (conv_pred    - real_conv)    * alpha * obj_strength.get("conversionRate",  1.0), 4)
    proj_abandon = round(real_abandon + (abandon_pred - real_abandon) * alpha * obj_strength.get("cartAbandonment", 1.0), 2)
    proj_roi     = round(real_roi     + (roi_pred     - real_roi)     * alpha * obj_strength.get("roi",             1.0), 4)

    # Clamp
    proj_ctr     = max(0.0, min(100.0, proj_ctr))
    proj_conv    = max(0.0, min(100.0, proj_conv))
    proj_abandon = max(0.0, min(100.0, proj_abandon))
    proj_roi     = max(0.0, min(50.0,  proj_roi))
    if proj_roi > 4.0:
        proj_roi = round(real_roi + (proj_roi - real_roi) * 0.6, 4)

    # Minimum lifts
    min_lifts = OBJECTIVE_MIN_LIFT.get(objective, {})
    if min_lifts.get("conversionRate", 0) > 0:
        proj_conv = max(proj_conv, real_conv * (1 + min_lifts["conversionRate"]))
    if min_lifts.get("cartAbandonment", 0) < 0:
        proj_abandon = min(proj_abandon, real_abandon * (1 + min_lifts["cartAbandonment"]))
    if objective == "optimize_marketing_roi" and min_lifts.get("roi", 0) > 0:
        proj_roi = max(proj_roi, real_roi * (1 + min_lifts["roi"]))
    if objective in ("optimize_marketing_roi", "improve_conversion_rate") and min_lifts.get("ctr", 0) > 0:
        proj_ctr = max(proj_ctr, real_ctr * (1 + min_lifts["ctr"]))

    proj_conv    = max(0.0, min(100.0, proj_conv))
    proj_abandon = max(0.0, min(100.0, proj_abandon))
    proj_roi     = max(0.0, min(50.0,  proj_roi))
    proj_ctr     = max(0.0, min(100.0, proj_ctr))

    rev_lift = round(((proj_conv - real_conv) / max(real_conv, 0.01)) * 100, 1)
    return {
        "ctr":             proj_ctr,
        "conversionRate":  proj_conv,
        "cartAbandonment": proj_abandon,
        "roi":             proj_roi,
        "revenueLift":     rev_lift,
    }


# ════════════════════════════════════════════════════════════════
#  STRATEGY MODIFICATIONS — FIX REGRESSOR-C: normalised derived feats
# ════════════════════════════════════════════════════════════════

def _apply_strategy_modifications(
    strategy_id: str,
    params: dict,
    vec: dict,
    max_pages: float = 24.0,
    max_time:  float = 1800.0,
    di_99:     float = 1.0,
    ppp_99:    float = 1.0,
) -> dict:
    """
    Apply feature changes for a strategy.  All modifications work on raw
    pages/time/price/disc, then recompute normalised derived features at the end.
    """
    if strategy_id == "offer_discount":
        vec["discount_percent"]  = float(params.get("discount_pct", 10.0)) + 20.0
        vec["marketing_channel"] = CHANNEL_TO_INT.get("Email", 3)
        vec["user_type"]         = 1.0

    elif strategy_id == "retargeting_campaign":
        ch = params.get("channel", "Email")
        vec["marketing_channel"] = float(CHANNEL_TO_INT.get(ch, 3))
        vec["pages_viewed"]      = vec.get("pages_viewed", _SAFE_DEFAULTS["pages_viewed"]) * 1.30
        vec["time_on_site_sec"]  = vec.get("time_on_site_sec", _SAFE_DEFAULTS["time_on_site_sec"]) * 1.25

    elif strategy_id == "increase_ad_budget":
        ch  = params.get("channel", "Email")
        pct = float(params.get("budget_increase_pct", 20.0))
        vec["marketing_channel"] = float(CHANNEL_TO_INT.get(ch, 3))
        scale = 1.0 + (pct / 100.0) * 0.25
        vec["pages_viewed"]      = vec.get("pages_viewed", _SAFE_DEFAULTS["pages_viewed"]) * min(scale, 1.40)
        vec["time_on_site_sec"]  = vec.get("time_on_site_sec", _SAFE_DEFAULTS["time_on_site_sec"]) * min(scale, 1.30)

    elif strategy_id == "improve_checkout_ux":
        vec["pages_viewed"]      = vec.get("pages_viewed", _SAFE_DEFAULTS["pages_viewed"]) + 4.0
        vec["time_on_site_sec"]  = vec.get("time_on_site_sec", _SAFE_DEFAULTS["time_on_site_sec"]) + 90.0
        vec["discount_percent"]  = 0.0

    elif strategy_id == "add_urgency_signals":
        vec["pages_viewed"]      = vec.get("pages_viewed", _SAFE_DEFAULTS["pages_viewed"]) * 1.20
        vec["time_on_site_sec"]  = vec.get("time_on_site_sec", _SAFE_DEFAULTS["time_on_site_sec"]) * 0.90
        vec["discount_percent"]  = float(params.get("discount_pct", 5.0))

    elif strategy_id == "reallocate_channel_budget":
        vec["marketing_channel"] = float(CHANNEL_TO_INT.get("Email", 3))
        vec["unit_price"]        = vec.get("unit_price", _SAFE_DEFAULTS["unit_price"]) * 1.05
        vec["pages_viewed"]      = vec.get("pages_viewed", _SAFE_DEFAULTS["pages_viewed"]) * 1.25
        vec["time_on_site_sec"]  = vec.get("time_on_site_sec", _SAFE_DEFAULTS["time_on_site_sec"]) * 1.20

    elif strategy_id == "improve_ad_creative":
        vec["marketing_channel"] = float(CHANNEL_TO_INT.get("Instagram", 2))
        vec["pages_viewed"]      = vec.get("pages_viewed", _SAFE_DEFAULTS["pages_viewed"]) * 1.25

    elif strategy_id == "optimize_targeting":
        vec["user_type"]         = 0.0   # user_type=0 has higher conv in this dataset
        vec["pages_viewed"]      = vec.get("pages_viewed", _SAFE_DEFAULTS["pages_viewed"]) * 1.20
        vec["time_on_site_sec"]  = vec.get("time_on_site_sec", _SAFE_DEFAULTS["time_on_site_sec"]) * 1.15

    elif strategy_id == "user_strategy":
        actual_discount = float(params.get("discount", 0))
        actual_budget   = float(params.get("adBudgetIncrease", 0))
        ch      = params.get("channel", "Email")
        segment = params.get("customerSegment", "All Customers")
        vec["discount_percent"]  = actual_discount
        vec["marketing_channel"] = float(CHANNEL_TO_INT.get(ch, 3))
        vec["user_type"]         = float(SEGMENT_TO_INT.get(segment, 1))
        if actual_budget > 0:
            scale = 1.0 + (actual_budget / 100.0) * 0.15
            vec["pages_viewed"]     = vec.get("pages_viewed",     _SAFE_DEFAULTS["pages_viewed"])     * min(scale, 1.25)
            vec["time_on_site_sec"] = vec.get("time_on_site_sec", _SAFE_DEFAULTS["time_on_site_sec"]) * min(scale, 1.20)

    # ── Recompute normalised derived features ────────────────────────────
    pages = max(float(vec.get("pages_viewed",     _SAFE_DEFAULTS["pages_viewed"])),  1.0)
    time_ = float(vec.get("time_on_site_sec", _SAFE_DEFAULTS["time_on_site_sec"]))
    price = float(vec.get("unit_price",       _SAFE_DEFAULTS["unit_price"]))
    disc  = float(vec.get("discount_percent", _SAFE_DEFAULTS["discount_percent"]))

    if "engagement_score" in vec:
        vec["engagement_score"] = float(
            np.clip((pages / max_pages) * 0.4 + (time_ / max_time) * 0.6, 0, 1)
        )
    # FIX REGRESSOR-C: store NORMALISED values matching training scale
    if "discount_impact" in vec:
        vec["discount_impact"] = float(np.clip((disc * price) / max(di_99, 1.0), 0, 1.5))
    if "price_per_page" in vec:
        vec["price_per_page"] = float(np.clip((price / pages) / max(ppp_99, 1.0), 0, 1.5))

    return vec


# ════════════════════════════════════════════════════════════════
#  STRATEGY BUILDERS
# ════════════════════════════════════════════════════════════════

def _build_from_mechanism(
    direction, real_ctr, real_conv, real_abandon, real_roi,
    ml_confidence, eff_benchmarks, active_mechanisms,
    kpi_regressor, reg_features, reg_targets, base_vector,
    objective="increase_revenue",
    max_pages: float = 24.0,
    max_time:  float = 1800.0,
    di_99:     float = 1.0,
    ppp_99:    float = 1.0,
):
    defn = STRATEGY_MECHANISMS[direction]
    proj = _ml_project_kpis(
        direction, defn["params"], dict(base_vector), reg_features, reg_targets,
        kpi_regressor, real_ctr, real_conv, real_abandon, real_roi, ml_confidence,
        objective=objective, max_pages=max_pages, max_time=max_time,
        di_99=di_99, ppp_99=ppp_99)

    conv_lift   = (proj["conversionRate"]  - real_conv)    / max(real_conv,    0.01)
    abandon_red = (real_abandon - proj["cartAbandonment"]) / max(real_abandon, 0.01)
    roi_change  = (proj["roi"]             - real_roi)     / max(real_roi,     0.01)
    ctr_lift    = (proj["ctr"]             - real_ctr)     / max(real_ctr,     0.01)

    return {
        "id":               direction,
        "name":             defn["name"],
        "description":      defn["description"],
        "source":           "ai",
        "params":           defn["params"],
        "projectedMetrics": proj,
        "mlDriven":         True,
        "impact": {
            "ctr_lift":          1 + ctr_lift,
            "conversion_lift":   1 + conv_lift,
            "abandon_reduction": abandon_red,
            "roi_multiplier":    1 + roi_change,
        },
    }


def _build_user_strategy(
    strategy_input, real_ctr, real_conv, real_abandon, real_roi,
    ml_confidence, raw_kpis, eff_benchmarks,
    kpi_regressor, reg_features, reg_targets, base_vector,
    objective="increase_revenue",
    max_pages: float = 24.0,
    max_time:  float = 1800.0,
    di_99:     float = 1.0,
    ppp_99:    float = 1.0,
    channel_effectiveness: Optional[Dict] = None,
    seg_conv_affinity: Optional[Dict] = None,
    seg_abandon_affinity: Optional[Dict] = None,
    using_real_affinities: bool = False,
):
    ch_eff_map   = channel_effectiveness or _CHANNEL_CONV_RATIO_DEFAULT
    seg_conv_map = seg_conv_affinity     or _SEGMENT_CONV_AFFINITY_DEFAULT
    seg_ab_map   = seg_abandon_affinity  or _SEGMENT_ABANDON_AFFINITY_DEFAULT

    ad_budget = float(strategy_input.get("adBudgetIncrease", 10))
    discount  = float(strategy_input.get("discount", 5))
    channel   = strategy_input.get("channel", "Email")
    segment   = strategy_input.get("customerSegment", "All Customers")

    ch_eff  = ch_eff_map.get(channel, 1.00)
    seg_eff = seg_conv_map.get(segment, 1.00)
    seg_ab  = seg_ab_map.get(segment, 1.00)

    proj = _ml_project_kpis(
        "user_strategy", strategy_input, dict(base_vector), reg_features, reg_targets,
        kpi_regressor, real_ctr, real_conv, real_abandon, real_roi, ml_confidence,
        objective=objective, max_pages=max_pages, max_time=max_time,
        di_99=di_99, ppp_99=ppp_99)

    conv_lift   = (proj["conversionRate"]  - real_conv)    / max(real_conv,    0.01)
    abandon_red = (real_abandon - proj["cartAbandonment"]) / max(real_abandon, 0.01)
    roi_change  = (proj["roi"]             - real_roi)     / max(real_roi,     0.01)
    ctr_lift_r  = (proj["ctr"]             - real_ctr)     / max(real_ctr,     0.01)

    data_source_label = "your dataset" if using_real_affinities else "industry estimates"
    desc_parts = []
    if ad_budget > 0:
        desc_parts.append(
            f"Increase {channel} ad budget by {ad_budget:.0f}% "
            f"(channel effectiveness: {round(ch_eff * 100, 1)}% — {data_source_label})"
        )
    if discount > 0:
        desc_parts.append(
            f"offer {discount:.0f}% discount targeting {segment} "
            f"(conv affinity: {round(seg_eff * 100, 1)}%, "
            f"abandon: {round(seg_ab * 100, 1)}% — {data_source_label})"
        )
    if not desc_parts:
        desc_parts.append(f"Custom strategy targeting {segment} via {channel}")

    description = (
        f"{'. '.join(desc_parts)}. "
        f"ML-projected from real KPIs: CTR={real_ctr:.4f}%, conv={real_conv:.4f}%, "
        f"abandon={real_abandon:.2f}%, ROI={real_roi:.4f}x. "
        f"ML confidence: {round(ml_confidence * 100, 1)}%."
    )

    name_parts = []
    if ad_budget > 0: name_parts.append(f"+{ad_budget:.0f}% {channel} budget")
    if discount  > 0: name_parts.append(f"{discount:.0f}% discount")
    if segment not in ("All Customers", "All"): name_parts.append(f"→ {segment}")
    strategy_name = "Your strategy: " + (
        ", ".join(name_parts) if name_parts else f"{channel} + {segment}"
    )

    return {
        "id":     "user_strategy",
        "name":   strategy_name,
        "description": description,
        "source": "user",
        "channel": channel,
        "segment": segment,
        "params": {
            "adBudgetIncrease":     ad_budget,
            "discount":             discount,
            "channel":              channel,
            "customerSegment":      segment,
            "channelEffectiveness": round(ch_eff, 4),
            "segmentAffinity":      round(seg_eff, 4),
            "segmentAbandonRate":   round(seg_ab, 4),
            "affinitiesSource":     data_source_label,
        },
        "projectedMetrics": proj,
        "mlDriven":         True,
        "impact": {
            "ctr_lift":          1 + ctr_lift_r,
            "conversion_lift":   1 + conv_lift,
            "abandon_reduction": abandon_red,
            "roi_multiplier":    1 + roi_change,
        },
    }


# ════════════════════════════════════════════════════════════════
#  ENRICHMENT
# ════════════════════════════════════════════════════════════════

def _enrich_strategies(strategies, objective, real_conv, real_roi):
    if not strategies:
        return
    best      = strategies[0]
    best_proj = best.get("projectedMetrics", {})
    KPI_FOCUS = {
        "increase_revenue":        ("conversionRate",  "conversion rate",  "higher"),
        "reduce_cart_abandonment": ("cartAbandonment", "cart abandonment", "lower"),
        "improve_conversion_rate": ("conversionRate",  "conversion rate",  "higher"),
        "optimize_marketing_roi":  ("roi",             "ROI",              "higher"),
    }
    kpi_key, kpi_label, direction = KPI_FOCUS.get(
        objective, ("conversionRate", "conversion rate", "higher"))
    for i, strat in enumerate(strategies):
        proj    = strat.get("projectedMetrics", {})
        score   = strat.get("score", 0)
        sid     = strat.get("id", "")
        proj_val  = proj.get(kpi_key, 0)
        real_val  = real_conv if kpi_key == "conversionRate" else real_roi
        delta     = round(proj_val - real_val, 4)
        delta_str = f"+{delta:.4f}" if delta >= 0 else f"{delta:.4f}"
        strat["whySelected"] = (
            f"This strategy improves {kpi_label} by {delta_str} "
            f"because {_strategy_mechanism_explanation(sid, objective)}."
        )
        if i > 0:
            best_val  = best_proj.get(kpi_key, 0)
            gap_label = round(abs(best_val - proj_val), 4)
            strat["whyNotSelected"] = (
                f"This strategy was not ranked #1 because it projects a {kpi_label} of "
                f"{proj_val:.4f} vs {best_val:.4f} for the top pick "
                f"({gap_label:.4f} gap)."
            )
        else:
            strat["whyNotSelected"] = None
        if score >= 80:
            conf_label = "High"; risk_label = "Low"
        elif score >= 65:
            conf_label = "Medium-high"; risk_label = "Low-medium"
        elif score >= 52:
            conf_label = "Medium"; risk_label = "Medium"
        else:
            conf_label = "Low-medium"; risk_label = "Medium-high"
        if sid == "offer_discount":
            risk_label = "Medium (ROI may drop slightly due to margin impact)"
        strat["confidenceBand"] = conf_label
        strat["riskLabel"]      = risk_label


def _strategy_mechanism_explanation(strategy_id: str, objective: str) -> str:
    EXPLANATIONS = {
        "offer_discount":            "discounts directly influence purchase decisions per the dataset's feature importance",
        "retargeting_campaign":      "retargeting re-engages high-intent visitors, improving CTR and conversion at lower acquisition cost",
        "increase_ad_budget":        "scaling spend on the top channel increases qualified traffic volume per the ML model",
        "improve_checkout_ux":       "simplifying checkout directly reduces the friction that causes abandonment — the highest-impact lever",
        "add_urgency_signals":       "scarcity signals accelerate purchase decisions, effective for on-the-fence cart visitors",
        "reallocate_channel_budget": "shifting spend to Email delivers more qualified sessions per dollar, improving ROI",
        "improve_ad_creative":       "refreshed ad copy and visuals boost CTR and top-of-funnel traffic quality",
        "optimize_targeting":        "tighter segmentation raises conversion affinity of incoming traffic based on real dataset patterns",
    }
    return EXPLANATIONS.get(
        strategy_id,
        f"this mechanism directly addresses the KPIs prioritised for '{objective}'"
    )


# ════════════════════════════════════════════════════════════════
#  DIRECTION SELECTION
# ════════════════════════════════════════════════════════════════

def _get_importance_driven_directions(fix_directions, feature_importance):
    if not fix_directions:
        return [
            "improve_checkout_ux", "retargeting_campaign", "offer_discount",
            "reallocate_channel_budget", "increase_ad_budget",
            "improve_ad_creative", "optimize_targeting",
        ]
    if not feature_importance:
        return fix_directions[:7]
    feat_imp_dict = {f["feature"]: f["importance"] for f in feature_importance if "feature" in f}
    STRAT_FEATURE_MAP = {
        "offer_discount":            ["discount_percent", "discount_impact", "user_type"],
        "retargeting_campaign":      ["marketing_channel", "engagement_score", "pages_viewed"],
        "increase_ad_budget":        ["marketing_channel", "pages_viewed", "time_on_site_sec"],
        "improve_checkout_ux":       ["pages_viewed", "time_on_site_sec", "engagement_score"],
        "add_urgency_signals":       ["time_on_site_sec", "engagement_score"],
        "reallocate_channel_budget": ["marketing_channel", "unit_price"],
        "improve_ad_creative":       ["marketing_channel", "pages_viewed"],
        "optimize_targeting":        ["marketing_channel", "user_type", "engagement_score"],
    }
    all_known = list(STRATEGY_MECHANISMS.keys())
    combined  = list(fix_directions) + [d for d in all_known if d not in fix_directions]
    scored = {
        d: sum(feat_imp_dict.get(f, 0.0) for f in STRAT_FEATURE_MAP.get(d, []))
        for d in combined
    }
    return sorted(combined, key=lambda d: scored.get(d, 0.0), reverse=True)[:7]


# ════════════════════════════════════════════════════════════════
#  SCORING
# ════════════════════════════════════════════════════════════════

def _get_objective_weights(objective, active_obj_weights=None):
    if active_obj_weights and objective in active_obj_weights:
        w = active_obj_weights[objective]
        return {
            "conversion": w.get("conversion", w.get("conversion_rate", 30)),
            "abandon":    w.get("abandon",    w.get("cart_abandonment", 25)),
            "roi":        w.get("roi", 20),
            "ctr":        w.get("ctr", 10),
        }
    return DEFAULT_OBJECTIVE_WEIGHTS.get(objective, DEFAULT_OBJECTIVE_WEIGHTS["increase_revenue"])


def _compute_score(
    strategy, objective, ml_confidence,
    real_ctr, real_conv, real_abandon, real_roi,
    eff_benchmarks, active_obj_weights=None,
):
    weights = _get_objective_weights(objective, active_obj_weights)
    proj    = strategy.get("projectedMetrics", {})
    BENCHMARKS = {
        "ctr":              eff_benchmarks.get("ctr",             2.0),
        "conversion_rate":  eff_benchmarks.get("conversion_rate", 5.0),
        "cart_abandonment": eff_benchmarks.get("cart_abandonment", 60.0),
        "roi":              eff_benchmarks.get("roi",             3.0),
    }
    STRETCH = 0.15
    conv_imp  = max(0, proj.get("conversionRate",  real_conv)    - real_conv)
    ctr_imp   = max(0, proj.get("ctr",             real_ctr)     - real_ctr)
    abn_imp   = max(0, real_abandon - proj.get("cartAbandonment", real_abandon))
    roi_delta = proj.get("roi", real_roi) - real_roi
    roi_imp   = roi_delta if roi_delta >= 0 else roi_delta * 0.5
    b_conv = BENCHMARKS["conversion_rate"]; b_ctr = BENCHMARKS["ctr"]
    b_ab   = BENCHMARKS["cart_abandonment"]; b_roi = BENCHMARKS["roi"]
    conv_gap    = max(0.01, b_conv - real_conv) if real_conv    < b_conv else max(0.01, real_conv    * STRETCH)
    ctr_gap     = max(0.01, b_ctr  - real_ctr)  if real_ctr     < b_ctr  else max(0.01, real_ctr     * STRETCH)
    abandon_gap = max(0.01, real_abandon - b_ab) if real_abandon > b_ab   else max(0.01, real_abandon * STRETCH)
    roi_gap     = max(0.01, b_roi  - real_roi)   if real_roi     < b_roi  else max(0.01, real_roi     * STRETCH)
    conv_s = min(1.0,  conv_imp / conv_gap)
    ctr_s  = min(1.0,  ctr_imp  / ctr_gap)
    abn_s  = min(1.0,  abn_imp  / abandon_gap)
    roi_s  = min(1.0,  max(-1.0, roi_imp / roi_gap))
    kpi_score = (
        weights.get("conversion", 0) * conv_s +
        weights.get("abandon",    0) * abn_s  +
        weights.get("roi",        0) * roi_s  +
        weights.get("ctr",        0) * ctr_s
    )
    return round(min(100, max(0, kpi_score * ml_confidence)), 1)


def _rescale_scores(strategies):
    max_raw = max((s["_raw_score"] for s in strategies), default=0)
    if max_raw <= 0:
        for s in strategies:
            s["score"] = 55.0
        return
    FLOOR = 55.0; CEILING = 93.0
    for s in strategies:
        s["score"] = round(FLOOR + (s["_raw_score"] / max_raw) * (CEILING - FLOOR), 1)


def _merge_learned_with_defaults(learned):
    merged = {}
    for strat_id, defn in STRATEGY_MECHANISMS.items():
        default_s = defn.get("default_strengths", {})
        learned_s = learned.get(strat_id, {})
        merged_s  = {}
        for kpi in ["ctr", "conversion_rate", "cart_abandonment", "roi"]:
            lv = learned_s.get(kpi)
            merged_s[kpi] = float(lv) if (lv is not None and lv != 0.0) else float(default_s.get(kpi, 0.05))
        if strat_id == "offer_discount":
            merged_s["roi"] = -abs(merged_s["roi"])
        merged[strat_id] = merged_s
    return merged


def _overlaps_with_user(direction: str, strategy_input: dict) -> bool:
    if direction == "offer_discount"     and float(strategy_input.get("discount",          0)) > 0:
        return True
    if direction == "increase_ad_budget" and float(strategy_input.get("adBudgetIncrease", 0)) > 0:
        return True
    return False