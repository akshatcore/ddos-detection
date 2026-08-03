"""
Live DDoS detection for cloud-network traffic.

This script loads a trained model bundle and scores one or more feature rows,
which are typically produced by feature_extraction/build_features.py.

Usage:
    python3 detect_live.py --model ../models/random_forest_v1.0.joblib --features ../data/flow_features.csv
"""

from pathlib import Path
import argparse
import logging

import joblib
import pandas as pd


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
DEFAULT_MODEL_PATH = REPO_ROOT / "models" / "random_forest_v1.0.joblib"
DEFAULT_FEATURES_PATH = REPO_ROOT / "data" / "flow_features.csv"
logger = logging.getLogger(__name__)


def parse_args():
    parser = argparse.ArgumentParser(description="Score live flow features with a trained DDoS model")
    parser.add_argument("--model", default=str(DEFAULT_MODEL_PATH), help="Path to the saved joblib model bundle")
    parser.add_argument("--features", default=str(DEFAULT_FEATURES_PATH), help="CSV file containing extracted flow features")
    parser.add_argument("--threshold", type=float, default=0.5, help="Attack probability threshold")
    return parser.parse_args()


def load_bundle(model_path):
    bundle = joblib.load(model_path)
    if not isinstance(bundle, dict) or "model" not in bundle or "features" not in bundle:
        raise ValueError("Model bundle is missing the expected keys: model, features")
    return bundle


def score_flows(model_path, features_path, threshold):
    bundle = load_bundle(model_path)
    model = bundle["model"]
    feature_columns = bundle["features"]
    label_encoder = bundle.get("label_encoder")

    if not features_path.exists():
        raise FileNotFoundError(f"Feature file not found: {features_path}")

    df = pd.read_csv(features_path)
    missing = [column for column in feature_columns if column not in df.columns]
    if missing:
        raise ValueError(f"Feature file is missing required columns: {missing}")

    X = df[feature_columns].copy()
    probabilities = model.predict_proba(X)
    predicted_indices = probabilities.argmax(axis=1)
    predicted_labels = model.predict(X)

    if label_encoder is not None:
        predicted_names = label_encoder.inverse_transform(predicted_labels)
        class_names = list(label_encoder.classes_)
    else:
        predicted_names = predicted_labels
        class_names = [str(index) for index in range(probabilities.shape[1])]

    results = df.copy()
    results["predicted_label"] = predicted_names
    results["predicted_index"] = predicted_indices

    benign_index = next((index for index, class_name in enumerate(class_names) if str(class_name).lower() == "benign"), None)
    if benign_index is not None:
        results["attack_probability"] = 1.0 - probabilities[:, benign_index]
    elif probabilities.shape[1] == 2:
        results["attack_probability"] = probabilities.max(axis=1)
    else:
        results["attack_probability"] = probabilities.max(axis=1)

    results["alert"] = results["attack_probability"] >= threshold

    logger.info("Loaded model from: %s", model_path)
    logger.info("Scoring features from: %s", features_path)
    logger.info("Rows scored: %s", len(results))
    logger.info("%s", results[["predicted_label", "attack_probability", "alert"]].head().to_string(index=False))

    alerts = results[results["alert"]]
    if not alerts.empty:
        logger.warning("Potential DDoS alerts:\n%s", alerts[[col for col in ["window_start", "src_ip", "predicted_label", "attack_probability"] if col in alerts.columns]].to_string(index=False))
    else:
        logger.info("No rows crossed the attack threshold.")

    return results


if __name__ == "__main__":
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
    score_flows(Path(args.model).expanduser().resolve(), Path(args.features).expanduser().resolve(), args.threshold)