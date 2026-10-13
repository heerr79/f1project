from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

CSV_NAME = "F1_Tyre_Degradation_Dataset_2023_2024.csv"


def root() -> Path:
    return Path(__file__).resolve().parents[3]


def csv_path() -> Path:
    return root() / "data" / CSV_NAME


@lru_cache(maxsize=1)
def load_raw() -> pd.DataFrame:
    path = csv_path()
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found at {path}")
    return pd.read_csv(path)


def dataset_loaded() -> bool:
    return csv_path().exists()


def summary() -> dict:
    if not dataset_loaded():
        return {"loaded": False, "message": "Upload or place CSV in data/ folder"}
    df = load_raw()
    miss = df.isnull().sum()
    return {
        "loaded": True,
        "shape": {"rows": int(len(df)), "columns": int(len(df.columns))},
        "seasons": sorted(df["year"].unique().tolist()) if "year" in df.columns else [],
        "races": int(df["race"].nunique()) if "race" in df.columns else None,
        "circuits": int(df["circuit"].nunique()) if "circuit" in df.columns else None,
        "drivers": int(df["driver"].nunique()) if "driver" in df.columns else None,
        "teams": int(df["team_name"].nunique()) if "team_name" in df.columns else None,
        "compounds": df["compound"].value_counts().to_dict() if "compound" in df.columns else {},
        "missing_total": int(miss.sum()),
        "duplicate_rows": int(df.duplicated().sum()),
        "lap_time_mean": float(df["lap_time_sec"].mean()) if "lap_time_sec" in df.columns else None,
    }


def columns_info() -> list[dict]:
    df = load_raw()
    miss = df.isnull().sum()
    n = len(df)
    out = []
    for c in df.columns:
        out.append(
            {
                "name": c,
                "dtype": str(df[c].dtype),
                "missing": int(miss[c]),
                "missing_pct": round(float(miss[c] / n * 100), 3),
                "unique": int(df[c].nunique()),
            }
        )
    return out


def missing_values() -> list[dict]:
    df = load_raw()
    n = len(df)
    rows = []
    for c in df.columns:
        m = int(df[c].isnull().sum())
        if m > 0:
            rows.append({"column": c, "count": m, "pct": round(m / n * 100, 3)})
    return rows


def filters_meta() -> dict:
    df = load_raw()
    return {
        "seasons": sorted(df["year"].unique().tolist()),
        "races": sorted(df["race"].unique().tolist()),
        "circuits": sorted(df["circuit"].unique().tolist()),
        "drivers": sorted(df["driver"].unique().tolist()),
        "teams": sorted(df["team_name"].unique().tolist()) if "team_name" in df.columns else [],
        "compounds": sorted(df["compound"].dropna().unique().tolist()),
        "stints": sorted(df["stint_number"].unique().tolist()) if "stint_number" in df.columns else [],
    }


def lap_table(
    season: int | None = None,
    race: str | None = None,
    circuit: str | None = None,
    driver: str | None = None,
    compound: str | None = None,
    tyre_age_min: float | None = None,
    tyre_age_max: float | None = None,
    limit: int = 200,
    offset: int = 0,
    sort_by: str = "lap_number",
    sort_dir: str = "asc",
) -> dict:
    df = load_raw()
    if season is not None:
        df = df[df["year"] == season]
    if race:
        df = df[df["race"] == race]
    if circuit:
        df = df[df["circuit"] == circuit]
    if driver:
        df = df[df["driver"] == driver]
    if compound:
        df = df[df["compound"] == compound]
    if tyre_age_min is not None:
        df = df[df["tyre_age"] >= tyre_age_min]
    if tyre_age_max is not None:
        df = df[df["tyre_age"] <= tyre_age_max]
    total = len(df)
    if sort_by in df.columns:
        df = df.sort_values(sort_by, ascending=(sort_dir == "asc"))
    page = df.iloc[offset : offset + limit]
    return {"total": total, "offset": offset, "limit": limit, "rows": page.replace({np.nan: None}).to_dict(orient="records")}


def chart_histogram(column: str, bins: int = 40) -> dict:
    df = load_raw()
    if column not in df.columns:
        return {"available": False, "column": column}
    s = df[column].dropna()
    counts, edges = np.histogram(s, bins=bins)
    return {
        "available": True,
        "column": column,
        "bins": [{"start": float(edges[i]), "end": float(edges[i + 1]), "count": int(counts[i])} for i in range(len(counts))],
    }


def degradation_analysis(
    season: int | None = None,
    circuit: str | None = None,
    compound: str | None = None,
    driver: str | None = None,
    sample: int = 2500,
) -> dict:
    df = load_raw().copy()
    if season:
        df = df[df["year"] == season]
    if circuit:
        df = df[df["circuit"] == circuit]
    if compound:
        df = df[df["compound"] == compound]
    if driver:
        df = df[df["driver"] == driver]
    if len(df) > sample:
        df = df.sample(sample, random_state=42)
    g = df.groupby(["year", "race", "driver_number", "session_key", "stint_number"], sort=False)
    df["delta_tyre_age"] = g["tyre_age"].diff()
    df["proxy"] = np.where(
        (df["delta_tyre_age"] > 0) & df["previous_lap_time"].notna(),
        (df["lap_time_sec"] - df["previous_lap_time"]) / df["delta_tyre_age"],
        np.nan,
    )
    scatter = df.dropna(subset=["tyre_age", "proxy"])[["tyre_age", "proxy", "compound", "lap_time_sec"]]
    scatter = scatter.replace({np.nan: None})
    by_compound = (
        df.dropna(subset=["proxy"]).groupby("compound")["proxy"].agg(["mean", "std", "count"]).reset_index()
        if "compound" in df.columns
        else pd.DataFrame()
    )
    meta_path = root() / "results" / "target_metadata.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    return {
        "target_note": meta.get(
            "target_definition",
            "Lap-time-derived proxy; not pure physical tyre degradation.",
        ),
        "points": scatter.to_dict(orient="records"),
        "compound_summary": by_compound.replace({np.nan: None}).to_dict(orient="records"),
        "proxy_distribution": chart_histogram("proxy", 50) if len(scatter) else {"available": False},
    }


def read_json_result(name: str) -> dict | None:
    p = root() / "results" / name
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def read_csv_result(name: str) -> list[dict] | None:
    p = root() / "results" / name
    if not p.exists():
        return None
    return pd.read_csv(p).replace({np.nan: None}).to_dict(orient="records")
