"""Training pipeline: 2023 train, 2024 test. Saves models/ and results/."""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import RandomizedSearchCV
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBRegressor

RANDOM_SEED = 42
GROUP_STINT = ["year", "race", "driver_number", "session_key", "stint_number"]
GROUP_LAP = ["year", "race", "driver_number", "session_key", "lap_number"]

NUM_FEATURES = [
    "tyre_age",
    "lap_number",
    "stint_number",
    "tyre_age_at_start",
    "previous_lap_time",
    "track_temperature",
    "air_temperature",
    "humidity",
    "wind_speed",
    "rainfall",
    "rolling_prev_lap_time_mean_3",
    "rolling_prev_lap_time_std_3",
    "tyre_age_squared",
]
CAT_FEATURES = ["compound"]
FEATURES = NUM_FEATURES + CAT_FEATURES
TARGET = "TARGET"


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def build_preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        [
            (
                "num",
                Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]),
                NUM_FEATURES,
            ),
            (
                "cat",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
                    ]
                ),
                CAT_FEATURES,
            ),
        ]
    )


def load_and_clean(csv_path: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    df_raw = pd.read_csv(csv_path)
    log = []
    df = df_raw.copy()

    def record(step: str, n_before: int, n_after: int, reason: str) -> None:
        log.append({"step": step, "removed": n_before - n_after, "reason": reason, "remaining": n_after})

    n = len(df)
    df = df.drop_duplicates()
    record("exact_duplicate_rows", n, len(df), "Identical rows")

    n = len(df)
    df = df.drop_duplicates(subset=GROUP_LAP, keep="first")
    record("duplicate_session_lap", n, len(df), "Duplicate session lap keys")

    n = len(df)
    df = df[~df["is_pit_out_lap"]]
    record("pit_out_laps", n, len(df), "Pit-out laps excluded")

    n = len(df)
    df = df[(df["lap_time_sec"] >= 60) & (df["lap_time_sec"] <= 200)]
    record("invalid_lap_time", n, len(df), "Lap time outside 60–200 s")

    df = df.sort_values(GROUP_STINT + ["lap_number"]).reset_index(drop=True)
    g = df.groupby(GROUP_STINT, sort=False)
    df["tyre_age_prev"] = g["tyre_age"].shift(1)
    df["delta_tyre_age"] = df["tyre_age"] - df["tyre_age_prev"]

    n = len(df)
    df = df[df["delta_tyre_age"] > 0]
    record("no_tyre_age_increment", n, len(df), "Requires tyre age increment")

    n = len(df)
    df = df[df["previous_lap_time"].notna()]
    record("missing_previous_lap", n, len(df), "Requires previous lap time")

    df["degradation_proxy"] = (df["lap_time_sec"] - df["previous_lap_time"]) / df["delta_tyre_age"]
    both = df["degradation_rate"].notna()
    corr = float(df.loc[both, "degradation_proxy"].corr(df.loc[both, "degradation_rate"])) if both.any() else None
    mae_cmp = float((df.loc[both, "degradation_proxy"] - df.loc[both, "degradation_rate"]).abs().mean()) if both.any() else None

    n = len(df)
    q_low, q_high = df["degradation_proxy"].quantile([0.005, 0.995])
    df = df[(df["degradation_proxy"] >= q_low) & (df["degradation_proxy"] <= q_high)]
    record("proxy_outliers", n, len(df), f"Outside 0.5–99.5 pct [{q_low:.3f}, {q_high:.3f}]")

    df[TARGET] = df["degradation_proxy"]
    g = df.groupby(GROUP_STINT, sort=False)
    df["rolling_prev_lap_time_mean_3"] = g["lap_time_sec"].transform(
        lambda s: s.shift(1).rolling(3, min_periods=1).mean()
    )
    df["rolling_prev_lap_time_std_3"] = g["lap_time_sec"].transform(
        lambda s: s.shift(1).rolling(3, min_periods=2).std()
    )
    df["tyre_age_squared"] = df["tyre_age"] ** 2

    root = project_root()
    pd.DataFrame(log).to_csv(root / "results" / "cleaning_log.csv", index=False)
    meta = {
        "target_definition": (
            "TARGET = (lap_time_sec - previous_lap_time) / delta_tyre_age; "
            "lap-time tyre degradation proxy, not physical wear."
        ),
        "degradation_rate_vs_proxy_corr": corr,
        "degradation_rate_vs_proxy_mae": mae_cmp,
        "raw_rows": int(len(df_raw)),
        "clean_rows": int(len(df)),
    }
    with open(root / "results" / "target_metadata.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    return df_raw, df


def metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    return {
        "MAE": float(mean_absolute_error(y_true, y_pred)),
        "RMSE": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "R2": float(r2_score(y_true, y_pred)),
    }


def conformal_quantile(scores: np.ndarray, alpha: float = 0.1) -> float:
    """Split conformal: (1-alpha) quantile with finite-sample correction."""
    n = len(scores)
    q_level = np.ceil((n + 1) * (1 - alpha)) / n
    q_level = min(q_level, 1.0)
    return float(np.quantile(scores, q_level, method="higher"))


def train_all(csv_path: Path | None = None) -> dict:
    np.random.seed(RANDOM_SEED)
    root = project_root()
    csv_path = csv_path or root / "data" / "F1_Tyre_Degradation_Dataset_2023_2024.csv"
    (root / "models").mkdir(exist_ok=True)
    (root / "results").mkdir(exist_ok=True)

    _, df = load_and_clean(csv_path)
    train = df[df["year"] == 2023].copy()
    test = df[df["year"] == 2024].copy()
    X_train, y_train = train[FEATURES], train[TARGET]
    X_test, y_test = test[FEATURES], test[TARGET]

    results = []
    preds: dict[str, np.ndarray] = {}
    pipes: dict[str, Pipeline] = {}

    timings: dict[str, float] = {}
    t0 = time.perf_counter()
    lr = Pipeline([("prep", build_preprocessor()), ("model", LinearRegression())])
    lr.fit(X_train, y_train)
    timings["LinearRegression_train_sec"] = round(time.perf_counter() - t0, 3)
    pred = lr.predict(X_test)
    m = metrics(y_test, pred)
    m.update({"model": "LinearRegression", "train_season": 2023, "test_season": 2024, "status": "evaluated"})
    results.append(m)
    preds["LinearRegression"] = pred
    pipes["LinearRegression"] = lr

    rf_search = RandomizedSearchCV(
        Pipeline([("prep", build_preprocessor()), ("model", RandomForestRegressor(random_state=RANDOM_SEED, n_jobs=-1))]),
        {"model__n_estimators": [200, 300], "model__max_depth": [12, 16, None], "model__min_samples_leaf": [2, 5]},
        n_iter=8,
        cv=3,
        scoring="neg_root_mean_squared_error",
        random_state=RANDOM_SEED,
        n_jobs=-1,
    )
    t0 = time.perf_counter()
    rf_search.fit(X_train, y_train)
    timings["RandomForest_train_sec"] = round(time.perf_counter() - t0, 3)
    rf_pipe = rf_search.best_estimator_
    pred = rf_pipe.predict(X_test)
    m = metrics(y_test, pred)
    m.update({"model": "RandomForest", "train_season": 2023, "test_season": 2024, "status": "evaluated"})
    results.append(m)
    preds["RandomForest"] = pred
    pipes["RandomForest"] = rf_pipe

    xgb_search = RandomizedSearchCV(
        Pipeline(
            [
                ("prep", build_preprocessor()),
                ("model", XGBRegressor(objective="reg:squarederror", random_state=RANDOM_SEED, n_jobs=-1)),
            ]
        ),
        {
            "model__n_estimators": [200, 300],
            "model__max_depth": [4, 6, 8],
            "model__learning_rate": [0.05, 0.1],
            "model__subsample": [0.8, 0.9],
        },
        n_iter=8,
        cv=3,
        scoring="neg_root_mean_squared_error",
        random_state=RANDOM_SEED,
        n_jobs=-1,
    )
    t0 = time.perf_counter()
    xgb_search.fit(X_train, y_train)
    timings["XGBoost_train_sec"] = round(time.perf_counter() - t0, 3)
    xgb_pipe = xgb_search.best_estimator_
    pred = xgb_pipe.predict(X_test)
    m = metrics(y_test, pred)
    m.update({"model": "XGBoost", "train_season": 2023, "test_season": 2024, "status": "evaluated"})
    results.append(m)
    preds["XGBoost"] = pred
    pipes["XGBoost"] = xgb_pipe

    comp_df = pd.DataFrame(results)
    comp_df.to_csv(root / "results" / "model_comparison.csv", index=False)
    best_name = comp_df.sort_values("RMSE").iloc[0]["model"]
    final_pipe = pipes[best_name]
    y_pred = preds[best_name]

    # Segment metrics
    test_eval = test.copy()
    test_eval["y_true"] = y_test.values
    test_eval["y_pred"] = y_pred

    def segment(col: str, min_n: int = 100) -> pd.DataFrame:
        rows = []
        for seg, g in test_eval.groupby(col):
            if len(g) < min_n:
                continue
            mm = metrics(g["y_true"].values, g["y_pred"].values)
            mm[col] = seg
            mm["n"] = int(len(g))
            rows.append(mm)
        return pd.DataFrame(rows)

    segment("compound", 80).to_csv(root / "results" / "compound_results.csv", index=False)
    segment("circuit", 200).to_csv(root / "results" / "circuit_results.csv", index=False)

    # Split conformal on 2023 (last 20% races by name order for calibration)
    races_2023 = sorted(train["race"].unique())
    cal_races = set(races_2023[int(len(races_2023) * 0.8) :])
    tr_mask = ~train["race"].isin(cal_races)
    cal = train[~tr_mask]
    tr = train[tr_mask]
    cal_pipe = Pipeline(
        [
            ("prep", build_preprocessor()),
            (
                "model",
                RandomForestRegressor(n_estimators=200, max_depth=16, min_samples_leaf=5, random_state=RANDOM_SEED, n_jobs=-1),
            ),
        ]
    )
    cal_pipe.fit(tr[FEATURES], tr[TARGET])
    cal_pred = cal_pipe.predict(cal[FEATURES])
    scores = np.abs(cal[TARGET].values - cal_pred)
    q_hat = conformal_quantile(scores, alpha=0.1)

    test_pred = cal_pipe.predict(X_test)
    lower = test_pred - q_hat
    upper = test_pred + q_hat
    covered = float(((y_test.values >= lower) & (y_test.values <= upper)).mean())
    width = upper - lower
    rel = pd.DataFrame(
        {
            "predicted": test_pred,
            "lower_90": lower,
            "upper_90": upper,
            "interval_width": width,
            "actual": y_test.values,
            "abs_error": np.abs(y_test.values - test_pred),
            "compound": test["compound"].values,
            "circuit": test["circuit"].values,
        }
    )
    rel.to_csv(root / "results" / "reliability_results.csv", index=False)
    rel_summary = {
        "method": "split_conformal",
        "confidence_level": 0.9,
        "calibration_season": 2023,
        "calibration_fraction": "last 20% of 2023 races",
        "q_hat": q_hat,
        "empirical_coverage_2024": covered,
        "mean_interval_width": float(width.mean()),
        "corr_abs_error_width": float(np.corrcoef(rel["abs_error"], width)[0, 1]),
        "assumptions": (
            "Exchangeability between calibration and test data; coverage may degrade under 2023→2024 shift."
        ),
    }
    with open(root / "results" / "reliability_summary.json", "w", encoding="utf-8") as f:
        json.dump(rel_summary, f, indent=2)

    # Stability
    stab_rows = []
    for seed in [42, 7, 123, 2023, 999]:
        p = Pipeline(
            [
                ("prep", build_preprocessor()),
                (
                    "model",
                    RandomForestRegressor(
                        n_estimators=200, max_depth=16, min_samples_leaf=5, random_state=seed, n_jobs=-1
                    ),
                ),
            ]
        )
        p.fit(X_train, y_train)
        pr = p.predict(X_test)
        mm = metrics(y_test, pr)
        mm["seed"] = seed
        stab_rows.append(mm)
    stab = pd.DataFrame(stab_rows)
    stab.to_csv(root / "results" / "stability_runs.csv", index=False)
    pd.DataFrame(
        [
            {
                "MAE_mean": stab["MAE"].mean(),
                "MAE_std": stab["MAE"].std(),
                "RMSE_mean": stab["RMSE"].mean(),
                "RMSE_std": stab["RMSE"].std(),
                "R2_mean": stab["R2"].mean(),
                "R2_std": stab["R2"].std(),
            }
        ]
    ).to_csv(root / "results" / "stability_summary.csv", index=False)

    # Ablation
    groups = {
        "A_tyre_only": ["tyre_age", "tyre_age_squared", "tyre_age_at_start", "compound"],
        "B_tyre_lap": [
            "tyre_age",
            "tyre_age_squared",
            "tyre_age_at_start",
            "compound",
            "lap_number",
            "stint_number",
            "previous_lap_time",
            "rolling_prev_lap_time_mean_3",
            "rolling_prev_lap_time_std_3",
        ],
        "C_tyre_weather": [
            "tyre_age",
            "tyre_age_squared",
            "tyre_age_at_start",
            "compound",
            "track_temperature",
            "air_temperature",
            "humidity",
            "wind_speed",
            "rainfall",
        ],
        "D_all": FEATURES,
    }
    ab_rows = []
    for exp, cols in groups.items():
        num_c = [c for c in cols if c in NUM_FEATURES]
        cat_c = [c for c in cols if c in CAT_FEATURES]
        prep = ColumnTransformer(
            [
                (
                    "num",
                    Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]),
                    num_c,
                ),
                (
                    "cat",
                    Pipeline(
                        [
                            ("imputer", SimpleImputer(strategy="most_frequent")),
                            ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
                        ]
                    ),
                    cat_c,
                ),
            ]
        )
        p = Pipeline(
            [
                ("prep", prep),
                (
                    "model",
                    RandomForestRegressor(
                        n_estimators=200, max_depth=16, min_samples_leaf=5, random_state=RANDOM_SEED, n_jobs=-1
                    ),
                ),
            ]
        )
        p.fit(X_train[cols], y_train)
        pr = p.predict(X_test[cols])
        mm = metrics(y_test, pr)
        mm["experiment"] = exp
        mm["n_train"] = len(train)
        mm["n_test"] = len(test)
        ab_rows.append(mm)
    pd.DataFrame(ab_rows).to_csv(root / "results" / "ablation_results.csv", index=False)

    # SHAP importance (mean |shap|) on sample
    import shap

    sample = X_test.sample(min(800, len(X_test)), random_state=RANDOM_SEED)
    tree_pipe = final_pipe if best_name in ("RandomForest", "XGBoost") else rf_pipe
    Xt = tree_pipe.named_steps["prep"].transform(sample)
    names = tree_pipe.named_steps["prep"].get_feature_names_out()
    explainer = shap.TreeExplainer(tree_pipe.named_steps["model"])
    sv = explainer.shap_values(Xt)
    imp = np.abs(sv).mean(axis=0)
    shap_df = pd.DataFrame({"feature": names, "mean_abs_shap": imp}).sort_values("mean_abs_shap", ascending=False)
    shap_df.to_csv(root / "results" / "shap_importance.csv", index=False)

    # Save predictions for charts
    pred_cols = [
        "year",
        "race",
        "circuit",
        "compound",
        "tyre_age",
        "stint_number",
        "driver",
        "team_name",
        "track_temperature",
        "air_temperature",
        "humidity",
        "wind_speed",
        "rainfall",
        TARGET,
    ]
    pred_out = test_eval[pred_cols].copy()
    pred_out["predicted"] = y_pred
    pred_out["residual"] = pred_out[TARGET] - pred_out["predicted"]
    pred_out.to_csv(root / "results" / "test_predictions.csv", index=False)
    pred_out.to_csv(root / "results" / "test_predictions_enriched.csv", index=False)

    # SHAP sample rows for local explanations (2024 test)
    shap_idx = X_test.sample(min(500, len(X_test)), random_state=RANDOM_SEED).index
    shap_sample = X_test.loc[shap_idx].copy()
    shap_sample.insert(0, "row_id", range(len(shap_sample)))
    shap_sample[TARGET] = y_test.loc[shap_idx].values
    shap_sample.to_csv(root / "results" / "shap_test_sample.csv", index=False)

    feature_ranges = {}
    for col in FEATURES:
        if col in train.columns:
            s = train[col]
            if s.dtype == object:
                feature_ranges[col] = {"type": "categorical", "values": sorted(s.dropna().unique().tolist())}
            else:
                feature_ranges[col] = {
                    "type": "numeric",
                    "min": float(s.min()),
                    "max": float(s.max()),
                    "p05": float(s.quantile(0.05)),
                    "p95": float(s.quantile(0.95)),
                }
    with open(root / "results" / "feature_ranges.json", "w", encoding="utf-8") as f:
        json.dump(feature_ranges, f, indent=2)

    joblib.dump(final_pipe, root / "models" / "final_model.pkl")
    joblib.dump(lr, root / "models" / "model_linear.pkl")
    joblib.dump(rf_pipe, root / "models" / "model_random_forest.pkl")
    joblib.dump(xgb_pipe, root / "models" / "model_xgboost.pkl")
    joblib.dump(
        {
            "features": FEATURES,
            "target": TARGET,
            "best_model": best_name,
            "random_seed": RANDOM_SEED,
            "conformal_q_hat": q_hat,
        },
        root / "models" / "model_metadata.pkl",
    )
    joblib.dump(cal_pipe, root / "models" / "conformal_model.pkl")

    experiment = {
        "available": True,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "random_seed": RANDOM_SEED,
        "temporal_split": {"train_season": 2023, "test_season": 2024},
        "train_n": int(len(train)),
        "test_n": int(len(test)),
        "features": FEATURES,
        "target": TARGET,
        "target_definition": (
            "TARGET = (lap_time_sec - previous_lap_time) / delta_tyre_age; lap-time degradation proxy."
        ),
        "preprocessing": "Median/mode imputation + standard scaling (numeric) + one-hot (compound); fit on 2023 only.",
        "models": {
            "LinearRegression": {"best_params": {}, "train_sec": timings.get("LinearRegression_train_sec")},
            "RandomForest": {"best_params": rf_search.best_params_, "train_sec": timings.get("RandomForest_train_sec")},
            "XGBoost": {"best_params": xgb_search.best_params_, "train_sec": timings.get("XGBoost_train_sec")},
        },
        "selected_model": best_name,
        "comparison": results,
    }
    with open(root / "results" / "experiment_config.json", "w", encoding="utf-8") as f:
        json.dump(experiment, f, indent=2, default=str)

    stats = {
        "train_n": int(len(train)),
        "test_n": int(len(test)),
        "selected_model": best_name,
        "target_mean": float(df[TARGET].mean()),
        "target_std": float(df[TARGET].std()),
    }
    with open(root / "results" / "dataset_statistics.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)

    return {"best_model": best_name, "comparison": results, "reliability": rel_summary}


if __name__ == "__main__":
    train_all()
