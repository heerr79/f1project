from __future__ import annotations

import math
from functools import lru_cache

import pandas as pd

from backend.app.services.data_service import load_raw


def driver_code(name: str) -> str:
    parts = name.strip().split()
    if not parts:
        return "UNK"
    surname = parts[-1].upper().replace("Ü", "U")
    return surname[:3].ljust(3, "X")[:3]


@lru_cache(maxsize=1)
def _sessions_df() -> pd.DataFrame:
    df = load_raw()
    meta = (
        df.groupby(["year", "race", "circuit", "session_key"], as_index=False)
        .agg(max_lap=("lap_number", "max"), rows=("lap_number", "count"), drivers=("driver", "nunique"))
        .sort_values(["year", "race", "session_key"])
    )
    return meta


def list_sessions(limit: int = 80) -> list[dict]:
    meta = _sessions_df().head(limit)
    return meta.replace({pd.NA: None}).to_dict(orient="records")


def _load_predictions() -> pd.DataFrame:
    from backend.app.services.data_service import root

    p = root() / "results" / "test_predictions_enriched.csv"
    if not p.exists():
        p = root() / "results" / "test_predictions.csv"
    return pd.read_csv(p) if p.exists() else pd.DataFrame()


def session_detail(year: int, race: str, session_key: int) -> dict:
    df = load_raw()
    df = df[(df["year"] == year) & (df["race"] == race) & (df["session_key"] == session_key)].copy()
    if df.empty:
        raise ValueError("Session not found")

    max_lap = int(df["lap_number"].max())
    circuit = str(df["circuit"].iloc[0])

    preds = _load_predictions()
    pred_map: dict[tuple[str, str, int], float] = {}
    if not preds.empty and year == 2024:
        race_preds = preds[preds["race"] == race] if "race" in preds.columns else preds
        for _, pr in race_preds.iterrows():
            d_key = str(pr.get("driver", ""))
            c_key = str(pr.get("compound", ""))
            try:
                a_key = int(round(float(pr.get("tyre_age", -1))))
            except (ValueError, TypeError):
                continue
            pred_map[(d_key, c_key, a_key)] = float(pr["predicted"])
            if ("", c_key, a_key) not in pred_map:
                pred_map[("", c_key, a_key)] = float(pr["predicted"])

    drivers_out = []
    for driver, g in df.groupby("driver", sort=False):
        g = g.sort_values("lap_number")
        laps = []
        cumulative = 0.0
        cum_list = []
        for _, row in g.iterrows():
            cumulative += float(row["lap_time_sec"])
            cum_list.append(cumulative)
            pred_val = None
            if pred_map:
                try:
                    cur_age = int(round(float(row["tyre_age"])))
                except (ValueError, TypeError):
                    cur_age = -1
                pred_val = pred_map.get((driver, str(row["compound"]), cur_age))
                if pred_val is None:
                    pred_val = pred_map.get(("", str(row["compound"]), cur_age))
            laps.append(
                {
                    "lap_number": int(row["lap_number"]),
                    "lap_time_sec": float(row["lap_time_sec"]),
                    "predicted_degradation_proxy": pred_val,
                    "sector1_sec": None if pd.isna(row["sector1_sec"]) else float(row["sector1_sec"]),
                    "sector2_sec": None if pd.isna(row["sector2_sec"]) else float(row["sector2_sec"]),
                    "sector3_sec": None if pd.isna(row["sector3_sec"]) else float(row["sector3_sec"]),
                    "compound": str(row["compound"]),
                    "tyre_age": float(row["tyre_age"]),
                    "track_temperature": float(row["track_temperature"]),
                    "air_temperature": float(row["air_temperature"]),
                    "humidity": float(row["humidity"]),
                    "wind_speed": float(row["wind_speed"]),
                    "rainfall": int(row["rainfall"]),
                }
            )
        drivers_out.append(
            {
                "driver": driver,
                "code": driver_code(driver),
                "team_name": str(g["team_name"].iloc[0]),
                "driver_number": int(g["driver_number"].iloc[0]),
                "laps": laps,
                "cumulative_times": cum_list,
            }
        )

    w = df.iloc[len(df) // 2]
    return {
        "year": year,
        "race": race,
        "session_key": session_key,
        "circuit": circuit,
        "max_lap": max_lap,
        "driver_count": len(drivers_out),
        "weather": {
            "track_temperature": float(w["track_temperature"]),
            "air_temperature": float(w["air_temperature"]),
            "humidity": float(w["humidity"]),
            "wind_speed": float(w["wind_speed"]),
            "rainfall": int(w["rainfall"]),
        },
        "drivers": drivers_out,
        "data_note": (
            "Replay uses lap-level CSV only. Car positions are estimated along a schematic track from "
            "lap/sector timing — not official GPS or live F1 timing."
        ),
    }


def _sector_fraction(lap_row: dict, sector: int, sector_part: float) -> float:
    s1 = lap_row.get("sector1_sec") or 0
    s2 = lap_row.get("sector2_sec") or 0
    s3 = lap_row.get("sector3_sec") or 0
    total = s1 + s2 + s3
    if total <= 0:
        return max(0.0, min(1.0, sector_part))
    part = max(0.0, min(1.0, sector_part))
    if sector <= 1:
        return (s1 * part) / total
    if sector == 2:
        return (s1 + s2 * part) / total
    return (s1 + s2 + s3 * part) / total


def replay_frame(
    year: int,
    race: str,
    session_key: int,
    lap: int,
    sector: int = 1,
    sector_part: float = 0.0,
) -> dict:
    detail = session_detail(year, race, session_key)
    max_lap = detail["max_lap"]
    lap = max(1, min(lap, max_lap))
    sector = max(1, min(sector, 3))

    entries = []
    for d in detail["drivers"]:
        lap_rows = {x["lap_number"]: x for x in d["laps"]}
        if lap not in lap_rows:
            last_lap = max([n for n in lap_rows if n <= lap], default=None)
            if last_lap is None:
                continue
            progress = (last_lap - 1) / max_lap
            row = lap_rows[last_lap]
        else:
            row = lap_rows[lap]
            frac = _sector_fraction(row, sector, sector_part)
            progress = ((lap - 1) + frac) / max_lap

        cum = None
        for i, lr in enumerate(d["laps"]):
            if lr["lap_number"] == lap:
                cum = d["cumulative_times"][i]
                break
        if cum is None:
            eligible = [(i, lr) for i, lr in enumerate(d["laps"]) if lr["lap_number"] <= lap]
            if eligible:
                i, _ = eligible[-1]
                cum = d["cumulative_times"][i]
            else:
                cum = 0.0

        avg_kph = None
        if row["lap_time_sec"] > 0:
            # Schematic scale only (no official track length in dataset)
            avg_kph = round(3600 / row["lap_time_sec"] * 5.8, 1)

        entries.append(
            {
                "driver": d["driver"],
                "code": d["code"],
                "team_name": d["team_name"],
                "driver_number": d["driver_number"],
                "lap_number": lap if lap in lap_rows else max(lap_rows.keys()),
                "progress": max(0.0, min(0.999, progress)),
                "cumulative_time_sec": cum,
                "lap_time_sec": row["lap_time_sec"],
                "compound": row["compound"],
                "tyre_age": row["tyre_age"],
                "estimated_kph": avg_kph,
                "sector1_sec": row.get("sector1_sec"),
                "sector2_sec": row.get("sector2_sec"),
                "sector3_sec": row.get("sector3_sec"),
            }
        )

    entries.sort(key=lambda x: x["cumulative_time_sec"])
    for pos, e in enumerate(entries, start=1):
        e["position"] = pos
        if pos > 1:
            e["interval_sec"] = round(e["cumulative_time_sec"] - entries[0]["cumulative_time_sec"], 3)
        else:
            e["interval_sec"] = 0.0

    race_time_sec = entries[0]["cumulative_time_sec"] if entries else 0.0

    return {
        "lap": lap,
        "max_lap": max_lap,
        "sector": sector,
        "sector_part": sector_part,
        "race_time_sec": race_time_sec,
        "circuit": detail["circuit"],
        "weather": detail["weather"],
        "cars": entries,
        "data_note": detail["data_note"],
    }
