from __future__ import annotations

import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap

from backend.app.services import data_service

MODEL_FILES = {
    "LinearRegression": "model_linear.pkl",
    "RandomForest": "model_random_forest.pkl",
    "XGBoost": "model_xgboost.pkl",
}


def root() -> Path:
    return data_service.root()


def models_ready() -> bool:
    return (root() / "models" / "final_model.pkl").exists()


def _load_pipe(name: str | None = None):
    if name and name in MODEL_FILES:
        fname = MODEL_FILES[name]
        p = root() / "models" / fname
        if p.exists():
            return joblib.load(p)

    meta_path = root() / "models" / "model_metadata.pkl"
    if meta_path.exists():
        try:
            meta = joblib.load(meta_path)
            best = meta.get("best_model")
            if name is None or name == best:
                final_p = root() / "models" / "final_model.pkl"
                if final_p.exists():
                    return joblib.load(final_p)
        except Exception:
            pass

    final_p = root() / "models" / "final_model.pkl"
    if final_p.exists():
        return joblib.load(final_p)
    return None


def feature_schema() -> dict:
    meta_path = root() / "models" / "model_metadata.pkl"
    ranges_path = root() / "results" / "feature_ranges.json"
    if not meta_path.exists():
        return {"available": False}
    meta = joblib.load(meta_path)
    ranges = data_service.read_json_result("feature_ranges.json") or {}
    return {"available": True, "features": meta.get("features", []), "target": meta.get("target"), "ranges": ranges}


def model_comparison() -> dict:
    rows = data_service.read_csv_result("model_comparison.csv")
    stats = data_service.read_json_result("dataset_statistics.json")
    exp = data_service.read_json_result("experiment_config.json")
    if not rows:
        return {"evaluated": False, "models": [], "message": "Run training: python -m backend.ml.pipeline"}
    best = min(rows, key=lambda r: r["RMSE"])
    return {
        "evaluated": True,
        "models": rows,
        "best_model": best["model"],
        "train_season": 2023,
        "test_season": 2024,
        "statistics": stats,
        "experiment": exp,
    }


def test_predictions_sample(n: int = 1500) -> list[dict]:
    p = root() / "results" / "test_predictions_enriched.csv"
    if not p.exists():
        p = root() / "results" / "test_predictions.csv"
    if not p.exists():
        return []
    df = pd.read_csv(p)
    if len(df) > n:
        df = df.sample(n, random_state=42)
    return df.replace({np.nan: None}).to_dict(orient="records")


def reliability_summary() -> dict:
    s = data_service.read_json_result("reliability_summary.json")
    if not s:
        return {"available": False, "message": "Reliability analysis not computed. Train models first."}
    return {"available": True, **s}


def reliability_details(limit: int = 2000) -> list[dict]:
    p = root() / "results" / "reliability_results.csv"
    if not p.exists():
        return []
    df = pd.read_csv(p)
    if len(df) > limit:
        df = df.sample(limit, random_state=42)
    return df.replace({np.nan: None}).to_dict(orient="records")


def shap_importance() -> list[dict]:
    return data_service.read_csv_result("shap_importance.csv") or []


def shap_explain(row_id: int | None = None, feature: str | None = None) -> dict:
    sample_path = root() / "results" / "shap_test_sample.csv"
    meta = joblib.load(root() / "models" / "model_metadata.pkl") if models_ready() else {}
    if not sample_path.exists() or not models_ready():
        return {"available": False, "message": "Train pipeline to generate SHAP sample and models."}

    df = pd.read_csv(sample_path)
    if row_id is None:
        row_id = int(df["row_id"].iloc[0])
    row = df[df["row_id"] == row_id]
    if row.empty:
        return {"available": False, "message": f"row_id {row_id} not found in shap_test_sample.csv"}

    best = meta.get("best_model", "RandomForest")
    pipe = _load_pipe(best)
    if pipe is None:
        return {"available": False, "message": "Model artifact missing."}

    features = meta.get("features", [])
    X = row[features]
    model = pipe.named_steps["model"]
    prep = pipe.named_steps["prep"]
    Xt = prep.transform(X)
    names = prep.get_feature_names_out()

    try:
        if best == "LinearRegression":
            masker = np.zeros((1, Xt.shape[1]))
            explainer = shap.LinearExplainer(model, masker)
        else:
            explainer = shap.TreeExplainer(model)
        sv = explainer.shap_values(Xt)
        if isinstance(sv, list):
            sv = sv[0]
        sv = np.array(sv).reshape(-1)
        base = float(np.atleast_1d(getattr(explainer, "expected_value", 0.0))[0])
    except Exception as e:
        return {"available": False, "message": f"SHAP explanation computation error: {e}"}
    pred = float(pipe.predict(X[features])[0])

    contributions = [
        {"feature": str(names[i]), "shap_value": float(sv[i]), "direction": "positive" if sv[i] >= 0 else "negative"}
        for i in range(len(names))
    ]
    contributions.sort(key=lambda x: abs(x["shap_value"]), reverse=True)

    dependence = None
    if feature:
        full = pd.read_csv(sample_path)
        if feature in full.columns:
            fidx = None
            for i, n in enumerate(names):
                if feature in str(n):
                    fidx = i
                    break
            if fidx is not None:
                sub = full.sample(min(300, len(full)), random_state=42)
                Xs = prep.transform(sub[features])
                svs = explainer.shap_values(Xs)
                if isinstance(svs, list):
                    svs = svs[0]
                dependence = [
                    {"x": float(sub[feature].iloc[i]), "shap": float(svs[i, fidx])}
                    for i in range(len(sub))
                    if not pd.isna(sub[feature].iloc[i])
                ]

    top = contributions[0] if contributions else None
    plain = (
        f"Model prediction {pred:.4f} (proxy units). Strongest contributor: {top['feature']} "
        f"({'increases' if top and top['shap_value'] >= 0 else 'decreases'} prediction)."
        if top
        else "No SHAP contributions available."
    )

    return {
        "available": True,
        "model": best,
        "row_id": row_id,
        "base_value": base,
        "prediction": pred,
        "actual": float(row[meta["target"]].iloc[0]) if meta.get("target") in row.columns else None,
        "contributions": contributions,
        "dependence": dependence,
        "plain_language": plain,
        "causal_disclaimer": "SHAP describes model behavior, not causal tyre physics.",
    }


def ablation() -> list[dict]:
    return data_service.read_csv_result("ablation_results.csv") or []


def stability() -> dict:
    runs = data_service.read_csv_result("stability_runs.csv")
    p = root() / "results" / "stability_summary.csv"
    summary = None
    if p.exists():
        summary = pd.read_csv(p).replace({np.nan: None}).to_dict(orient="records")[0]
    return {"runs": runs or [], "summary": summary}


def _prepare_payload(payload: dict, meta: dict) -> tuple[pd.DataFrame, list[str], list[str]]:
    features = meta["features"]
    row = {f: payload.get(f) for f in features}
    if row.get("tyre_age_squared") is None and "tyre_age" in row:
        row["tyre_age_squared"] = float(row["tyre_age"]) ** 2
    if row.get("rolling_prev_lap_time_mean_3") is None:
        row["rolling_prev_lap_time_mean_3"] = row.get("previous_lap_time")
    if row.get("rolling_prev_lap_time_std_3") is None:
        row["rolling_prev_lap_time_std_3"] = 0.0
    X = pd.DataFrame([row])
    warnings = []
    ranges = data_service.read_json_result("feature_ranges.json") or {}
    for f, spec in ranges.items():
        if f not in row or spec.get("type") != "numeric":
            continue
        v = float(row[f])
        if v < spec["p05"] or v > spec["p95"]:
            warnings.append(f"{f}={v} outside training p05–p95 [{spec['p05']:.3f}, {spec['p95']:.3f}]")
    return X, features, warnings


def predict(payload: dict, model_name: str | None = None) -> dict:
    if not models_ready():
        return {"ok": False, "error": "Model not trained. Run python -m backend.ml.pipeline from project root."}
    meta = joblib.load(root() / "models" / "model_metadata.pkl")
    name = model_name or meta.get("best_model")
    pipe = _load_pipe(name) or joblib.load(root() / "models" / "final_model.pkl")
    X, features, warnings = _prepare_payload(payload, meta)
    t0 = time.perf_counter()
    pred = float(pipe.predict(X[features])[0])
    infer_ms = round((time.perf_counter() - t0) * 1000, 2)
    q_hat = float(meta.get("conformal_q_hat", 0))
    lower = pred - q_hat
    upper = pred + q_hat
    shap_local = shap_explain_for_row(X, features, pipe, name)
    return {
        "ok": True,
        "predicted_degradation_proxy": pred,
        "units": "seconds lap-time change per tyre-age lap (proxy)",
        "lower_bound_90": lower,
        "upper_bound_90": upper,
        "interval_width": upper - lower,
        "uncertainty_note": (
            "90% split-conformal interval calibrated on 2023; empirical coverage on 2024 may differ under season shift."
        ),
        "model_version": name,
        "features_used": features,
        "input": X.iloc[0].to_dict(),
        "out_of_range_warnings": warnings,
        "inference_ms": infer_ms,
        "shap": shap_local,
    }


def shap_explain_for_row(X: pd.DataFrame, features: list[str], pipe, model_name: str) -> dict:
    try:
        model = pipe.named_steps["model"]
        prep = pipe.named_steps["prep"]
        Xt = prep.transform(X[features])
        names = prep.get_feature_names_out()
        if model_name == "LinearRegression":
            masker = np.zeros((1, Xt.shape[1]))
            ex = shap.LinearExplainer(model, masker)
        else:
            ex = shap.TreeExplainer(model)
        sv = ex.shap_values(Xt)
        if isinstance(sv, list):
            sv = sv[0]
        sv = np.array(sv).reshape(-1)
        contribs = [{"feature": str(names[i]), "shap_value": float(sv[i])} for i in range(len(names))]
        contribs.sort(key=lambda x: abs(x["shap_value"]), reverse=True)
        return {"available": True, "contributions": contribs[:12]}
    except Exception as e:
        return {"available": False, "message": str(e)}


def predict_compare(payload: dict) -> dict:
    if not models_ready():
        return {"ok": False, "error": "Models not trained."}
    meta = joblib.load(root() / "models" / "model_metadata.pkl")
    X, features, warnings = _prepare_payload(payload, meta)
    out = []
    for name in MODEL_FILES:
        pipe = _load_pipe(name)
        if pipe is None:
            continue
        pred = float(pipe.predict(X[features])[0])
        out.append({"model": name, "prediction": pred})
    if not out:
        best_name = meta.get("best_model", "SelectedModel")
        pipe = _load_pipe(best_name) or _load_pipe(None)
        if pipe is not None:
            pred = float(pipe.predict(X[features])[0])
            out.append({"model": best_name, "prediction": pred})
    return {"ok": True, "predictions": out, "out_of_range_warnings": warnings, "units": "proxy units"}
