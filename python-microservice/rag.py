"""
AgenticIQ — RAG Engine v3.2

FIXES vs v3.1:

  FIX RAG-D — DOUBLE-STORE BUG (faiss=48 instead of 24):
    store_agent_context() is called twice per pipeline run:
      1. Auto-store inside run_agent_pipeline (app.py)
      2. Manual store triggered by Node MlController._autoStoreRagContext
    The old code deleted _STORES[pid] at the top but did NOT delete the
    on-disk .pkl file, so _get_or_create_store immediately reloaded the
    old 24 docs from disk and then added another 24 on top → 48 vectors.
    Fix: explicitly delete the .pkl file before rebuilding the store so
    every store_agent_context call starts from exactly zero docs.

  FIX RAG-E — FAST_PATH_MAX RAISED TO 60:
    With keyword-hash embeddings (no Ollama), FAISS cosine similarity
    between hash vectors is nearly random — the top-4 retrieved docs are
    essentially arbitrary. For doc sets ≤ 60, stuffing ALL docs into the
    prompt is strictly better than random FAISS retrieval because Groq's
    context window (32k tokens) can easily fit 60 short chunks.
    Raised FAST_PATH_MAX from 30 → 60 so the fast-path stuffing is always
    used for typical pipeline runs (24–30 docs per project).

  FIX RAG-F — RICHER OBSERVER / ANALYST CHUNK TEXT:
    Observer health chunk now includes explicit keywords like "observer
    agent", "health score", "KPI health", "severity", "benchmark" so
    keyword-hash retrieval can match user queries like "what is the
    observer agent health" or "what does the observer agent do".
    Analyst diagnosis chunk similarly enriched.

  All v3.1 fixes retained (Ollama server probe, permanent disable on
  first embed failure, GROQ_API_KEY whitespace strip).
"""

from __future__ import annotations

import os
import re
import pickle
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from dotenv import load_dotenv

# Load python-microservice/.env
load_dotenv()

# ── Groq LLM — primary provider ──────────────────────────────────────────────
# FIX RAG-C: strip whitespace so "GROQ_API_KEY= gsk_xxx" works correctly
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip()
GROQ_MODEL   = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile").strip()
_GROQ_OK     = False
_groq_client = None

if GROQ_API_KEY:
    try:
        from groq import Groq as _GroqClient
        _groq_client = _GroqClient(api_key=GROQ_API_KEY)
        _GROQ_OK = True
        print(f"[RAG] ✅ Groq LLM ready — model: {GROQ_MODEL}")
    except ImportError:
        print("[RAG] groq package not installed — run: pip install groq")
    except Exception as e:
        print(f"[RAG] Groq init failed: {e}")
else:
    print("[RAG] ⚠️  GROQ_API_KEY not set — set it in python-microservice/.env")

# ── Ollama — embeddings only (optional, falls back to keyword hash) ───────────
# FIX RAG-A: probe the Ollama server at startup, not just the package import.
_ollama    = None
_OLLAMA_OK = False

try:
    import ollama as _ollama_pkg  # type: ignore

    # Attempt a lightweight server health check.
    _ollama_pkg.list()          # raises if server is not reachable
    _ollama    = _ollama_pkg
    _OLLAMA_OK = True
    print("[RAG] ✅ Ollama server reachable — using nomic-embed-text for embeddings")

except ImportError:
    print("[RAG] Ollama package not installed — using keyword-hash embedding fallback")

except Exception as _ollama_probe_err:
    print(
        f"[RAG] ⚠️  Ollama server not reachable ({type(_ollama_probe_err).__name__}) "
        f"— using keyword-hash embedding fallback. "
        f"Start Ollama or ignore this if you don't need semantic embeddings."
    )

# ── FAISS — vector search (optional, falls back to cosine) ───────────────────
try:
    import faiss as _faiss
    _FAISS_OK = True
except ImportError:
    _faiss    = None
    _FAISS_OK = False
    print("[RAG] faiss-cpu not installed — using cosine similarity fallback.")

# ── Config ────────────────────────────────────────────────────────────────────

EMBED_MODEL = "nomic-embed-text"
LLM_DEFAULT = GROQ_MODEL
EMBED_DIM   = 768

# FIX RAG-E: raised from 30 → 60.
# With keyword-hash embeddings, FAISS retrieval is near-random for small doc
# sets. Stuffing ALL docs into the Groq prompt is strictly better because:
#   - Groq context window = 32k tokens, easily fits 60 short chunks
#   - All relevant context is guaranteed to be present
#   - No information lost to poor keyword-hash similarity ranking
FAST_PATH_MAX = 60

# In-memory registry
_STORES: Dict[str, Dict[str, Any]] = {}


# ════════════════════════════════════════════════════════════════
#  PERSISTENCE
# ════════════════════════════════════════════════════════════════

def _persist_dir() -> str:
    base = os.environ.get("UPLOADS_DIR",
           os.path.join(os.path.dirname(__file__), "uploads"))
    d = os.path.join(base, "rag")
    os.makedirs(d, exist_ok=True)
    return d


def _store_path(pid: str) -> str:
    return os.path.join(_persist_dir(), f"{pid}_rag.pkl")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ════════════════════════════════════════════════════════════════
#  EMBEDDING
# ════════════════════════════════════════════════════════════════

def _embed(text: str) -> np.ndarray:
    """
    Embed via Ollama nomic-embed-text; fall back to keyword hashing.
    FIX RAG-B: on the first connection error, permanently disable Ollama.
    """
    global _OLLAMA_OK, _ollama

    if _OLLAMA_OK and _ollama is not None:
        try:
            resp = _ollama.embeddings(model=EMBED_MODEL, prompt=text[:2000])
            emb  = np.array(resp["embedding"], dtype=np.float32)
            if len(emb) < EMBED_DIM:
                emb = np.pad(emb, (0, EMBED_DIM - len(emb)))
            return emb[:EMBED_DIM]
        except Exception as e:
            _OLLAMA_OK = False
            print(
                f"[RAG] Ollama embed failed ({type(e).__name__}) — "
                f"permanently switching to keyword-hash fallback for this session."
            )

    return _keyword_embed(text, EMBED_DIM)


def _keyword_embed(text: str, dim: int = EMBED_DIM) -> np.ndarray:
    """Deterministic hash-based word-count vector — reproducible, fast."""
    tokens = re.findall(r"\b\w{2,}\b", text.lower())
    vec    = np.zeros(dim, dtype=np.float32)
    for tok in tokens:
        idx = int(hashlib.md5(tok.encode()).hexdigest(), 16) % dim
        vec[idx] += 1.0
    norm = float(np.linalg.norm(vec))
    return vec / norm if norm > 0 else vec


# ════════════════════════════════════════════════════════════════
#  STORE MANAGEMENT
# ════════════════════════════════════════════════════════════════

def _get_or_create_store(pid: str) -> Dict[str, Any]:
    if pid in _STORES:
        return _STORES[pid]

    path = _store_path(pid)
    if os.path.exists(path):
        try:
            with open(path, "rb") as f:
                bundle = pickle.load(f)
            vectors = bundle.get("vectors", [])
            index   = None
            if _FAISS_OK and vectors:
                arr   = np.array(vectors, dtype=np.float32)
                dim   = arr.shape[1] if arr.ndim == 2 else EMBED_DIM
                index = _faiss.IndexFlatL2(dim)
                index.add(arr)
            store = {
                "project_id": bundle["project_id"],
                "docs":       bundle["docs"],
                "vectors":    vectors,
                "index":      index,
                "metadata":   bundle.get("metadata", {}),
            }
            _STORES[pid] = store
            print(f"[RAG] Loaded {pid}: {len(store['docs'])} docs from disk.")
            return store
        except Exception as e:
            print(f"[RAG] Failed to load store for {pid}: {e}")

    index = _faiss.IndexFlatL2(EMBED_DIM) if _FAISS_OK else None
    store = {
        "project_id": pid,
        "docs":       [],
        "vectors":    [],
        "index":      index,
        "metadata": {"created_at": _now(), "doc_count": 0, "objective": None},
    }
    _STORES[pid] = store
    return store


def _persist(pid: str) -> None:
    store = _STORES.get(pid)
    if not store:
        return
    try:
        with open(_store_path(pid), "wb") as f:
            pickle.dump({
                "project_id": store["project_id"],
                "docs":       store["docs"],
                "vectors":    store["vectors"],
                "metadata":   store["metadata"],
            }, f)
    except Exception as e:
        print(f"[RAG] Persist failed for {pid}: {e}")


def _add_doc(store: Dict, doc_id: str, doc_type: str, text: str) -> bool:
    if not text or not text.strip():
        return False
    text = text.strip()
    emb  = _embed(text)
    store["docs"].append({"id": doc_id, "type": doc_type, "text": text})
    store["vectors"].append(emb.tolist())
    if _FAISS_OK and store["index"] is not None:
        store["index"].add(np.array([emb], dtype=np.float32))
    return True


def _vec_count(store: Dict) -> int:
    if _FAISS_OK and store.get("index") is not None:
        return int(store["index"].ntotal)
    return len(store.get("vectors", []))


# ════════════════════════════════════════════════════════════════
#  RETRIEVAL
# ════════════════════════════════════════════════════════════════

def _retrieve(store: Dict, query: str, top_k: int = 4) -> List[Dict]:
    docs = store.get("docs", [])
    if not docs:
        return []
    k     = min(top_k, len(docs))
    q_emb = _embed(query)

    # ── FAISS path ────────────────────────────────────────────────
    if _FAISS_OK and store.get("index") is not None and store["index"].ntotal > 0:
        D, I = store["index"].search(np.array([q_emb], dtype=np.float32), k)
        return [
            {**docs[int(idx)], "score": float(dist)}
            for dist, idx in zip(D[0], I[0])
            if 0 <= int(idx) < len(docs)
        ]

    # ── Cosine fallback ───────────────────────────────────────────
    if not store["vectors"]:
        return docs[:k]
    vecs   = np.array(store["vectors"], dtype=np.float32)
    norms  = np.linalg.norm(vecs, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    q_norm = q_emb / (float(np.linalg.norm(q_emb)) or 1.0)
    cosines = (vecs / norms) @ q_norm
    top_idx = np.argsort(-cosines)[:k]
    return [{**docs[int(i)], "score": float(cosines[i])} for i in top_idx]


# ════════════════════════════════════════════════════════════════
#  DOCUMENT CHUNKING
#  FIX RAG-F: enriched chunk text with more searchable keywords
# ════════════════════════════════════════════════════════════════

def _chunk_agent_result(
    agent_result: Dict[str, Any],
    kpi_summary:  Dict[str, Any],
    objective:    str,
) -> List[Tuple[str, str, str]]:
    """Convert agent pipeline outputs into (doc_id, doc_type, text) tuples."""
    chunks: List[Tuple[str, str, str]] = []
    obj_label = objective.replace("_", " ").title()

    # 1. Objective
    chunks.append(("objective", "objective",
        f"Business Objective: {obj_label}. All analysis and recommendations target this goal."
    ))

    # 2. KPI baseline
    if kpi_summary:
        chunks.append(("kpi_summary", "kpi", (
            f"KPI baseline summary from dataset: "
            f"CTR (click-through rate)={kpi_summary.get('avgCTR',0):.4f}%, "
            f"Conversion Rate={kpi_summary.get('avgConversionRate',0):.4f}%, "
            f"Cart Abandonment Rate={kpi_summary.get('avgCartAbandonment',0):.2f}%, "
            f"ROI (return on investment)={kpi_summary.get('avgROI',0):.4f}x. "
            f"Total Revenue={kpi_summary.get('totalRevenue',0):.2f}, "
            f"Total Sessions={kpi_summary.get('totalSessions',0)}, "
            f"Total Purchases={kpi_summary.get('totalPurchases',0)}, "
            f"Total Clicks={kpi_summary.get('totalClicks',0)}, "
            f"Total Impressions={kpi_summary.get('totalImpressions',0)}."
        )))

    # 3. Observer Agent
    # FIX RAG-F: richer text with explicit "observer agent", "health score",
    # "KPI health", "severity", "benchmark" keywords for better retrieval.
    obs = agent_result.get("observerResult", {}) or {}
    if obs:
        health  = obs.get("healthScore", 0)
        summary = obs.get("summary", "")
        bm      = obs.get("benchmarksUsed", {})

        # Main observer health chunk — keyword-rich
        chunks.append(("observer_summary", "observer", (
            f"Observer Agent KPI Health Check: "
            f"The Observer Agent monitors all KPIs and computes a health score. "
            f"Current health score = {health}/100. "
            f"A score of 100 means all KPIs are healthy. "
            f"Score below 70 indicates warning issues. "
            f"Score below 40 indicates critical KPI problems. "
            f"This project health score is {health}/100 — "
            f"{'critical issues detected' if health < 40 else 'warning level' if health < 70 else 'healthy'}. "
            f"Summary: {summary}"
        )))

        # Benchmarks chunk
        if bm:
            chunks.append(("observer_benchmarks", "observer_benchmarks", (
                f"Observer Agent dynamic benchmarks used for KPI comparison: "
                f"CTR target benchmark={bm.get('ctr',0):.4f}%, "
                f"Conversion Rate target benchmark={bm.get('conversionRate',0):.4f}%, "
                f"Cart Abandonment target benchmark={bm.get('cartAbandonment',0):.2f}%, "
                f"ROI target benchmark={bm.get('roi',0):.4f}x. "
                f"These benchmarks are dynamically computed from the dataset."
            )))

        # Individual KPI observations — one chunk each, keyword-rich
        for i, o in enumerate(obs.get("observations", [])[:4]):
            metric   = o.get("metric", "")
            value    = o.get("value", 0)
            bench    = o.get("benchmark", 0)
            unit     = o.get("unit", "")
            severity = o.get("severity", "")
            gap      = o.get("gap", 0)
            message  = o.get("message", "")
            chunks.append((f"obs_{i}", "observer_detail", (
                f"Observer Agent KPI observation for {metric}: "
                f"Actual value = {value}{unit}, "
                f"Benchmark target = {bench}{unit}, "
                f"Severity = {severity}, "
                f"Gap from benchmark = {gap}{unit}. "
                f"Status: {message}"
            )))

    # 4. Analyst Agent
    analyst = agent_result.get("analystResult", {}) or {}
    if analyst:
        diag      = analyst.get("diagnosis", "")
        obj_focus = analyst.get("objectiveFocus", "")
        obj_lens  = analyst.get("objectiveLens", "")

        if diag:
            chunks.append(("analyst_diagnosis", "analyst", (
                f"Analyst Agent root cause diagnosis: "
                f"Objective focus = {obj_focus}. "
                f"Analysis lens: {obj_lens}. "
                f"Diagnosis: {diag}"
            )))

        dirs = analyst.get("fixDirections", [])
        if dirs:
            chunks.append(("fix_directions", "analyst_directions", (
                f"Analyst Agent ML-ranked strategy fix directions for {obj_label}: "
                f"{', '.join(d.replace('_',' ') for d in dirs[:5])}. "
                f"These directions are ranked by feature importance from the trained ML model."
            )))

        for i, rc in enumerate(analyst.get("rootCauses", [])[:4]):
            causes = "; ".join(
                f"{c.get('cause','')[:100]} (confidence {c.get('confidence',0):.0%})"
                for c in rc.get("causes", [])[:2]
            )
            chunks.append((f"root_cause_{i}", "root_cause", (
                f"Analyst Agent root cause for {rc.get('metric','')} "
                f"(severity: {rc.get('severity','')}, "
                f"actual value: {rc.get('value',0)}{rc.get('unit','')}, "
                f"benchmark: {rc.get('benchmark',0)}{rc.get('unit','')}, "
                f"gap: {rc.get('gap',0)}{rc.get('unit','')}): "
                f"{causes}."
            )))

    # 5. Simulation Agent
    sim = agent_result.get("simulationResult", {}) or {}
    if sim:
        chunks.append(("sim_meta", "simulation_meta", (
            f"Simulation Agent metadata: "
            f"ML-driven projections via RandomForestRegressor KPI predictor (kpi_predictor.pkl). "
            f"Affinities source: {sim.get('affinitiesSource','unknown')}. "
            f"Weights used: {sim.get('weightsUsed','default')}. "
            f"Directions used: {', '.join(sim.get('directionsUsed', [])[:5])}."
        )))

        for i, strat in enumerate(sim.get("strategies", [])[:5]):
            proj = strat.get("projectedMetrics", {})
            chunks.append((f"strategy_{i}", "strategy", (
                f"Strategy #{i+1} '{strat.get('name','')}' "
                f"(source: {strat.get('source','ai')}): "
                f"{strat.get('description','')} "
                f"Score: {strat.get('score',0):.1f}/100. "
                f"Projected KPIs: "
                f"Conversion Rate={proj.get('conversionRate',0):.4f}%, "
                f"Cart Abandonment={proj.get('cartAbandonment',0):.2f}%, "
                f"ROI={proj.get('roi',0):.4f}x, "
                f"CTR={proj.get('ctr',0):.4f}%, "
                f"Revenue Lift=+{proj.get('revenueLift',0):.1f}%."
            )))

        whatif = sim.get("whatIfTable", [])
        if whatif:
            best = max(whatif, key=lambda r: r.get("convLift", 0))
            chunks.append(("whatif_best", "whatif", (
                f"What-If simulation: Optimal discount scenario = {best.get('discountPct',0)}% discount "
                f"projects conversion rate of {best.get('projectedConversion',0):.4f}% "
                f"(lift +{best.get('convLift',0):.4f}% vs baseline), "
                f"projected ROI = {best.get('projectedROI',0):.4f}x."
            )))

    # 6. Decision Agent
    decision = agent_result.get("decisionResult", {}) or {}
    if decision:
        rec = decision.get("recommendation", {}) or {}
        if rec:
            proj = rec.get("projectedMetrics", {})
            imp  = rec.get("improvement", {})
            chunks.append(("recommendation", "decision_recommendation", (
                f"Decision Agent top recommendation: '{rec.get('strategyName','')}' "
                f"with confidence {rec.get('confidence',0)}% "
                f"and score {rec.get('score',0):.1f}/100. "
                f"PKL-validated: {rec.get('pklScoringUsed',False)}. "
                f"ML accuracy: {decision.get('mlAccuracy',0):.1f}%. "
                f"AI Insight: {rec.get('aiInsight','')[:300]}"
            )))

            if imp:
                chunks.append(("improvement", "decision_improvement", (
                    f"Decision Agent projected improvement: "
                    f"Conversion Rate before = {float(imp.get('before',0)):.4f}%, "
                    f"Conversion Rate after strategy = {float(imp.get('after',0)):.4f}%, "
                    f"Conversion lift = +{float(imp.get('conversionLift',0)):.1f}%."
                )))

            if proj:
                chunks.append(("projected_kpis", "decision_projected", (
                    f"Decision Agent projected KPIs after recommended strategy: "
                    f"CTR={proj.get('ctr',0):.4f}%, "
                    f"Conversion Rate={proj.get('conversionRate',0):.4f}%, "
                    f"Cart Abandonment={proj.get('cartAbandonment',0):.2f}%, "
                    f"ROI={proj.get('roi',0):.4f}x, "
                    f"Revenue Lift=+{proj.get('revenueLift',0):.1f}%."
                )))

        real = decision.get("realDatasetKPIs", {})
        if real:
            chunks.append(("real_kpis", "decision_kpis", (
                f"Real dataset KPI values from uploaded data: "
                f"CTR={real.get('ctr',0):.4f}%, "
                f"Conversion Rate={real.get('conversionRate',0):.4f}%, "
                f"Cart Abandonment={real.get('cartAbandonment',0):.2f}%, "
                f"ROI={real.get('roi',0):.4f}x."
            )))

        ranked = decision.get("rankedStrategies", [])
        if ranked:
            ranking = " | ".join(
                f"#{s.get('rank',i+1)} '{s.get('name','')}' score={s.get('score',0):.1f}"
                + (f" mlProba={s['mlPurchaseProba']:.4f}" if s.get("mlPurchaseProba") else "")
                for i, s in enumerate(ranked[:5])
            )
            chunks.append(("strategy_ranking", "decision_ranking", (
                f"Decision Agent strategy ranking ({len(ranked)} strategies total): "
                f"{ranking}"
            )))

        summary = decision.get("summary", "")
        if summary:
            chunks.append(("decision_summary", "decision_summary", (
                f"Decision Agent overall summary: {summary}"
            )))

    return chunks


# ════════════════════════════════════════════════════════════════
#  PROMPT BUILDER
# ════════════════════════════════════════════════════════════════

def _build_prompt(query: str, retrieved: List[Dict], metadata: Dict) -> str:
    context = "\n\n".join(
        f"[{d['type'].upper()}]\n{d['text']}"
        for d in retrieved
    )
    objective = (metadata.get("objective") or "business optimization").replace("_", " ").title()
    return f"""You are AgenticIQ — an AI business analyst embedded in a decision-intelligence platform.

BUSINESS OBJECTIVE: {objective}

ANALYSIS CONTEXT (from ML agent pipeline results):
{context}

INSTRUCTIONS:
- Answer ONLY using the context above.
- Be concise and data-driven — cite exact numbers from context.
- If the question cannot be answered from context, say so clearly.
- Do NOT hallucinate any information not in the context.
- Keep responses under 250 words unless detail is essential.

USER QUESTION: {query}

ANSWER:"""


# ════════════════════════════════════════════════════════════════
#  PUBLIC API
# ════════════════════════════════════════════════════════════════

def store_agent_context(
    project_id:   str,
    agent_result: Dict[str, Any],
    kpi_summary:  Dict[str, Any],
    objective:    str,
) -> Dict[str, Any]:
    """
    Chunk + embed all agent outputs into the per-project FAISS store.

    FIX RAG-D: clear BOTH in-memory store AND on-disk pkl before rebuilding
    so that double-calls (auto-store + manual store) don't accumulate
    duplicate vectors (was causing faiss=48 instead of 24).
    """
    # Clear in-memory store
    if project_id in _STORES:
        del _STORES[project_id]

    # FIX RAG-D: also delete the on-disk pkl so _get_or_create_store
    # starts from zero instead of reloading old docs.
    pkl_path = _store_path(project_id)
    if os.path.exists(pkl_path):
        try:
            os.remove(pkl_path)
        except Exception as e:
            print(f"[RAG] Warning: could not delete old pkl for {project_id}: {e}")

    store  = _get_or_create_store(project_id)
    chunks = _chunk_agent_result(agent_result, kpi_summary, objective)

    stored: List[Dict] = []
    errors: List[Dict] = []

    for doc_id, doc_type, text in chunks:
        try:
            ok = _add_doc(store, doc_id, doc_type, text)
            if ok:
                stored.append({"id": doc_id, "type": doc_type, "chars": len(text)})
        except Exception as e:
            errors.append({"id": doc_id, "error": str(e)})

    store["metadata"].update({
        "doc_count":  len(store["docs"]),
        "updated_at": _now(),
        "objective":  objective,
    })
    _persist(project_id)

    faiss_cnt = _vec_count(store)
    print(
        f"[RAG] store_agent_context: pid={project_id} | "
        f"stored={len(stored)} | faiss={faiss_cnt} | "
        f"embed={'ollama' if _OLLAMA_OK else 'keyword'} | "
        f"llm={'groq' if _GROQ_OK else 'fallback'}"
    )

    return {
        "stored":        stored,
        "errors":        errors,
        "total_docs":    len(store["docs"]),
        "faiss_vectors": faiss_cnt,
        "embedding":     "ollama" if _OLLAMA_OK else "keyword-fallback",
    }


def rag_chat(
    project_id: str,
    query:      str,
    model:      str = LLM_DEFAULT,
    top_k:      int = 4,
) -> Dict[str, Any]:
    """Full RAG pipeline: retrieve → build prompt → LLM → return answer."""
    store      = _get_or_create_store(project_id)
    total_docs = len(store["docs"])

    if total_docs == 0:
        return {
            "answer": (
                "No analysis context found for this project. "
                "Run the Agent Decision Pipeline first, then ask your question."
            ),
            "sources":          [],
            "total_docs":       0,
            "docs_retrieved":   0,
            "retrieval_method": "none",
        }

    # FIX RAG-E: fast-path threshold raised to 60.
    # With keyword-hash embeddings, stuffing all docs is better than
    # random FAISS retrieval for small doc sets.
    use_faiss = _FAISS_OK and total_docs > FAST_PATH_MAX

    if use_faiss:
        retrieved = _retrieve(store, query, top_k=top_k)
        retrieval_method = "faiss"
        print(f"[RAG] FAISS path: {total_docs} docs, retrieved {len(retrieved)}")
    else:
        retrieved = store["docs"]  # all docs — guaranteed to include observer
        retrieval_method = "fast_path_stuffing"
        print(f"[RAG] Fast-path: {total_docs} docs → direct context stuffing")

    if not retrieved:
        return {
            "answer":           "Could not retrieve relevant context. Try rephrasing.",
            "sources":          [],
            "total_docs":       total_docs,
            "docs_retrieved":   0,
            "retrieval_method": retrieval_method,
        }

    prompt = _build_prompt(query, retrieved, store.get("metadata", {}))

    # ── Groq LLM (primary) ────────────────────────────────────────────────────
    if _GROQ_OK and _groq_client is not None:
        try:
            response = _groq_client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.15,
                max_tokens=600,
                top_p=0.85,
            )
            answer           = response.choices[0].message.content.strip()
            retrieval_method = f"rag_{retrieval_method}_groq/{GROQ_MODEL}"
            print(f"[RAG] ✅ Groq answered | model={GROQ_MODEL} | len={len(answer)}")
        except Exception as e:
            print(f"[RAG] Groq error: {e}")
            best   = retrieved[0]
            answer = (
                f"Based on the analysis:\n\n{best['text'][:600]}"
                f"\n\n(Groq API error: {e}. Check GROQ_API_KEY in python-microservice/.env)"
            )
            retrieval_method = "groq_error_fallback"

    # ── Context-paste fallback (no API key or groq unavailable) ──────────────
    else:
        best  = retrieved[0]
        extra = f"\n\nAdditional context:\n{retrieved[1]['text'][:400]}" if len(retrieved) > 1 else ""
        answer = (
            f"Based on the analysis:\n\n{best['text']}{extra}"
            f"\n\n(Set GROQ_API_KEY in python-microservice/.env for AI answers. "
            f"Get a free key at console.groq.com)"
        )
        retrieval_method = "context_paste_fallback"

    sources = [
        {
            "id":      d["id"],
            "type":    d["type"],
            "preview": d["text"][:150] + ("…" if len(d["text"]) > 150 else ""),
        }
        for d in retrieved[:top_k]
    ]

    return {
        "answer":           answer,
        "sources":          sources,
        "total_docs":       total_docs,
        "docs_retrieved":   len(retrieved),
        "retrieval_method": retrieval_method,
    }


def get_store_stats(project_id: str) -> Dict[str, Any]:
    """Return metadata + health info about the per-project store."""
    store      = _get_or_create_store(project_id)
    total      = len(store["docs"])
    faiss_cnt  = _vec_count(store)
    type_counts: Dict[str, int] = {}
    for doc in store["docs"]:
        t = doc.get("type", "unknown")
        type_counts[t] = type_counts.get(t, 0) + 1
    return {
        "exists":           total > 0,
        "total_docs":       total,
        "faiss_vectors":    faiss_cnt,
        "type_counts":      type_counts,
        "metadata":         store.get("metadata", {}),
        "groq_available":   _GROQ_OK,
        "ollama_available": _OLLAMA_OK,
        "faiss_available":  _FAISS_OK,
        "embedding_model":  EMBED_MODEL if _OLLAMA_OK else "keyword-fallback",
        "llm_provider":     f"groq/{GROQ_MODEL}" if _GROQ_OK else "context-paste-fallback",
        "llm_model":        GROQ_MODEL if _GROQ_OK else "none",
        "fast_path_active": total <= FAST_PATH_MAX,
    }


def clear_project_store(project_id: str) -> bool:
    """Clear in-memory + disk store for a project."""
    cleared = False
    if project_id in _STORES:
        del _STORES[project_id]
        cleared = True
    path = _store_path(project_id)
    if os.path.exists(path):
        try:
            os.remove(path)
            cleared = True
        except Exception as e:
            print(f"[RAG] Delete failed for {project_id}: {e}")
    return cleared