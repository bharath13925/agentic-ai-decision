"""
AgenticIQ — Simulation Agent v8.0

FIXES from v7.8:

  FIX FEAT-A — ECO_FEATURES LIST ALIGNED WITH app.py v15.0.0:
    The previous ECO_FEATURES list had old features (quantity, discount_amount,
    rating) that app.py v15.0.0 drops during training (ECO_DROP_COLUMNS) and
    was missing the new interaction features added in v15:
      added_to_cart, time_per_page, cart_engage, cart_time_ratio,
      cart_pages_ratio, is_weekend, ch_x_user, season_x_cat, price_x_disc.
    This misalignment caused feature vector dimension mismatches when scoring
    strategies with PKL models, leading to silent wrong predictions.
    Fixed: ECO_FEATURES now exactly mirrors ECO_RAW_FEATURES + ECO_DERIVED_FEATURES
    from app.py v15.0.0.

  FIX FEAT-B — _SAFE_DEFAULTS EXTENDED FOR ALL NEW FEATURES:
    _SAFE_DEFAULTS was missing entries for all new interaction features.
    When _build_base_vector or _apply_strategy_modifications looked up a
    missing key it silently got 0.0 for all new features, producing a
    systematically wrong base vector.
    Fixed: all 11 interaction features now have correct real-median defaults.

  FIX FEAT-C (v8.0 REVERTED) — quantity / discount_amount / rating RESTORED:
    app.py v15.0 trains WITH quantity, discount_amount, rating in ECO_RAW_FEATURES.
    These are included in the PKL feature_cols. simulation_agent must include
    them in ECO_RAW_FEATURES and _SAFE_DEFAULTS so dimension matches the PKL.
    The PKL bundle feature_cols is always authoritative for scoring matrix shape.

  FIX FEAT-D — _build_base_vector EXTENDED FOR ALL DERIVED FEATURES:
    The function now builds all 11 derived features consistently with app.py.

  FIX FEAT-E — _apply_strategy_modifications RECOMPUTES ALL DERIVED FEATURES:
    All 11 derived features are now recomputed after modifications, not just
    the original 3 (engagement_score, discount_impact, price_per_page).

  All fixes from v7.8 retained (OBJ-A/B/C, REGRESSOR-A/B/C/D).
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
#  SAFE DEFAULTS — ALIGNED WITH app.py v15.0.0 _SAFE_DEFAULTS
#  All raw and derived interaction features included.
#  NOTE: discount_impact and price_per_page are RAW values here;
#  they are normalised inside _build_base_vector / _apply_strategy_modifications
#  using di_99 / ppp_99 from the pkl bundle.
# ════════════════════════════════════════════════════════════════

_SAFE_DEFAULTS = {
    # ── Raw features (ECO_RAW_FEATURES) ──────────────────────────
    "device_type":        1.0,
    "user_type":          1.0,
    "marketing_channel":  3.0,        # Email
    "product_category":   4.0,
    "unit_price":         691.73,     # real median
    "quantity":           2.0,        # real median
    "discount_percent":   10.0,       # real median
    "discount_amount":    65.815,     # real median (disc_pct * unit_price / 100 * qty)
    "pages_viewed":       13.0,       # real median
    "time_on_site_sec":   903.0,      # real median
    "payment_method":     2.0,
    "visit_day":          16.0,
    "visit_month":        7.0,
    "visit_weekday":      3.0,
    "visit_season":       2.0,
    "location":           111.0,      # real median
    "added_to_cart":      0.64,       # real median probability
    "rating":             4.0,        # real median product rating
    # ── Derived features (ECO_DERIVED_FEATURES) ──────────────────
    "engagement_score":   0.509,      # real median (normalised 0–1)
    "discount_impact":    6917.3,     # raw: disc_pct * unit_price (normalised in fn)
    "price_per_page":     53.21,      # raw: unit_price / pages_viewed (normalised in fn)
    "time_per_page":      69.46,      # time_on_site_sec / pages_viewed
    "cart_engage":        0.326,      # added_to_cart * engagement_score
    "cart_time_ratio":    0.323,      # added_to_cart * (time / max_time)
    "cart_pages_ratio":   0.348,      # added_to_cart * (pages / max_pages)
    "is_weekend":         0.286,      # fraction of weekend visits
    "ch_x_user":          22.0,       # marketing_channel * 7 + user_type
    "season_x_cat":       18.0,       # visit_season * 8 + product_category
    "price_x_disc":       69.17,      # unit_price * discount_percent / 100
}


# ════════════════════════════════════════════════════════════════
#  ECO_FEATURES — MUST EXACTLY MATCH app.py v15.0.0
#  ECO_RAW_FEATURES + ECO_DERIVED_FEATURES
#  v8.0 FIX: quantity, discount_amount, rating restored to match app.py training.
#  PKL bundle feature_cols is authoritative for scoring matrix shape.
# ════════════════════════════════════════════════════════════════

# Raw features — must match app.py ECO_RAW_FEATURES exactly
# app.py trains WITH quantity, discount_amount, rating — PKL feature_cols includes them
ECO_RAW_FEATURES = [
    "device_type", "user_type", "marketing_channel", "product_category",
    "unit_price", "quantity", "discount_percent", "discount_amount",
    "pages_viewed", "time_on_site_sec",
    "added_to_cart",
    "rating", "payment_method", "visit_day", "visit_month",
    "visit_weekday", "visit_season", "location",
]

# Derived features computed post-split (exact match with app.py ECO_DERIVED_FEATURES)
ECO_DERIVED_FEATURES = [
    "engagement_score",
    "discount_impact",
    "price_per_page",
    "time_per_page",
    "cart_engage",
    "cart_time_ratio",
    "cart_pages_ratio",
    "is_weekend",
    "ch_x_user",
    "season_x_cat",
    "price_x_disc",
]

# Full feature list — used for strategy vector building and PKL scoring
ECO_FEATURES = ECO_RAW_FEATURES + ECO_DERIVED_FEATURES

WHATIF_DISCOUNT_LEVELS = [5, 10, 15, 20, 25, 30]


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
    kpi_predictor_bundle:        Optional[Dict[str, Any]] = None,
    feature_importance:          Optional[list] = None,
    uploads_dir:                 Optional[str]  = None,
    dataset_stats:               Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:

    # Accept either a pre-loaded bundle dict (from GridFS via app.py)
    # or fall back to loading from disk path (legacy local-only path).
    if kpi_predictor_bundle is not None:
        reg_bundle = kpi_predictor_bundle
    elif kpi_predictor_path and os.path.exists(kpi_predictor_path):
        # Legacy: load from disk (kept for backward-compat / testing)
        with open(kpi_predictor_path, "rb") as f:
            reg_bundle = pickle.load(f)
    else:
        raise ValueError(
            f"[SimulationAgent] kpi_predictor bundle not provided and path "
            f"'{kpi_predictor_path}' not found on disk. "
            f"PKLs are stored in GridFS — app.py must load and pass kpi_predictor_bundle."
        )

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

    # FIX OBJ-A / OBJ-B: directions are computed AND filtered to OBJECTIVE_ALLOWED in one step.
    allowed_for_objective = OBJECTIVE_ALLOWED.get(objective, list(STRATEGY_MECHANISMS.keys()))
    merged_directions = _get_importance_driven_directions(
        fix_directions, feature_importance, objective
    )
    # Final safety net — deduplicate while preserving order
    seen = set()
    merged_directions_deduped = []
    for d in merged_directions:
        if d not in seen:
            seen.add(d)
            merged_directions_deduped.append(d)
    merged_directions = merged_directions_deduped
    print(
        f"[Sim] Directions for objective '{objective}' (allowed={allowed_for_objective}): "
        f"{merged_directions}"
    )

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
    _enrich_strategies(strategies, objective, real_conv, real_roi, real_abandon, real_ctr)

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
#  BASE VECTOR — FIX REGRESSOR-B + FIX FEAT-D
#  Builds ALL derived features including new interaction features
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
    FIX FEAT-D: now also builds all 11 derived interaction features.
    """
    base: Dict[str, float] = {}
    ds = dataset_stats or {}

    # Build raw features from dataset_stats medians or SAFE_DEFAULTS
    for feat in reg_features:
        if feat in ECO_DERIVED_FEATURES:
            continue  # handled below
        if ds and feat in ds and isinstance(ds[feat], dict):
            base[feat] = float(ds[feat].get("median", _SAFE_DEFAULTS.get(feat, 0.0)))
        else:
            base[feat] = _SAFE_DEFAULTS.get(feat, 0.0)

    # Retrieve raw values for derived feature computation
    pages = max(float(base.get("pages_viewed",     _SAFE_DEFAULTS["pages_viewed"])),  1.0)
    time_ = float(base.get("time_on_site_sec", _SAFE_DEFAULTS["time_on_site_sec"]))
    price = float(base.get("unit_price",       _SAFE_DEFAULTS["unit_price"]))
    disc  = float(base.get("discount_percent", _SAFE_DEFAULTS["discount_percent"]))
    atc   = float(base.get("added_to_cart",    _SAFE_DEFAULTS["added_to_cart"]))
    mc    = float(base.get("marketing_channel", _SAFE_DEFAULTS["marketing_channel"]))
    ut    = float(base.get("user_type",        _SAFE_DEFAULTS["user_type"]))
    vs    = float(base.get("visit_season",     _SAFE_DEFAULTS["visit_season"]))
    pc    = float(base.get("product_category", _SAFE_DEFAULTS["product_category"]))
    wd    = float(base.get("visit_weekday",    _SAFE_DEFAULTS["visit_weekday"]))

    # Compute all derived features consistently with app.py v15.0.0
    engagement = float(np.clip((pages / max_pages) * 0.4 + (time_ / max_time) * 0.6, 0, 1))

    if "engagement_score"  in reg_features: base["engagement_score"]  = engagement
    if "discount_impact"   in reg_features: base["discount_impact"]   = float(np.clip((disc * price) / max(di_99,  1.0), 0, 1.5))
    if "price_per_page"    in reg_features: base["price_per_page"]    = float(np.clip((price / pages) / max(ppp_99, 1.0), 0, 1.5))
    if "time_per_page"     in reg_features: base["time_per_page"]     = float(time_ / pages)
    if "cart_engage"       in reg_features: base["cart_engage"]       = float(atc * engagement)
    if "cart_time_ratio"   in reg_features: base["cart_time_ratio"]   = float(atc * (time_ / max(max_time, 1.0)))
    if "cart_pages_ratio"  in reg_features: base["cart_pages_ratio"]  = float(atc * (pages / max(max_pages, 1.0)))
    if "is_weekend"        in reg_features: base["is_weekend"]        = float(wd >= 5)
    if "ch_x_user"         in reg_features: base["ch_x_user"]         = float(mc * 7 + ut)
    if "season_x_cat"      in reg_features: base["season_x_cat"]      = float(vs * 8 + pc)
    if "price_x_disc"      in reg_features: base["price_x_disc"]      = float(price * disc / 100.0)

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
#  WHAT-IF TABLE
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
        pages = max(float(vec.get("pages_viewed", _SAFE_DEFAULTS["pages_viewed"])), 1.0)
        time_ = float(vec.get("time_on_site_sec", _SAFE_DEFAULTS["time_on_site_sec"]))
        atc   = float(vec.get("added_to_cart",    _SAFE_DEFAULTS["added_to_cart"]))
        mc    = float(vec.get("marketing_channel", _SAFE_DEFAULTS["marketing_channel"]))
        ut    = float(vec.get("user_type",         _SAFE_DEFAULTS["user_type"]))
        vs    = float(vec.get("visit_season",      _SAFE_DEFAULTS["visit_season"]))
        pc    = float(vec.get("product_category",  _SAFE_DEFAULTS["product_category"]))
        wd    = float(vec.get("visit_weekday",     _SAFE_DEFAULTS["visit_weekday"]))

        vec["discount_percent"] = float(disc_pct)

        # Recompute ALL derived features after discount change
        engagement = float(np.clip((pages / max_pages) * 0.4 + (time_ / max_time) * 0.6, 0, 1))
        if "engagement_score"  in vec: vec["engagement_score"]  = engagement
        if "discount_impact"   in vec: vec["discount_impact"]   = float(np.clip((disc_pct * price) / max(di_99, 1.0), 0, 1.5))
        if "price_per_page"    in vec: vec["price_per_page"]    = float(np.clip((price / pages) / max(ppp_99, 1.0), 0, 1.5))
        if "time_per_page"     in vec: vec["time_per_page"]     = float(time_ / pages)
        if "cart_engage"       in vec: vec["cart_engage"]       = float(atc * engagement)
        if "cart_time_ratio"   in vec: vec["cart_time_ratio"]   = float(atc * (time_ / max(max_time, 1.0)))
        if "cart_pages_ratio"  in vec: vec["cart_pages_ratio"]  = float(atc * (pages / max(max_pages, 1.0)))
        if "is_weekend"        in vec: vec["is_weekend"]        = float(wd >= 5)
        if "ch_x_user"         in vec: vec["ch_x_user"]         = float(mc * 7 + ut)
        if "season_x_cat"      in vec: vec["season_x_cat"]      = float(vs * 8 + pc)
        if "price_x_disc"      in vec: vec["price_x_disc"]      = float(price * disc_pct / 100.0)

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
#  ML-BASED KPI PROJECTION
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
#  STRATEGY MODIFICATIONS — FIX FEAT-E: recompute ALL derived features
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
    Apply feature changes for a strategy. All modifications work on raw
    pages/time/price/disc, then recompute ALL derived features at the end.
    FIX FEAT-E: now recomputes all 11 interaction features, not just 3.
    """
    if strategy_id == "offer_discount":
        vec["discount_percent"]  = float(params.get("discount_pct", 10.0)) + 20.0
        vec["marketing_channel"] = CHANNEL_TO_INT.get("Email", 3)
        vec["user_type"]         = 1.0
        vec["added_to_cart"]     = 1.0

    elif strategy_id == "retargeting_campaign":
        ch = params.get("channel", "Email")
        vec["marketing_channel"] = float(CHANNEL_TO_INT.get(ch, 3))
        vec["pages_viewed"]      = vec.get("pages_viewed", _SAFE_DEFAULTS["pages_viewed"]) * 1.30
        vec["time_on_site_sec"]  = vec.get("time_on_site_sec", _SAFE_DEFAULTS["time_on_site_sec"]) * 1.25
        vec["added_to_cart"]     = 0.9

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
        vec["added_to_cart"]     = 1.0

    elif strategy_id == "add_urgency_signals":
        vec["pages_viewed"]      = vec.get("pages_viewed", _SAFE_DEFAULTS["pages_viewed"]) * 1.20
        vec["time_on_site_sec"]  = vec.get("time_on_site_sec", _SAFE_DEFAULTS["time_on_site_sec"]) * 0.90
        vec["discount_percent"]  = float(params.get("discount_pct", 5.0))
        vec["added_to_cart"]     = vec.get("added_to_cart", _SAFE_DEFAULTS["added_to_cart"]) * 1.2

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
        vec["added_to_cart"]     = vec.get("added_to_cart", _SAFE_DEFAULTS["added_to_cart"]) * 1.1

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

    # ── Recompute ALL derived features after modifications — FIX FEAT-E ──────
    pages = max(float(vec.get("pages_viewed",     _SAFE_DEFAULTS["pages_viewed"])),  1.0)
    time_ = float(vec.get("time_on_site_sec", _SAFE_DEFAULTS["time_on_site_sec"]))
    price = float(vec.get("unit_price",       _SAFE_DEFAULTS["unit_price"]))
    disc  = float(vec.get("discount_percent", _SAFE_DEFAULTS["discount_percent"]))
    atc   = float(vec.get("added_to_cart",    _SAFE_DEFAULTS["added_to_cart"]))
    mc    = float(vec.get("marketing_channel", _SAFE_DEFAULTS["marketing_channel"]))
    ut    = float(vec.get("user_type",        _SAFE_DEFAULTS["user_type"]))
    vs    = float(vec.get("visit_season",     _SAFE_DEFAULTS["visit_season"]))
    pc    = float(vec.get("product_category", _SAFE_DEFAULTS["product_category"]))
    wd    = float(vec.get("visit_weekday",    _SAFE_DEFAULTS["visit_weekday"]))

    engagement = float(np.clip((pages / max_pages) * 0.4 + (time_ / max_time) * 0.6, 0, 1))

    if "engagement_score"  in vec: vec["engagement_score"]  = engagement
    if "discount_impact"   in vec: vec["discount_impact"]   = float(np.clip((disc * price) / max(di_99,  1.0), 0, 1.5))
    if "price_per_page"    in vec: vec["price_per_page"]    = float(np.clip((price / pages) / max(ppp_99, 1.0), 0, 1.5))
    if "time_per_page"     in vec: vec["time_per_page"]     = float(time_ / pages)
    if "cart_engage"       in vec: vec["cart_engage"]       = float(atc * engagement)
    if "cart_time_ratio"   in vec: vec["cart_time_ratio"]   = float(atc * (time_ / max(max_time, 1.0)))
    if "cart_pages_ratio"  in vec: vec["cart_pages_ratio"]  = float(atc * (pages / max(max_pages, 1.0)))
    if "is_weekend"        in vec: vec["is_weekend"]        = float(wd >= 5)
    if "ch_x_user"         in vec: vec["ch_x_user"]         = float(mc * 7 + ut)
    if "season_x_cat"      in vec: vec["season_x_cat"]      = float(vs * 8 + pc)
    if "price_x_disc"      in vec: vec["price_x_disc"]      = float(price * disc / 100.0)

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

def _enrich_strategies(strategies, objective, real_conv, real_roi, real_abandon=0.0, real_ctr=0.0):
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

    # FIX OBJ-C: use the correct real KPI baseline for the primary metric
    real_kpi_map = {
        "conversionRate":  real_conv,
        "cartAbandonment": real_abandon,
        "roi":             real_roi,
        "ctr":             real_ctr,
    }
    real_val = real_kpi_map.get(kpi_key, real_conv)

    for i, strat in enumerate(strategies):
        proj    = strat.get("projectedMetrics", {})
        score   = strat.get("score", 0)
        sid     = strat.get("id", "")
        proj_val  = proj.get(kpi_key, 0)
        # For lower-is-better (cart abandonment): improvement = decrease
        if direction == "lower":
            delta = round(real_val - proj_val, 4)
        else:
            delta = round(proj_val - real_val, 4)
        delta_str = f"+{delta:.4f}" if delta >= 0 else f"{delta:.4f}"
        strat["whySelected"] = (
            f"This strategy improves {kpi_label} by {delta_str} "
            f"because {_strategy_mechanism_explanation(sid, objective)}."
        )
        if i > 0:
            best_val  = best_proj.get(kpi_key, 0)
            if direction == "lower":
                gap_label = round(abs(proj_val - best_val), 4)
            else:
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
#  FIX OBJ-A: objective parameter added — function only returns
#  strategies that belong to OBJECTIVE_ALLOWED[objective].
# ════════════════════════════════════════════════════════════════

def _get_importance_driven_directions(fix_directions, feature_importance, objective: str = "increase_revenue"):
    """
    Return a ranked list of strategy directions valid for `objective`.

    RULES:
      1. Only directions in OBJECTIVE_ALLOWED[objective] are eligible.
      2. Directions from the analyst's fixDirections are ranked first.
      3. Remaining eligible directions are ranked by feature-importance
         alignment score.
      4. Any direction NOT in OBJECTIVE_ALLOWED[objective] is silently dropped.
    """
    allowed = OBJECTIVE_ALLOWED.get(objective, list(STRATEGY_MECHANISMS.keys()))

    if not fix_directions:
        if not feature_importance:
            return list(allowed)
        feat_imp_dict = {f["feature"]: f["importance"] for f in feature_importance if "feature" in f}
        STRAT_FEATURE_MAP = {
            "offer_discount":            ["discount_percent", "discount_impact", "user_type", "price_x_disc"],
            "retargeting_campaign":      ["marketing_channel", "engagement_score", "pages_viewed", "added_to_cart"],
            "increase_ad_budget":        ["marketing_channel", "pages_viewed", "time_on_site_sec", "ch_x_user"],
            "improve_checkout_ux":       ["pages_viewed", "time_on_site_sec", "engagement_score", "price_per_page", "cart_engage"],
            "add_urgency_signals":       ["time_on_site_sec", "engagement_score", "cart_time_ratio"],
            "reallocate_channel_budget": ["marketing_channel", "unit_price", "discount_impact", "ch_x_user"],
            "improve_ad_creative":       ["marketing_channel", "pages_viewed", "engagement_score"],
            "optimize_targeting":        ["marketing_channel", "user_type", "engagement_score", "ch_x_user"],
        }
        scored = {
            d: sum(feat_imp_dict.get(f, 0.0) for f in STRAT_FEATURE_MAP.get(d, []))
            for d in allowed
        }
        return sorted(allowed, key=lambda d: scored.get(d, 0.0), reverse=True)

    # Build candidate list: analyst directions first, then remaining allowed directions
    analyst_valid = [d for d in fix_directions if d in allowed]
    remaining     = [d for d in allowed if d not in analyst_valid]

    if not feature_importance:
        return analyst_valid + remaining

    feat_imp_dict = {f["feature"]: f["importance"] for f in feature_importance if "feature" in f}
    STRAT_FEATURE_MAP = {
        "offer_discount":            ["discount_percent", "discount_impact", "user_type", "price_x_disc"],
        "retargeting_campaign":      ["marketing_channel", "engagement_score", "pages_viewed", "added_to_cart"],
        "increase_ad_budget":        ["marketing_channel", "pages_viewed", "time_on_site_sec", "ch_x_user"],
        "improve_checkout_ux":       ["pages_viewed", "time_on_site_sec", "engagement_score", "price_per_page", "cart_engage"],
        "add_urgency_signals":       ["time_on_site_sec", "engagement_score", "cart_time_ratio"],
        "reallocate_channel_budget": ["marketing_channel", "unit_price", "discount_impact", "ch_x_user"],
        "improve_ad_creative":       ["marketing_channel", "pages_viewed", "engagement_score"],
        "optimize_targeting":        ["marketing_channel", "user_type", "engagement_score", "ch_x_user"],
    }

    combined = analyst_valid + remaining
    scored   = {
        d: sum(feat_imp_dict.get(f, 0.0) for f in STRAT_FEATURE_MAP.get(d, []))
        for d in combined
    }
    # Analyst directions get a priority boost so they appear first
    for d in analyst_valid:
        scored[d] = scored.get(d, 0.0) + 1000.0

    return sorted(combined, key=lambda d: scored.get(d, 0.0), reverse=True)


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