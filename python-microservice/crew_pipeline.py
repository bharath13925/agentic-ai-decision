"""
AgenticIQ — CrewAI Agent Pipeline v3.1

FIXES vs v3.0:

  FIX RATE-LIMIT-1 — GROQ RATE LIMIT RETRY WITH BACKOFF:
    Previously a single 429 rate-limit error caused the entire CrewAI pipeline
    to fall back to rule-based immediately. Now implements exponential backoff
    retry (up to 3 attempts, waiting 15 / 30 / 60 seconds) before falling back.
    This handles the Groq free-tier TPM (tokens-per-minute) limit gracefully.

  FIX RATE-LIMIT-2 — REDUCE TASK PROMPT SIZE:
    Each CrewAI task prompt is now trimmed to reduce token consumption per call.
    Large JSON payloads are capped so the total tokens per task stay well within
    the 12,000 TPM limit.

  FIX CREW-BUNDLE-1 — retained from v3.0:
    kpi_predictor_bundle (dict) passed instead of path.

  FIX CREW-BUNDLE-2 — retained from v3.0:
    Fallback rule-based pipeline passes kpi_predictor_bundle correctly.

All other v3.0 logic retained.
"""

from __future__ import annotations

import os
import json
import time
import traceback as _tb
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
load_dotenv()

# ── Groq LLM for CrewAI ──────────────────────────────────────────────────────
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip()
GROQ_MODEL   = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile").strip()

_CREW_LLM           = None
_CREW_LLM_AVAILABLE = False

if GROQ_API_KEY:
    try:
        from crewai import LLM as CrewLLM
        _CREW_LLM = CrewLLM(
            model=f"groq/{GROQ_MODEL}",
            api_key=GROQ_API_KEY,
            temperature=0.1,
            max_tokens=800,   # FIX RATE-LIMIT-2: reduced from 2048 to save TPM
        )
        _CREW_LLM_AVAILABLE = True
        print(f"[CrewAI] ✅ LLM ready — groq/{GROQ_MODEL} (max_tokens=800)")
    except Exception as e:
        print(f"[CrewAI] ⚠️  LLM init failed ({e}) — using rule-based fallback")
else:
    print("[CrewAI] ⚠️  GROQ_API_KEY not set — using rule-based fallback")

# ── Rule-based agents (data providers + fallback) ────────────────────────────
from agents import observer_agent, analyst_agent, simulation_agent, decision_agent

# ── Retry config for Groq rate limits ────────────────────────────────────────
_GROQ_RETRY_DELAYS = [15, 30, 60]  # seconds between attempts


def _is_rate_limit_error(err: Exception) -> bool:
    """Return True if the exception is a Groq / LiteLLM rate-limit error."""
    err_str = str(err).lower()
    return (
        "rate_limit" in err_str
        or "ratelimit" in err_str
        or "429" in err_str
        or "tokens per minute" in err_str
        or "tpm" in err_str
    )


# ════════════════════════════════════════════════════════════════
#  PUBLIC ENTRY POINT
# ════════════════════════════════════════════════════════════════

def run_crew_pipeline(
    project_id:                  str,
    objective:                   str,
    simulation_mode:             str,
    strategy_input:              Dict[str, Any],
    kpi_summary:                 Dict[str, Any],
    ml_ensemble_acc:             float,
    avg_purchase_proba:          Optional[float],
    feature_importance:          List[Dict],
    kpi_predictor_bundle:        Dict[str, Any],
    dataset_stats:               Dict[str, Any],
    learned_mechanism_strengths: Optional[Dict] = None,
    learned_objective_weights:   Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    Orchestrate the full 4-agent pipeline.
    Uses real CrewAI agents when GROQ_API_KEY is set, with retry on rate limits.
    Falls back to rule-based pipeline if all retries are exhausted.

    kpi_predictor_bundle: Pre-loaded dict from GridFS (contains 'model', 'features',
                          'targets', 'di_99', 'ppp_99', 'max_pages', 'max_time', etc.)
    """
    if _CREW_LLM_AVAILABLE:
        # FIX RATE-LIMIT-1: _GROQ_RETRY_DELAYS[attempt-1] caused IndexError on the
        # 4th iteration (attempt=4, delay=60) because attempt-1=3 is out of bounds
        # for a 3-element list. Fixed by iterating over delays directly with zip.
        all_delays = [0] + _GROQ_RETRY_DELAYS   # [0, 15, 30, 60]
        for attempt, delay in enumerate(all_delays, start=1):
            if delay > 0:
                print(f"[CrewAI] ⏳ Rate limit — waiting {delay}s before attempt {attempt}…")
                time.sleep(delay)
            try:
                result = _run_crewai_pipeline(
                    project_id=project_id,
                    objective=objective,
                    simulation_mode=simulation_mode,
                    strategy_input=strategy_input,
                    kpi_summary=kpi_summary,
                    ml_ensemble_acc=ml_ensemble_acc,
                    avg_purchase_proba=avg_purchase_proba,
                    feature_importance=feature_importance,
                    kpi_predictor_bundle=kpi_predictor_bundle,
                    dataset_stats=dataset_stats,
                    learned_mechanism_strengths=learned_mechanism_strengths,
                    learned_objective_weights=learned_objective_weights,
                )
                return result
            except Exception as crew_err:
                # attempt < len(all_delays) means there is still a next delay to use
                if _is_rate_limit_error(crew_err) and attempt < len(all_delays):
                    next_wait = all_delays[attempt]  # safe: attempt is 1-based, array is 0-based
                    print(
                        f"[CrewAI] ⚠️  Rate limit on attempt {attempt} — "
                        f"will retry in {next_wait}s"
                    )
                    continue
                # Non-rate-limit error or retries exhausted
                print(f"[CrewAI] Pipeline error ({crew_err}) — falling back to rule-based")
                _tb.print_exc()
                break

    return _run_fallback_pipeline(
        objective=objective,
        simulation_mode=simulation_mode,
        strategy_input=strategy_input,
        kpi_summary=kpi_summary,
        ml_ensemble_acc=ml_ensemble_acc,
        avg_purchase_proba=avg_purchase_proba,
        feature_importance=feature_importance,
        kpi_predictor_bundle=kpi_predictor_bundle,
        dataset_stats=dataset_stats,
        learned_mechanism_strengths=learned_mechanism_strengths,
        learned_objective_weights=learned_objective_weights,
    )


# ════════════════════════════════════════════════════════════════
#  REAL CREWAI PIPELINE
#  FIX RATE-LIMIT-2: task prompts trimmed for lower token usage
# ════════════════════════════════════════════════════════════════

def _run_crewai_pipeline(
    project_id, objective, simulation_mode, strategy_input,
    kpi_summary, ml_ensemble_acc, avg_purchase_proba,
    feature_importance, kpi_predictor_bundle, dataset_stats,
    learned_mechanism_strengths, learned_objective_weights,
) -> Dict[str, Any]:
    from crewai import Agent, Task, Crew, Process

    # Step 1: Run rule-based agents to get structured data (grounded context)
    rb = _run_fallback_pipeline(
        objective=objective,
        simulation_mode=simulation_mode,
        strategy_input=strategy_input,
        kpi_summary=kpi_summary,
        ml_ensemble_acc=ml_ensemble_acc,
        avg_purchase_proba=avg_purchase_proba,
        feature_importance=feature_importance,
        kpi_predictor_bundle=kpi_predictor_bundle,
        dataset_stats=dataset_stats,
        learned_mechanism_strengths=learned_mechanism_strengths,
        learned_objective_weights=learned_objective_weights,
    )

    obs_data  = rb["observerResult"]
    ana_data  = rb["analystResult"]
    sim_data  = rb["simulationResult"]
    dec_data  = rb["decisionResult"]

    obj_label = objective.replace("_", " ").title()
    kpi       = kpi_summary or {}

    # FIX RATE-LIMIT-2: compact JSON to reduce token count
    kpi_compact = (
        f"CTR={kpi.get('avgCTR',0):.4f}% | Conv={kpi.get('avgConversionRate',0):.4f}% | "
        f"Abandon={kpi.get('avgCartAbandonment',0):.2f}% | ROI={kpi.get('avgROI',0):.4f}x | "
        f"Sessions={int(kpi.get('totalSessions',0))} | Purchases={int(kpi.get('totalPurchases',0))}"
    )

    benchmarks   = obs_data.get("benchmarksUsed", {})
    bm_compact   = (
        f"CTR_bench={benchmarks.get('ctr',0):.4f}% | Conv_bench={benchmarks.get('conversionRate',0):.4f}% | "
        f"Abandon_bench={benchmarks.get('cartAbandonment',0):.2f}% | ROI_bench={benchmarks.get('roi',0):.4f}x"
    )
    health       = obs_data.get("healthScore", 0)
    obs_list     = obs_data.get("observations", [])
    obs_summary  = "; ".join([
        f"{o['metric']}={o['value']}{o['unit']} vs {o['benchmark']}{o['unit']} [{o['severity']}]"
        for o in obs_list
    ])

    # Top 5 features only to save tokens
    top_features_str = " | ".join([
        f"{f.get('feature')}={f.get('importance',0):.4f}"
        for f in (feature_importance or [])[:5]
    ])

    strategies   = sim_data.get("strategies", [])[:4]
    strat_summary = " | ".join([
        f"#{s.get('rank')} '{s.get('name','')}' score={s.get('score',0):.1f} "
        f"conv={s.get('projectedMetrics',{}).get('conversionRate',0):.4f}% "
        f"roi={s.get('projectedMetrics',{}).get('roi',0):.4f}x"
        for s in strategies
    ])

    rec         = dec_data.get("recommendation", {})
    top_strat   = rec.get("strategyName", "")
    confidence  = rec.get("confidence",   0)
    ai_insight  = rec.get("aiInsight",    "")[:200]  # truncate
    improvement = rec.get("improvement",  {})
    diag        = ana_data.get("diagnosis", "")[:300]  # truncate
    fix_dirs    = ", ".join(ana_data.get("fixDirections", [])[:4])

    # ── Define CrewAI Agents ──────────────────────────────────────────────────

    observer_agent_crew = Agent(
        role="KPI Health Monitor",
        goal="Assess KPI health against benchmarks, classify severity, surface key gaps.",
        backstory="Seasoned BI analyst. Every statement references exact data numbers.",
        llm=_CREW_LLM,
        verbose=False,
        allow_delegation=False,
    )

    analyst_agent_crew = Agent(
        role="ML Root Cause Analyst",
        goal="Identify root causes of KPI gaps using ML feature importance.",
        backstory="Data scientist. Root causes grounded in dataset patterns only.",
        llm=_CREW_LLM,
        verbose=False,
        allow_delegation=False,
    )

    simulation_agent_crew = Agent(
        role="Strategy Simulation Specialist",
        goal="Explain ML-simulated strategy projections using dataset evidence.",
        backstory="Quantitative strategist. Projections come from trained KPI regressor.",
        llm=_CREW_LLM,
        verbose=False,
        allow_delegation=False,
    )

    decision_agent_crew = Agent(
        role="Decision Intelligence Officer",
        goal="Select optimal strategy and provide concise, data-backed recommendation.",
        backstory="Executive strategist. Every recommendation backed by model evidence. Under 200 words.",
        llm=_CREW_LLM,
        verbose=False,
        allow_delegation=False,
    )

    # ── Define CrewAI Tasks (shorter prompts to save TPM) ────────────────────

    observer_task = Task(
        description=(
            f"Objective: {obj_label}\n"
            f"KPIs: {kpi_compact}\n"
            f"Benchmarks: {bm_compact}\n"
            f"Health Score: {health}/100\n"
            f"Observations: {obs_summary}\n\n"
            f"Write a 3-sentence KPI health assessment with severity classification "
            f"and priority order for fixing. Reference exact numbers only."
        ),
        expected_output=(
            "Per-KPI severity with gap values, priority order, overall health verdict."
        ),
        agent=observer_agent_crew,
    )

    analyst_task = Task(
        description=(
            f"Objective: {obj_label}\n"
            f"KPI issues: {obs_summary}\n"
            f"Top ML features: {top_features_str}\n"
            f"Diagnosis: {diag}\n"
            f"Fix directions: {fix_dirs}\n\n"
            f"In 3-4 sentences: explain the primary root cause citing feature importance, "
            f"and confirm the top fix directions with ML justification."
        ),
        expected_output=(
            "Primary root cause with feature importance evidence; confirmed fix directions."
        ),
        agent=analyst_agent_crew,
        context=[observer_task],
    )

    simulation_task = Task(
        description=(
            f"Objective: {obj_label} | ML Accuracy: {ml_ensemble_acc:.1f}%\n"
            f"Strategies: {strat_summary}\n\n"
            f"In 3 sentences: explain why the top-ranked strategy best addresses the root "
            f"causes. Note the risk/reward trade-off vs the runner-up."
        ),
        expected_output=(
            "Top strategy mechanism explanation, root cause alignment, risk/reward comparison."
        ),
        agent=simulation_agent_crew,
        context=[observer_task, analyst_task],
    )

    decision_task = Task(
        description=(
            f"Objective: {obj_label}\n"
            f"Top strategy: '{top_strat}' (confidence {confidence}%)\n"
            f"Conv: {improvement.get('before',0):.4f}% → {improvement.get('after',0):.4f}% "
            f"(+{improvement.get('conversionLift',0):.1f}%)\n"
            f"Base insight: {ai_insight}\n"
            f"ML accuracy: {ml_ensemble_acc:.1f}%\n\n"
            f"Write a 150-word executive recommendation: confirm '{top_strat}', "
            f"give 3 implementation steps, state expected KPI improvements, name the primary risk."
        ),
        expected_output=(
            "Strategy confirmation with evidence, 3 action steps, KPI improvements, primary risk."
        ),
        agent=decision_agent_crew,
        context=[observer_task, analyst_task, simulation_task],
    )

    # ── Build and run the Crew ────────────────────────────────────────────────
    crew = Crew(
        agents=[observer_agent_crew, analyst_agent_crew, simulation_agent_crew, decision_agent_crew],
        tasks=[observer_task, analyst_task, simulation_task, decision_task],
        process=Process.sequential,
        verbose=False,
    )

    print(f"[CrewAI] 🚀 Running crew pipeline for project={project_id} | objective={objective}")
    crew_output = crew.kickoff()

    # ── Extract task outputs ──────────────────────────────────────────────────
    def _get_task_text(idx: int) -> str:
        try:
            if hasattr(crew_output, "tasks_output") and crew_output.tasks_output:
                t = crew_output.tasks_output[idx]
                return str(t.raw) if hasattr(t, "raw") else str(t)
            if hasattr(crew_output, "raw"):
                return str(crew_output.raw) if idx == 3 else ""
        except Exception:
            pass
        return ""

    observer_narrative   = _get_task_text(0)
    analyst_narrative    = _get_task_text(1)
    simulation_narrative = _get_task_text(2)
    decision_narrative   = _get_task_text(3)

    # ── Enrich structured results with LLM narrative ──────────────────────────
    enhanced_observer = dict(obs_data)
    if observer_narrative:
        enhanced_observer["crewAiNarrative"] = observer_narrative
        enhanced_observer["summary"]         = observer_narrative[:600]

    enhanced_analyst = dict(ana_data)
    if analyst_narrative:
        enhanced_analyst["crewAiNarrative"] = analyst_narrative
        enhanced_analyst["diagnosis"]       = analyst_narrative[:800]

    enhanced_simulation = dict(sim_data)
    if simulation_narrative:
        enhanced_simulation["crewAiNarrative"] = simulation_narrative

    enhanced_decision = dict(dec_data)
    if decision_narrative and enhanced_decision.get("recommendation"):
        enhanced_decision["crewAiNarrative"] = decision_narrative
        enhanced_decision["recommendation"]["aiInsight"] = decision_narrative[:700]
    enhanced_decision["agentFramework"] = "crewai"

    print(f"[CrewAI] ✅ Pipeline complete for project={project_id}")

    return {
        "observerResult":   enhanced_observer,
        "analystResult":    enhanced_analyst,
        "simulationResult": enhanced_simulation,
        "decisionResult":   enhanced_decision,
    }


# ════════════════════════════════════════════════════════════════
#  RULE-BASED FALLBACK PIPELINE
#  FIX CREW-BUNDLE-2: passes kpi_predictor_bundle (dict) to simulation_agent
# ════════════════════════════════════════════════════════════════

def _run_fallback_pipeline(
    objective, simulation_mode, strategy_input,
    kpi_summary, ml_ensemble_acc, avg_purchase_proba,
    feature_importance, kpi_predictor_bundle, dataset_stats,
    learned_mechanism_strengths, learned_objective_weights,
) -> Dict[str, Any]:
    print(f"[Pipeline] Rule-based pipeline | objective={objective}")

    observer_result = observer_agent.run(kpi_summary, objective)
    print(f"[Pipeline] Observer: health={observer_result['healthScore']}")

    analyst_result = analyst_agent.run(
        observer_result, objective, kpi_summary, feature_importance)

    # FIX CREW-BUNDLE-2: pass kpi_predictor_bundle (pre-loaded dict) not path
    simulation_result = simulation_agent.run(
        analyst_result=analyst_result,
        observer_result=observer_result,
        simulation_mode=simulation_mode,
        strategy_input=strategy_input,
        objective=objective,
        ml_ensemble_acc=ml_ensemble_acc,
        kpi_summary=kpi_summary,
        avg_purchase_proba=avg_purchase_proba,
        learned_mechanism_strengths=learned_mechanism_strengths,
        learned_objective_weights=learned_objective_weights,
        kpi_predictor_path=None,             # not used — bundle is passed directly
        kpi_predictor_bundle=kpi_predictor_bundle,
        feature_importance=feature_importance,
        uploads_dir=None,
        dataset_stats=dataset_stats,
    )

    decision_result = decision_agent.run(
        simulation_result=simulation_result,
        analyst_result=analyst_result,
        observer_result=observer_result,
        objective=objective,
        ml_ensemble_acc=ml_ensemble_acc,
        kpi_summary=kpi_summary,
        avg_purchase_proba=avg_purchase_proba,
        simulation_mode=simulation_mode,
        per_strategy_ml_scores={},
        dataset_stats=dataset_stats,
    )
    decision_result["agentFramework"] = "rule-based"

    return {
        "observerResult":   observer_result,
        "analystResult":    analyst_result,
        "simulationResult": simulation_result,
        "decisionResult":   decision_result,
    }