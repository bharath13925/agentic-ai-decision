"""
AgenticIQ — GridFS Storage Helper v4.0

ALWAYS stores .pkl model files AND RAG documents in MongoDB GridFS.
No dependency on local disk for any persistent data.

Storage layout:
  LOCAL:      CSVs → ./uploads (disk, temp only)    | PKLs → MongoDB GridFS ✅
  PRODUCTION: CSVs → /mnt/data/uploads (disk, temp)  | PKLs → MongoDB GridFS ✅
              RAG docs (JSON) → MongoDB GridFS ✅

GridFS key naming convention:
  {projectId}/models/random_forest.pkl
  {projectId}/models/xgboost.pkl
  {projectId}/models/lightgbm.pkl
  {projectId}/models/kpi_predictor.pkl
  {projectId}/rag/docs.json          ← NEW v4.0

CHANGES v4.0:
  - Added save_json() / load_json() for storing RAG document chunks in GridFS.
  - Added rag_docs_key() helper to standardise the GridFS key for RAG docs.
  - Added json_exists() to check whether RAG docs exist.
  - GridFS used unconditionally for both PKLs and JSON blobs.
  - Lazy connection with retry on first use (unchanged from v3.0).
"""

import os
import io
import json
import pickle
from pymongo import MongoClient
import gridfs

MONGO_URI = os.environ.get("MONGO_URI", "")
DB_NAME   = os.environ.get("MONGO_DB", "agentiq")

_client = None
_db     = None
_fs     = None


def _get_fs() -> gridfs.GridFS:
    global _client, _db, _fs
    if _fs is None:
        if not MONGO_URI:
            raise ValueError(
                "[GridFS] MONGO_URI is not set. "
                "Add MONGO_URI=mongodb+srv://... to your .env file."
            )
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
        _db     = _client[DB_NAME]
        _fs     = gridfs.GridFS(_db)
        print(f"[GridFS] ✅ Connected → database: {DB_NAME}")
    return _fs


# ════════════════════════════════════════════════════════════════
#  PICKLE HELPERS (ML models)
# ════════════════════════════════════════════════════════════════

def save_pickle(obj, filename: str, metadata: dict = None) -> str:
    """
    Serialize obj and store in GridFS.
    Replaces any existing file with the same filename.
    Returns the filename (used as the GridFS key stored in MongoDB).
    """
    fs = _get_fs()

    # Delete all old versions first (avoids orphaned chunks)
    for old in list(fs.find({"filename": filename})):
        fs.delete(old._id)

    buf = io.BytesIO()
    pickle.dump(obj, buf)
    data = buf.getvalue()

    file_id = fs.put(
        data,
        filename=filename,
        content_type="application/octet-stream",
        metadata=metadata or {},
    )
    print(f"[GridFS] ✅ Saved PKL: {filename} | id={file_id} | {round(len(data)/1024, 1)}KB")
    return filename


def load_pickle(filename: str):
    """Load and deserialize a pickle from GridFS. Raises FileNotFoundError if missing."""
    fs = _get_fs()
    if not fs.exists({"filename": filename}):
        raise FileNotFoundError(
            f"[GridFS] '{filename}' not found. Please retrain models."
        )
    grid_out = fs.get_last_version(filename)
    data = grid_out.read()
    print(f"[GridFS] ✅ Loaded PKL: {filename} | {round(len(data)/1024, 1)}KB")
    return pickle.loads(data)


def pkl_exists(filename: str) -> bool:
    """Check if a pkl exists in GridFS. Returns False on any error."""
    if not filename:
        return False
    try:
        return _get_fs().exists({"filename": filename})
    except Exception as e:
        print(f"[GridFS] ⚠️  exists check failed for '{filename}': {e}")
        return False


def delete_pkl(filename: str):
    """Delete all versions of a pkl from GridFS."""
    fs = _get_fs()
    count = 0
    for f in list(fs.find({"filename": filename})):
        fs.delete(f._id)
        count += 1
    print(f"[GridFS] Deleted PKL: {filename} ({count} version(s))")


def list_project_pkls(project_id: str) -> list:
    """List all pkl filenames for a project."""
    import re as _re
    safe_pid = _re.escape(project_id)
    fs = _get_fs()
    return [f.filename for f in fs.find({"filename": {"$regex": f"^{safe_pid}/models/"}})]


# ════════════════════════════════════════════════════════════════
#  JSON HELPERS (RAG documents)
#  NEW in v4.0 — stores RAG doc chunks as JSON blobs in GridFS.
#  This replaces disk-based FAISS .faiss / .pkl persistence.
#  FAISS is rebuilt in-memory at query time from these JSON docs.
# ════════════════════════════════════════════════════════════════

def save_json(obj, filename: str, metadata: dict = None) -> str:
    """
    Serialize obj as UTF-8 JSON and store in GridFS.
    Replaces any existing file with the same filename.
    Returns the filename (GridFS key).

    Use for RAG document chunks, config blobs, etc.
    obj must be JSON-serialisable (list / dict of primitives).
    """
    fs = _get_fs()

    # Delete old versions first
    for old in list(fs.find({"filename": filename})):
        fs.delete(old._id)

    data = json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8")

    file_id = fs.put(
        data,
        filename=filename,
        content_type="application/json",
        metadata=metadata or {},
    )
    print(f"[GridFS] ✅ Saved JSON: {filename} | id={file_id} | {round(len(data)/1024, 1)}KB")
    return filename


def load_json(filename: str):
    """
    Load and deserialise a JSON blob from GridFS.
    Raises FileNotFoundError if the key does not exist.
    Returns the original Python object (list / dict).
    """
    fs = _get_fs()
    if not fs.exists({"filename": filename}):
        raise FileNotFoundError(
            f"[GridFS] JSON '{filename}' not found."
        )
    grid_out = fs.get_last_version(filename)
    data     = grid_out.read()
    print(f"[GridFS] ✅ Loaded JSON: {filename} | {round(len(data)/1024, 1)}KB")
    return json.loads(data.decode("utf-8"))


def json_exists(filename: str) -> bool:
    """Check if a JSON blob exists in GridFS. Returns False on any error."""
    if not filename:
        return False
    try:
        return _get_fs().exists({"filename": filename})
    except Exception as e:
        print(f"[GridFS] ⚠️  json_exists check failed for '{filename}': {e}")
        return False


def delete_json(filename: str):
    """Delete all versions of a JSON blob from GridFS."""
    fs    = _get_fs()
    count = 0
    for f in list(fs.find({"filename": filename})):
        fs.delete(f._id)
        count += 1
    print(f"[GridFS] Deleted JSON: {filename} ({count} version(s))")


# ════════════════════════════════════════════════════════════════
#  KEY HELPERS
# ════════════════════════════════════════════════════════════════

def rf_key(pid: str)       -> str: return f"{pid}/models/random_forest.pkl"
def xgb_key(pid: str)      -> str: return f"{pid}/models/xgboost.pkl"
def lgb_key(pid: str)      -> str: return f"{pid}/models/lightgbm.pkl"
def kpi_key(pid: str)      -> str: return f"{pid}/models/kpi_predictor.pkl"

# NEW v4.0 — RAG document storage key
def rag_docs_key(pid: str) -> str: return f"{pid}/rag/docs.json"