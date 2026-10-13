from __future__ import annotations

import io
import json
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from backend.app.services import data_service
from backend.ml.pipeline import FEATURES, TARGET, load_and_clean

DATA_DICTIONARY = [
    {"column": "year", "description": "Season year", "role": "metadata"},
    {"column": "race", "description": "Grand Prix event name", "role": "metadata"},
    {"column": "circuit", "description": "Circuit location name", "role": "metadata"},
    {"column": "driver", "description": "Driver full name", "role": "metadata"},
    {"column": "team_name", "description": "Constructor team", "role": "metadata"},
    {"column": "lap_time_sec", "description": "Lap time in seconds", "role": "signal"},
    {"column": "compound", "description": "Tyre compound", "role": "feature"},
    {"column": "tyre_age", "description": "Laps on current tyre set", "role": "feature"},
    {"column": "stint_number", "description": "Stint index in session", "role": "feature"},
    {"column": "previous_lap_time", "description": "Previous lap time (seconds)", "role": "feature"},
    {"column": "lap_time_change", "description": "Current minus previous lap time", "role": "target_component"},
    {"column": "degradation_rate", "description": "Dataset-provided rate (validate before use)", "role": "reference"},
    {"column": "TARGET", "description": "Engineered proxy: lap_time_change / delta_tyre_age", "role": "target"},
]


def data_quality() -> dict:
    df = data_service.load_raw()
    dup_lap = int(
        df.duplicated(subset=["year", "race", "driver_number", "session_key", "lap_number"]).sum()
    )
    dup_stint_lap = int(
        df.duplicated(subset=["year", "race", "driver_number", "stint_number", "lap_number"]).sum()
    )
    warnings = [
        "session_key required when grouping stints (Sprint + Race events).",
        "degradation_rate may not match simple per-lap proxy.",
        "No SC/VSC/traffic/fuel flags in CSV.",
        "TARGET uses lap_time_change — do not use lap_time_change as a model input.",
    ]
    return {
        "duplicate_rows": int(df.duplicated().sum()),
        "duplicate_session_lap_keys": dup_lap,
        "duplicate_stint_lap_without_session": dup_stint_lap,
        "pit_out_laps": int(df["is_pit_out_lap"].sum()) if "is_pit_out_lap" in df.columns else None,
        "warnings": warnings,
        "leakage_notes": [
            "Features exclude current-lap lap_time_sec, sectors, and lap_time_change.",
            "Rolling lap features use prior laps only (shifted).",
        ],
    }


def filter_laps(
    season: int | None = None,
    race: str | None = None,
    circuit: str | None = None,
    driver: str | None = None,
    team: str | None = None,
    compound: str | None = None,
    stint: int | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
    sort_by: str = "lap_number",
    sort_dir: str = "asc",
) -> dict:
    df = data_service.load_raw()
    if season is not None:
        df = df[df["year"] == season]
    if race:
        df = df[df["race"] == race]
    if circuit:
        df = df[df["circuit"] == circuit]
    if driver:
        df = df[df["driver"] == driver]
    if team:
        df = df[df["team_name"] == team]
    if compound:
        df = df[df["compound"] == compound]
    if stint is not None:
        df = df[df["stint_number"] == stint]
    if search:
        q = search.lower()
        mask = False
        for col in ["driver", "race", "circuit", "team_name", "compound"]:
            if col in df.columns:
                mask = mask | df[col].astype(str).str.lower().str.contains(q, na=False)
        df = df[mask]
    total = len(df)
    if sort_by in df.columns:
        df = df.sort_values(sort_by, ascending=(sort_dir == "asc"))
    page = df.iloc[offset : offset + limit]
    return {"total": total, "offset": offset, "limit": limit, "rows": page.replace({np.nan: None}).to_dict(orient="records")}


def export_laps_csv(**kwargs) -> str:
    kwargs["limit"] = 100000
    kwargs["offset"] = 0
    rows = filter_laps(**kwargs)["rows"]
    buf = io.StringIO()
    pd.DataFrame(rows).to_csv(buf, index=False)
    return buf.getvalue()


def chart_filtered(column: str, bins: int = 40, **filters) -> dict:
    data = filter_laps(limit=100000, offset=0, **filters)
    df = pd.DataFrame(data["rows"])
    if column not in df.columns:
        return {"available": False, "column": column}
    s = pd.to_numeric(df[column], errors="coerce").dropna()
    if s.empty:
        return {"available": False, "column": column}
    counts, edges = np.histogram(s, bins=bins)
    return {
        "available": True,
        "column": column,
        "n": int(len(s)),
        "bins": [{"start": float(edges[i]), "end": float(edges[i + 1]), "count": int(counts[i])} for i in range(len(counts))],
    }


def degradation_extended(
    season: int | None = None,
    race: str | None = None,
    circuit: str | None = None,
    compound: str | None = None,
    driver: str | None = None,
    stint: int | None = None,
    sample: int = 3000,
) -> dict:
    _, clean = load_and_clean(data_service.csv_path())
    df = clean.copy()
    if season:
        df = df[df["year"] == season]
    if race:
        df = df[df["race"] == race]
    if circuit:
        df = df[df["circuit"] == circuit]
    if compound:
        df = df[df["compound"] == compound]
    if driver:
        df = df[df["driver"] == driver]
    if stint is not None:
        df = df[df["stint_number"] == stint]
    if len(df) > sample:
        df = df.sample(sample, random_state=42)

    pred_path = data_service.root() / "results" / "test_predictions.csv"
    pred = pd.read_csv(pred_path) if pred_path.exists() else pd.DataFrame()
    merged_note = "Predicted degradation available for 2024 test rows only when merge keys match."
    if not pred.empty and "year" in df.columns:
        m = df.merge(
            pred[["year", "race", "circuit", "compound", "tyre_age", "predicted"]],
            on=["year", "race", "circuit", "compound", "tyre_age"],
            how="left",
            suffixes=("", "_pred"),
        )
        df = m

    points = df[
        ["tyre_age", TARGET, "lap_time_sec", "compound", "driver", "team_name", "stint_number", "predicted"]
    ].replace({np.nan: None})
    if "predicted" not in points.columns:
        points["predicted"] = None

    by_compound = df.groupby("compound").agg(n=(TARGET, "count"), mean_proxy=(TARGET, "mean")).reset_index()
    by_driver = df.groupby("driver").agg(n=(TARGET, "count"), mean_proxy=(TARGET, "mean")).reset_index().sort_values("n", ascending=False).head(15)
    by_team = df.groupby("team_name").agg(n=(TARGET, "count"), mean_proxy=(TARGET, "mean")).reset_index()
    by_circuit = df.groupby("circuit").agg(n=(TARGET, "count"), mean_proxy=(TARGET, "mean")).reset_index()

    stint_trend = (
        df.groupby(["stint_number", "compound"])[TARGET].mean().reset_index().replace({np.nan: None}).to_dict(orient="records")
    )

    meta = data_service.read_json_result("target_metadata.json") or {}
    return {
        "target_note": meta.get("target_definition", ""),
        "observed_vs_predicted_note": merged_note,
        "points": points.to_dict(orient="records"),
        "by_compound": by_compound.replace({np.nan: None}).to_dict(orient="records"),
        "by_driver": by_driver.replace({np.nan: None}).to_dict(orient="records"),
        "by_team": by_team.replace({np.nan: None}).to_dict(orient="records"),
        "by_circuit": by_circuit.replace({np.nan: None}).to_dict(orient="records"),
        "stint_trend": stint_trend,
    }


def subgroup_errors() -> dict:
    p = data_service.root() / "results" / "test_predictions_enriched.csv"
    if not p.exists():
        p = data_service.root() / "results" / "test_predictions.csv"
    if not p.exists():
        return {"available": False, "groups": []}
    df = pd.read_csv(p)
    df["abs_error"] = (df[TARGET] - df["predicted"]).abs()
    df["residual"] = df[TARGET] - df["predicted"]

    def agg_group(col: str, min_n: int = 80) -> list[dict]:
        rows = []
        for name, g in df.groupby(col):
            if len(g) < min_n:
                continue
            rows.append(
                {
                    "group": str(name),
                    "dimension": col,
                    "n": int(len(g)),
                    "MAE": float(g["abs_error"].mean()),
                    "RMSE": float(np.sqrt((g["residual"] ** 2).mean())),
                    "mean_abs_residual": float(g["residual"].abs().mean()),
                }
            )
        return sorted(rows, key=lambda x: x["MAE"], reverse=True)

    df["tyre_age_bin"] = pd.cut(df["tyre_age"], bins=[0, 5, 10, 15, 25, 100], labels=["0-5", "6-10", "11-15", "16-25", "25+"])
    df["stint_stage"] = df["stint_number"].apply(lambda x: "early" if x <= 1 else ("mid" if x <= 2 else "late"))
    if "rainfall" in df.columns:
        df["rain_bin"] = df["rainfall"].apply(lambda x: "wet" if x else "dry")
        rain_groups = agg_group("rain_bin", 30)
    else:
        rain_groups = []

    groups = (
        agg_group("compound", 50)
        + agg_group("circuit", 100)
        + agg_group("tyre_age_bin", 50)
        + agg_group("stint_stage", 50)
        + rain_groups
    )
    large = df.nlargest(25, "abs_error").replace({np.nan: None}).to_dict(orient="records")
    return {"available": True, "groups": groups, "large_errors": large, "residual_mean": float(df["residual"].mean())}


def bootstrap_metric_ci(n_boot: int = 400, seed: int = 42) -> dict:
    p = data_service.root() / "results" / "test_predictions.csv"
    if not p.exists():
        return {"available": False}
    df = pd.read_csv(p)
    y = df[TARGET].values
    pred = df["predicted"].values
    rng = np.random.default_rng(seed)
    maes, rmses = [], []
    n = len(df)
    for _ in range(n_boot):
        idx = rng.integers(0, n, n)
        err = y[idx] - pred[idx]
        maes.append(float(np.abs(err).mean()))
        rmses.append(float(np.sqrt((err**2).mean())))
    return {
        "available": True,
        "n_boot": n_boot,
        "MAE_mean": float(np.mean(maes)),
        "MAE_ci_low": float(np.quantile(maes, 0.025)),
        "MAE_ci_high": float(np.quantile(maes, 0.975)),
        "RMSE_mean": float(np.mean(rmses)),
        "RMSE_ci_low": float(np.quantile(rmses, 0.025)),
        "RMSE_ci_high": float(np.quantile(rmses, 0.975)),
    }


def experiment_manifest() -> dict:
    root = data_service.root()
    cfg = data_service.read_json_result("experiment_config.json")
    if not cfg:
        cfg = {"available": False, "message": "Run python -m backend.ml.pipeline to generate experiment_config.json"}
    export = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "results_files": [p.name for p in (root / "results").glob("*") if p.is_file()],
    }
    return {"config": cfg, "export_meta": export, "data_dictionary": DATA_DICTIONARY}


DRIVER_META: dict[str, dict] = {
    "Max VERSTAPPEN": {"code": "VER", "number": 1, "country": "Netherlands", "flag": "🇳🇱", "team": "Red Bull Racing"},
    "Sergio PEREZ": {"code": "PER", "number": 11, "country": "Mexico", "flag": "🇲🇽", "team": "Red Bull Racing"},
    "Lewis HAMILTON": {"code": "HAM", "number": 44, "country": "United Kingdom", "flag": "🇬🇧", "team": "Mercedes"},
    "George RUSSELL": {"code": "RUS", "number": 63, "country": "United Kingdom", "flag": "🇬🇧", "team": "Mercedes"},
    "Charles LECLERC": {"code": "LEC", "number": 16, "country": "Monaco", "flag": "🇲🇨", "team": "Ferrari"},
    "Carlos SAINZ": {"code": "SAI", "number": 55, "country": "Spain", "flag": "🇪🇸", "team": "Ferrari"},
    "Lando NORRIS": {"code": "NOR", "number": 4, "country": "United Kingdom", "flag": "🇬🇧", "team": "McLaren"},
    "Oscar PIASTRI": {"code": "PIA", "number": 81, "country": "Australia", "flag": "🇦🇺", "team": "McLaren"},
    "Fernando ALONSO": {"code": "ALO", "number": 14, "country": "Spain", "flag": "🇪🇸", "team": "Aston Martin"},
    "Lance STROLL": {"code": "STR", "number": 18, "country": "Canada", "flag": "🇨🇦", "team": "Aston Martin"},
    "Pierre GASLY": {"code": "GAS", "number": 10, "country": "France", "flag": "🇫🇷", "team": "Alpine"},
    "Esteban OCON": {"code": "OCO", "number": 31, "country": "France", "flag": "🇫🇷", "team": "Alpine"},
    "Alexander ALBON": {"code": "ALB", "number": 23, "country": "Thailand", "flag": "🇹🇭", "team": "Williams"},
    "Logan SARGEANT": {"code": "SAR", "number": 2, "country": "United States", "flag": "🇺🇸", "team": "Williams"},
    "Franco COLAPINTO": {"code": "COL", "number": 43, "country": "Argentina", "flag": "🇦🇷", "team": "Williams"},
    "Yuki TSUNODA": {"code": "TSU", "number": 22, "country": "Japan", "flag": "🇯🇵", "team": "RB"},
    "Daniel RICCIARDO": {"code": "RIC", "number": 3, "country": "Australia", "flag": "🇦🇺", "team": "RB"},
    "Liam LAWSON": {"code": "LAW", "number": 30, "country": "New Zealand", "flag": "🇳🇿", "team": "RB"},
    "Nyck DE VRIES": {"code": "DEV", "number": 21, "country": "Netherlands", "flag": "🇳🇱", "team": "AlphaTauri"},
    "Nico HULKENBERG": {"code": "HUL", "number": 27, "country": "Germany", "flag": "🇩🇪", "team": "Haas F1 Team"},
    "Kevin MAGNUSSEN": {"code": "MAG", "number": 20, "country": "Denmark", "flag": "🇩🇰", "team": "Haas F1 Team"},
    "Oliver BEARMAN": {"code": "BEA", "number": 38, "country": "United Kingdom", "flag": "🇬🇧", "team": "Haas F1 Team"},
    "Valtteri BOTTAS": {"code": "BOT", "number": 77, "country": "Finland", "flag": "🇫🇮", "team": "Kick Sauber"},
    "ZHOU Guanyu": {"code": "ZHO", "number": 24, "country": "China", "flag": "🇨🇳", "team": "Kick Sauber"},
    "Jack DOOHAN": {"code": "DOO", "number": 61, "country": "Australia", "flag": "🇦🇺", "team": "Alpine"},
}

TEAM_META: dict[str, dict] = {
    "Red Bull Racing": {"color": "#3671C6", "secondary": "#F59E0B", "engine": "Honda RBPT", "base": "Milton Keynes, UK", "principal": "Christian Horner"},
    "Ferrari": {"color": "#E8002D", "secondary": "#FFF200", "engine": "Ferrari 066/12", "base": "Maranello, Italy", "principal": "Frédéric Vasseur"},
    "McLaren": {"color": "#FF8000", "secondary": "#47C7FC", "engine": "Mercedes M15", "base": "Woking, UK", "principal": "Andrea Stella"},
    "Mercedes": {"color": "#27F4D2", "secondary": "#C0C0C0", "engine": "Mercedes-AMG M15", "base": "Brackley, UK", "principal": "Toto Wolff"},
    "Aston Martin": {"color": "#229971", "secondary": "#CEDC00", "engine": "Mercedes M15", "base": "Silverstone, UK", "principal": "Mike Krack"},
    "Alpine": {"color": "#0093CC", "secondary": "#FF87BC", "engine": "Renault E-Tech RE24", "base": "Enstone, UK", "principal": "Oliver Oakes"},
    "Williams": {"color": "#64C4FF", "secondary": "#041E42", "engine": "Mercedes M15", "base": "Grove, UK", "principal": "James Vowles"},
    "Haas F1 Team": {"color": "#B6BABD", "secondary": "#DA291C", "engine": "Ferrari 066/12", "base": "Kannapolis, USA", "principal": "Ayao Komatsu"},
    "RB": {"color": "#6692FF", "secondary": "#FFFFFF", "engine": "Honda RBPT", "base": "Faenza, Italy", "principal": "Laurent Mekies"},
    "AlphaTauri": {"color": "#5E8FAA", "secondary": "#FFFFFF", "engine": "Honda RBPT", "base": "Faenza, Italy", "principal": "Franz Tost"},
    "Kick Sauber": {"color": "#52E252", "secondary": "#1E1E1E", "engine": "Ferrari 066/12", "base": "Hinwil, Switzerland", "principal": "Alessandro Alunni Bravi"},
    "Alfa Romeo": {"color": "#C92D4B", "secondary": "#981E32", "engine": "Ferrari 066/10", "base": "Hinwil, Switzerland", "principal": "Alessandro Alunni Bravi"},
}


def drivers_and_teams_overview() -> dict:
    df = data_service.load_raw()

    driver_list = []
    driver_deg_map = {}

    for name, g in df.groupby("driver"):
        meta = DRIVER_META.get(name, {
            "code": name[:3].upper(),
            "number": int(g["driver_number"].iloc[0]) if "driver_number" in g.columns and not g["driver_number"].dropna().empty else 0,
            "country": "International",
            "flag": "🏁",
            "team": str(g["team_name"].iloc[0]) if "team_name" in g.columns else "Formula 1",
        })

        laps = int(len(g))
        valid_deg = g["degradation_rate"].dropna() if "degradation_rate" in g.columns else pd.Series(dtype=float)
        mean_deg = float(valid_deg.mean()) if not valid_deg.empty else 0.0
        driver_deg_map[name] = mean_deg

        valid_lt = g["lap_time_sec"].dropna()
        mean_lt = float(valid_lt.mean()) if not valid_lt.empty else 0.0
        fastest_lt = float(valid_lt.min()) if not valid_lt.empty else 0.0

        comp_counts = g["compound"].value_counts().to_dict() if "compound" in g.columns else {}

        # Compound specific deg
        comp_deg = {}
        for c in ["SOFT", "MEDIUM", "HARD"]:
            cg = g[g["compound"] == c] if "compound" in g.columns else pd.DataFrame()
            if not cg.empty and "degradation_rate" in cg.columns:
                cd = cg["degradation_rate"].dropna()
                comp_deg[c] = float(cd.mean()) if not cd.empty else None
            else:
                comp_deg[c] = None

        stint_lens = g.groupby(["year", "race", "stint_number"]).size() if "stint_number" in g.columns else pd.Series(dtype=float)
        avg_stint = float(stint_lens.mean()) if not stint_lens.empty else 0.0
        max_stint = int(stint_lens.max()) if not stint_lens.empty else 0
        mean_tyre_age = float(g["tyre_age"].mean()) if "tyre_age" in g.columns and not g["tyre_age"].dropna().empty else 0.0

        # Tyre management score (0-100): lower degradation rate + longer stint preservation = higher score
        # base formula normalized from observed degradation spread
        score = int(np.clip(85 - (mean_deg * 25) + min(15, avg_stint / 2), 40, 99))

        teams_driven = [str(t) for t in g["team_name"].dropna().unique()] if "team_name" in g.columns else [meta["team"]]
        seasons = sorted([int(y) for y in g["year"].dropna().unique()]) if "year" in g.columns else [2023, 2024]

        driver_list.append({
            "driver": name,
            "code": meta["code"],
            "number": meta["number"],
            "country": meta["country"],
            "flag": meta["flag"],
            "team": meta["team"],
            "teams": teams_driven,
            "seasons": seasons,
            "total_laps": laps,
            "mean_lap_time": round(mean_lt, 3),
            "fastest_lap": round(fastest_lt, 3),
            "mean_degradation_rate": round(mean_deg, 4),
            "tyre_management_score": score,
            "compounds": comp_counts,
            "compound_degradation": comp_deg,
            "avg_stint_laps": round(avg_stint, 1),
            "max_stint_laps": max_stint,
            "mean_tyre_age": round(mean_tyre_age, 1),
        })

    driver_list = sorted(driver_list, key=lambda x: x["total_laps"], reverse=True)

    team_list = []
    for team_name, tg in df.groupby("team_name"):
        tmeta = TEAM_META.get(team_name, {
            "color": "#e10600",
            "secondary": "#ffffff",
            "engine": "Turbo Hybrid",
            "base": "Europe",
            "principal": "Team Principal",
        })

        tlaps = int(len(tg))
        valid_tdeg = tg["degradation_rate"].dropna() if "degradation_rate" in tg.columns else pd.Series(dtype=float)
        mean_tdeg = float(valid_tdeg.mean()) if not valid_tdeg.empty else 0.0

        valid_tlt = tg["lap_time_sec"].dropna()
        mean_tlt = float(valid_tlt.mean()) if not valid_tlt.empty else 0.0
        fastest_tlt = float(valid_tlt.min()) if not valid_tlt.empty else 0.0

        t_comp_counts = tg["compound"].value_counts().to_dict() if "compound" in tg.columns else {}
        t_drivers = sorted([str(d) for d in tg["driver"].dropna().unique()])

        t_comp_deg = {}
        for c in ["SOFT", "MEDIUM", "HARD"]:
            cg = tg[tg["compound"] == c] if "compound" in tg.columns else pd.DataFrame()
            if not cg.empty and "degradation_rate" in cg.columns:
                cd = cg["degradation_rate"].dropna()
                t_comp_deg[c] = float(round(cd.mean(), 4)) if not cd.empty else None
            else:
                t_comp_deg[c] = None

        t_stint_lens = tg.groupby(["year", "race", "driver", "stint_number"]).size() if "stint_number" in tg.columns else pd.Series(dtype=float)
        t_avg_stint = float(t_stint_lens.mean()) if not t_stint_lens.empty else 0.0

        t_score = int(np.clip(85 - (mean_tdeg * 25) + min(15, t_avg_stint / 2), 40, 99))

        team_list.append({
            "team_name": team_name,
            "color": tmeta["color"],
            "secondary": tmeta["secondary"],
            "engine": tmeta["engine"],
            "base": tmeta["base"],
            "principal": tmeta["principal"],
            "drivers": t_drivers,
            "total_laps": tlaps,
            "mean_lap_time": round(mean_tlt, 3),
            "fastest_lap": round(fastest_tlt, 3),
            "mean_degradation_rate": round(mean_tdeg, 4),
            "tyre_preservation_score": t_score,
            "compounds": t_comp_counts,
            "compound_degradation": t_comp_deg,
            "avg_stint_laps": round(t_avg_stint, 1),
        })

    team_list = sorted(team_list, key=lambda x: x["total_laps"], reverse=True)

    # Teammate head to head comparisons
    h2h_pairs = [
        ("Red Bull Racing", "Max VERSTAPPEN", "Sergio PEREZ"),
        ("Ferrari", "Charles LECLERC", "Carlos SAINZ"),
        ("Mercedes", "Lewis HAMILTON", "George RUSSELL"),
        ("McLaren", "Lando NORRIS", "Oscar PIASTRI"),
        ("Aston Martin", "Fernando ALONSO", "Lance STROLL"),
        ("Alpine", "Pierre GASLY", "Esteban OCON"),
        ("Williams", "Alexander ALBON", "Logan SARGEANT"),
        ("Haas F1 Team", "Nico HULKENBERG", "Kevin MAGNUSSEN"),
        ("RB", "Yuki TSUNODA", "Daniel RICCIARDO"),
        ("Kick Sauber", "Valtteri BOTTAS", "ZHOU Guanyu"),
    ]

    head_to_head = []
    for team, d1, d2 in h2h_pairs:
        d1_obj = next((d for d in driver_list if d["driver"] == d1), None)
        d2_obj = next((d for d in driver_list if d["driver"] == d2), None)
        if d1_obj and d2_obj:
            deg_diff = round(d1_obj["mean_degradation_rate"] - d2_obj["mean_degradation_rate"], 4)
            lap_diff = round(d1_obj["mean_lap_time"] - d2_obj["mean_lap_time"], 3)
            head_to_head.append({
                "team": team,
                "driver1": d1_obj,
                "driver2": d2_obj,
                "degradation_delta": deg_diff,
                "lap_time_delta": lap_diff,
                "better_tyre_saver": d1 if deg_diff < 0 else d2,
            })

    top_saver = min(driver_list, key=lambda d: d["mean_degradation_rate"]) if driver_list else None
    top_team = min(team_list, key=lambda t: t["mean_degradation_rate"]) if team_list else None

    return {
        "drivers": driver_list,
        "teams": team_list,
        "head_to_head": head_to_head,
        "metrics_summary": {
            "total_drivers": len(driver_list),
            "total_teams": len(team_list),
            "top_tyre_saver": top_saver["driver"] if top_saver else "—",
            "top_tyre_saver_team": top_saver["team"] if top_saver else "—",
            "top_team_preserver": top_team["team_name"] if top_team else "—",
            "total_laps_analyzed": int(len(df)),
        },
    }


def driver_detail(driver_name: str) -> dict:
    df = data_service.load_raw()
    dg = df[df["driver"] == driver_name]
    if dg.empty:
        raise ValueError(f"Driver '{driver_name}' not found")

    meta = DRIVER_META.get(driver_name, {
        "code": driver_name[:3].upper(),
        "number": 0,
        "country": "International",
        "flag": "🏁",
        "team": "Formula 1",
    })
    tmeta = TEAM_META.get(meta["team"], {"color": "#e10600", "secondary": "#ffffff"})

    # Degradation curves: mean lap_time_sec and degradation proxy by tyre_age for each compound
    curves = {}
    for comp in ["SOFT", "MEDIUM", "HARD"]:
        cg = dg[dg["compound"] == comp]
        if cg.empty:
            continue
        # tyre_age grouped
        age_agg = (
            cg.groupby("tyre_age")
            .agg(
                mean_lap_time=("lap_time_sec", "mean"),
                mean_deg=("degradation_rate", "mean"),
                laps=("lap_number", "count"),
            )
            .reset_index()
        )
        age_agg = age_agg[age_agg["laps"] >= 3].sort_values("tyre_age")
        curves[comp] = [
            {
                "tyre_age": float(r["tyre_age"]),
                "lap_time": round(float(r["mean_lap_time"]), 3),
                "deg_rate": round(float(r["mean_deg"]), 4) if pd.notnull(r["mean_deg"]) else 0.0,
                "laps": int(r["laps"]),
            }
            for _, r in age_agg.head(30).iterrows()
        ]

    # Stint distribution
    stint_summary = []
    if "stint_number" in dg.columns:
        for stint_no, sg in dg.groupby("stint_number"):
            stint_summary.append({
                "stint": int(stint_no),
                "laps": int(len(sg)),
                "avg_tyre_age": round(float(sg["tyre_age"].mean()), 1) if "tyre_age" in sg.columns else 0.0,
                "primary_compound": str(sg["compound"].mode().iloc[0]) if not sg["compound"].empty else "—",
            })

    # Race breakdown (top races by lap count)
    race_breakdown = []
    for (yr, rc), rg in dg.groupby(["year", "race"]):
        race_breakdown.append({
            "year": int(yr),
            "race": str(rc),
            "laps": int(len(rg)),
            "fastest_lap": round(float(rg["lap_time_sec"].min()), 3) if not rg["lap_time_sec"].dropna().empty else 0.0,
            "compounds_used": sorted(rg["compound"].dropna().unique().tolist()),
            "mean_deg": round(float(rg["degradation_rate"].mean()), 4) if "degradation_rate" in rg.columns and not rg["degradation_rate"].dropna().empty else 0.0,
        })
    race_breakdown = sorted(race_breakdown, key=lambda x: (x["year"], x["race"]), reverse=True)[:10]

    return {
        "driver": driver_name,
        "meta": meta,
        "team_meta": tmeta,
        "curves": curves,
        "stints": stint_summary,
        "recent_races": race_breakdown,
        "total_laps": int(len(dg)),
    }

