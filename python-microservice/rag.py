"""
AgenticIQ — RAG Engine v6.0 (HuggingFace Semantic Embeddings + GridFS JSON persistence + FAISS in-memory)

CHANGES vs v5.0:

  EMBED-1 — REPLACED KeywordHashEmbeddings WITH HuggingFace all-MiniLM-L6-v2:
    The previous KeywordHashEmbeddings class used deterministic keyword-frequency
    hashing to produce 768-dim vectors. While fast and dependency-free, it had no
    semantic understanding — "conversion rate" and "purchase probability" were treated
    as unrelated, causing poor retrieval quality.

    Fixed: Uses HuggingFaceEmbeddings("sentence-transformers/all-MiniLM-L6-v2"), a
    384-dim semantic embedding model that:
      - Understands semantic similarity (e.g. "why is CTR low?" retrieves CTR-related
        chunks even if they use different phrasing).
      - Is fully local (no API key required — runs on CPU on Render).
      - Model is ~80MB, downloaded once and cached by sentence-transformers.
      - Production-grade: used by LangChain, Hugging Face, and the wider ML community.

  EMBED-2 — EMBED_DIM UPDATED TO 384:
    all-MiniLM-L6-v2 produces 384-dimensional embeddings, not 768.
    EMBED_DIM constant updated accordingly. This constant is no longer used for vector
    construction (the model handles that internally) but kept for reference / stats.

  EMBED-3 — LAZY MODEL LOADING:
    HuggingFaceEmbeddings is initialised at module load time with
    model_kwargs={"device": "cpu"} and encode_kwargs={"normalize_embeddings": True}.
    Normalising embeddings ensures cosine similarity works correctly in FAISS.

  REQUIREMENTS — add to requirements.txt:
    sentence-transformers

  All v5.0 architecture retained:
    - GridFS JSON persistence (no disk writes for RAG data)
    - FAISS rebuilt in-memory from GridFS on cold start
    - LangChain LCEL chain with ChatGroq
    - store_agent_context(), rag_chat(), get_store_stats(), clear_project_store()
    - All public API signatures unchanged
"""

from __future__ import annotations

import os
import re
import traceback as _tb
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

# ── GridFS storage (v4.0+) ────────────────────────────────────────────────────
try:
    import gridfs_storage as _gfs
    _GFS_AVAILABLE = True
    print("[RAG] ✅ gridfs_storage module loaded — RAG docs will be stored in MongoDB GridFS")
except Exception as _gfs_err:
    _GFS_AVAILABLE = False
    print(f"[RAG] ⚠️  gridfs_storage not available ({_gfs_err}) — RAG persistence disabled")

# ── Config ────────────────────────────────────────────────────────────────────
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip()
GROQ_MODEL   = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile").strip()
EMBED_DIM    = 384   # all-MiniLM-L6-v2 output dimension

# ── LangChain imports ─────────────────────────────────────────────────────────
_LC_OK       = False
_GROQ_OK     = False
_FAISS_LC_OK = False

try:
    from langchain_core.documents            import Document
    from langchain_core.prompts              import ChatPromptTemplate
    from langchain_core.output_parsers       import StrOutputParser
    from langchain_core.runnables            import RunnablePassthrough, RunnableLambda
    _LC_OK = True
    print("[RAG] ✅ LangChain core imports OK")
except ImportError as e:
    print(f"[RAG] ⚠️  LangChain core import failed: {e}")

# ── HuggingFace Embeddings — replaces KeywordHashEmbeddings ──────────────────
# EMBED-1: semantic embeddings via sentence-transformers/all-MiniLM-L6-v2
# - Fully local (no API key), ~80MB download on first run, cached afterwards.
# - normalize_embeddings=True ensures cosine similarity works correctly in FAISS.
# - device="cpu" ensures compatibility on Render free-tier (no GPU required).
try:
    from langchain_huggingface import HuggingFaceEmbeddings

    _EMBEDDINGS = HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2",
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )
    print("[RAG] ✅ HuggingFace embeddings loaded — sentence-transformers/all-MiniLM-L6-v2 (384-dim, CPU)")
except Exception as _emb_err:
    print(f"[RAG] ⚠️  HuggingFaceEmbeddings failed ({_emb_err}) — falling back to keyword-hash")
    # Graceful fallback: keyword-hash keeps the service running even if sentence-transformers
    # is not installed. Install with: pip install sentence-transformers
    import numpy as np
    import hashlib
    from langchain_core.embeddings import Embeddings as _BaseEmbeddings

    class _FallbackKeywordEmbeddings(_BaseEmbeddings):
        """Emergency fallback — used only when sentence-transformers is missing."""
        def __init__(self, dim: int = 384):
            self.dim = dim

        def _embed(self, text: str) -> List[float]:
            import re as _re
            tokens = _re.findall(r"\b\w{2,}\b", text.lower())
            vec    = np.zeros(self.dim, dtype=np.float32)
            for tok in tokens:
                idx = int(hashlib.md5(tok.encode()).hexdigest(), 16) % self.dim
                vec[idx] += 1.0
            norm = float(np.linalg.norm(vec))
            vec  = vec / norm if norm > 0 else vec
            return vec.tolist()

        def embed_documents(self, texts: List[str]) -> List[List[float]]:
            return [self._embed(t) for t in texts]

        def embed_query(self, text: str) -> List[float]:
            return self._embed(text)

    _EMBEDDINGS = _FallbackKeywordEmbeddings(dim=384)
    print("[RAG] ⚠️  Using fallback keyword-hash embeddings. Run: pip install sentence-transformers")

try:
    from langchain_groq import ChatGroq
    if GROQ_API_KEY:
        _GROQ_LLM = ChatGroq(
            model=GROQ_MODEL,
            groq_api_key=GROQ_API_KEY,
            temperature=0.1,
            max_tokens=700,
        )
        _GROQ_OK = True
        print(f"[RAG] ✅ ChatGroq ready — model: {GROQ_MODEL}")
    else:
        print("[RAG] ⚠️  GROQ_API_KEY not set — set it in python-microservice/.env")
        _GROQ_LLM = None
except ImportError as e:
    print(f"[RAG] ⚠️  langchain-groq not installed: {e}")
    _GROQ_LLM = None
except Exception as e:
    print(f"[RAG] ⚠️  ChatGroq init failed: {e}")
    _GROQ_LLM = None

try:
    from langchain_community.vectorstores import FAISS as LangFAISS
    _FAISS_LC_OK = True
    print("[RAG] ✅ LangChain FAISS vectorstore ready")
except ImportError as e:
    print(f"[RAG] ⚠️  langchain-community FAISS not available: {e}")
    LangFAISS = None  # type: ignore


# ── In-memory store registry ──────────────────────────────────────────────────
# Maps project_id → {"store": LangFAISS | None, "docs": [Document], "metadata": dict}
# This is a process-level cache. On cold start, stores are rebuilt from GridFS.
_STORES: Dict[str, Dict[str, Any]] = {}


# ════════════════════════════════════════════════════════════════
#  PERSISTENCE HELPERS  (GridFS-backed, no disk)
# ════════════════════════════════════════════════════════════════

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _docs_to_json(docs: List["Document"]) -> List[Dict[str, Any]]:
    """Serialise LangChain Document objects to plain JSON-safe dicts."""
    return [
        {
            "page_content": d.page_content,
            "metadata":     d.metadata,
        }
        for d in docs
    ]


def _json_to_docs(raw: List[Dict[str, Any]]) -> List["Document"]:
    """Deserialise plain dicts back into LangChain Document objects."""
    if not _LC_OK:
        return []
    return [
        Document(
            page_content=item["page_content"],
            metadata=item.get("metadata", {}),
        )
        for item in raw
    ]


def _save_store(pid: str) -> None:
    """
    Persist the document list for a project to MongoDB GridFS as JSON.
    FAISS index is NOT persisted — it is always rebuilt in-memory from the docs.
    This avoids the disk dependency and FAISS version-mismatch problems.
    """
    if not _GFS_AVAILABLE:
        print(f"[RAG] ⚠️  GridFS not available — RAG docs for {pid} not persisted.")
        return

    entry = _STORES.get(pid)
    if not entry:
        return

    docs = entry.get("docs", [])
    if not docs:
        return

    try:
        raw_docs = _docs_to_json(docs)
        payload  = {
            "docs":       raw_docs,
            "metadata":   entry.get("metadata", {}),
            "saved_at":   _now(),
        }
        _gfs.save_json(payload, _gfs.rag_docs_key(pid))
        print(f"[RAG] ✅ Persisted {len(raw_docs)} docs to GridFS for {pid}")
    except Exception as e:
        print(f"[RAG] ⚠️  GridFS persist failed for {pid}: {e}")


def _load_store_from_gridfs(pid: str) -> Optional[Dict[str, Any]]:
    """
    Load document list from GridFS and rebuild the FAISS vectorstore in-memory.
    Returns None if no data exists in GridFS for this project.
    """
    if not _GFS_AVAILABLE:
        return None

    key = _gfs.rag_docs_key(pid)
    if not _gfs.json_exists(key):
        return None

    try:
        payload  = _gfs.load_json(key)
        raw_docs = payload.get("docs", [])
        meta     = payload.get("metadata", {})

        if not raw_docs:
            return None

        docs = _json_to_docs(raw_docs)

        # Rebuild FAISS in-memory from the loaded documents
        # Uses HuggingFace embeddings (semantic) for high-quality retrieval
        vs = None
        if _FAISS_LC_OK and LangFAISS is not None and docs:
            try:
                vs = LangFAISS.from_documents(docs, _EMBEDDINGS)
                print(f"[RAG] ✅ FAISS rebuilt in-memory for {pid}: {len(docs)} docs (HuggingFace embeddings)")
            except Exception as faiss_err:
                print(f"[RAG] ⚠️  FAISS rebuild failed for {pid}: {faiss_err} — using doc-list only")
                vs = None

        meta["loaded_from_gridfs"] = True
        meta["doc_count"]          = len(docs)
        meta["embedding_model"]    = "all-MiniLM-L6-v2"

        return {
            "store":    vs,
            "docs":     docs,
            "metadata": meta,
        }

    except Exception as e:
        print(f"[RAG] ⚠️  Failed to load store from GridFS for {pid}: {e}")
        return None


def _delete_store_data(pid: str) -> None:
    """
    Delete the persisted RAG docs for a project from GridFS.
    No disk files to delete in v5.0+.
    """
    if not _GFS_AVAILABLE:
        return
    try:
        key = _gfs.rag_docs_key(pid)
        if _gfs.json_exists(key):
            _gfs.delete_json(key)
            print(f"[RAG] Deleted GridFS RAG docs for {pid}")
    except Exception as e:
        print(f"[RAG] ⚠️  Could not delete GridFS RAG docs for {pid}: {e}")


def _get_or_create_store(pid: str) -> Dict[str, Any]:
    """
    Get in-memory cached store; load+rebuild from GridFS if not cached;
    create a fresh empty entry if nothing exists anywhere.
    """
    # 1. In-memory cache hit
    if pid in _STORES:
        return _STORES[pid]

    # 2. GridFS cold-start load
    loaded = _load_store_from_gridfs(pid)
    if loaded:
        _STORES[pid] = loaded
        return _STORES[pid]

    # 3. Fresh empty entry
    _STORES[pid] = {
        "store":    None,
        "docs":     [],
        "metadata": {"created_at": _now(), "doc_count": 0},
    }
    return _STORES[pid]


# ════════════════════════════════════════════════════════════════
#  DOCUMENT CHUNKING — rich text for good retrieval
# ════════════════════════════════════════════════════════════════

def _chunk_agent_result(
    agent_result: Dict[str, Any],
    kpi_summary:  Dict[str, Any],
    objective:    str,
) -> List["Document"]:
    """Convert agent pipeline outputs into LangChain Documents."""
    docs: List[Document] = []
    obj_label = objective.replace("_", " ").title()

    def _doc(page_content: str, doc_type: str, doc_id: str) -> "Document":
        return Document(
            page_content=page_content.strip(),
            metadata={"type": doc_type, "id": doc_id, "objective": objective},
        )

    # 1. Objective
    docs.append(_doc(
        f"Business Objective: {obj_label}. All analysis targets this goal.",
        "objective", "objective"))

    # 2. KPI baseline
    if kpi_summary:
        docs.append(_doc(
            f"KPI baseline from dataset: "
            f"CTR (click-through rate)={kpi_summary.get('avgCTR',0):.4f}%, "
            f"Conversion Rate={kpi_summary.get('avgConversionRate',0):.4f}%, "
            f"Cart Abandonment Rate={kpi_summary.get('avgCartAbandonment',0):.2f}%, "
            f"ROI (return on investment)={kpi_summary.get('avgROI',0):.4f}x. "
            f"Total Sessions={kpi_summary.get('totalSessions',0)}, "
            f"Total Purchases={kpi_summary.get('totalPurchases',0)}, "
            f"Total Revenue={kpi_summary.get('totalRevenue',0):.2f}.",
            "kpi", "kpi_summary"))

    # 3. Observer Agent
    obs = agent_result.get("observerResult", {}) or {}
    if obs:
        health  = obs.get("healthScore", 0)
        summary = obs.get("summary", "")
        bm      = obs.get("benchmarksUsed", {})
        crew_n  = obs.get("crewAiNarrative", "")

        docs.append(_doc(
            f"Observer Agent KPI Health Check: "
            f"The Observer Agent monitors all KPIs and computes a health score. "
            f"Current health score = {health}/100. "
            f"A score below 40 means critical KPI problems; below 70 means warnings; "
            f"100 means all KPIs are healthy. "
            f"For objective '{obj_label}' this health score is {health}/100. "
            f"Summary: {summary} "
            f"{crew_n[:500] if crew_n else ''}",
            "observer", "observer_summary"))

        if bm:
            docs.append(_doc(
                f"Observer Agent dynamic benchmarks used for KPI comparison: "
                f"CTR benchmark={bm.get('ctr',0):.4f}%, "
                f"Conversion Rate benchmark={bm.get('conversionRate',0):.4f}%, "
                f"Cart Abandonment benchmark={bm.get('cartAbandonment',0):.2f}%, "
                f"ROI benchmark={bm.get('roi',0):.4f}x. "
                f"These are computed dynamically from the dataset distribution.",
                "observer_benchmarks", "observer_benchmarks"))

        for i, o in enumerate(obs.get("observations", [])[:4]):
            docs.append(_doc(
                f"Observer Agent KPI observation for {o.get('metric','')}: "
                f"Actual={o.get('value',0)}{o.get('unit','')}, "
                f"Benchmark={o.get('benchmark',0)}{o.get('unit','')}, "
                f"Severity={o.get('severity','')}, "
                f"Gap={o.get('gap',0)}{o.get('unit','')}. "
                f"Message: {o.get('message','')} "
                f"Benchmark note: {o.get('benchmarkNote','')}",
                "observer_detail", f"obs_{i}"))

    # 4. Analyst Agent
    analyst = agent_result.get("analystResult", {}) or {}
    if analyst:
        diag      = analyst.get("diagnosis", "")
        obj_focus = analyst.get("objectiveFocus", "")
        obj_lens  = analyst.get("objectiveLens", "")
        crew_n    = analyst.get("crewAiNarrative", "")

        if diag or crew_n:
            docs.append(_doc(
                f"Analyst Agent root cause diagnosis: "
                f"Objective focus = {obj_focus}. "
                f"Analysis lens: {obj_lens}. "
                f"Diagnosis: {diag} "
                f"{crew_n[:600] if crew_n else ''}",
                "analyst", "analyst_diagnosis"))

        dirs = analyst.get("fixDirections", [])
        if dirs:
            docs.append(_doc(
                f"Analyst Agent ML-ranked strategy fix directions for {obj_label}: "
                f"{', '.join(d.replace('_',' ') for d in dirs[:5])}. "
                f"These directions are ranked by feature importance from the trained ML model.",
                "analyst_directions", "fix_directions"))

        for i, rc in enumerate(analyst.get("rootCauses", [])[:4]):
            causes = "; ".join(
                f"{c.get('cause','')[:100]} (confidence {c.get('confidence',0):.0%})"
                for c in rc.get("causes", [])[:2])
            docs.append(_doc(
                f"Analyst root cause for {rc.get('metric','')} "
                f"(severity={rc.get('severity','')}, "
                f"actual={rc.get('value',0)}{rc.get('unit','')}, "
                f"benchmark={rc.get('benchmark',0)}{rc.get('unit','')}, "
                f"gap={rc.get('gap',0)}{rc.get('unit','')}): {causes}. "
                f"Data source: {rc.get('dataSource','unknown')}.",
                "root_cause", f"root_cause_{i}"))

    # 5. Simulation Agent
    sim = agent_result.get("simulationResult", {}) or {}
    if sim:
        docs.append(_doc(
            f"Simulation Agent metadata: "
            f"ML-driven KPI projections via RandomForestRegressor (kpi_predictor.pkl). "
            f"Affinities source: {sim.get('affinitiesSource','unknown')}. "
            f"Weights used: {sim.get('weightsUsed','default')}. "
            f"Directions used: {', '.join(sim.get('directionsUsed', [])[:5])}.",
            "simulation_meta", "sim_meta"))

        for i, strat in enumerate(sim.get("strategies", [])[:5]):
            proj = strat.get("projectedMetrics", {})
            docs.append(_doc(
                f"Strategy #{i+1} '{strat.get('name','')}' "
                f"(source: {strat.get('source','ai')}): "
                f"{strat.get('description','')} "
                f"Score: {strat.get('score',0):.1f}/100. "
                f"Projected: Conv={proj.get('conversionRate',0):.4f}%, "
                f"Abandon={proj.get('cartAbandonment',0):.2f}%, "
                f"ROI={proj.get('roi',0):.4f}x, "
                f"CTR={proj.get('ctr',0):.4f}%, "
                f"RevenueLift=+{proj.get('revenueLift',0):.1f}%. "
                f"Why selected: {strat.get('whySelected','')}",
                "strategy", f"strategy_{i}"))

        whatif = sim.get("whatIfTable", [])
        if whatif:
            best = max(whatif, key=lambda r: r.get("convLift", 0))
            docs.append(_doc(
                f"What-If simulation: Optimal discount = {best.get('discountPct',0)}% "
                f"projects conversion {best.get('projectedConversion',0):.4f}% "
                f"(lift +{best.get('convLift',0):.4f}% vs baseline), "
                f"projected ROI = {best.get('projectedROI',0):.4f}x.",
                "whatif", "whatif_best"))

    # 6. Decision Agent
    decision = agent_result.get("decisionResult", {}) or {}
    if decision:
        rec    = decision.get("recommendation", {}) or {}
        crew_n = decision.get("crewAiNarrative", "")

        if rec:
            proj = rec.get("projectedMetrics", {})
            imp  = rec.get("improvement", {})
            docs.append(_doc(
                f"Decision Agent top recommendation: '{rec.get('strategyName','')}' "
                f"with confidence {rec.get('confidence',0)}% "
                f"and score {rec.get('score',0):.1f}/100. "
                f"PKL-validated: {rec.get('pklScoringUsed',False)}. "
                f"ML accuracy: {decision.get('mlAccuracy',0):.1f}%. "
                f"AI Insight: {rec.get('aiInsight','')[:400]} "
                f"{crew_n[:400] if crew_n else ''}",
                "decision_recommendation", "recommendation"))

            if imp:
                docs.append(_doc(
                    f"Decision Agent projected improvement: "
                    f"Conversion before = {float(imp.get('before',0)):.4f}%, "
                    f"Conversion after = {float(imp.get('after',0)):.4f}%, "
                    f"Conversion lift = +{float(imp.get('conversionLift',0)):.1f}%.",
                    "decision_improvement", "improvement"))

            if proj:
                docs.append(_doc(
                    f"Projected KPIs after recommended strategy: "
                    f"CTR={proj.get('ctr',0):.4f}%, "
                    f"Conversion Rate={proj.get('conversionRate',0):.4f}%, "
                    f"Cart Abandonment={proj.get('cartAbandonment',0):.2f}%, "
                    f"ROI={proj.get('roi',0):.4f}x, "
                    f"Revenue Lift=+{proj.get('revenueLift',0):.1f}%.",
                    "decision_projected", "projected_kpis"))

        real = decision.get("realDatasetKPIs", {})
        if real:
            docs.append(_doc(
                f"Real dataset KPI values: "
                f"CTR={real.get('ctr',0):.4f}%, "
                f"Conversion Rate={real.get('conversionRate',0):.4f}%, "
                f"Cart Abandonment={real.get('cartAbandonment',0):.2f}%, "
                f"ROI={real.get('roi',0):.4f}x.",
                "decision_kpis", "real_kpis"))

        ranked = decision.get("rankedStrategies", [])
        if ranked:
            ranking = " | ".join(
                f"#{s.get('rank',i+1)} '{s.get('name','')}' score={s.get('score',0):.1f}"
                + (f" mlProba={s['mlPurchaseProba']:.4f}" if s.get("mlPurchaseProba") else "")
                for i, s in enumerate(ranked[:5]))
            docs.append(_doc(
                f"Strategy ranking ({len(ranked)} strategies): {ranking}",
                "decision_ranking", "strategy_ranking"))

        summary = decision.get("summary", "")
        if summary:
            docs.append(_doc(
                f"Decision summary: {summary}",
                "decision_summary", "decision_summary"))

    return docs


# ════════════════════════════════════════════════════════════════
#  LCEL RAG CHAIN BUILDER
# ════════════════════════════════════════════════════════════════

_RAG_PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "You are AgenticIQ — an AI business analyst embedded in a decision-intelligence platform.\n"
     "Answer ONLY using the context provided below.\n"
     "Be concise and data-driven — cite exact numbers from the context.\n"
     "If the question cannot be answered from context, say so clearly.\n"
     "Keep responses under 250 words unless essential detail requires more.\n"
     "Never hallucinate any information not in the context."),
    ("human",
     "BUSINESS OBJECTIVE: {objective}\n\n"
     "ANALYSIS CONTEXT:\n{context}\n\n"
     "QUESTION: {question}"),
]) if _LC_OK else None

_OUTPUT_PARSER = StrOutputParser() if _LC_OK else None


def _build_rag_chain(llm):
    """Build the LCEL RAG chain: context + question → prompt → llm → string."""
    def _format_docs(docs: List["Document"]) -> str:
        return "\n\n".join(
            f"[{d.metadata.get('type','doc').upper()}]\n{d.page_content}"
            for d in docs
        )

    chain = (
        {
            "context":   RunnableLambda(lambda x: _format_docs(x["docs"])),
            "question":  RunnableLambda(lambda x: x["question"]),
            "objective": RunnableLambda(lambda x: x.get("objective", "business optimization").replace("_", " ").title()),
        }
        | _RAG_PROMPT
        | llm
        | _OUTPUT_PARSER
    )
    return chain


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
    Chunk + embed agent pipeline outputs into a per-project FAISS store,
    then persist the raw documents to MongoDB GridFS as JSON.

    Embeddings: HuggingFace all-MiniLM-L6-v2 (384-dim semantic, local, CPU).

    On the next cold start, the documents are loaded from GridFS and FAISS
    is rebuilt in-memory — no disk FAISS files are ever written.
    """
    # Clear in-memory cache + GridFS for this project (prevents double-storage)
    if project_id in _STORES:
        del _STORES[project_id]
    _delete_store_data(project_id)

    docs   = _chunk_agent_result(agent_result, kpi_summary, objective)
    stored = []
    errors = []

    if not docs:
        return {
            "stored": [], "errors": ["No documents to store"],
            "total_docs": 0, "faiss_vectors": 0,
        }

    faiss_cnt = 0
    try:
        vs = None
        if _FAISS_LC_OK and LangFAISS is not None:
            # Uses HuggingFace semantic embeddings for accurate similarity search
            vs = LangFAISS.from_documents(docs, _EMBEDDINGS)
            faiss_cnt = vs.index.ntotal if hasattr(vs, "index") else len(docs)

        _STORES[project_id] = {
            "store":    vs,
            "docs":     docs,
            "metadata": {
                "created_at":    _now(),
                "doc_count":     len(docs),
                "objective":     objective,
                "embedding_model": "all-MiniLM-L6-v2",
            },
        }

        # ── Persist docs to GridFS (no disk write) ──────────────────────────
        _save_store(project_id)

        stored = [
            {
                "id":    d.metadata.get("id", f"doc_{i}"),
                "type":  d.metadata.get("type", "doc"),
                "chars": len(d.page_content),
            }
            for i, d in enumerate(docs)
        ]

    except Exception as e:
        errors.append(str(e))
        _tb.print_exc()

    total_docs = len(_STORES.get(project_id, {}).get("docs", []))
    print(
        f"[RAG] store_agent_context: pid={project_id} | "
        f"stored={len(stored)} | faiss={faiss_cnt} | "
        f"gridfs={'yes' if _GFS_AVAILABLE else 'no'} | "
        f"embed=all-MiniLM-L6-v2 (semantic) | llm={'groq' if _GROQ_OK else 'fallback'}"
    )

    return {
        "stored":              stored,
        "errors":              errors,
        "total_docs":          total_docs,
        "faiss_vectors":       faiss_cnt,
        "embedding":           "all-MiniLM-L6-v2",
        "persistence_backend": "gridfs" if _GFS_AVAILABLE else "memory_only",
    }


def rag_chat(
    project_id: str,
    query:      str,
    model:      str = GROQ_MODEL,
    top_k:      int = 4,
) -> Dict[str, Any]:
    """
    Full LangChain LCEL RAG pipeline:
      query → FAISS semantic retriever (HuggingFace embeddings, rebuilt from GridFS if needed)
            → context → ChatGroq → answer

    Cold start behaviour:
      If _STORES[project_id] is empty, _get_or_create_store() loads the
      JSON docs from GridFS and rebuilds FAISS in-memory automatically.
    """
    entry      = _get_or_create_store(project_id)
    all_docs   = entry.get("docs", [])
    total_docs = len(all_docs)

    if total_docs == 0:
        return {
            "answer": (
                "No analysis context found for this project. "
                "Run the Agent Decision Pipeline first, then ask your question."
            ),
            "sources": [], "total_docs": 0, "docs_retrieved": 0,
            "retrieval_method": "none",
        }

    objective   = entry.get("metadata", {}).get("objective", "business_optimization")
    vs          = entry.get("store")
    retrieved   = []

    # ── Retrieve relevant docs via semantic FAISS ─────────────────────────────
    if vs is not None and _FAISS_LC_OK:
        if total_docs <= 30:
            # Fast path: stuff all docs into context (small enough to fit Groq limit)
            retrieved        = all_docs
            retrieval_method = "full_context_stuffing"
        else:
            try:
                retriever        = vs.as_retriever(search_kwargs={"k": min(top_k, total_docs)})
                retrieved        = retriever.invoke(query)
                retrieval_method = "faiss_semantic_similarity"
            except Exception as e:
                print(f"[RAG] FAISS retrieval failed ({e}), using all docs")
                retrieved        = all_docs
                retrieval_method = "faiss_fallback_all"
    else:
        retrieved        = all_docs
        retrieval_method = "full_context_stuffing"

    if not retrieved:
        retrieved        = all_docs[:top_k]
        retrieval_method = "head_docs_fallback"

    # ── LangChain LCEL chain ──────────────────────────────────────────────────
    answer = ""

    if _GROQ_OK and _GROQ_LLM is not None and _LC_OK:
        try:
            chain  = _build_rag_chain(_GROQ_LLM)
            answer = chain.invoke({
                "docs":      retrieved,
                "question":  query,
                "objective": objective,
            })
            retrieval_method = f"lcel_rag_{retrieval_method}_groq/{GROQ_MODEL}"
            print(f"[RAG] ✅ LCEL chain answered | len={len(answer)}")
        except Exception as e:
            print(f"[RAG] LCEL chain error: {e}")
            _tb.print_exc()
            answer           = _context_paste_answer(retrieved, query, error=str(e))
            retrieval_method = "lcel_error_fallback"
    else:
        answer           = _context_paste_answer(retrieved, query)
        retrieval_method = f"context_paste_{retrieval_method}"

    sources = [
        {
            "id":      d.metadata.get("id",   f"doc_{i}"),
            "type":    d.metadata.get("type",  "doc"),
            "preview": d.page_content[:150] + ("…" if len(d.page_content) > 150 else ""),
        }
        for i, d in enumerate(retrieved[:top_k])
    ]

    return {
        "answer":           answer,
        "sources":          sources,
        "total_docs":       total_docs,
        "docs_retrieved":   len(retrieved),
        "retrieval_method": retrieval_method,
    }


def get_store_stats(project_id: str) -> Dict[str, Any]:
    """Return metadata about the per-project LangChain FAISS store."""
    entry      = _get_or_create_store(project_id)
    docs       = entry.get("docs", [])
    vs         = entry.get("store")
    total      = len(docs)
    faiss_cnt  = 0
    if vs is not None:
        try:
            faiss_cnt = vs.index.ntotal if hasattr(vs, "index") else total
        except Exception:
            faiss_cnt = total

    type_counts: Dict[str, int] = {}
    for doc in docs:
        t = doc.metadata.get("type", "unknown") if hasattr(doc, "metadata") else "unknown"
        type_counts[t] = type_counts.get(t, 0) + 1

    # Check GridFS for stored docs (cold-start indicator)
    gridfs_docs_stored = False
    if _GFS_AVAILABLE:
        try:
            gridfs_docs_stored = _gfs.json_exists(_gfs.rag_docs_key(project_id))
        except Exception:
            pass

    return {
        "exists":              total > 0,
        "total_docs":          total,
        "faiss_vectors":       faiss_cnt,
        "type_counts":         type_counts,
        "metadata":            entry.get("metadata", {}),
        "groq_available":      _GROQ_OK,
        "ollama_available":    False,
        "faiss_available":     _FAISS_LC_OK,
        "embedding_model":     "sentence-transformers/all-MiniLM-L6-v2 (384-dim, semantic)",
        "llm_provider":        f"groq/{GROQ_MODEL}" if _GROQ_OK else "context-paste-fallback",
        "llm_model":           GROQ_MODEL if _GROQ_OK else "none",
        "langchain_rag":       _LC_OK,
        "fast_path_active":    total <= 30,
        "persistence_backend": "gridfs" if _GFS_AVAILABLE else "memory_only",
        "gridfs_docs_stored":  gridfs_docs_stored,
    }


def clear_project_store(project_id: str) -> bool:
    """Clear in-memory cache + GridFS RAG docs for a project."""
    cleared = False
    if project_id in _STORES:
        del _STORES[project_id]
        cleared = True
    _delete_store_data(project_id)   # GridFS delete (no disk)
    return cleared


# ════════════════════════════════════════════════════════════════
#  HELPERS
# ════════════════════════════════════════════════════════════════

def _context_paste_answer(docs: List["Document"], query: str, error: str = "") -> str:
    """Fallback when LLM is unavailable — paste top context chunks."""
    if not docs:
        return (
            "No relevant context found for this query. "
            "Run the Agent Decision Pipeline first, then try again."
        )

    best   = docs[0].page_content
    extra  = f"\n\nAdditional context:\n{docs[1].page_content[:400]}" if len(docs) > 1 else ""
    err_msg = ""
    if error:
        err_msg = (
            f"\n\n(Note: LLM chain error — {error}. "
            "Check that GROQ_API_KEY is valid in python-microservice/.env)"
        )
    elif not _GROQ_OK:
        err_msg = (
            "\n\n(Note: Set GROQ_API_KEY in python-microservice/.env for AI-generated answers. "
            "Get a free key at console.groq.com)"
        )

    return f"Based on the analysis:\n\n{best}{extra}{err_msg}"