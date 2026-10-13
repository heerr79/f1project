# F1 Tyre Degradation Research Platform

Full-stack research application for **“A Reliability-Aware Machine Learning Framework for Predicting Tyre Degradation in Formula 1 Racing”**.

- **Frontend:** React + TypeScript + Vite + Tailwind CSS + Recharts  
- **Backend:** FastAPI + scikit-learn + XGBoost + SHAP  
- **Data:** Real lap-level CSV (`2023` train · `2024` hold-out test)

## How to see the website

You need **two terminals** (backend + frontend).

### 1. Python backend (port 8000)

```powershell
cd c:\Users\Arjun\Desktop\f1project\f1-tyre-degradation
pip install -r requirements.txt
python -m backend.ml.pipeline
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Open API docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 2. React frontend (port 5173)

```powershell
cd c:\Users\Arjun\Desktop\f1project\f1-tyre-degradation\frontend
npm install
npm run dev
```

Open the app: **[http://127.0.0.1:5173](http://127.0.0.1:5173)**

The Vite dev server proxies `/api/*` to the FastAPI backend.

## Project structure

```
f1-tyre-degradation/
├── frontend/          # React UI (8 pages)
├── backend/           # FastAPI + ML pipeline
├── data/              # Original CSV (not overwritten)
├── models/            # Trained pipelines
├── results/           # Metrics CSV/JSON
├── plots/             # Optional exported figures
└── notebooks/         # Colab / analysis
```

## Research integrity

- Metrics come from `results/` after running `python -m backend.ml.pipeline`.
- Target is a **lap-time degradation proxy**, not direct physical tyre wear.
- No 2024 data in training or hyperparameter tuning.
- Split-conformal intervals are calibrated on 2023; 2024 coverage is empirical only.

## Pages

1. Research Overview  
2. Dataset Explorer  
3. Tyre Degradation Analysis  
4. Model Comparison  
5. Compound & Circuit Analysis  
6. Reliability & Uncertainty  
7. Explainability & Experiments  
8. Interactive Prediction  

## Troubleshooting

| Issue | Fix |
|--------|-----|
| Frontend shows errors / empty metrics | Start backend on port 8000 and run training pipeline |
| `ModuleNotFoundError: backend` | Run commands from `f1-tyre-degradation` root |
| Dataset missing | Place `F1_Tyre_Degradation_Dataset_2023_2024.csv` in `data/` |
