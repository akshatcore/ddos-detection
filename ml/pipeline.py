"""
End-to-end detection pipeline: features -> model -> backend incident.

This is the missing "step 6" glue the README's build order calls for:
    capture -> feature_extraction -> ml (this file) -> backend -> dashboard

It reads the flow-window features produced by
feature_extraction/build_features.py, scores every row with the trained
RandomForest bundle, and for each row POSTs the flow + prediction to the
backend's POST /alerts/evaluate endpoint. The backend's AlertEngine then
decides whether to open an Incident, which immediately shows up on the
React dashboard (Incidents / Threat Hunting pages) - no manual step needed.

Usage:
    python3 pipeline.py \
        --features ../data/flow_features.csv \
        --backend-url http://localhost:8000 \
        --email admin@local --password 'Admin123!'

Run this on a loop (e.g. every WINDOW_SECONDS via cron/systemd timer) right
after build_features.py to get near-real-time detection without needing the
full packet-capture VM lab set up - it also works on any CSV that has the
11 FEATURE_COLUMNS, including a hand-crafted "attack replay" CSV for demos.
"""

from pathlib import Path
import argparse
import logging

import joblib
import pandas as pd
import requests

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
DEFAULT_MODEL_PATH = REPO_ROOT / "models" / "random_forest_v1.0.joblib"
DEFAULT_FEATURES_PATH = REPO_ROOT / "data" / "flow_features.csv"

logger = logging.getLogger(__name__)


def parse_args():
    parser = argparse.ArgumentParser(description="Score flow features and push alerts to the backend")
    parser.add_argument("--model", default=str(DEFAULT_MODEL_PATH))
    parser.add_argument("--features", default=str(DEFAULT_FEATURES_PATH))
    parser.add_argument("--backend-url", default="http://localhost:8000")
    parser.add_argument("--email", default="admin@local", help="Seeded default admin account")
    parser.add_argument("--password", default="Admin123!")
    parser.add_argument("--threshold", type=float, default=0.5, help="Attack probability threshold to bother pushing")
    return parser.parse_args()


def login(backend_url: str, email: str, password: str) -> str:
    resp = requests.post(f"{backend_url}/auth/login", json={"email": email, "password": password}, timeout=10)
    resp.raise_for_status()
    return resp.json()["access_token"]


def score(model_path: Path, features_path: Path):
    bundle = joblib.load(model_path)
    model = bundle["model"]
    feature_columns = bundle["features"]
    label_encoder = bundle.get("label_encoder")

    df = pd.read_csv(features_path)
    missing = [c for c in feature_columns if c not in df.columns]
    if missing:
        raise ValueError(
            f"Feature file is missing required columns: {missing}. "
            "Regenerate it with the current feature_extraction/build_features.py."
        )

    X = df[feature_columns]
    probabilities = model.predict_proba(X)
    predicted_indices = model.predict(X)
    class_names = list(label_encoder.classes_) if label_encoder is not None else [str(i) for i in range(probabilities.shape[1])]
    predicted_labels = label_encoder.inverse_transform(predicted_indices) if label_encoder is not None else predicted_indices

    benign_index = next((i for i, name in enumerate(class_names) if str(name).lower() == "benign"), None)
    if benign_index is not None:
        attack_probability = 1.0 - probabilities[:, benign_index]
    else:
        attack_probability = probabilities.max(axis=1)

    df = df.copy()
    df["predicted_label"] = predicted_labels
    df["confidence"] = probabilities.max(axis=1)
    df["attack_probability"] = attack_probability
    return df


def push_alerts(df: pd.DataFrame, backend_url: str, token: str, threshold: float):
    headers = {"Authorization": f"Bearer {token}"}
    pushed, triggered = 0, 0

    for _, row in df.iterrows():
        if row["attack_probability"] < threshold:
            continue

        duration_seconds = max(float(row.get("Flow Duration", 0)) / 1_000_000, 1e-6)
        packet_count = int(row.get("Total Fwd Packets", 0) + row.get("Total Backward Packets", 0))
        byte_count = int(row.get("Fwd Packets Length Total", 0) + row.get("Bwd Packets Length Total", 0))
        packet_rate = packet_count / duration_seconds

        flow_payload = {
            "src_ip": row.get("src_ip", "unknown"),
            "dst_ip": row.get("dst_ip", "unknown"),
            "protocol": row.get("protocol", "TCP"),
            "packet_count": packet_count,
            "byte_count": byte_count,
            "packet_rate": packet_rate,
            "flow_duration": duration_seconds,
            "feature_snapshot": {k: row[k] for k in row.index if k not in ("src_ip", "dst_ip", "protocol")},
        }
        prediction_payload = {
            "predicted_label": row["predicted_label"],
            "confidence": float(row["confidence"]),
            "attack_probability": float(row["attack_probability"]),
            "packet_rate": packet_rate,
        }

        resp = requests.post(
            f"{backend_url}/alerts/evaluate",
            json={"flow": flow_payload, "prediction": prediction_payload},
            headers=headers,
            timeout=10,
        )
        resp.raise_for_status()
        pushed += 1
        if resp.json().get("alert_triggered"):
            triggered += 1
            logger.warning("Incident opened for %s -> %s (%s, %.2f confidence)",
                            flow_payload["src_ip"], flow_payload["dst_ip"], row["predicted_label"], row["confidence"])

    logger.info("Pushed %s flows to backend, %s triggered incidents", pushed, triggered)


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
    args = parse_args()

    scored = score(Path(args.model), Path(args.features))
    logger.info("Scored %s flow windows", len(scored))

    token = login(args.backend_url, args.email, args.password)
    push_alerts(scored, args.backend_url, token, args.threshold)


if __name__ == "__main__":
    main()
