from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import PlainTextResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.app.services import analytics_service, data_service, ml_service, replay_service

app = FastAPI(
    title="F1 Tyre Degradation Research API",
    description="Reliability-aware ML API for lap-level tyre degradation proxy analysis.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    model_name: str | None = None
    compound: str
    tyre_age: float
    lap_number: int
    stint_number: int
    tyre_age_at_start: int = 0
    previous_lap_time: float
    track_temperature: float
    air_temperature: float
    humidity: float
    wind_speed: float
    rainfall: int = 0
    rolling_prev_lap_time_mean_3: float | None = None
    rolling_prev_lap_time_std_3: float | None = None
    tyre_age_squared: float | None = Field(default=None)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "dataset": data_service.dataset_loaded(),
        "models": ml_service.models_ready(),
    }


@app.get("/api/dataset/summary")
def dataset_summary():
    try:
        return data_service.summary()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.get("/api/dataset/columns")
def dataset_columns():
    try:
        return {"columns": data_service.columns_info()}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.get("/api/dataset/missing-values")
def dataset_missing():
    try:
        return {"missing": data_service.missing_values()}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.get("/api/dataset/filters")
def dataset_filters():
    try:
        return data_service.filters_meta()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.get("/api/dataset/laps")
def dataset_laps(
    season: int | None = None,
    race: str | None = None,
    circuit: str | None = None,
    driver: str | None = None,
    team: str | None = None,
    compound: str | None = None,
    stint: int | None = None,
    search: str | None = None,
    tyre_age_min: float | None = None,
    tyre_age_max: float | None = None,
    limit: int = Query(50, le=500),
    offset: int = 0,
    sort_by: str = "lap_number",
    sort_dir: str = "asc",
):
    try:
        return analytics_service.filter_laps(
            season,
            race,
            circuit,
            driver,
            team,
            compound,
            stint,
            search,
            limit,
            offset,
            sort_by,
            sort_dir,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.get("/api/dataset/quality")
def dataset_quality():
    try:
        return analytics_service.data_quality()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.get("/api/dataset/dictionary")
def dataset_dictionary():
    return {"dictionary": analytics_service.DATA_DICTIONARY}


@app.get("/api/dataset/export")
def dataset_export(
    season: int | None = None,
    race: str | None = None,
    driver: str | None = None,
    team: str | None = None,
    compound: str | None = None,
    stint: int | None = None,
    search: str | None = None,
):
    try:
        csv_text = analytics_service.export_laps_csv(
            season=season, race=race, driver=driver, team=team, compound=compound, stint=stint, search=search
        )
        return PlainTextResponse(csv_text, media_type="text/csv")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.get("/api/dataset/chart-filtered/{column}")
def dataset_chart_filtered(
    column: str,
    bins: int = 40,
    season: int | None = None,
    race: str | None = None,
    driver: str | None = None,
    team: str | None = None,
    compound: str | None = None,
    stint: int | None = None,
):
    try:
        return analytics_service.chart_filtered(
            column, bins, season=season, race=race, driver=driver, team=team, compound=compound, stint=stint
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.get("/api/dataset/chart/{column}")
def dataset_chart(column: str, bins: int = 40):
    try:
        return data_service.chart_histogram(column, bins)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.post("/api/dataset/upload")
async def upload_dataset(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="CSV file required")
    dest = data_service.root() / "data" / data_service.CSV_NAME
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    data_service.load_raw.cache_clear()
    return {"ok": True, "path": str(dest)}


@app.get("/api/analysis/degradation")
def analysis_degradation(
    season: int | None = None,
    race: str | None = None,
    circuit: str | None = None,
    compound: str | None = None,
    driver: str | None = None,
    stint: int | None = None,
):
    try:
        return analytics_service.degradation_extended(season, race, circuit, compound, driver, stint)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.get("/api/analysis/subgroups")
def analysis_subgroups():
    return analytics_service.subgroup_errors()


@app.get("/api/reliability/bootstrap")
def reliability_bootstrap():
    return analytics_service.bootstrap_metric_ci()


@app.get("/api/experiments/manifest")
def experiments_manifest():
    return analytics_service.experiment_manifest()


@app.get("/api/models/schema")
def models_schema():
    return ml_service.feature_schema()


@app.get("/api/explainability/shap")
def explainability_shap(row_id: int | None = None, feature: str | None = None):
    return ml_service.shap_explain(row_id, feature)


@app.get("/api/explainability/sample-rows")
def explainability_sample_rows():
    p = data_service.root() / "results" / "shap_test_sample.csv"
    if not p.exists():
        return {"available": False, "rows": []}
    import pandas as pd

    df = pd.read_csv(p)[["row_id", "compound", "tyre_age", "lap_number", "stint_number"]].head(100)
    return {"available": True, "rows": df.replace({float("nan"): None}).to_dict(orient="records")}


@app.post("/api/predict/compare")
def predict_compare(req: PredictRequest):
    payload = req.model_dump()
    result = ml_service.predict_compare(payload)
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail=result.get("error"))
    return result


@app.get("/api/models/comparison")
def models_comparison():
    return ml_service.model_comparison()


@app.get("/api/models/predictions")
def models_predictions(sample: int = Query(1500, le=5000)):
    return {"predictions": ml_service.test_predictions_sample(sample)}


@app.get("/api/analysis/compounds")
def analysis_compounds():
    rows = data_service.read_csv_result("compound_results.csv")
    if not rows:
        return {"evaluated": False, "compounds": []}
    return {"evaluated": True, "compounds": rows}


@app.get("/api/analysis/circuits")
def analysis_circuits():
    rows = data_service.read_csv_result("circuit_results.csv")
    if not rows:
        return {"evaluated": False, "circuits": []}
    return {"evaluated": True, "circuits": rows}


@app.get("/api/reliability/summary")
def reliability_summary():
    return ml_service.reliability_summary()


@app.get("/api/reliability/details")
def reliability_details(limit: int = Query(2000, le=10000)):
    return {"rows": ml_service.reliability_details(limit)}


@app.get("/api/explainability/importance")
def explainability():
    rows = ml_service.shap_importance()
    return {"available": bool(rows), "importance": rows}


@app.get("/api/experiments/ablation")
def experiments_ablation():
    rows = ml_service.ablation()
    return {"available": bool(rows), "experiments": rows}


@app.get("/api/experiments/stability")
def experiments_stability():
    return ml_service.stability()


@app.get("/api/replay/sessions")
def replay_sessions(limit: int = Query(80, le=200)):
    try:
        return {"sessions": replay_service.list_sessions(limit)}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.get("/api/replay/session")
def replay_session(
    year: int = Query(...),
    race: str = Query(...),
    session_key: int = Query(...),
):
    try:
        return replay_service.session_detail(year, race, session_key)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.get("/api/replay/frame")
def replay_frame(
    year: int = Query(...),
    race: str = Query(...),
    session_key: int = Query(...),
    lap: int = Query(1, ge=1),
    sector: int = Query(1, ge=1, le=3),
    sector_part: float = Query(0.0, ge=0.0, le=1.0),
):
    try:
        return replay_service.replay_frame(year, race, session_key, lap, sector, sector_part)
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.post("/api/predict")
def predict(req: PredictRequest):
    payload = req.model_dump()
    if payload.get("tyre_age_squared") is None:
        payload["tyre_age_squared"] = payload["tyre_age"] ** 2
    if payload.get("rolling_prev_lap_time_mean_3") is None:
        payload["rolling_prev_lap_time_mean_3"] = payload["previous_lap_time"]
    if payload.get("rolling_prev_lap_time_std_3") is None:
        payload["rolling_prev_lap_time_std_3"] = 0.0
    result = ml_service.predict(payload, model_name=req.model_name)
    if not result.get("ok"):
        raise HTTPException(status_code=503, detail=result.get("error"))
    return result
