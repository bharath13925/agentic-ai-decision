"""
AgenticIQ — Python Microservice
Handles: Data Cleaning + Feature Engineering

Location : agentic-ai-decision/python-microservice/app.py
Start cmd : uvicorn app:app --reload --port 8000

Endpoints:
  GET  /health
  POST /clean-datasets      ← called after upload
  POST /engineer-features   ← called after cleaning
"""

import os
import math
import pandas as pd
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="AgenticIQ Python Microservice", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    ecommerceFile:   str   # path relative to uploadsDir e.g. "cleaned/AI_XXX-ecommerce-cleaned.csv"
    marketingFile:   str
    advertisingFile: str


# ════════════════════════════════════════════════════════════════
#  HEALTH
# ════════════════════════════════════════════════════════════════

@app.get("/")
def root():
    return {"status": "OK", "service": "AgenticIQ Python Microservice v2"}


@app.get("/health")
def health():
    return {"status": "OK"}


# ════════════════════════════════════════════════════════════════
#  POST /clean-datasets
#  Step 1: Remove nulls, duplicates, invalid rows
# ════════════════════════════════════════════════════════════════

@app.post("/clean-datasets")
def clean_datasets(req: CleanRequest):
    try:
        uploads_dir = req.uploadsDir
        cleaned_dir = os.path.join(uploads_dir, "cleaned")
        os.makedirs(cleaned_dir, exist_ok=True)

        raw_paths = {
            "ecommerce":   os.path.join(uploads_dir, req.ecommerceFile),
            "marketing":   os.path.join(uploads_dir, req.marketingFile),
            "advertising": os.path.join(uploads_dir, req.advertisingFile),
        }

        cleaned_filenames = {}

        for key, raw_path in raw_paths.items():
            print(f"[Clean] {key}: {raw_path}")
            df = pd.read_csv(raw_path, on_bad_lines="skip", low_memory=False)
            before = len(df)

            df.columns = (
                df.columns.str.strip()
                .str.lower()
                .str.replace(" ", "_")
                .str.replace(r"[^\w]", "_", regex=True)
            )
            df.dropna(how="all",   inplace=True)
            df.drop_duplicates(    inplace=True)

            if key == "ecommerce":
                df = _clean_ecommerce(df)
            elif key == "marketing":
                df = _clean_marketing(df)
            elif key == "advertising":
                df = _clean_advertising(df)

            df.reset_index(drop=True, inplace=True)
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
        print(f"[Error] clean_datasets: {e}")
        return {"status": "error", "message": str(e), "projectId": req.projectId, "cleanedFiles": {}}


# ════════════════════════════════════════════════════════════════
#  POST /engineer-features
#  Step 2: Compute CTR, Conversion Rate, Cart Abandonment, ROI
#          Append as new columns to each dataset
#          Return KPI summary for MongoDB
# ════════════════════════════════════════════════════════════════

@app.post("/engineer-features")
def engineer_features(req: EngineerRequest):
    try:
        uploads_dir    = req.uploadsDir
        engineered_dir = os.path.join(uploads_dir, "engineered")
        os.makedirs(engineered_dir, exist_ok=True)

        # ── Load cleaned CSVs ──
        eco_path = os.path.join(uploads_dir, req.ecommerceFile)
        mkt_path = os.path.join(uploads_dir, req.marketingFile)
        adv_path = os.path.join(uploads_dir, req.advertisingFile)

        df_eco = pd.read_csv(eco_path, low_memory=False)
        df_mkt = pd.read_csv(mkt_path, low_memory=False)
        df_adv = pd.read_csv(adv_path, low_memory=False)

        print(f"[Engineer] Loaded: eco={len(df_eco)}, mkt={len(df_mkt)}, adv={len(df_adv)}")

        # ════════════════════════════════════════════
        #  FEATURE: CTR (Click-Through Rate)
        #  CTR = clicks / displays * 100
        #  Applied to: advertising dataset
        # ════════════════════════════════════════════
        if "clicks" in df_adv.columns and "displays" in df_adv.columns:
            df_adv["ctr"] = df_adv.apply(
                lambda r: round((r["clicks"] / r["displays"]) * 100, 4)
                if r["displays"] > 0 else 0.0,
                axis=1,
            )
            print(f"[Engineer] CTR computed. Avg = {df_adv['ctr'].mean():.4f}%")
        else:
            df_adv["ctr"] = 0.0

        # ════════════════════════════════════════════
        #  FEATURE: Conversion Rate
        #  Conv Rate = purchased / total_visits * 100
        #  Applied to: ecommerce dataset (per-row binary)
        #  Also add session-level column
        # ════════════════════════════════════════════
        if "purchased" in df_eco.columns:
            # Row-level: 1 if purchased else 0 (already binary)
            df_eco["conversion_flag"] = df_eco["purchased"].astype(int)

            # Rolling 1000-row window conversion rate as a feature
            df_eco["conversion_rate_pct"] = (
                df_eco["conversion_flag"]
                .rolling(window=1000, min_periods=1)
                .mean() * 100
            ).round(4)
            print(f"[Engineer] Conversion rate computed.")
        else:
            df_eco["conversion_flag"]    = 0
            df_eco["conversion_rate_pct"] = 0.0

        # ════════════════════════════════════════════
        #  FEATURE: Cart Abandonment Rate
        #  cart_abandon_rate = cart_abandoned / added_to_cart * 100
        #  Applied to: ecommerce dataset
        # ════════════════════════════════════════════
        if "cart_abandoned" in df_eco.columns and "added_to_cart" in df_eco.columns:
            df_eco["cart_abandon_flag"] = df_eco["cart_abandoned"].astype(int)

            # Rolling window cart abandonment rate
            added = df_eco["added_to_cart"].rolling(window=1000, min_periods=1).sum()
            abandoned = df_eco["cart_abandoned"].rolling(window=1000, min_periods=1).sum()
            df_eco["cart_abandonment_rate"] = (
                (abandoned / added.replace(0, np.nan)) * 100
            ).fillna(0).round(4)
            print(f"[Engineer] Cart abandonment rate computed.")
        else:
            df_eco["cart_abandon_flag"]      = 0
            df_eco["cart_abandonment_rate"]  = 0.0

        # ════════════════════════════════════════════
        #  FEATURE: ROI (Return on Investment)
        #  ROI = revenue / cost * 100
        #  Applied to: advertising dataset
        #  Marketing dataset already has ROI column — normalize it
        # ════════════════════════════════════════════
        if "revenue" in df_adv.columns and "cost" in df_adv.columns:
            df_adv["roi_computed"] = df_adv.apply(
                lambda r: round((r["revenue"] / r["cost"]) * 100, 4)
                if r["cost"] > 0 else 0.0,
                axis=1,
            )
            print(f"[Engineer] ROI computed. Avg = {df_adv['roi_computed'].mean():.4f}%")
        else:
            df_adv["roi_computed"] = 0.0

        # ════════════════════════════════════════════
        #  FEATURE: Revenue per Click
        #  rev_per_click = revenue / clicks
        #  Applied to: advertising dataset
        # ════════════════════════════════════════════
        if "revenue" in df_adv.columns and "clicks" in df_adv.columns:
            df_adv["revenue_per_click"] = df_adv.apply(
                lambda r: round(r["revenue"] / r["clicks"], 4)
                if r["clicks"] > 0 else 0.0,
                axis=1,
            )

        # ════════════════════════════════════════════
        #  FEATURE: Engagement Score Normalized (marketing)
        # ════════════════════════════════════════════
        if "engagement_score" in df_mkt.columns:
            max_eng = df_mkt["engagement_score"].max()
            if max_eng > 0:
                df_mkt["engagement_normalized"] = (
                    df_mkt["engagement_score"] / max_eng
                ).round(4)
            else:
                df_mkt["engagement_normalized"] = 0.0

        # ════════════════════════════════════════════
        #  SAVE ENGINEERED FILES
        # ════════════════════════════════════════════
        engineered_files = {}

        for key, df, fname_key in [
            ("ecommerce",   df_eco, "ecommerce"),
            ("marketing",   df_mkt, "marketing"),
            ("advertising", df_adv, "advertising"),
        ]:
            fname = f"{req.projectId}-{fname_key}-engineered.csv"
            out   = os.path.join(engineered_dir, fname)
            df.to_csv(out, index=False)
            engineered_files[key] = f"engineered/{fname}"
            print(f"[Engineer] Saved {key}: {fname}")

        # ════════════════════════════════════════════
        #  COMPUTE KPI SUMMARY for MongoDB
        # ════════════════════════════════════════════
        def safe(val):
            """Convert numpy types / NaN to plain Python float."""
            if val is None or (isinstance(val, float) and math.isnan(val)):
                return 0.0
            return round(float(val), 4)

        total_purchases  = int(df_eco["purchased"].sum())   if "purchased"      in df_eco.columns else 0
        total_visits     = len(df_eco)
        total_cart_added = int(df_eco["added_to_cart"].sum()) if "added_to_cart" in df_eco.columns else 0
        total_abandoned  = int(df_eco["cart_abandoned"].sum()) if "cart_abandoned" in df_eco.columns else 0

        kpi_summary = {
            "avgCTR":            safe(df_adv["ctr"].mean()            if "ctr"           in df_adv.columns else 0),
            "avgConversionRate": safe(
                (total_purchases / total_visits * 100) if total_visits > 0 else 0
            ),
            "avgCartAbandonment": safe(
                (total_abandoned / total_cart_added * 100) if total_cart_added > 0 else 0
            ),
            "avgROI":            safe(df_mkt["roi"].mean()            if "roi"           in df_mkt.columns else 0),
            "totalRevenue":      safe(df_eco["revenue"].sum()         if "revenue"       in df_eco.columns else 0),
            "totalClicks":       safe(df_adv["clicks"].sum()          if "clicks"        in df_adv.columns else 0),
            "totalImpressions":  safe(df_adv["displays"].sum()        if "displays"      in df_adv.columns else 0),
        }

        print(f"[Engineer] KPI Summary: {kpi_summary}")

        return {
            "status":          "success",
            "message":         "Feature engineering complete.",
            "projectId":       req.projectId,
            "engineeredFiles": engineered_files,
            "kpiSummary":      kpi_summary,
        }

    except Exception as e:
        print(f"[Error] engineer_features: {e}")
        return {
            "status":          "error",
            "message":         str(e),
            "projectId":       req.projectId,
            "engineeredFiles": {},
            "kpiSummary":      {},
        }


# ════════════════════════════════════════════════════════════════
#  DATASET-SPECIFIC CLEANERS (used by /clean-datasets)
# ════════════════════════════════════════════════════════════════

def _clean_ecommerce(df: pd.DataFrame) -> pd.DataFrame:
    numeric = [
        "unit_price", "quantity", "discount_percent", "discount_amount",
        "revenue", "pages_viewed", "time_on_site_sec", "rating",
    ]
    for col in numeric:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            df[col].fillna(df[col].median(), inplace=True)

    binary = ["added_to_cart", "purchased", "cart_abandoned", "user_type"]
    for col in binary:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            mode_val = df[col].mode()
            df[col].fillna(mode_val[0] if not mode_val.empty else 0, inplace=True)
            df[col] = df[col].astype(int)

    cat = ["device_type", "marketing_channel", "product_category",
           "payment_method", "location", "visit_date"]
    for col in cat:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip().replace("nan", "Unknown")

    if "revenue"    in df.columns: df = df[df["revenue"]    >= 0]
    if "unit_price" in df.columns: df = df[df["unit_price"]  > 0]
    return df


def _clean_marketing(df: pd.DataFrame) -> pd.DataFrame:
    if "acquisition_cost" in df.columns:
        df["acquisition_cost"] = (
            df["acquisition_cost"].astype(str)
            .str.replace(r"[\$,]", "", regex=True).str.strip()
        )
        df["acquisition_cost"] = pd.to_numeric(df["acquisition_cost"], errors="coerce")
        df["acquisition_cost"].fillna(df["acquisition_cost"].median(), inplace=True)

    numeric = ["conversion_rate", "roi", "clicks", "impressions", "engagement_score"]
    for col in numeric:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            df[col].fillna(df[col].median(), inplace=True)

    cat = ["company", "campaign_type", "target_audience", "duration",
           "channel_used", "location", "language", "customer_segment", "date"]
    for col in cat:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip().replace("nan", "Unknown")

    if "roi" in df.columns:
        df = df[df["roi"] > 0]
    return df


def _clean_advertising(df: pd.DataFrame) -> pd.DataFrame:
    df = df.loc[:, ~df.columns.str.startswith("unnamed")]

    numeric = ["displays", "cost", "clicks", "revenue",
               "post_click_conversions", "post_click_sales_amount"]
    for col in numeric:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            df[col].fillna(0, inplace=True)

    cat = ["month", "campaign_number", "user_engagement", "banner", "placement"]
    for col in cat:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip().replace("nan", "Unknown")

    if "displays" in df.columns: df = df[df["displays"] > 0]
    if "cost"     in df.columns: df = df[df["cost"]     >= 0]
    return df