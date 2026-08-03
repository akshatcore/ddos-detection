import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import pandas as pd


logger = logging.getLogger(__name__)
app = FastAPI(title="DDoS ML Service")
DEFAULT_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "random_forest_v1.0.joblib"


class PredictRequest(BaseModel):
    features: dict


def load_model(model_path: Path = DEFAULT_MODEL_PATH):
    if not model_path.exists():
        raise FileNotFoundError(f"Model bundle not found at {model_path}")
    return joblib.load(model_path)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict")
def predict(payload: PredictRequest):
    try:
        bundle = load_model()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    model = bundle["model"]
    feature_columns = bundle["features"]
    label_encoder = bundle.get("label_encoder")

    frame = pd.DataFrame([payload.features])
    missing = [column for column in feature_columns if column not in frame.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing features: {missing}")

    frame = frame[feature_columns]
    prediction = model.predict(frame)[0]
    confidence = float(model.predict_proba(frame).max())
    label = label_encoder.inverse_transform([prediction])[0] if label_encoder is not None else str(prediction)

    logger.info("Prediction completed with label=%s confidence=%.4f", label, confidence)
    return {"predicted_label": label, "confidence": confidence}
