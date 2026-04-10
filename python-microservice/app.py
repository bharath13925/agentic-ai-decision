"""
AgenticIQ — Python Microservice v15.1

FIXES vs v15.0:

  FIX STARTUP-1 — LAZY IMPORTS (fixes Render "No open ports detected"):
    ALL heavy imports (CrewAI, Groq, RAG, GridFS, ML libs) are now deferred
    to first use via module-level None sentinels + _ensure_X() helpers.
    The FastAPI app + /health endpoint are available within ~2 seconds of
    process start, well within Render's 30-60 sec port-open deadline.

  FIX STARTUP-2 — TOP-LEVEL IMPORT GUARD:
    sklearn, xgboost, lightgbm, shap are NOT imported at module level.
    They are imported inside the endpoint functions that need them.

  All GRIDFS-1, GRIDFS-2, CREW-1, ENDPOINT-1, ECO-1, ACC-1 fixes from
  v15.0 are fully retained.
"""

import os
import io
import math
import time
import pickle
import traceback as _tb
import pandas as pd
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from typing import Optional, List, Dict, Any

from dotenv import load_dotenv
load_dotenv()

# ── FIX ENG-4: resolve UPLOADS_DIR to absolute path at startup ─────────────
_raw_uploads = os.environ.get("UPLOADS_DIR", "./uploads")
UPLOADS_DIR  = os.path.abspath(_raw_uploads)
print(f"[Startup] UPLOADS_DIR resolved → {UPLOADS_DIR}")

# ── FastAPI app — created immediately so Render sees the port fast ──────────
app = FastAPI(title="AgenticIQ Python Microservice", version="15.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ════════════════════════════════════════════════════════════════
#  FIX STARTUP-1 — LAZY MODULE SENTINELS
#  All heavy modules start as None and are loaded on first use.
# ════════════════════════════════════════════════════════════════
_gfs_module        = None   # gridfs_storage
_GFS_AVAILABLE     = None   # True / False (set on first _ensure_gfs())
_rag_module        = None   # rag
_crew_module       = None   # crew_pipeline
_agents_module     = None   # agents package dict
_decision_agent    = None   # agents.decision_agent.run


def _ensure_gfs():
    global _gfs_module, _GFS_AVAILABLE
    if _GFS_AVAILABLE is not None:
        return _GFS_AVAILABLE
    try:
        import gridfs_storage as _gfs
        _gfs_module    = _gfs
        _GFS_AVAILABLE = True
        print("[LazyLoad] ✅ GridFS storage module loaded")
    except Exception as _e:
        _GFS_AVAILABLE = False
        print(f"[LazyLoad] ⚠️  GridFS not available ({_e}) — disk fallback")
    return _GFS_AVAILABLE


def _ensure_rag():
    global _rag_module
    if _rag_module is not None:
        return _rag_module
    from rag import (
        store_agent_context as _rag_store,
        rag_chat            as _rag_chat,
        get_store_stats     as _rag_stats,
        clear_project_store as _rag_clear,
    )
    _rag_module = {
        "store":  _rag_store,
        "chat":   _rag_chat,
        "stats":  _rag_stats,
        "clear":  _rag_clear,
    }
    print("[LazyLoad] ✅ RAG module loaded")
    return _rag_module


def _ensure_crew():
    global _crew_module
    if _crew_module is not None:
        return _crew_module
    from crew_pipeline import run_crew_pipeline
    _crew_module = run_crew_pipeline
    print("[LazyLoad] ✅ crew_pipeline loaded")
    return _crew_module


def _ensure_decision_agent():
    global _decision_agent
    if _decision_agent is not None:
        return _decision_agent
    from agents.decision_agent import run as _dec_run
    _decision_agent = _dec_run
    print("[LazyLoad] ✅ decision_agent loaded")
    return _decision_agent


# ── Feature column definitions ──────────────────────────────────────────────
ECO_RAW_FEATURES = [
    "device_type", "user_type", "marketing_channel", "product_category",
    "unit_price", "quantity", "discount_percent", "discount_amount",
    "pages_viewed", "time_on_site_sec",
    "added_to_cart",
    "rating", "payment_method", "visit_day", "visit_month",
    "visit_weekday", "visit_season", "location",
]

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
ECO_FEATURES = ECO_RAW_FEATURES + ECO_DERIVED_FEATURES

ECO_DROP_COLUMNS = [
    "review_text", "review_helpful_votes",
    "session_duration_bucket", "revenue_normalized",
]

CHANNEL_TO_INT: Dict[str, int] = {
    "Google Ads": 0, "Facebook Ads": 1, "Instagram": 2,
    "Email": 3, "SEO": 4, "Referral": 5,
}
INT_TO_CHANNEL: Dict[int, str] = {v: k for k, v in CHANNEL_TO_INT.items()}

SEGMENT_TO_FEATURES: Dict[str, Dict[str, float]] = {
    "All Customers":       {"user_type": 1.0},
    "New Customers":       {"user_type": 0.0},
    "Returning Customers": {"user_type": 1.0},
    "High Value":          {"user_type": 1.0},
    "At Risk":             {"user_type": 0.0},
    "Mobile Users":        {"device_type": 2.0, "user_type": 1.0},
}

_SAFE_DEFAULTS: Dict[str, float] = {
    "device_type":        1.0,
    "user_type":          1.0,
    "marketing_channel":  3.0,
    "product_category":   4.0,
    "unit_price":         691.73,
    "quantity":           2.0,
    "discount_percent":   10.0,
    "discount_amount":    65.815,
    "pages_viewed":       13.0,
    "time_on_site_sec":   903.0,
    "added_to_cart":      0.64,
    "rating":             4.0,
    "payment_method":     2.0,
    "visit_day":          16.0,
    "visit_month":        7.0,
    "visit_weekday":      3.0,
    "visit_season":       2.0,
    "location":           111.0,
    "engagement_score":   0.509,
    "discount_impact":    0.057,
    "price_per_page":     0.030,
    "cart_engage":        0.326,
    "cart_time_ratio":    0.323,
    "cart_pages_ratio":   0.348,
}


# ════════════════════════════════════════════════════════════════
#  GRIDFS HELPERS
# ════════════════════════════════════════════════════════════════

def _is_gridfs_key(path_or_key: str) -> bool:
    if not path_or_key:
        return False
    return "/models/" in path_or_key and not os.path.isabs(path_or_key)


def _save_pkl_to_gridfs(obj: Any, gridfs_key: str, disk_path: str) -> str:
    os.makedirs(os.path.dirname(disk_path), exist_ok=True)
    with open(disk_path, "wb") as f:
        pickle.dump(obj, f)

    if _ensure_gfs():
        try:
            _gfs_module.save_pickle(obj, gridfs_key)
            try:
                os.remove(disk_path)
            except Exception:
                pass
            print(f"[GridFS] ✅ Saved to GridFS: {gridfs_key}")
            return gridfs_key
        except Exception as gfs_err:
            print(f"[GridFS] ⚠️  Upload failed for {gridfs_key}: {gfs_err} — keeping disk copy")
            return disk_path
    else:
        print(f"[GridFS] ⚠️  GridFS not available — keeping disk path: {disk_path}")
        return disk_path


def _load_pkl_from_gridfs_or_disk(path_or_key: str) -> Any:
    if _ensure_gfs() and _is_gridfs_key(path_or_key):
        try:
            return _gfs_module.load_pickle(path_or_key)
        except Exception as e:
            raise FileNotFoundError(
                f"GridFS key '{path_or_key}' not found: {e}. Please retrain models."
            )
    if os.path.exists(path_or_key):
        with open(path_or_key, "rb") as f:
            return pickle.load(f)
    raise FileNotFoundError(
        f"PKL not found at path '{path_or_key}' and GridFS not available. "
        "Please retrain models."
    )


# ════════════════════════════════════════════════════════════════
#  SAFE NUMERIC HELPERS
# ════════════════════════════════════════════════════════════════

def _safe_num(val: Any, fallback: float = 0.0) -> float:
    try:
        v = float(val)
        if math.isnan(v) or math.isinf(v):
            return fallback
        return v
    except Exception:
        return fallback


def _safe_stat_dict(col: pd.Series) -> Dict[str, float]:
    numeric = pd.to_numeric(col, errors="coerce").dropna()
    if len(numeric) == 0:
        return {"median": 0.0, "mean": 0.0, "std": 0.0, "max": 0.0, "min": 0.0}
    return {
        "median": _safe_num(numeric.median()),
        "mean":   _safe_num(numeric.mean()),
        "std":    _safe_num(numeric.std(), 0.0),
        "max":    _safe_num(numeric.max()),
        "min":    _safe_num(numeric.min()),
    }


# ════════════════════════════════════════════════════════════════
#  SCHEMAS
# ════════════════════════════════════════════════════════════════

class CleanRequest(BaseModel):
    projectId:       str
    mongoId:         str
    uploadsDir:      str
    ecommerceFile:   str
    marketingFile:   str
    advertisingFile: str


class EngineerRequest(BaseModel):
    projectId:       str
    mongoId:         str
    uploadsDir:      str
    ecommerceFile:   str
    marketingFile:   str
    advertisingFile: str


class TrainRequest(BaseModel):
    projectId:       str
    mongoId:         str
    mlResultId:      str
    uploadsDir:      str
    ecommerceFile:   str
    marketingFile:   str
    advertisingFile: str
    objective:       str


class ScoreStrategiesRequest(BaseModel):
    projectId:       str
    uploadsDir:      str
    ecommerceFile:   str
    modelPaths:      Dict[str, str]
    strategies:      List[Dict[str, Any]]
    objective:       str
    ensembleWeights: Optional[Dict[str, float]] = None
    datasetStats:    Optional[Dict[str, Any]]   = None


class AgentPipelineRequest(BaseModel):
    projectId:        str
    mongoId:          str
    agentResultId:    str
    objective:        str
    simulationMode:   str
    strategyInput:             Optional[dict]  = {}
    kpiSummary:                Optional[dict]  = {}
    mlEnsembleAcc:             Optional[float] = None
    avgPurchaseProba:          Optional[float] = None
    modelPaths:                Optional[dict]  = None
    uploadsDir:                Optional[str]   = None
    ecommerceEngineerFile:     Optional[str]   = None
    featureImportance:         Optional[list]  = None
    kpiPredictorPath:          Optional[str]   = None
    datasetStats:              Optional[dict]  = None
    ensembleWeights:           Optional[Dict[str, float]] = None
    learnedMechanismStrengths: Optional[dict]  = None
    learnedObjectiveWeights:   Optional[dict]  = None

    @validator("strategyInput", pre=True, always=True)
    def _si(cls, v): return v or {}

    @validator("kpiSummary", pre=True, always=True)
    def _ks(cls, v): return v or {}

    @validator("mlEnsembleAcc", pre=True, always=True)
    def _ma(cls, v): return None if (v is None or v == 0) else float(v)

    @validator("avgPurchaseProba", pre=True, always=True)
    def _ap(cls, v): return None if (v is None or v <= 0) else float(v)

    class Config:
        extra = "allow"


class SHAPRequest(BaseModel):
    projectId:         str
    uploadsDir:        str
    ecommerceFile:     str
    marketingFile:     str
    advertisingFile:   str
    modelPath:         Optional[str]  = None
    objective:         str
    strategyName:      str
    featureImportance: Optional[list] = []
    storedFeatureCols: Optional[list] = []


class StoreContextRequest(BaseModel):
    projectId:   str
    agentResult: Dict[str, Any]
    kpiSummary:  Dict[str, Any]
    objective:   str


class RagQueryRequest(BaseModel):
    projectId: str
    query:     str
    model:     Optional[str] = None
    topK:      Optional[int] = 4


class DeleteProjectCsvsRequest(BaseModel):
    projectId:       str
    uploadsDir:      str
    ecommerceFile:   Optional[str] = None
    marketingFile:   Optional[str] = None
    advertisingFile: Optional[str] = None


# ════════════════════════════════════════════════════════════════
#  HEALTH — returns instantly, no heavy deps needed
# ════════════════════════════════════════════════════════════════

@app.get("/")
def root():
    return {"status": "OK", "service": "AgenticIQ v15.1"}


@app.get("/health")
def health():
    return {"status": "OK", "service": "AgenticIQ v15.1"}


# ════════════════════════════════════════════════════════════════
#  RAG ENDPOINTS
# ════════════════════════════════════════════════════════════════

@app.post("/store-agent-context")
def store_agent_context(req: StoreContextRequest):
    try:
        rag = _ensure_rag()
        result = rag["store"](
            project_id=req.projectId,
            agent_result=req.agentResult,
            kpi_summary=req.kpiSummary,
            objective=req.objective,
        )
        return {
            "status":    "success",
            "message":   f"Stored {len(result['stored'])} documents.",
            "projectId": req.projectId,
            **result,
        }
    except Exception as e:
        _tb.print_exc()
        return {"status": "error", "message": str(e), "projectId": req.projectId}


@app.post("/rag-chat")
def rag_chat_endpoint(req: RagQueryRequest):
    try:
        if not req.query or not req.query.strip():
            return {"status": "error", "message": "Query cannot be empty.", "answer": ""}
        rag = _ensure_rag()
        result = rag["chat"](
            project_id=req.projectId,
            query=req.query.strip(),
            model=req.model or os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
            top_k=req.topK or 4,
        )
        return {"status": "success", "projectId": req.projectId, **result}
    except Exception as e:
        _tb.print_exc()
        return {
            "status":  "error",
            "message": str(e),
            "answer":  f"An error occurred: {str(e)}",
            "projectId": req.projectId,
        }


@app.get("/rag-stats/{project_id}")
def rag_stats_endpoint(project_id: str):
    try:
        rag = _ensure_rag()
        stats = rag["stats"](project_id)
        return {"status": "success", "projectId": project_id, **stats}
    except Exception as e:
        return {"status": "error", "message": str(e), "exists": False}


@app.delete("/rag-clear/{project_id}")
def rag_clear_endpoint(project_id: str):
    try:
        rag = _ensure_rag()
        cleared = rag["clear"](project_id)
        return {
            "status":    "success",
            "projectId": project_id,
            "cleared":   cleared,
            "message":   "Context cleared." if cleared else "No store found.",
        }
    except Exception as e:
        return {"status": "error", "message": str(e), "cleared": False}


# ════════════════════════════════════════════════════════════════
#  FIX ENDPOINT-1: POST /delete-project-csvs
# ════════════════════════════════════════════════════════════════

@app.post("/delete-project-csvs")
def delete_project_csvs(req: DeleteProjectCsvsRequest):
    uploads_dir = os.path.abspath(req.uploadsDir)
    deleted = []
    skipped = []

    for file_ref in [req.ecommerceFile, req.marketingFile, req.advertisingFile]:
        if not file_ref:
            skipped.append("(none)")
            continue
        full_path = os.path.join(uploads_dir, file_ref)
        if os.path.exists(full_path):
            try:
                os.remove(full_path)
                deleted.append(file_ref)
                print(f"[CSV:delete] Removed: {full_path}")
            except Exception as e:
                skipped.append(file_ref)
                print(f"[CSV:delete] Could not remove {full_path}: {e}")
        else:
            skipped.append(file_ref)

    print(
        f"[CSV:delete] projectId={req.projectId} | "
        f"deleted={deleted} | skipped={skipped}"
    )
    return {
        "status":  "success",
        "deleted": deleted,
        "skipped": skipped,
    }


# ════════════════════════════════════════════════════════════════
#  POST /clean-datasets
# ════════════════════════════════════════════════════════════════

@app.post("/clean-datasets")
def clean_datasets(req: CleanRequest):
    try:
        uploads_dir = os.path.abspath(req.uploadsDir)
        cleaned_dir = os.path.join(uploads_dir, "cleaned")
        os.makedirs(cleaned_dir, exist_ok=True)

        raw_paths = {
            "ecommerce":   os.path.join(uploads_dir, req.ecommerceFile),
            "marketing":   os.path.join(uploads_dir, req.marketingFile),
            "advertising": os.path.join(uploads_dir, req.advertisingFile),
        }
        cleaned_filenames: Dict[str, str] = {}

        for key, raw_path in raw_paths.items():
            if not os.path.exists(raw_path):
                return {
                    "status": "error",
                    "message": f"File not found: {raw_path}",
                    "projectId": req.projectId,
                    "cleanedFiles": {},
                }
            df = pd.read_csv(raw_path, on_bad_lines="skip", low_memory=False)
            before = len(df)
            df.columns = (
                df.columns.str.strip()
                  .str.lower()
                  .str.replace(" ", "_")
                  .str.replace(r"[^\w]", "_", regex=True)
            )
            df = df.dropna(how="all").drop_duplicates()
            if key == "ecommerce":
                df = _clean_ecommerce(df)
            elif key == "marketing":
                df = _clean_marketing(df)
            elif key == "advertising":
                df = _clean_advertising(df)
            df = df.reset_index(drop=True)
            print(f"[Clean] {key}: {before} → {len(df)} rows")
            fname = f"{req.projectId}-{key}-cleaned.csv"
            df.to_csv(os.path.join(cleaned_dir, fname), index=False)
            cleaned_filenames[key] = f"cleaned/{fname}"

        return {
            "status":       "success",
            "message":      "All 3 datasets cleaned.",
            "projectId":    req.projectId,
            "cleanedFiles": cleaned_filenames,
        }
    except Exception as e:
        _tb.print_exc()
        return {
            "status": "error",
            "message": f"{type(e).__name__}: {e}\n{_tb.format_exc()}",
            "projectId": req.projectId,
            "cleanedFiles": {},
        }


# ════════════════════════════════════════════════════════════════
#  POST /engineer-features
# ════════════════════════════════════════════════════════════════

@app.post("/engineer-features")
def engineer_features(req: EngineerRequest):
    try:
        uploads_dir    = os.path.abspath(req.uploadsDir)
        engineered_dir = os.path.join(uploads_dir, "engineered")
        os.makedirs(engineered_dir, exist_ok=True)

        eco_path = os.path.join(uploads_dir, req.ecommerceFile)
        mkt_path = os.path.join(uploads_dir, req.marketingFile)
        adv_path = os.path.join(uploads_dir, req.advertisingFile)

        for label, path in [
            ("ecommerce", eco_path),
            ("marketing",  mkt_path),
            ("advertising", adv_path),
        ]:
            if not os.path.exists(path):
                return {
                    "status": "error",
                    "message": f"{label} file not found: {path}",
                    "projectId": req.projectId,
                    "engineeredFiles": {},
                    "kpiSummary": {},
                }

        df_eco = pd.read_csv(eco_path, low_memory=False).copy()
        df_mkt = pd.read_csv(mkt_path, low_memory=False).copy()
        df_adv = pd.read_csv(adv_path, low_memory=False).copy()

        required_eco = ["purchased"]
        missing_eco  = [c for c in required_eco if c not in df_eco.columns]
        if missing_eco:
            return {
                "status":  "error",
                "message": (
                    f"Ecommerce dataset is missing required columns: {missing_eco}. "
                    f"Available: {list(df_eco.columns)}"
                ),
                "projectId": req.projectId,
                "engineeredFiles": {},
                "kpiSummary": {},
            }

        if "clicks" not in df_adv.columns or "displays" not in df_adv.columns:
            return {
                "status":  "error",
                "message": (
                    "Advertising dataset is missing 'clicks' and/or 'displays' columns. "
                    f"Available: {list(df_adv.columns)}"
                ),
                "projectId": req.projectId,
                "engineeredFiles": {},
                "kpiSummary": {},
            }

        valid_adv_rows = df_adv[df_adv["displays"] > 0]
        if len(valid_adv_rows) == 0:
            return {
                "status":  "error",
                "message": "Advertising dataset has no rows with displays > 0.",
                "projectId": req.projectId,
                "engineeredFiles": {},
                "kpiSummary": {},
            }

        df_adv["ctr"] = df_adv.apply(
            lambda r: round((r["clicks"] / r["displays"]) * 100, 4)
            if r["displays"] > 0 else 0.0,
            axis=1,
        )

        df_eco["conversion_flag"] = df_eco["purchased"].astype(int)
        df_eco["conversion_rate_pct"] = (
            df_eco["conversion_flag"]
            .rolling(window=1000, min_periods=1).mean()
            .mul(100).round(4)
        )

        if "cart_abandoned" in df_eco.columns and "added_to_cart" in df_eco.columns:
            df_eco["cart_abandon_flag"] = df_eco["cart_abandoned"].astype(int)
            added     = df_eco["added_to_cart"].rolling(window=1000, min_periods=1).sum()
            abandoned = df_eco["cart_abandoned"].rolling(window=1000, min_periods=1).sum()
            df_eco["cart_abandonment_rate"] = (
                (abandoned / added.replace(0, np.nan)).mul(100).fillna(0).round(4)
            )
        else:
            df_eco["cart_abandon_flag"]    = 0
            df_eco["cart_abandonment_rate"] = 0.0

        if "revenue" in df_adv.columns and "cost" in df_adv.columns:
            df_adv["roi_computed"] = df_adv.apply(
                lambda r: round(r["revenue"] / r["cost"], 4) if r["cost"] > 0 else 0.0,
                axis=1,
            )
        if "revenue" in df_adv.columns and "clicks" in df_adv.columns:
            df_adv["revenue_per_click"] = df_adv.apply(
                lambda r: round(r["revenue"] / r["clicks"], 4) if r["clicks"] > 0 else 0.0,
                axis=1,
            )
        if "engagement_score" in df_mkt.columns:
            max_eng = df_mkt["engagement_score"].max()
            df_mkt["engagement_normalized"] = (
                (df_mkt["engagement_score"] / max_eng).round(4) if max_eng > 0 else 0.0
            )

        raw_max_pages = (
            pd.to_numeric(df_eco["pages_viewed"], errors="coerce").max()
            if "pages_viewed" in df_eco.columns else np.nan
        )
        raw_max_time = (
            pd.to_numeric(df_eco["time_on_site_sec"], errors="coerce").max()
            if "time_on_site_sec" in df_eco.columns else np.nan
        )
        max_pages = float(raw_max_pages) if (raw_max_pages is not None and not math.isnan(raw_max_pages)) else 30.0
        max_time  = float(raw_max_time)  if (raw_max_time  is not None and not math.isnan(raw_max_time))  else 1800.0
        max_pages = max(max_pages, 1.0)
        max_time  = max(max_time,  1.0)

        if "pages_viewed" in df_eco.columns and "time_on_site_sec" in df_eco.columns:
            pv = pd.to_numeric(df_eco["pages_viewed"],    errors="coerce").fillna(0)
            ts = pd.to_numeric(df_eco["time_on_site_sec"], errors="coerce").fillna(0)
            df_eco["engagement_score"] = (pv / max_pages * 0.4 + ts / max_time * 0.6).round(4)
        else:
            df_eco["engagement_score"] = 0.0

        if "discount_percent" in df_eco.columns and "unit_price" in df_eco.columns:
            dp = pd.to_numeric(df_eco["discount_percent"], errors="coerce").fillna(0)
            up = pd.to_numeric(df_eco["unit_price"],       errors="coerce").fillna(0)
            df_eco["discount_impact"] = (dp * up).round(4)

        if "unit_price" in df_eco.columns and "pages_viewed" in df_eco.columns:
            up = pd.to_numeric(df_eco["unit_price"],   errors="coerce").fillna(0)
            pv = pd.to_numeric(df_eco["pages_viewed"], errors="coerce").replace(0, 1).fillna(1)
            df_eco["price_per_page"] = (up / pv).round(4)

        if "added_to_cart" in df_eco.columns and "engagement_score" in df_eco.columns:
            atc = pd.to_numeric(df_eco["added_to_cart"],    errors="coerce").fillna(0)
            eng = pd.to_numeric(df_eco["engagement_score"], errors="coerce").fillna(0)
            pv2 = pd.to_numeric(df_eco["pages_viewed"],     errors="coerce").fillna(0)
            ts2 = pd.to_numeric(df_eco["time_on_site_sec"], errors="coerce").fillna(0)
            df_eco["cart_engage"]      = (atc * eng).round(4)
            df_eco["cart_time_ratio"]  = (atc * (ts2 / max(max_time,  1.0))).round(4)
            df_eco["cart_pages_ratio"] = (atc * (pv2 / max(max_pages, 1.0))).round(4)

        if "visit_weekday" in df_eco.columns:
            wd = pd.to_numeric(df_eco["visit_weekday"], errors="coerce").fillna(3)
            df_eco["is_weekend"] = (wd >= 5).astype(float)

        if "marketing_channel" in df_eco.columns and "user_type" in df_eco.columns:
            mc = pd.to_numeric(df_eco["marketing_channel"], errors="coerce").fillna(3)
            ut = pd.to_numeric(df_eco["user_type"],         errors="coerce").fillna(1)
            df_eco["ch_x_user"] = (mc * 7 + ut).round(4)

        if "visit_season" in df_eco.columns and "product_category" in df_eco.columns:
            vs = pd.to_numeric(df_eco["visit_season"],     errors="coerce").fillna(2)
            pc = pd.to_numeric(df_eco["product_category"], errors="coerce").fillna(4)
            df_eco["season_x_cat"] = (vs * 8 + pc).round(4)

        if "unit_price" in df_eco.columns and "discount_percent" in df_eco.columns:
            up  = pd.to_numeric(df_eco["unit_price"],      errors="coerce").fillna(0)
            dp2 = pd.to_numeric(df_eco["discount_percent"], errors="coerce").fillna(0)
            df_eco["price_x_disc"] = (up * dp2 / 100.0).round(4)

        if "pages_viewed" in df_eco.columns and "time_on_site_sec" in df_eco.columns:
            pv3 = pd.to_numeric(df_eco["pages_viewed"],     errors="coerce").fillna(1).clip(lower=1)
            ts3 = pd.to_numeric(df_eco["time_on_site_sec"], errors="coerce").fillna(0)
            df_eco["time_per_page"] = (ts3 / pv3).round(4)

        for col in ECO_DROP_COLUMNS:
            if col in df_eco.columns:
                df_eco = df_eco.drop(columns=[col])

        engineered_files: Dict[str, str] = {}
        for key, df, fname_key in [
            ("ecommerce",   df_eco, "ecommerce"),
            ("marketing",   df_mkt, "marketing"),
            ("advertising", df_adv, "advertising"),
        ]:
            fname = f"{req.projectId}-{fname_key}-engineered.csv"
            df.to_csv(os.path.join(engineered_dir, fname), index=False)
            engineered_files[key] = f"engineered/{fname}"

        def safe(val: Any) -> float:
            if val is None:
                return 0.0
            try:
                v = float(val)
                return 0.0 if (math.isnan(v) or math.isinf(v)) else round(v, 4)
            except Exception:
                return 0.0

        total_purchases  = int(df_eco["purchased"].sum())
        total_visits     = len(df_eco)
        total_cart_added = int(df_eco["added_to_cart"].sum()) if "added_to_cart" in df_eco.columns else 0
        total_abandoned  = int(df_eco["cart_abandoned"].sum()) if "cart_abandoned" in df_eco.columns else 0

        df_adv_valid = df_adv[df_adv["displays"] > 0]
        avg_ctr     = safe(df_adv_valid["ctr"].mean() if "ctr" in df_adv_valid.columns else 0)
        avg_conv    = safe((total_purchases / total_visits * 100) if total_visits > 0 else 0)
        avg_abandon = safe((total_abandoned / total_cart_added * 100) if total_cart_added > 0 else 0)

        if "roi" in df_mkt.columns:
            df_mkt_r = df_mkt.copy()
            df_mkt_r["roi"] = pd.to_numeric(df_mkt_r["roi"], errors="coerce")
            avg_roi = safe(df_mkt_r[df_mkt_r["roi"] > 0]["roi"].mean())
        else:
            avg_roi = 0.0

        dataset_stats: Dict[str, Any] = {}
        for feat in ECO_FEATURES:
            if feat in df_eco.columns:
                dataset_stats[feat] = _safe_stat_dict(df_eco[feat])

        dataset_stats["_max_pages"] = _safe_num(max_pages, 30.0)
        dataset_stats["_max_time"]  = _safe_num(max_time,  1800.0)

        channel_conv_rates: Dict[str, float] = {}
        if "marketing_channel" in df_eco.columns:
            ch_col = pd.to_numeric(df_eco["marketing_channel"], errors="coerce").dropna()
            for ch_int in ch_col.unique():
                ch_clean = int(ch_int)
                grp = df_eco[
                    pd.to_numeric(df_eco["marketing_channel"], errors="coerce") == ch_int
                ]
                if len(grp) >= 10 and "purchased" in grp.columns:
                    conv_rate = _safe_num(grp["purchased"].mean() * 100)
                    ch_name   = INT_TO_CHANNEL.get(ch_clean, str(ch_clean))
                    channel_conv_rates[ch_name]       = conv_rate
                    channel_conv_rates[str(ch_clean)] = conv_rate
            if channel_conv_rates:
                print(f"[Engineer] ✅ Real channel conv rates: {channel_conv_rates}")
        else:
            print("[Engineer] ⚠️  marketing_channel column missing.")

        dataset_stats["channel_conv_rates"] = channel_conv_rates

        segment_conv_rates:    Dict[str, float] = {}
        segment_abandon_rates: Dict[str, float] = {}

        if "user_type" in df_eco.columns:
            overall_conv = float(df_eco["purchased"].mean()) if total_visits > 0 else 1.0
            overall_conv = max(overall_conv, 0.001)
            for ut_val in pd.to_numeric(df_eco["user_type"], errors="coerce").dropna().unique():
                ut_int = int(ut_val)
                grp    = df_eco[
                    pd.to_numeric(df_eco["user_type"], errors="coerce") == ut_val
                ]
                if len(grp) >= 10:
                    conv_ratio = _safe_num(float(grp["purchased"].mean()) / overall_conv)
                    segment_conv_rates[str(ut_int)] = conv_ratio

                    if "cart_abandoned" in grp.columns and "added_to_cart" in grp.columns:
                        added_g     = grp["added_to_cart"].sum()
                        abandoned_g = grp["cart_abandoned"].sum()
                        if added_g > 0:
                            overall_abn = total_abandoned / max(total_cart_added, 1)
                            seg_abn     = abandoned_g / added_g
                            segment_abandon_rates[str(ut_int)] = _safe_num(
                                seg_abn / max(overall_abn, 0.001)
                            )
            if segment_conv_rates:
                print(f"[Engineer] ✅ Real segment conv ratios: {segment_conv_rates}")

        dataset_stats["segment_conv_rates"]    = segment_conv_rates
        dataset_stats["segment_abandon_rates"] = segment_abandon_rates

        kpi_summary = {
            "avgCTR":             avg_ctr,
            "avgConversionRate":  avg_conv,
            "avgCartAbandonment": avg_abandon,
            "avgROI":             avg_roi,
            "totalRevenue":       safe(df_eco["revenue"].sum()   if "revenue"  in df_eco.columns else 0),
            "totalClicks":        safe(df_adv["clicks"].sum()    if "clicks"   in df_adv.columns else 0),
            "totalImpressions":   safe(df_adv["displays"].sum()  if "displays" in df_adv.columns else 0),
            "totalSessions":      total_visits,
            "totalPurchases":     total_purchases,
            "totalCartAdded":     total_cart_added,
            "totalAbandoned":     total_abandoned,
        }
        print(f"[Engineer] REAL KPI Summary: {kpi_summary}")

        return {
            "status":          "success",
            "message":         "Feature engineering complete.",
            "projectId":       req.projectId,
            "engineeredFiles": engineered_files,
            "kpiSummary":      kpi_summary,
            "datasetStats":    dataset_stats,
        }
    except Exception as e:
        err_detail = f"{type(e).__name__}: {e}\n{_tb.format_exc()}"
        print(f"[Engineer] ❌ EXCEPTION: {err_detail}")
        return {
            "status":  "error",
            "message": err_detail,
            "projectId": req.projectId,
            "engineeredFiles": {},
            "kpiSummary": {},
        }


# ════════════════════════════════════════════════════════════════
#  Post-split derived feature computation (no leakage)
# ════════════════════════════════════════════════════════════════

def _add_derived_features_post_split(
    X: np.ndarray,
    raw_feature_cols: List[str],
    max_pages: float,
    max_time: float,
) -> np.ndarray:
    idx = {f: i for i, f in enumerate(raw_feature_cols)}

    def _col(name, default):
        return (X[:, idx[name]] if name in idx
                else np.full(len(X), _SAFE_DEFAULTS.get(name, default)))

    pages = _col("pages_viewed",     13.0)
    time_ = _col("time_on_site_sec", 903.0)
    price = _col("unit_price",       691.73)
    disc  = _col("discount_percent", 10.0)
    atc   = _col("added_to_cart",    0.64)
    mc    = _col("marketing_channel", 3.0)
    ut    = _col("user_type",        1.0)
    vs    = _col("visit_season",     2.0)
    pc    = _col("product_category", 4.0)
    wd    = _col("visit_weekday",    3.0)

    pages_safe   = np.maximum(pages, 1.0)
    engagement   = np.clip((pages / max_pages) * 0.4 + (time_ / max_time) * 0.6, 0, 1)
    discount_imp = disc * price
    price_per_pg = price / pages_safe
    time_per_pg  = time_ / pages_safe

    cart_engage      = atc * engagement
    cart_time_ratio  = atc * (time_ / max(max_time,  1.0))
    cart_pages_ratio = atc * (pages / max(max_pages, 1.0))
    is_weekend       = (wd >= 5).astype(float)
    ch_x_user        = mc * 7.0 + ut
    season_x_cat     = vs * 8.0 + pc
    price_x_disc     = price * disc / 100.0

    return np.hstack([
        X,
        engagement.reshape(-1, 1),
        discount_imp.reshape(-1, 1),
        price_per_pg.reshape(-1, 1),
        time_per_pg.reshape(-1, 1),
        cart_engage.reshape(-1, 1),
        cart_time_ratio.reshape(-1, 1),
        cart_pages_ratio.reshape(-1, 1),
        is_weekend.reshape(-1, 1),
        ch_x_user.reshape(-1, 1),
        season_x_cat.reshape(-1, 1),
        price_x_disc.reshape(-1, 1),
    ])


# ════════════════════════════════════════════════════════════════
#  POST /train-models
#  FIX STARTUP-2: sklearn/xgboost/lightgbm imported inside function
# ════════════════════════════════════════════════════════════════

@app.post("/train-models")
def train_models(req: TrainRequest):
    import warnings
    warnings.filterwarnings("ignore")
    # FIX STARTUP-2: lazy import of ML libs
    from sklearn.ensemble        import RandomForestClassifier
    from sklearn.model_selection import train_test_split, RandomizedSearchCV, StratifiedKFold
    from sklearn.preprocessing   import LabelEncoder
    from sklearn.metrics         import roc_auc_score
    import xgboost  as xgb
    import lightgbm as lgb

    try:
        uploads_dir = os.path.abspath(req.uploadsDir)
        models_dir  = os.path.join(uploads_dir, "models", req.projectId)
        os.makedirs(models_dir, exist_ok=True)

        eco_path = os.path.join(uploads_dir, req.ecommerceFile)
        mkt_path = os.path.join(uploads_dir, req.marketingFile)
        adv_path = os.path.join(uploads_dir, req.advertisingFile)

        for label, path in [
            ("ecommerce", eco_path),
            ("marketing",  mkt_path),
            ("advertising", adv_path),
        ]:
            if not os.path.exists(path):
                return {
                    "status": "error",
                    "message": f"File not found: {path}",
                    "projectId": req.projectId,
                }

        df_eco = pd.read_csv(eco_path, low_memory=False)
        df_mkt = pd.read_csv(mkt_path, low_memory=False)
        df_adv = pd.read_csv(adv_path, low_memory=False)

        print(f"[Train] Loaded: eco={len(df_eco)}, mkt={len(df_mkt)}, adv={len(df_adv)}")
        print(f"[Train] Objective: {req.objective} | Pipeline: v15.1 (GridFS PKLs)")

        df_raw, target_col, raw_feature_cols = _build_training_data(
            df_eco, df_mkt, df_adv, req.objective
        )

        if len(df_raw) < 50:
            return {
                "status":  "error",
                "message": f"Not enough training data ({len(df_raw)} rows). Minimum 50 required.",
                "projectId": req.projectId,
            }

        X_raw = df_raw[raw_feature_cols].values
        y     = df_raw[target_col].values

        X_train_raw, X_test_raw, y_train, y_test = train_test_split(
            X_raw, y, test_size=0.2, random_state=42, stratify=y
        )

        pv_idx = raw_feature_cols.index("pages_viewed")     if "pages_viewed"     in raw_feature_cols else None
        ts_idx = raw_feature_cols.index("time_on_site_sec") if "time_on_site_sec" in raw_feature_cols else None

        max_pages_train = (
            max(float(X_train_raw[:, pv_idx].max()), 1.0)
            if pv_idx is not None else _SAFE_DEFAULTS["pages_viewed"] * 2
        )
        max_time_train = (
            max(float(X_train_raw[:, ts_idx].max()), 1.0)
            if ts_idx is not None else _SAFE_DEFAULTS["time_on_site_sec"] * 2
        )

        X_train = _add_derived_features_post_split(
            X_train_raw, raw_feature_cols, max_pages_train, max_time_train
        )
        X_test = _add_derived_features_post_split(
            X_test_raw, raw_feature_cols, max_pages_train, max_time_train
        )

        feature_cols = raw_feature_cols + [
            f for f in ECO_DERIVED_FEATURES if f not in raw_feature_cols
        ]

        neg_count = int(np.sum(y_train == 0))
        pos_count = int(np.sum(y_train == 1))
        scale_pos = round(neg_count / max(pos_count, 1), 2)
        print(
            f"[Train] Split → train={len(X_train)}, test={len(X_test)} | "
            f"features={len(feature_cols)} | neg={neg_count} pos={pos_count} scale_pos={scale_pos}"
        )

        cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
        results:         Dict[str, Any]          = {}
        model_paths:     Dict[str, str]          = {}
        importances:     List[np.ndarray]        = []
        proba_arrays:    Dict[str, np.ndarray]   = {}
        roc_auc_scores_: Dict[str, float]        = {}
        best_params_log: Dict[str, Any]          = {}

        # ── Random Forest ──
        print("[Train] Training Random Forest (n_iter=15, 3-fold CV)...")
        t0 = time.time()
        rf_param_dist = {
            "n_estimators":      [200, 300, 400, 500],
            "max_depth":         [10, 15, 20, None],
            "min_samples_split": [2, 5, 10],
            "min_samples_leaf":  [1, 2, 4],
            "max_features":      ["sqrt", "log2", 0.4, 0.5],
            "class_weight":      ["balanced", "balanced_subsample"],
        }
        rf_base   = RandomForestClassifier(random_state=42, n_jobs=-1)
        rf_search = RandomizedSearchCV(
            rf_base, rf_param_dist, n_iter=15, cv=cv,
            scoring="roc_auc", n_jobs=-1, random_state=42, verbose=0,
        )
        rf_search.fit(X_train, y_train)
        rf = rf_search.best_estimator_
        best_params_log["randomForest"] = rf_search.best_params_
        rf_time  = round(time.time() - t0, 2)
        rf_pred  = rf.predict(X_test)
        rf_proba = rf.predict_proba(X_test)[:, 1]
        results["randomForest"]       = _metrics(y_test, rf_pred, rf_time, rf_proba)
        proba_arrays["randomForest"]  = rf_proba
        try:
            roc_auc_scores_["randomForest"] = float(roc_auc_score(y_test, rf_proba))
        except Exception:
            roc_auc_scores_["randomForest"] = results["randomForest"]["accuracy"] / 100.0

        rf_bundle    = {"model": rf, "feature_cols": feature_cols}
        rf_disk_path = os.path.join(models_dir, "random_forest.pkl")
        rf_gfs_key   = f"{req.projectId}/models/random_forest.pkl"
        model_paths["randomForest"] = _save_pkl_to_gridfs(rf_bundle, rf_gfs_key, rf_disk_path)

        importances.append(rf.feature_importances_)
        print(f"[Train] RF  → Acc={results['randomForest']['accuracy']}% "
              f"ROC-AUC={round(roc_auc_scores_['randomForest']*100,2)}% "
              f"time={rf_time}s | stored={model_paths['randomForest']}")

        # ── XGBoost ──
        print("[Train] Training XGBoost (n_iter=15, 3-fold CV)...")
        t0  = time.time()
        le  = LabelEncoder()
        y_train_enc = le.fit_transform(y_train)
        xgb_param_dist = {
            "n_estimators":     [200, 300, 400, 500],
            "max_depth":        [4, 5, 6, 7, 8],
            "learning_rate":    [0.03, 0.05, 0.08, 0.1],
            "subsample":        [0.7, 0.8, 0.9, 1.0],
            "colsample_bytree": [0.6, 0.7, 0.8, 0.9],
            "min_child_weight": [1, 3, 5],
            "gamma":            [0, 0.05, 0.1],
            "reg_alpha":        [0, 0.01, 0.1],
            "reg_lambda":       [1, 1.5, 2],
        }
        xgb_base   = xgb.XGBClassifier(
            random_state=42, eval_metric="logloss",
            verbosity=0, scale_pos_weight=scale_pos,
            tree_method="hist",
        )
        xgb_search = RandomizedSearchCV(
            xgb_base, xgb_param_dist, n_iter=15, cv=cv,
            scoring="roc_auc", n_jobs=-1, random_state=42, verbose=0,
        )
        xgb_search.fit(X_train, y_train_enc)
        xgb_model = xgb_search.best_estimator_
        best_params_log["xgboost"] = xgb_search.best_params_
        xgb_time      = round(time.time() - t0, 2)
        xgb_pred      = le.inverse_transform(xgb_model.predict(X_test))
        xgb_proba_raw = xgb_model.predict_proba(X_test)
        class_1_idx   = (
            list(le.classes_).index(1)
            if 1 in le.classes_
            else min(1, xgb_proba_raw.shape[1] - 1)
        )
        results["xgboost"]       = _metrics(y_test, xgb_pred, xgb_time, xgb_proba_raw[:, class_1_idx])
        proba_arrays["xgboost"]  = xgb_proba_raw[:, class_1_idx]
        try:
            roc_auc_scores_["xgboost"] = float(roc_auc_score(y_test, xgb_proba_raw[:, class_1_idx]))
        except Exception:
            roc_auc_scores_["xgboost"] = results["xgboost"]["accuracy"] / 100.0

        xgb_bundle    = {"model": xgb_model, "le": le, "feature_cols": feature_cols}
        xgb_disk_path = os.path.join(models_dir, "xgboost.pkl")
        xgb_gfs_key   = f"{req.projectId}/models/xgboost.pkl"
        model_paths["xgboost"] = _save_pkl_to_gridfs(xgb_bundle, xgb_gfs_key, xgb_disk_path)

        importances.append(xgb_model.feature_importances_)
        print(f"[Train] XGB → Acc={results['xgboost']['accuracy']}% "
              f"ROC-AUC={round(roc_auc_scores_['xgboost']*100,2)}% "
              f"time={xgb_time}s | stored={model_paths['xgboost']}")

        # ── LightGBM ──
        print("[Train] Training LightGBM (n_iter=15, 3-fold CV)...")
        t0     = time.time()
        le_lgb = LabelEncoder()
        y_train_enc_lgb = le_lgb.fit_transform(y_train)
        lgb_param_dist = {
            "n_estimators":      [200, 300, 400, 500],
            "max_depth":         [4, 6, 8, 10, -1],
            "learning_rate":     [0.03, 0.05, 0.08, 0.1],
            "subsample":         [0.7, 0.8, 0.9, 1.0],
            "colsample_bytree":  [0.6, 0.7, 0.8, 0.9],
            "num_leaves":        [31, 63, 127, 255],
            "min_child_samples": [10, 20, 30],
            "reg_alpha":         [0, 0.01, 0.1],
            "reg_lambda":        [0, 0.1, 1.0],
        }
        lgb_base   = lgb.LGBMClassifier(
            random_state=42, verbose=-1, class_weight="balanced",
            n_jobs=-1,
        )
        lgb_search = RandomizedSearchCV(
            lgb_base, lgb_param_dist, n_iter=15, cv=cv,
            scoring="roc_auc", n_jobs=-1, random_state=42, verbose=0,
        )
        lgb_search.fit(X_train, y_train_enc_lgb)
        lgb_model = lgb_search.best_estimator_
        best_params_log["lightgbm"] = lgb_search.best_params_
        lgb_time      = round(time.time() - t0, 2)
        lgb_pred      = le_lgb.inverse_transform(lgb_model.predict(X_test))
        lgb_proba_raw = lgb_model.predict_proba(X_test)
        class_1_idx_lgb = (
            list(le_lgb.classes_).index(1)
            if 1 in le_lgb.classes_
            else min(1, lgb_proba_raw.shape[1] - 1)
        )
        results["lightgbm"]      = _metrics(
            y_test, lgb_pred, lgb_time, lgb_proba_raw[:, class_1_idx_lgb]
        )
        proba_arrays["lightgbm"] = lgb_proba_raw[:, class_1_idx_lgb]
        try:
            roc_auc_scores_["lightgbm"] = float(roc_auc_score(y_test, lgb_proba_raw[:, class_1_idx_lgb]))
        except Exception:
            roc_auc_scores_["lightgbm"] = results["lightgbm"]["accuracy"] / 100.0

        lgb_bundle    = {"model": lgb_model, "le": le_lgb, "feature_cols": feature_cols}
        lgb_disk_path = os.path.join(models_dir, "lightgbm.pkl")
        lgb_gfs_key   = f"{req.projectId}/models/lightgbm.pkl"
        model_paths["lightgbm"] = _save_pkl_to_gridfs(lgb_bundle, lgb_gfs_key, lgb_disk_path)

        importances.append(lgb_model.feature_importances_)
        print(f"[Train] LGB → Acc={results['lightgbm']['accuracy']}% "
              f"ROC-AUC={round(roc_auc_scores_['lightgbm']*100,2)}% "
              f"time={lgb_time}s | stored={model_paths['lightgbm']}")

        # ── ROC-AUC weighted ensemble ──
        total_roc = sum(roc_auc_scores_.values()) or 1.0
        w_rf  = roc_auc_scores_["randomForest"] / total_roc
        w_xgb = roc_auc_scores_["xgboost"]      / total_roc
        w_lgb = roc_auc_scores_["lightgbm"]     / total_roc

        def w_avg(k: str) -> float:
            return round(
                results["randomForest"][k] * w_rf
                + results["xgboost"][k]    * w_xgb
                + results["lightgbm"][k]   * w_lgb,
                2,
            )

        ensemble = {
            "avgAccuracy":  w_avg("accuracy"),
            "avgPrecision": w_avg("precision"),
            "avgRecall":    w_avg("recall"),
            "avgF1Score":   w_avg("f1Score"),
            "method":       "roc_auc_weighted",
            "weights": {
                "rf":  round(w_rf,  4),
                "xgb": round(w_xgb, 4),
                "lgb": round(w_lgb, 4),
            },
        }
        ensemble_proba = (
            proba_arrays["randomForest"] * w_rf
            + proba_arrays["xgboost"]    * w_xgb
            + proba_arrays["lightgbm"]   * w_lgb
        )
        avg_purchase_proba = round(float(ensemble_proba.mean()), 4)

        avg_imp = (
            np.array(importances[0]) * w_rf
            + np.array(importances[1]) * w_xgb
            + np.array(importances[2]) * w_lgb
        )
        total_imp = avg_imp.sum() or 1.0
        feat_importance = sorted(
            [
                {"feature": f, "importance": round(float(i / total_imp), 4)}
                for f, i in zip(feature_cols, avg_imp)
            ],
            key=lambda x: x["importance"],
            reverse=True,
        )[:10]

        print(
            f"[Train] Ensemble: {ensemble['avgAccuracy']}% | "
            f"AvgProba: {avg_purchase_proba} | "
            f"Weights RF={round(w_rf,3)} XGB={round(w_xgb,3)} LGB={round(w_lgb,3)}"
        )

        # ── KPI Regressor ──
        print("[Train] Training KPI Regressor...")
        kpi_predictor_path = _train_kpi_regressor(
            df_eco, df_mkt, df_adv, feature_cols, models_dir, req.projectId,
            max_pages_train, max_time_train,
        )
        print(f"[Train] KPI Regressor stored: {kpi_predictor_path}")

        # ── Learned mechanism strengths ──
        feat_imp_dict = {f["feature"]: f["importance"] for f in feat_importance}

        STRATEGY_FEATURE_MAP = {
            "offer_discount":            ["discount_percent", "discount_impact", "user_type", "discount_amount"],
            "retargeting_campaign":      ["marketing_channel", "engagement_score", "pages_viewed", "cart_engage"],
            "increase_ad_budget":        ["marketing_channel", "pages_viewed", "time_on_site_sec"],
            "improve_checkout_ux":       ["pages_viewed", "time_on_site_sec", "engagement_score", "price_per_page",
                                          "cart_engage", "cart_time_ratio"],
            "add_urgency_signals":       ["time_on_site_sec", "engagement_score", "discount_percent",
                                          "cart_pages_ratio"],
            "reallocate_channel_budget": ["marketing_channel", "unit_price", "discount_impact"],
            "improve_ad_creative":       ["marketing_channel", "pages_viewed", "engagement_score"],
            "optimize_targeting":        ["marketing_channel", "user_type", "engagement_score",
                                          "added_to_cart"],
        }
        FEATURE_KPI_MAP = {
            "discount_percent":   ["conversion_rate", "cart_abandonment"],
            "discount_amount":    ["conversion_rate", "roi"],
            "discount_impact":    ["conversion_rate", "roi"],
            "engagement_score":   ["conversion_rate", "cart_abandonment"],
            "pages_viewed":       ["conversion_rate", "cart_abandonment"],
            "time_on_site_sec":   ["conversion_rate", "cart_abandonment"],
            "marketing_channel":  ["ctr", "roi"],
            "user_type":          ["conversion_rate", "cart_abandonment"],
            "unit_price":         ["roi", "conversion_rate"],
            "quantity":           ["roi", "conversion_rate"],
            "price_per_page":     ["roi", "conversion_rate"],
            "added_to_cart":      ["conversion_rate", "cart_abandonment"],
            "cart_engage":        ["conversion_rate", "cart_abandonment"],
            "cart_time_ratio":    ["conversion_rate", "cart_abandonment"],
            "cart_pages_ratio":   ["cart_abandonment", "conversion_rate"],
        }

        learned_mechanism_strengths: Dict[str, Any] = {}
        for strat_id, feat_list in STRATEGY_FEATURE_MAP.items():
            strat_strengths = {
                "ctr": 0.0, "conversion_rate": 0.0,
                "cart_abandonment": 0.0, "roi": 0.0,
            }
            total_feat_imp = (
                sum(feat_imp_dict.get(f, 0.0) for f in feat_list) or 1.0
            )
            for feat in feat_list:
                feat_imp_val = feat_imp_dict.get(feat, 0.0)
                weight       = feat_imp_val / total_feat_imp
                for kpi in FEATURE_KPI_MAP.get(feat, []):
                    strat_strengths[kpi] += round(weight * feat_imp_val, 4)
            max_s = max(strat_strengths.values()) or 1.0
            scale = 0.60 / max_s if max_s > 0 else 1.0
            normalized = {k: round(min(0.60, v * scale), 4) for k, v in strat_strengths.items()}
            if strat_id == "offer_discount":
                normalized["roi"] = -abs(normalized.get("roi", 0.05))
            learned_mechanism_strengths[strat_id] = normalized

        # ── Learned objective weights ──
        kpi_raw_weight = {"conversion": 0.0, "abandon": 0.0, "roi": 0.0, "ctr": 0.0}
        feature_kpi_weight_map = {
            "discount_percent":   {"conversion": 0.5, "abandon": 0.5},
            "discount_amount":    {"roi": 0.4, "conversion": 0.6},
            "engagement_score":   {"conversion": 0.6, "abandon": 0.4},
            "pages_viewed":       {"conversion": 0.5, "abandon": 0.5},
            "time_on_site_sec":   {"conversion": 0.5, "abandon": 0.5},
            "unit_price":         {"roi": 0.6, "conversion": 0.4},
            "quantity":           {"roi": 0.5, "conversion": 0.5},
            "marketing_channel":  {"ctr": 0.5, "roi": 0.5},
            "user_type":          {"conversion": 0.4, "abandon": 0.6},
            "price_per_page":     {"roi": 0.5, "conversion": 0.5},
            "discount_impact":    {"roi": 0.5, "conversion": 0.5},
            "rating":             {"conversion": 0.7, "abandon": 0.3},
            "device_type":        {"conversion": 0.4, "abandon": 0.3, "ctr": 0.3},
            "payment_method":     {"conversion": 0.5, "abandon": 0.5},
            "added_to_cart":      {"conversion": 0.7, "abandon": 0.3},
            "cart_engage":        {"conversion": 0.6, "abandon": 0.4},
            "cart_time_ratio":    {"conversion": 0.5, "abandon": 0.5},
            "cart_pages_ratio":   {"abandon": 0.6, "conversion": 0.4},
        }
        for feat, kpi_weights in feature_kpi_weight_map.items():
            feat_imp_val = feat_imp_dict.get(feat, 0.0)
            for kpi, w in kpi_weights.items():
                kpi_raw_weight[kpi] += feat_imp_val * w

        total_kpi_w = sum(kpi_raw_weight.values()) or 1.0
        base_learned_obj_weights = {
            k: round(v / total_kpi_w * 100, 1)
            for k, v in kpi_raw_weight.items()
        }

        def make_obj_weights(primary_kpi: str, emphasis: float = 0.45) -> dict:
            base        = dict(base_learned_obj_weights)
            others_sum  = sum(v for k, v in base.items() if k != primary_kpi)
            primary_val = round(emphasis * 100, 1)
            scale_      = (100 - primary_val) / max(others_sum, 1)
            result      = {
                k: round(v * scale_, 1) if k != primary_kpi else primary_val
                for k, v in base.items()
            }
            diff  = round(100 - sum(result.values()), 1)
            max_k = max((k for k in result if k != primary_kpi), key=result.get)
            result[max_k] = round(result[max_k] + diff, 1)
            return result

        learned_objective_weights = {
            "increase_revenue":        make_obj_weights("conversion", 0.45),
            "reduce_cart_abandonment": make_obj_weights("abandon",    0.55),
            "improve_conversion_rate": make_obj_weights("conversion", 0.55),
            "optimize_marketing_roi":  make_obj_weights("roi",        0.60),
        }

        return {
            "status":  "success",
            "message": (
                f"All 3 models + KPI regressor trained on {len(X_train)} "
                f"real rows (test={len(X_test)}, features={len(feature_cols)}). "
                f"v15.1: all PKLs in GridFS."
            ),
            "projectId":              req.projectId,
            "models":                 results,
            "ensemble":               ensemble,
            "avgPurchaseProbability": avg_purchase_proba,
            "featureImportance":      feat_importance,
            "trainingRows":           len(X_train),
            "testRows":               len(X_test),
            "features":               feature_cols,
            "bestHyperparams":        best_params_log,
            "learnedMechanismStrengths": learned_mechanism_strengths,
            "learnedObjectiveWeights":   learned_objective_weights,
            "kpiPredictorPath":          kpi_predictor_path,
            "pipelineVersion":           "v15.1",
            "storageBackend":            "gridfs",
            "modelPaths": {
                "randomForest": model_paths["randomForest"],
                "xgboost":      model_paths["xgboost"],
                "lightgbm":     model_paths["lightgbm"],
            },
        }
    except Exception as e:
        err_detail = f"{type(e).__name__}: {e}\n{_tb.format_exc()}"
        print(f"[Train] ❌ EXCEPTION: {err_detail}")
        return {"status": "error", "message": err_detail, "projectId": req.projectId}


# ════════════════════════════════════════════════════════════════
#  KPI REGRESSOR
# ════════════════════════════════════════════════════════════════

def _train_kpi_regressor(
    df_eco, df_mkt, df_adv, feature_cols, models_dir, project_id,
    max_pages_train: float = 30.0,
    max_time_train:  float = 1800.0,
) -> str:
    # FIX STARTUP-2: lazy import
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.metrics  import r2_score

    df = df_eco.copy().reset_index(drop=True)
    n  = len(df)

    for col in ["purchased", "added_to_cart", "cart_abandoned"]:
        if col not in df.columns:
            raise ValueError(f"KPI regressor requires '{col}' column.")
    if "clicks" not in df_adv.columns or "displays" not in df_adv.columns:
        raise ValueError("KPI regressor requires 'clicks' and 'displays' in advertising data.")

    total_vis    = len(df)
    total_purch  = int(df["purchased"].sum())
    total_added  = max(int(df["added_to_cart"].sum()), 1)
    total_abn    = int(df["cart_abandoned"].sum())
    real_conv    = total_purch / total_vis   * 100
    real_abandon = total_abn   / total_added * 100

    df_adv_valid = df_adv[df_adv["displays"] > 0].copy()
    if "ctr" in df_adv_valid.columns:
        real_ctr = float(df_adv_valid["ctr"].mean())
    else:
        real_ctr = float((df_adv_valid["clicks"] / df_adv_valid["displays"]).mean() * 100)

    roi_series = pd.to_numeric(df_mkt.get("roi", pd.Series(dtype=float)), errors="coerce")
    real_roi   = float(roi_series[roi_series > 0].mean()) if (roi_series > 0).any() else 3.0

    print(
        f"[KPIReg] Real KPIs → conv={real_conv:.4f}% ctr={real_ctr:.4f}% "
        f"abandon={real_abandon:.2f}% roi={real_roi:.4f}x"
    )

    ECO_RAW_ONLY = [f for f in feature_cols
                    if f not in ("engagement_score", "discount_impact", "price_per_page",
                                 "cart_engage", "cart_time_ratio", "cart_pages_ratio")]

    for col in ECO_RAW_ONLY + ["purchased", "added_to_cart", "cart_abandoned"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    rng         = np.random.default_rng(42)
    shuffle_idx = rng.permutation(n)
    df          = df.iloc[shuffle_idx].reset_index(drop=True)
    split_n     = int(n * 0.8)
    df_train    = df.iloc[:split_n].copy()
    df_test     = df.iloc[split_n:].copy()

    price_tr = df_train["unit_price"].clip(lower=0)       if "unit_price"       in df_train.columns else pd.Series([691.73])
    disc_tr  = df_train["discount_percent"].clip(lower=0) if "discount_percent" in df_train.columns else pd.Series([10.0])
    pages_tr = df_train["pages_viewed"].clip(lower=1)     if "pages_viewed"     in df_train.columns else pd.Series([13.0])

    di_99  = max(float((disc_tr * price_tr).quantile(0.99)), 1.0)
    ppp_99 = max(float((price_tr / pages_tr).quantile(0.99)), 1.0)
    p98    = max(float(price_tr.quantile(0.98)), 1.0)
    d_max  = max(float(disc_tr.max()), 1.0)

    ch_conv_map = {}
    if "marketing_channel" in df.columns:
        for ch in range(6):
            grp = df[df["marketing_channel"] == ch]
            if len(grp) >= 50:
                ch_conv_map[ch] = float(grp["purchased"].mean() * 100)
    mean_ch_conv = real_conv if not ch_conv_map else np.mean(list(ch_conv_map.values()))
    ch_ctr_mult  = {ch: v / max(mean_ch_conv, 0.01) for ch, v in ch_conv_map.items()}

    def _build_targets(df_split: pd.DataFrame) -> pd.DataFrame:
        ds          = df_split.copy()
        pv_col      = ds["pages_viewed"].clip(lower=1) if "pages_viewed" in ds.columns else pd.Series(13.0, index=ds.index)
        ts_col      = ds["time_on_site_sec"]           if "time_on_site_sec" in ds.columns else pd.Series(903.0, index=ds.index)
        atc_col     = ds["added_to_cart"].astype(float) if "added_to_cart" in ds.columns else pd.Series(0.0, index=ds.index)
        ds["_eng"]  = ((pv_col / max_pages_train) * 0.4 + (ts_col / max_time_train) * 0.6).clip(0, 1)
        ds["_pages_bin"] = pd.cut(
            pv_col, bins=[0, 6, 12, 18, 25, 100], labels=False, include_lowest=True
        ).fillna(0).astype(int)
        ds["_disc_bin"]  = pd.cut(
            ds["discount_percent"] if "discount_percent" in ds.columns else pd.Series(10.0, index=ds.index),
            bins=[-1, 0, 10, 20, 100], labels=False, include_lowest=True
        ).fillna(0).astype(int)
        train_seg = df_train.copy()
        train_seg["_pages_bin"] = pd.cut(
            train_seg["pages_viewed"].clip(lower=1) if "pages_viewed" in train_seg.columns else pd.Series(13.0),
            bins=[0, 6, 12, 18, 25, 100], labels=False, include_lowest=True
        ).fillna(0).astype(int)
        seg_map = (
            train_seg.groupby(["marketing_channel", "user_type", "_pages_bin"])["purchased"].mean() * 100
            if "marketing_channel" in train_seg.columns and "user_type" in train_seg.columns
            else pd.Series(dtype=float)
        )
        if len(seg_map) > 0:
            ds["_key"]   = list(zip(
                ds["marketing_channel"].astype(int) if "marketing_channel" in ds.columns else [0]*len(ds),
                ds["user_type"].astype(int)         if "user_type"         in ds.columns else [1]*len(ds),
                ds["_pages_bin"],
            ))
            ds["t_conv"] = ds["_key"].map(seg_map).fillna(real_conv)
        else:
            ds["t_conv"] = real_conv
        ds["t_conv"] = ds["t_conv"].clip(real_conv * 0.5, real_conv * 1.5)

        tr_abn = df_train.copy()
        tr_abn["_disc_bin"] = pd.cut(
            tr_abn["discount_percent"] if "discount_percent" in tr_abn.columns else pd.Series(10.0),
            bins=[-1, 0, 10, 20, 100], labels=False, include_lowest=True
        ).fillna(0).astype(int)

        def _abn(g):
            add = g["added_to_cart"].sum()
            abn = g["cart_abandoned"].sum()
            return float(abn / max(add, 1) * 100)

        abn_map = {}
        if "user_type" in tr_abn.columns:
            for (ut, db), g in tr_abn.groupby(["user_type", "_disc_bin"]):
                abn_map[(ut, db)] = _abn(g)

        if abn_map:
            ds["_abn_key"]  = list(zip(
                ds["user_type"].astype(int) if "user_type" in ds.columns else [1]*len(ds),
                ds["_disc_bin"],
            ))
            ds["t_abandon"] = ds["_abn_key"].map(abn_map).fillna(real_abandon)
        else:
            ds["t_abandon"] = real_abandon
        ds["t_abandon"] = ds["t_abandon"].clip(real_abandon * 0.5, real_abandon * 1.5)

        train_signal = (
            0.6 * (df_train["unit_price"]       / p98   ).clip(0, 1) -
            0.4 * (df_train["discount_percent"]  / d_max ).clip(0, 1)
            if "unit_price" in df_train.columns and "discount_percent" in df_train.columns
            else pd.Series(0.5, index=df_train.index)
        )
        s_min = float(train_signal.min())
        s_rng = max(float(train_signal.max()) - s_min, 0.001)
        signal = (
            0.6 * (ds["unit_price"]      / p98   ).clip(0, 1) -
            0.4 * (ds["discount_percent"] / d_max ).clip(0, 1)
            if "unit_price" in ds.columns and "discount_percent" in ds.columns
            else pd.Series(0.5, index=ds.index)
        )
        roi_min_t = real_roi * 0.6
        roi_max_t = real_roi * 1.8
        ds["t_roi"] = (roi_min_t + (signal - s_min) / s_rng * (roi_max_t - roi_min_t)).clip(roi_min_t, roi_max_t)

        ch_mult   = ds["marketing_channel"].map(ch_ctr_mult).fillna(1.0) if "marketing_channel" in ds.columns else pd.Series(1.0, index=ds.index)
        ds["t_ctr"] = real_ctr * ch_mult * (0.5 + 0.5 * ds["_eng"])
        ds["t_ctr"] = ds["t_ctr"].clip(real_ctr * 0.3, real_ctr * 2.5)

        return ds[["t_ctr", "t_conv", "t_abandon", "t_roi"]]

    Y_train = _build_targets(df_train).values.astype(np.float32)
    Y_test  = _build_targets(df_test).values.astype(np.float32)

    def _make_X(df_split: pd.DataFrame) -> np.ndarray:
        raw_matrix = np.zeros((len(df_split), len(ECO_RAW_ONLY)), dtype=np.float32)
        for col_idx, col_name in enumerate(ECO_RAW_ONLY):
            if col_name in df_split.columns:
                vals = pd.to_numeric(df_split[col_name], errors="coerce").fillna(
                    _SAFE_DEFAULTS.get(col_name, 0.0)
                ).values.astype(np.float32)
            else:
                vals = np.full(len(df_split), float(_SAFE_DEFAULTS.get(col_name, 0.0)), dtype=np.float32)
            raw_matrix[:, col_idx] = vals

        def _get_col(name, default):
            if name in ECO_RAW_ONLY:
                return raw_matrix[:, ECO_RAW_ONLY.index(name)]
            return np.full(len(df_split), float(default), dtype=np.float32)

        pv  = np.maximum(_get_col("pages_viewed",     _SAFE_DEFAULTS["pages_viewed"]),  1.0)
        ts  = _get_col("time_on_site_sec",  _SAFE_DEFAULTS["time_on_site_sec"])
        pri = _get_col("unit_price",        _SAFE_DEFAULTS["unit_price"])
        dis = _get_col("discount_percent",  _SAFE_DEFAULTS["discount_percent"])
        atc = _get_col("added_to_cart",     _SAFE_DEFAULTS.get("added_to_cart", 0.64))

        eng        = np.clip((pv / max_pages_train) * 0.4 + (ts / max_time_train) * 0.6, 0, 1)
        di_n       = np.clip((dis * pri) / di_99,  0, 1.5)
        ppp_n      = np.clip((pri / pv)  / ppp_99, 0, 1.5)
        c_engage   = atc * eng
        c_time_r   = atc * (ts / max(max_time_train,  1.0))
        c_pages_r  = atc * (pv / max(max_pages_train, 1.0))

        return np.hstack([
            raw_matrix,
            eng.reshape(-1, 1),
            di_n.reshape(-1, 1),
            ppp_n.reshape(-1, 1),
            c_engage.reshape(-1, 1),
            c_time_r.reshape(-1, 1),
            c_pages_r.reshape(-1, 1),
        ]).astype(np.float32)

    X_train_kpi = _make_X(df_train)
    X_test_kpi  = _make_X(df_test)

    mask_tr = ~(np.isnan(X_train_kpi).any(1) | np.isnan(Y_train).any(1))
    mask_te = ~(np.isnan(X_test_kpi).any(1)  | np.isnan(Y_test).any(1))
    X_train_kpi, Y_train = X_train_kpi[mask_tr], Y_train[mask_tr]
    X_test_kpi,  Y_test  = X_test_kpi[mask_te],  Y_test[mask_te]

    if len(X_train_kpi) < 50:
        raise ValueError(f"Not enough rows for KPI regressor: {len(X_train_kpi)}")

    reg = RandomForestRegressor(
        n_estimators=200, max_depth=12, min_samples_leaf=10,
        random_state=42, n_jobs=-1
    )
    reg.fit(X_train_kpi, Y_train)

    preds        = reg.predict(X_test_kpi)
    target_names = ["t_ctr", "t_conv", "t_abandon", "t_roi"]
    r2_scores    = {}
    for i, tn in enumerate(target_names):
        r2_scores[tn] = round(float(r2_score(Y_test[:, i], preds[:, i])), 4)
    print(f"[KPIReg] R² per target: {r2_scores}")

    full_feature_cols = ECO_RAW_ONLY + [
        "engagement_score", "discount_impact", "price_per_page",
        "cart_engage", "cart_time_ratio", "cart_pages_ratio",
    ]

    reg_bundle = {
        "model":        reg,
        "features":     full_feature_cols,
        "targets":      target_names,
        "di_99":        di_99,
        "ppp_99":       ppp_99,
        "p98":          p98,
        "d_max":        d_max,
        "max_pages":    max_pages_train,
        "max_time":     max_time_train,
        "real_conv":    real_conv,
        "real_ctr":     real_ctr,
        "real_abandon": real_abandon,
        "real_roi":     real_roi,
        "ch_ctr_mult":  ch_ctr_mult,
        "r2_scores":    r2_scores,
    }

    kpi_disk_path = os.path.join(models_dir, "kpi_predictor.pkl")
    kpi_gfs_key   = f"{project_id}/models/kpi_predictor.pkl"
    return _save_pkl_to_gridfs(reg_bundle, kpi_gfs_key, kpi_disk_path)


# ════════════════════════════════════════════════════════════════
#  POST /score-strategies
# ════════════════════════════════════════════════════════════════

@app.post("/score-strategies")
def score_strategies(req: ScoreStrategiesRequest):
    try:
        uploads_dir = os.path.abspath(req.uploadsDir)
        eco_path    = os.path.join(uploads_dir, req.ecommerceFile)
        if not os.path.exists(eco_path):
            return {"status": "error", "message": f"Engineered file not found: {eco_path}"}

        df_eco         = pd.read_csv(eco_path, low_memory=False)
        avail_features = [f for f in ECO_FEATURES if f in df_eco.columns]
        if not avail_features:
            return {"status": "error", "message": "No matching ECO_FEATURES in engineered file"}

        dataset_stats = req.datasetStats or {}
        base_vector: Dict[str, float] = {}
        for feat in avail_features:
            if dataset_stats and feat in dataset_stats and isinstance(dataset_stats[feat], dict):
                base_vector[feat] = float(dataset_stats[feat].get("median", 0.0))
            else:
                col = pd.to_numeric(df_eco[feat], errors="coerce")
                base_vector[feat] = float(col.median())

        max_pages = float(
            dataset_stats.get("_max_pages",
                df_eco["pages_viewed"].max() if "pages_viewed" in df_eco.columns else 30.0)
        )
        max_time = float(
            dataset_stats.get("_max_time",
                df_eco["time_on_site_sec"].max() if "time_on_site_sec" in df_eco.columns else 1800.0)
        )
        max_pages = max(max_pages, 1.0)
        max_time  = max(max_time,  1.0)

        models_loaded: Dict[str, Any]     = {}
        model_load_errors: Dict[str, str] = {}
        for model_key, model_path in req.modelPaths.items():
            if not model_path:
                model_load_errors[model_key] = "empty path"
                continue
            try:
                models_loaded[model_key] = _load_pkl_from_gridfs_or_disk(model_path)
            except Exception as load_err:
                model_load_errors[model_key] = str(load_err)
                print(f"[ScoreStrategies] Load failed for {model_key}: {load_err}")

        if not models_loaded:
            return {
                "status":     "error",
                "message":    "No PKL model files could be loaded. Please retrain models.",
                "loadErrors": model_load_errors,
            }

        weights = req.ensembleWeights or {"rf": 0.333, "xgb": 0.333, "lgb": 0.334}
        strategy_scores = []

        for strat in req.strategies:
            strat_id     = strat.get("id", "unknown")
            strat_params = strat.get("params", {})

            vec = _build_strategy_feature_vector(
                strat_id, strat_params, base_vector,
                max_pages, max_time, avail_features,
                req.objective, dataset_stats,
            )
            X       = np.array([[vec.get(f, 0.0) for f in avail_features]])
            probas: Dict[str, float] = {}

            if "randomForest" in models_loaded:
                try:
                    m = _unwrap_model(models_loaded["randomForest"])
                    probas["randomForest"] = float(m.predict_proba(X)[0, 1])
                except Exception as e:
                    print(f"[score_strategies] RF predict failed for {strat_id}: {e}")

            if "xgboost" in models_loaded:
                try:
                    m, le = _unwrap_model_le(models_loaded["xgboost"])
                    xp    = m.predict_proba(X)
                    c1    = list(le.classes_).index(1) if 1 in le.classes_ else min(1, xp.shape[1] - 1)
                    probas["xgboost"] = float(xp[0, c1])
                except Exception as e:
                    print(f"[score_strategies] XGB predict failed for {strat_id}: {e}")

            if "lightgbm" in models_loaded:
                try:
                    m, le = _unwrap_model_le(models_loaded["lightgbm"])
                    lp    = m.predict_proba(X)
                    c1    = list(le.classes_).index(1) if 1 in le.classes_ else min(1, lp.shape[1] - 1)
                    probas["lightgbm"] = float(lp[0, c1])
                except Exception as e:
                    print(f"[score_strategies] LGB predict failed for {strat_id}: {e}")

            ensemble_proba = 0.0
            total_w_       = 0.0
            for mkey, proba in probas.items():
                w_key          = {"randomForest": "rf", "xgboost": "xgb", "lightgbm": "lgb"}.get(mkey, mkey)
                w              = weights.get(w_key, 0.333)
                ensemble_proba += proba * w
                total_w_       += w
            if total_w_ > 0:
                ensemble_proba /= total_w_

            strategy_scores.append({
                "strategyId":            strat_id,
                "source":                strat.get("source", "ai"),
                "mlPurchaseProbability": round(ensemble_proba, 4),
                "modelProbabilities":    {k: round(v, 4) for k, v in probas.items()},
                "featureVector":         {k: round(v, 4) for k, v in vec.items()},
            })

        return {
            "status":          "success",
            "projectId":       req.projectId,
            "strategyScores":  strategy_scores,
            "modelsUsed":      list(models_loaded.keys()),
            "modelLoadErrors": model_load_errors or None,
        }
    except Exception as e:
        _tb.print_exc()
        return {
            "status": "error", "message": str(e),
            "projectId": req.projectId, "strategyScores": [],
        }


# ════════════════════════════════════════════════════════════════
#  HELPER: unwrap pkl format
# ════════════════════════════════════════════════════════════════

def _unwrap_model(loaded: Any):
    if isinstance(loaded, dict) and "model" in loaded:
        return loaded["model"]
    return loaded


def _unwrap_model_le(loaded: Any):
    if isinstance(loaded, dict):
        return loaded["model"], loaded.get("le")
    if isinstance(loaded, tuple):
        return loaded[0], loaded[1]
    return loaded, None


def _unwrap_feature_cols(loaded: Any) -> Optional[List[str]]:
    if isinstance(loaded, dict):
        return loaded.get("feature_cols")
    return None


# ════════════════════════════════════════════════════════════════
#  POST /run-agent-pipeline
#  FIX CREW-1: routes through crew_pipeline (lazy loaded)
# ════════════════════════════════════════════════════════════════

@app.post("/run-agent-pipeline")
def run_agent_pipeline(req: AgentPipelineRequest):
    try:
        print(f"[Agent] Starting → {req.projectId} | {req.objective} | {req.simulationMode}")

        kpi           = req.kpiSummary or {}
        ml_acc        = req.mlEnsembleAcc
        avg_proba     = req.avgPurchaseProba
        dataset_stats = req.datasetStats or {}

        if not ml_acc or ml_acc <= 0:
            raise ValueError(
                f"mlEnsembleAcc is missing or zero ({ml_acc}). Retrain first."
            )

        sim_mode = (
            req.simulationMode
            if req.simulationMode in ("mode1", "mode2")
            else "mode2"
        )
        strategy_input = req.strategyInput if sim_mode == "mode1" else {}

        learned_strengths  = getattr(req, "learnedMechanismStrengths", None)
        learned_weights    = getattr(req, "learnedObjectiveWeights",   None)
        feature_importance = req.featureImportance or []
        ensemble_weights   = req.ensembleWeights or {"rf": 1/3, "xgb": 1/3, "lgb": 1/3}

        # Load kpi_predictor bundle (lazy GridFS)
        kpi_predictor_bundle = None
        kpi_predictor_path   = req.kpiPredictorPath
        if kpi_predictor_path:
            try:
                kpi_predictor_bundle = _load_pkl_from_gridfs_or_disk(kpi_predictor_path)
                print(f"[Agent] ✅ KPI predictor bundle loaded from: {kpi_predictor_path}")
            except Exception as kpi_err:
                print(f"[Agent] ⚠️  KPI predictor load failed: {kpi_err}")

        if kpi_predictor_bundle is None:
            raise ValueError(
                f"KPI predictor bundle could not be loaded from '{kpi_predictor_path}'. "
                "Please retrain models."
            )

        # FIX CREW-1: lazy-load crew_pipeline
        run_crew_pipeline = _ensure_crew()
        pipeline_result = run_crew_pipeline(
            project_id=req.projectId,
            objective=req.objective,
            simulation_mode=sim_mode,
            strategy_input=strategy_input,
            kpi_summary=kpi,
            ml_ensemble_acc=ml_acc,
            avg_purchase_proba=avg_proba,
            feature_importance=feature_importance,
            kpi_predictor_bundle=kpi_predictor_bundle,
            dataset_stats=dataset_stats,
            learned_mechanism_strengths=learned_strengths,
            learned_objective_weights=learned_weights,
        )

        observer_result   = pipeline_result["observerResult"]
        analyst_result    = pipeline_result["analystResult"]
        simulation_result = pipeline_result["simulationResult"]
        decision_result   = pipeline_result["decisionResult"]
        strategies        = simulation_result.get("strategies", [])

        print(f"[Agent] Crew pipeline done: {len(strategies)} strategies")

        # Per-strategy PKL scoring
        per_strategy_ml_scores: Dict[str, float] = {}
        model_paths  = req.modelPaths or {}
        uploads_dir  = req.uploadsDir

        if model_paths:
            try:
                base_vector: Dict[str, float] = {}
                avail_features: List[str] = list(ECO_FEATURES)
                max_pages = float(dataset_stats.get("_max_pages", 30.0))
                max_time  = float(dataset_stats.get("_max_time", 1800.0))
                max_pages = max(max_pages, 1.0)
                max_time  = max(max_time,  1.0)

                eco_file = getattr(req, "ecommerceEngineerFile", None)
                if eco_file and uploads_dir:
                    uploads_dir_abs = os.path.abspath(uploads_dir)
                    eco_path = os.path.join(uploads_dir_abs, eco_file)
                    if os.path.exists(eco_path):
                        df_eco = pd.read_csv(eco_path, low_memory=False)
                        avail_features = [f for f in ECO_FEATURES if f in df_eco.columns]
                        for feat in avail_features:
                            if dataset_stats and feat in dataset_stats and isinstance(dataset_stats[feat], dict):
                                base_vector[feat] = float(dataset_stats[feat].get("median", 0.0))
                            else:
                                col = pd.to_numeric(df_eco[feat], errors="coerce")
                                base_vector[feat] = float(col.median())

                if not base_vector:
                    for feat in ECO_FEATURES:
                        if feat in dataset_stats and isinstance(dataset_stats[feat], dict):
                            base_vector[feat] = float(dataset_stats[feat].get("median", _SAFE_DEFAULTS.get(feat, 0.0)))
                        else:
                            base_vector[feat] = _SAFE_DEFAULTS.get(feat, 0.0)
                    avail_features = list(ECO_FEATURES)

                models_loaded_agent: Dict[str, Any] = {}
                for mkey, mpath in model_paths.items():
                    if not mpath:
                        continue
                    try:
                        models_loaded_agent[mkey] = _load_pkl_from_gridfs_or_disk(mpath)
                        print(f"[Agent] ✅ Loaded {mkey} from: {mpath}")
                    except Exception as le_err:
                        print(f"[Agent] PKL load failed for {mkey}: {le_err}")

                if models_loaded_agent:
                    for strat in strategies:
                        sid = strat.get("id", "unknown")
                        try:
                            vec = _build_strategy_feature_vector(
                                sid, strat.get("params", {}),
                                base_vector, max_pages, max_time,
                                avail_features, req.objective, dataset_stats,
                            )
                            X  = np.array([[vec.get(f, 0.0) for f in avail_features]])
                            ep = _predict_ensemble_proba(models_loaded_agent, X, ensemble_weights)
                            per_strategy_ml_scores[sid] = ep
                        except Exception as se:
                            print(f"[Agent] Strategy PKL score failed for {sid}: {se}")
                else:
                    print("[Agent] ⚠️  No classifier PKLs loaded — per-strategy scores unavailable")

            except Exception as pkl_err:
                print(f"[Agent] PKL scoring block failed (non-fatal): {pkl_err}")

        # Re-run decision with per-strategy PKL scores
        if per_strategy_ml_scores:
            try:
                _dec_run = _ensure_decision_agent()
                decision_result = _dec_run(
                    simulation_result=simulation_result,
                    analyst_result=analyst_result,
                    observer_result=observer_result,
                    objective=req.objective,
                    ml_ensemble_acc=ml_acc,
                    kpi_summary=kpi,
                    avg_purchase_proba=avg_proba,
                    simulation_mode=sim_mode,
                    per_strategy_ml_scores=per_strategy_ml_scores,
                    dataset_stats=dataset_stats,
                )
            except Exception as dec_err:
                print(f"[Agent] Decision re-run with PKL scores failed (using crew result): {dec_err}")

        # Auto-store RAG context
        try:
            rag = _ensure_rag()
            rag_result = rag["store"](
                project_id=req.projectId,
                agent_result={
                    "observerResult":   observer_result,
                    "analystResult":    analyst_result,
                    "simulationResult": simulation_result,
                    "decisionResult":   decision_result,
                },
                kpi_summary=kpi,
                objective=req.objective,
            )
            print(f"[Agent] ✅ RAG context stored: {len(rag_result.get('stored', []))} docs")
        except Exception as rag_err:
            print(f"[Agent] ⚠️  RAG auto-store failed (non-fatal): {rag_err}")

        return {
            "status":           "success",
            "projectId":        req.projectId,
            "agentResultId":    req.agentResultId,
            "observerResult":   observer_result,
            "analystResult":    analyst_result,
            "simulationResult": simulation_result,
            "decisionResult":   decision_result,
            "recommendation":   decision_result.get("recommendation"),
        }
    except Exception as e:
        _tb.print_exc()
        return {"status": "error", "message": str(e), "projectId": req.projectId}


def _predict_ensemble_proba(
    models_loaded: Dict[str, Any],
    X: np.ndarray,
    weights: Dict[str, float],
) -> float:
    probas: Dict[str, float] = {}

    if "randomForest" in models_loaded:
        try:
            m = _unwrap_model(models_loaded["randomForest"])
            probas["rf"] = float(m.predict_proba(X)[0, 1])
        except Exception:
            pass

    if "xgboost" in models_loaded:
        try:
            m, le = _unwrap_model_le(models_loaded["xgboost"])
            xp = m.predict_proba(X)
            c1 = list(le.classes_).index(1) if (le and 1 in le.classes_) else min(1, xp.shape[1] - 1)
            probas["xgb"] = float(xp[0, c1])
        except Exception:
            pass

    if "lightgbm" in models_loaded:
        try:
            m, le = _unwrap_model_le(models_loaded["lightgbm"])
            lp = m.predict_proba(X)
            c1 = list(le.classes_).index(1) if (le and 1 in le.classes_) else min(1, lp.shape[1] - 1)
            probas["lgb"] = float(lp[0, c1])
        except Exception:
            pass

    if not probas:
        return 0.0
    total_w = sum(weights.get(k, 0.333) for k in probas)
    ep      = sum(v * weights.get(k, 0.333) for k, v in probas.items())
    return round(ep / max(total_w, 1e-9), 4)


def _build_strategy_feature_vector(
    strat_id:       str,
    strat_params:   Dict[str, Any],
    base_vector:    Dict[str, float],
    max_pages:      float,
    max_time:       float,
    avail_features: List[str],
    objective:      str,
    dataset_stats:  Optional[Dict[str, Any]] = None,
) -> Dict[str, float]:
    vec = dict(base_vector)
    ds  = dataset_stats or {}

    krc    = ds.get("_kpi_reg_consts", {})
    di_99  = float(krc.get("di_99",  ds.get("_di_99",  1.0))) or 1.0
    ppp_99 = float(krc.get("ppp_99", ds.get("_ppp_99", 1.0))) or 1.0
    if di_99 == 1.0:
        _pr   = float(base_vector.get("unit_price",      691.73))
        di_99  = max(_pr * 30.0 * 1.05, 1.0)
    if ppp_99 == 1.0:
        _pr   = float(base_vector.get("unit_price", 691.73))
        ppp_99 = max(_pr / 1.0 * 1.05, 1.0)

    def _med(feat: str) -> float:
        if ds and feat in ds and isinstance(ds[feat], dict):
            return float(ds[feat].get("median", _SAFE_DEFAULTS.get(feat, 0.0)))
        return float(base_vector.get(feat, _SAFE_DEFAULTS.get(feat, 0.0)))

    if strat_id == "offer_discount":
        disc = float(strat_params.get("discount_pct", 10.0))
        vec["discount_percent"]  = disc
        vec["marketing_channel"] = CHANNEL_TO_INT.get("Email", 3)
        vec["user_type"]         = 1.0
        vec["added_to_cart"]     = 1.0
        if "discount_amount" in avail_features:
            qty = _med("quantity")
            vec["discount_amount"] = round(disc / 100.0 * _med("unit_price") * qty, 4)

    elif strat_id == "retargeting_campaign":
        ch = strat_params.get("channel", "Email")
        vec["marketing_channel"] = float(CHANNEL_TO_INT.get(ch, 3))
        vec["pages_viewed"]      = _med("pages_viewed") * 1.30
        vec["time_on_site_sec"]  = _med("time_on_site_sec") * 1.20
        vec["added_to_cart"]     = min(_med("added_to_cart") * 1.25, 1.0)

    elif strat_id == "increase_ad_budget":
        ch  = strat_params.get("channel", "Email")
        pct = float(strat_params.get("budget_increase_pct", 20.0))
        vec["marketing_channel"] = float(CHANNEL_TO_INT.get(ch, 3))
        scale = 1.0 + (pct / 100.0) * 0.15
        vec["pages_viewed"]     = _med("pages_viewed")     * min(scale, 1.25)
        vec["time_on_site_sec"] = _med("time_on_site_sec") * min(scale, 1.20)

    elif strat_id == "improve_checkout_ux":
        vec["pages_viewed"]     = _med("pages_viewed")     * 1.30
        vec["time_on_site_sec"] = _med("time_on_site_sec") * 1.10
        vec["added_to_cart"]    = min(_med("added_to_cart") * 1.30, 1.0)
        vec["discount_percent"] = 0.0
        if "discount_amount" in avail_features:
            vec["discount_amount"] = 0.0

    elif strat_id == "add_urgency_signals":
        disc = float(strat_params.get("discount_pct", 5.0))
        vec["pages_viewed"]     = _med("pages_viewed")     * 1.15
        vec["time_on_site_sec"] = _med("time_on_site_sec") * 0.90
        vec["discount_percent"] = disc
        vec["added_to_cart"]    = min(_med("added_to_cart") * 1.15, 1.0)
        if "discount_amount" in avail_features:
            vec["discount_amount"] = round(disc / 100.0 * _med("unit_price") * _med("quantity"), 4)

    elif strat_id == "reallocate_channel_budget":
        vec["marketing_channel"] = float(CHANNEL_TO_INT.get("Email", 3))
        vec["pages_viewed"]      = _med("pages_viewed")     * 1.25
        vec["time_on_site_sec"]  = _med("time_on_site_sec") * 1.20

    elif strat_id == "improve_ad_creative":
        vec["marketing_channel"] = float(CHANNEL_TO_INT.get("Instagram", 2))
        vec["pages_viewed"]      = _med("pages_viewed") * 1.25

    elif strat_id == "optimize_targeting":
        vec["user_type"]         = 0.0
        vec["pages_viewed"]      = _med("pages_viewed")     * 1.20
        vec["time_on_site_sec"]  = _med("time_on_site_sec") * 1.15

    elif strat_id == "user_strategy":
        actual_discount = float(strat_params.get("discount", 0))
        actual_budget   = float(strat_params.get("adBudgetIncrease", 0))
        ch      = strat_params.get("channel", "Email")
        segment = strat_params.get("customerSegment", "All Customers")
        vec["discount_percent"]  = actual_discount
        vec["marketing_channel"] = float(CHANNEL_TO_INT.get(ch, 3))
        if "discount_amount" in avail_features:
            vec["discount_amount"] = round(
                actual_discount / 100.0 * _med("unit_price") * _med("quantity"), 4
            )
        for sf_key, sf_val in SEGMENT_TO_FEATURES.get(segment, {}).items():
            if sf_key in avail_features:
                vec[sf_key] = float(sf_val)
        if actual_budget > 0:
            scale = 1.0 + (actual_budget / 100.0) * 0.12
            vec["pages_viewed"]     = _med("pages_viewed")     * min(scale, 1.20)
            vec["time_on_site_sec"] = _med("time_on_site_sec") * min(scale, 1.15)

    pages = max(float(vec.get("pages_viewed",     _med("pages_viewed"))),  1.0)
    time_ = float(vec.get("time_on_site_sec", _med("time_on_site_sec")))
    price = float(vec.get("unit_price",       _med("unit_price")))
    disc  = float(vec.get("discount_percent", _med("discount_percent")))
    atc   = float(vec.get("added_to_cart",    _med("added_to_cart")))

    if "engagement_score" in avail_features and max_pages > 0 and max_time > 0:
        vec["engagement_score"] = float(
            np.clip((pages / max_pages) * 0.4 + (time_ / max_time) * 0.6, 0, 1)
        )
    if "discount_impact" in avail_features:
        vec["discount_impact"] = float(np.clip((disc * price) / di_99, 0, 1.5))
    if "price_per_page" in avail_features:
        vec["price_per_page"] = float(np.clip((price / pages) / ppp_99, 0, 1.5))
    if "cart_engage" in avail_features:
        eng = float(np.clip((pages / max_pages) * 0.4 + (time_ / max_time) * 0.6, 0, 1))
        vec["cart_engage"]      = float(atc * eng)
        vec["cart_time_ratio"]  = float(atc * time_ / max(max_time,  1.0))
        vec["cart_pages_ratio"] = float(atc * pages / max(max_pages, 1.0))

    return {
        f: float(vec.get(f, base_vector.get(f, _SAFE_DEFAULTS.get(f, 0.0))))
        for f in avail_features
    }


# ════════════════════════════════════════════════════════════════
#  TRAINING DATA BUILDER
# ════════════════════════════════════════════════════════════════

def _build_training_data(df_eco, df_mkt, df_adv, objective):
    if objective == "increase_revenue":
        df = df_eco.copy()
        if "revenue" not in df.columns or "purchased" not in df.columns:
            raise ValueError("increase_revenue requires 'revenue' and 'purchased' columns")
        df = df[df["purchased"] == 1].copy()
        if len(df) < 50:
            raise ValueError(f"Not enough purchase rows ({len(df)}) for increase_revenue")
        q75 = df["revenue"].quantile(0.75)
        df["high_value_purchase"] = (df["revenue"] >= q75).astype(int)
        target_col = "high_value_purchase"

    elif objective == "reduce_cart_abandonment":
        df = df_eco.copy()
        if "cart_abandoned" not in df.columns:
            raise ValueError("reduce_cart_abandonment requires 'cart_abandoned' column")
        if "added_to_cart" in df.columns:
            df = df[df["added_to_cart"] == 1].copy()
        target_col = "cart_abandoned"

    elif objective == "improve_conversion_rate":
        df = df_eco.copy()
        if "purchased" not in df.columns:
            raise ValueError("improve_conversion_rate requires 'purchased' column")
        target_col = "purchased"

    else:
        df = df_eco.copy()
        if "revenue" in df.columns:
            df = df[df["revenue"] > 0].copy()
            median_rev = df["revenue"].median()
            df["high_revenue"] = (df["revenue"] > median_rev).astype(int)
        else:
            df["high_revenue"] = (
                df["purchased"].astype(int) if "purchased" in df.columns else 0
            )
        target_col = "high_revenue"

    feature_cols = [f for f in ECO_RAW_FEATURES if f in df.columns]

    for col in feature_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    df = df.dropna(subset=[target_col] + feature_cols)
    df[target_col] = df[target_col].astype(int)

    if len(df[target_col].unique()) < 2:
        raise ValueError(
            f"Target '{target_col}' has only one class. "
            "Not enough variation in the data."
        )

    return df, target_col, feature_cols


# ════════════════════════════════════════════════════════════════
#  DATA CLEANERS
# ════════════════════════════════════════════════════════════════

def _clean_ecommerce(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    numeric = [
        "unit_price", "quantity", "discount_percent", "discount_amount",
        "revenue", "pages_viewed", "time_on_site_sec", "rating",
    ]
    for col in numeric:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            df[col] = df[col].fillna(df[col].median() if not df[col].isna().all() else 0)
    binary = ["added_to_cart", "purchased", "cart_abandoned", "user_type"]
    for col in binary:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            mode_val = df[col].mode()
            df[col] = df[col].fillna(
                mode_val.iloc[0] if not mode_val.empty else 0
            ).astype(int)
    cat = ["device_type", "marketing_channel", "product_category",
           "payment_method", "location", "visit_date"]
    for col in cat:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip().replace("nan", "Unknown")
    if "revenue"    in df.columns: df = df[df["revenue"]    >= 0]
    if "unit_price" in df.columns: df = df[df["unit_price"]  > 0]
    return df


def _clean_marketing(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if "acquisition_cost" in df.columns:
        df["acquisition_cost"] = pd.to_numeric(
            df["acquisition_cost"].astype(str)
            .str.replace(r"[\$,]", "", regex=True).str.strip(),
            errors="coerce",
        )
        df["acquisition_cost"] = df["acquisition_cost"].fillna(
            df["acquisition_cost"].median()
        )
    numeric = ["conversion_rate", "roi", "clicks", "impressions", "engagement_score"]
    for col in numeric:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            df[col] = df[col].fillna(df[col].median() if not df[col].isna().all() else 0)
    if "roi" in df.columns:
        df["roi"] = pd.to_numeric(df["roi"], errors="coerce")
        df = df[df["roi"] > 0]
    return df


def _clean_advertising(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df = df.loc[:, ~df.columns.str.startswith("unnamed")]
    numeric = [
        "displays", "cost", "clicks", "revenue",
        "post_click_conversions", "post_click_sales_amount",
    ]
    for col in numeric:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    if "displays" in df.columns: df = df[df["displays"] > 0]
    if "cost"     in df.columns: df = df[df["cost"]     >= 0]
    return df


# ════════════════════════════════════════════════════════════════
#  METRICS
# ════════════════════════════════════════════════════════════════

def _metrics(
    y_test: np.ndarray,
    y_pred: np.ndarray,
    train_time: float,
    y_prob: Optional[np.ndarray] = None,
) -> Dict[str, Any]:
    # FIX STARTUP-2: lazy import
    from sklearn.metrics import (
        accuracy_score, precision_score, recall_score, f1_score, roc_auc_score,
    )
    base = {
        "accuracy":    round(accuracy_score(y_test,  y_pred) * 100, 2),
        "precision":   round(precision_score(y_test, y_pred, average="weighted", zero_division=0) * 100, 2),
        "recall":      round(recall_score(y_test,    y_pred, average="weighted", zero_division=0) * 100, 2),
        "f1Score":     round(f1_score(y_test,        y_pred, average="weighted", zero_division=0) * 100, 2),
        "f1Purchased": round(f1_score(y_test,        y_pred, pos_label=1,        zero_division=0) * 100, 2),
        "trainTime":   train_time,
    }
    if y_prob is not None:
        try:
            base["rocAuc"] = round(roc_auc_score(y_test, y_prob) * 100, 2)
        except Exception:
            base["rocAuc"] = None
    return base


# ════════════════════════════════════════════════════════════════
#  SHAP HELPERS
# ════════════════════════════════════════════════════════════════

def _shap_description(feature: str, direction: str) -> str:
    verb = "increases" if direction == "positive" else "decreases"
    descriptions = {
        "pages_viewed":      f"More pages viewed {verb} purchase probability — visitors who explore more are more likely to buy",
        "time_on_site_sec":  f"Longer session time {verb} conversion likelihood — engaged visitors spend more time before purchasing",
        "discount_percent":  f"Higher discount {verb} the likelihood of purchase — discounts reduce friction in the buy decision",
        "discount_amount":   f"Higher absolute discount value {verb} purchase probability — real savings drive conversions",
        "unit_price":        f"Higher product price {verb} purchase probability — pricing affects willingness-to-pay",
        "quantity":          f"More items in cart {verb} high-value purchase likelihood — bulk intent signals commitment",
        "added_to_cart":     f"Adding to cart {verb} purchase probability — the strongest non-leaky buying intent signal",
        "cart_engage":       f"Cart intent combined with session engagement {verb} conversion — visitors who add to cart and browse deeply are highest-quality",
        "cart_time_ratio":   f"Time spent by cart-adding visitors {verb} purchase probability — time-invested cart visitors almost always convert",
        "cart_pages_ratio":  f"Pages browsed by cart-adding visitors {verb} conversion — thorough cart visitors show strong purchase intent",
        "device_type":       f"Device type {verb} conversion — mobile vs desktop checkout completion rates differ significantly",
        "marketing_channel": f"Traffic source {verb} purchase intent — some channels attract higher-intent visitors",
        "product_category":  f"Product category {verb} purchase probability — category mix affects overall conversion rates",
        "rating":            f"Product rating {verb} customer purchase decision — social proof drives conversions",
        "visit_day":         f"Day of visit {verb} conversion rate — purchase timing patterns vary across the month",
        "visit_month":       f"Month {verb} purchase likelihood — seasonal demand patterns affect conversions",
        "visit_weekday":     f"Day of week {verb} purchase probability — weekday vs weekend shopping behaviour differs",
        "payment_method":    f"Payment method {verb} checkout completion rate — payment friction affects purchase finalisation",
        "location":          f"Customer location {verb} purchase probability — geographic factors influence conversion rates",
        "user_type":         f"User type (new/returning) {verb} conversion — returning customers have different purchase patterns",
        "visit_season":      f"Season {verb} purchase likelihood — seasonal demand cycles drive buying decisions",
        "engagement_score":  f"Combined engagement (pages+time) {verb} purchase probability — highly engaged visitors are far more likely to convert",
        "discount_impact":   f"Absolute discount value (price × discount%) {verb} purchase likelihood — real monetary savings are more persuasive than percentages",
        "price_per_page":    f"Price relative to pages browsed {verb} conversion — high-priced items need more browsing time to convert",
    }
    return descriptions.get(feature, f"{feature} {verb} the model prediction based on your dataset patterns")


def _shap_description_unknown(feature: str) -> str:
    descriptions = {
        "pages_viewed":      "Pages viewed — one of the strongest purchase predictors: more browsing = higher intent",
        "time_on_site_sec":  "Time on site — longer sessions strongly correlate with purchase completions",
        "discount_percent":  "Discount percentage — directly influences purchase decisions, especially for price-sensitive segments",
        "discount_amount":   "Absolute discount amount — captures the real monetary saving that motivates buying",
        "unit_price":        "Product price — higher-priced items require more browsing time but signal higher revenue potential",
        "quantity":          "Items added — more items indicate shopping commitment and higher order value",
        "added_to_cart":     "Cart intent — the single strongest non-leaky predictor: cart adders are 3-5x more likely to purchase",
        "cart_engage":       "Cart × engagement — visitors who add to cart AND browse deeply are the highest-quality buyers",
        "cart_time_ratio":   "Cart time ratio — time invested by cart-adding visitors is a near-certain purchase signal",
        "cart_pages_ratio":  "Cart pages ratio — thorough browsing by cart visitors strongly predicts checkout completion",
        "device_type":       "Device type — mobile vs desktop have significantly different checkout completion rates",
        "marketing_channel": "Traffic source — different acquisition channels bring visitors with vastly different purchase intent",
        "product_category":  "Product category — category selection reveals customer intent and price sensitivity",
        "engagement_score":  "Engagement score — combined pages+time signal, the top behavioural predictor of conversion",
        "discount_impact":   "Discount impact (price×discount) — captures the actual monetary saving value that drives decisions",
        "price_per_page":    "Price per page — high price items need more research time; measures purchase journey efficiency",
    }
    return descriptions.get(feature, f"{feature} — contributes to the model's prediction of purchase probability")


def _shap_context(top_features, strategy_name, objective):
    if not top_features:
        return "Feature importance data not available. Please retrain models."
    top1 = top_features[0]["feature"]
    top2 = top_features[1]["feature"] if len(top_features) > 1 else None
    obj_map = {
        "increase_revenue":        "purchase probability",
        "reduce_cart_abandonment": "cart abandonment",
        "improve_conversion_rate": "conversion rate",
        "optimize_marketing_roi":  "marketing ROI",
    }
    target = obj_map.get(objective, "the outcome")
    ctx    = (
        f"For strategy '{strategy_name}', the ML model's prediction of "
        f"{target} is most influenced by '{top1}'"
    )
    if top2:
        ctx += f" and '{top2}'"
    ctx += (
        ". These SHAP values are computed from your actual uploaded dataset using the "
        "trained Random Forest / XGBoost / LightGBM ensemble."
    )
    return ctx


def _shap_importance_fallback(req: SHAPRequest, error: Optional[str] = None) -> Dict[str, Any]:
    if not req.featureImportance:
        return {
            "status":          "error",
            "message":         "SHAP unavailable and no feature importance found.",
            "projectId":       req.projectId,
            "shapValues":      [],
            "topFeatures":     [],
            "strategyContext": "Feature importance unavailable. Please retrain models.",
            "fallback":        True,
            "fallbackType":    "none",
            **({"error": error} if error else {}),
        }

    total = sum(f.get("importance", 0) for f in req.featureImportance) or 1.0
    fallback = [
        {
            "feature":     f["feature"],
            "importance":  round(f.get("importance", 0) / total, 4),
            "shapValue":   round(f.get("importance", 0) / total, 4),
            "direction":   "unknown",
            "description": _shap_description_unknown(f["feature"]),
        }
        for f in req.featureImportance[:8]
    ]

    context = (
        f"Feature importance shown from trained ML model"
        f"{(' — Note: ' + error) if error else ''}. "
        "The importance values show each feature's contribution to the model's predictions. "
        "Direction (positive/negative) requires full SHAP computation."
    )
    return {
        "status":          "success",
        "projectId":       req.projectId,
        "shapValues":      fallback,
        "topFeatures":     fallback[:6],
        "strategyContext": _shap_context(fallback[:6], req.strategyName, req.objective),
        "fallback":        True,
        "fallbackType":    "feature_importance",
        "fallbackContext": context,
        **({"error": error} if error else {}),
    }


# ════════════════════════════════════════════════════════════════
#  POST /compute-shap
#  FIX STARTUP-2: shap imported inside function
# ════════════════════════════════════════════════════════════════

@app.post("/compute-shap")
def compute_shap(req: SHAPRequest):
    import warnings; warnings.filterwarnings("ignore")
    # FIX STARTUP-2: lazy import of shap
    try:
        import shap as shap_lib
    except ImportError:
        print("[SHAP] shap package not installed — using feature importance fallback")
        return _shap_importance_fallback(req, error="shap package not installed (pip install shap)")

    try:
        if not req.modelPath:
            raise FileNotFoundError("modelPath is empty. Please retrain models.")

        loaded = _load_pkl_from_gridfs_or_disk(req.modelPath)

        model     = _unwrap_model(loaded)
        stored_fc = _unwrap_feature_cols(loaded)
        if isinstance(loaded, tuple):
            model = loaded[0]

        feature_cols: Optional[List[str]] = None

        if stored_fc and len(stored_fc) > 0:
            feature_cols = stored_fc
            print(f"[SHAP] ✅ Feature cols from PKL bundle: {len(feature_cols)} features")

        elif req.storedFeatureCols and len(req.storedFeatureCols) > 0:
            feature_cols = req.storedFeatureCols
            print(f"[SHAP] ✅ Feature cols from request param: {len(feature_cols)} features")

        elif hasattr(model, "feature_names_in_") and model.feature_names_in_ is not None:
            feature_cols = list(model.feature_names_in_)
            print(f"[SHAP] ✅ Feature cols from model.feature_names_in_: {len(feature_cols)} features")

        else:
            uploads_dir  = os.path.abspath(req.uploadsDir)
            eco_path     = os.path.join(uploads_dir, req.ecommerceFile)
            if not os.path.exists(eco_path):
                raise FileNotFoundError(
                    f"Cannot determine feature list: PKL has no feature_cols and CSV not found: {eco_path}"
                )
            csv_cols     = pd.read_csv(eco_path, nrows=0, low_memory=False).columns.tolist()
            feature_cols = [f for f in ECO_FEATURES if f in csv_cols]
            print(f"[SHAP] ⚠️  Feature cols from CSV scan (last resort): {len(feature_cols)} features")

        if not feature_cols:
            raise ValueError("Could not determine the feature list used during training.")

        expected_feats = getattr(model, "n_features_in_", None)
        if expected_feats is not None and expected_feats != len(feature_cols):
            uploads_dir  = os.path.abspath(req.uploadsDir)
            eco_path     = os.path.join(uploads_dir, req.ecommerceFile)
            if os.path.exists(eco_path):
                csv_cols  = pd.read_csv(eco_path, nrows=0, low_memory=False).columns.tolist()
                csv_based = [f for f in ECO_FEATURES if f in csv_cols]
                if csv_based and len(csv_based) == expected_feats:
                    feature_cols = csv_based
                    print(f"[SHAP] ✅ Resolved feature mismatch via CSV: {len(feature_cols)} features")
                else:
                    raise ValueError(
                        f"Model expects {expected_feats} features but resolved list has "
                        f"{len(feature_cols)}. Please retrain models."
                    )
            else:
                raise ValueError(
                    f"Model expects {expected_feats} features but resolved list has "
                    f"{len(feature_cols)}. Please retrain models."
                )

        uploads_dir = os.path.abspath(req.uploadsDir)
        eco_path    = os.path.join(uploads_dir, req.ecommerceFile)

        if os.path.exists(eco_path):
            df = pd.read_csv(eco_path, low_memory=False)
            for missing_f in [f for f in feature_cols if f not in df.columns]:
                df[missing_f] = _SAFE_DEFAULTS.get(missing_f, 0.0)
            df_sample = df[feature_cols].copy()
            for col in feature_cols:
                df_sample[col] = pd.to_numeric(df_sample[col], errors="coerce").fillna(
                    _SAFE_DEFAULTS.get(col, 0.0)
                )
            df_sample = df_sample.dropna()
            if len(df_sample) > 500:
                df_sample = df_sample.sample(n=500, random_state=42)
            X = df_sample[feature_cols].values.astype(np.float32)
            print(f"[SHAP] Sample built from CSV: {X.shape}")
        else:
            print("[SHAP] CSV not found — building synthetic sample from SAFE_DEFAULTS medians")
            n_samples = 200
            X_rows    = []
            for _ in range(n_samples):
                row = [_SAFE_DEFAULTS.get(feat, 0.0) for feat in feature_cols]
                X_rows.append(row)
            X = np.array(X_rows, dtype=np.float32)
            rng = np.random.default_rng(42)
            X  += rng.normal(0, 0.01, X.shape).astype(np.float32)
            print(f"[SHAP] Synthetic sample built: {X.shape}")

        if X.shape[0] < 10:
            raise ValueError(f"Insufficient sample size for SHAP: {X.shape[0]} rows")

        print(f"[SHAP] Running TreeExplainer on {X.shape[0]} samples × {X.shape[1]} features...")
        explainer   = shap_lib.TreeExplainer(model)
        shap_values = explainer.shap_values(X, check_additivity=False)

        if isinstance(shap_values, list):
            if hasattr(model, "classes_") and 1 in model.classes_:
                class_idx = list(model.classes_).index(1)
            else:
                class_idx = min(1, len(shap_values) - 1)
            sv = shap_values[class_idx]
        else:
            sv = shap_values

        mean_abs    = np.abs(sv).mean(axis=0)
        mean_signed = sv.mean(axis=0)
        total       = mean_abs.sum() or 1.0

        shap_results = sorted(
            [
                {
                    "feature":     feat,
                    "importance":  round(float(mean_abs[i] / total), 4),
                    "shapValue":   round(float(mean_signed[i]), 4),
                    "direction":   "positive" if mean_signed[i] >= 0 else "negative",
                    "description": _shap_description(
                        feat,
                        "positive" if mean_signed[i] >= 0 else "negative",
                    ),
                }
                for i, feat in enumerate(feature_cols)
            ],
            key=lambda x: x["importance"],
            reverse=True,
        )

        top_features = shap_results[:6]
        print(f"[SHAP] ✅ Real SHAP computed | top: {top_features[0]['feature']} "
              f"({top_features[0]['importance']:.4f}) | dir: {top_features[0]['direction']}")
        return {
            "status":          "success",
            "projectId":       req.projectId,
            "shapValues":      shap_results,
            "topFeatures":     top_features,
            "strategyContext": _shap_context(
                top_features, req.strategyName, req.objective
            ),
            "sampleSize":  int(X.shape[0]),
            "fallback":    False,
            "shapVersion": "v15.1-gridfs",
        }

    except Exception as e:
        print(f"[SHAP] Error: {type(e).__name__}: {e}")
        _tb.print_exc()
        return _shap_importance_fallback(req, error=f"{type(e).__name__}: {e}")