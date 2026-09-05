"""
==============================================================================
DDoS DETECTION - PERSISTED MODEL EVALUATION REPORT
==============================================================================

train_baseline.py already computes accuracy/precision/recall/F1, a
classification report, a confusion matrix, and feature importances - but
only ever prints them to the console. That output disappears the moment the
terminal is closed, so there was nothing to attach to the project report,
compare across model versions, or show in a viva beyond a screenshot.

This script does NOT retrain anything. It loads the ALREADY-SAVED model
bundle (models/random_forest_v1.0.joblib) and reuses train_baseline.py's own
load_all_pooled() / clean_data() functions plus the same RANDOM_SEED to
reproduce the identical stratified 80/20 held-out test split that model was
originally evaluated on - then writes real files: a confusion matrix image
+ CSV, a feature-importance chart + CSV, and both text and JSON versions of
the classification report, all under models/evaluation/<version>/.

Reusing train_baseline.py's functions (rather than re-implementing the
load/clean logic here) matters: if that logic ever changes, this script
automatically evaluates against the same data pipeline instead of silently
drifting out of sync with it.

HOW TO RUN:
    cd ml
    python3 evaluate_model.py
    (needs the same ../data/cicddos2019/*.parquet files train_baseline.py
    uses, and the already-trained ../models/random_forest_v1.0.joblib)
==============================================================================
"""

import json
import os
from datetime import datetime

import joblib
import matplotlib
matplotlib.use("Agg")  # no display available on a headless dev/CI machine
import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split

from train_baseline import (
    FEATURE_COLUMNS,
    LABEL_COLUMN,
    MODEL_DIR,
    MODEL_VERSION,
    RANDOM_SEED,
    clean_data,
    load_all_pooled,
)

OUTPUT_DIR = os.path.join(MODEL_DIR, "evaluation", MODEL_VERSION)


def load_bundle():
    model_path = os.path.join(MODEL_DIR, f"random_forest_{MODEL_VERSION}.joblib")
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"{model_path} not found - train a model first with train_baseline.py"
        )
    bundle = joblib.load(model_path)
    return bundle["model"], bundle["label_encoder"], bundle["features"]


def rebuild_held_out_test_set(label_encoder):
    """Reproduces the EXACT same test split train_baseline.py evaluated the
    model on originally - same data loading/cleaning, same stratify target,
    same test_size, same random_state. train_test_split is deterministic
    given identical inputs, so this recovers the same held-out rows without
    the model bundle needing to store them itself."""
    df = clean_data(load_all_pooled())
    X = df[FEATURE_COLUMNS]
    y = label_encoder.transform(df[LABEL_COLUMN])
    _, X_test, _, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_SEED, stratify=y
    )
    return X_test, y_test


def write_confusion_matrix(y_test, y_pred, class_names, out_dir):
    cm = confusion_matrix(y_test, y_pred, labels=range(len(class_names)))

    # CSV - exact numbers, easy to paste into a report table
    csv_path = os.path.join(out_dir, "confusion_matrix.csv")
    with open(csv_path, "w") as f:
        f.write("," + ",".join(class_names) + "\n")
        for name, row in zip(class_names, cm):
            f.write(f"{name}," + ",".join(str(v) for v in row) + "\n")

    # PNG - for slides/report, actually readable at a glance
    fig, ax = plt.subplots(figsize=(6, 5))
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=class_names)
    disp.plot(ax=ax, cmap="Blues", colorbar=True, values_format="d")
    ax.set_title(f"Confusion Matrix - RandomForest {MODEL_VERSION}\n(held-out 20% test split)")
    plt.tight_layout()
    png_path = os.path.join(out_dir, "confusion_matrix.png")
    fig.savefig(png_path, dpi=150)
    plt.close(fig)

    return csv_path, png_path


def write_feature_importances(model, feature_names, out_dir):
    pairs = sorted(zip(feature_names, model.feature_importances_), key=lambda x: x[1], reverse=True)

    csv_path = os.path.join(out_dir, "feature_importances.csv")
    with open(csv_path, "w") as f:
        f.write("feature,importance\n")
        for name, score in pairs:
            f.write(f"{name},{score:.6f}\n")

    names = [p[0] for p in pairs]
    scores = [p[1] for p in pairs]
    fig, ax = plt.subplots(figsize=(7, 5))
    y_pos = np.arange(len(names))
    ax.barh(y_pos, scores, color="#4f8dfd")
    ax.set_yticks(y_pos)
    ax.set_yticklabels(names)
    ax.invert_yaxis()
    ax.set_xlabel("Gini importance")
    ax.set_title(f"Feature Importance - RandomForest {MODEL_VERSION}")
    plt.tight_layout()
    png_path = os.path.join(out_dir, "feature_importances.png")
    fig.savefig(png_path, dpi=150)
    plt.close(fig)

    return csv_path, png_path


def write_classification_report(y_test, y_pred, class_names, out_dir):
    text_report = classification_report(y_test, y_pred, target_names=class_names)
    json_report = classification_report(y_test, y_pred, target_names=class_names, output_dict=True)

    text_path = os.path.join(out_dir, "classification_report.txt")
    with open(text_path, "w") as f:
        f.write(text_report)

    json_path = os.path.join(out_dir, "classification_report.json")
    with open(json_path, "w") as f:
        json.dump(json_report, f, indent=2)

    return text_path, json_path, text_report


def compare_against_saved_metadata(accuracy, precision, recall, f1):
    """Sanity check, not a hard requirement: if the data files on disk have
    changed since the model was last trained (different CICDDoS2019 export,
    someone re-ran train_baseline.py with different ATTACK_TYPES, etc.), the
    numbers this script recomputes should still match what's in
    random_forest_v1.0_metadata.json. A mismatch here is a real signal worth
    investigating, not just noise - it means the saved model no longer
    matches the data it claims to have been evaluated on."""
    metadata_path = os.path.join(MODEL_DIR, f"random_forest_{MODEL_VERSION}_metadata.json")
    if not os.path.exists(metadata_path):
        print("(no saved metadata.json to compare against - skipping drift check)")
        return

    with open(metadata_path) as f:
        saved = json.load(f)

    checks = [
        ("accuracy", saved.get("test_accuracy"), accuracy),
        ("precision", saved.get("test_precision"), precision),
        ("recall", saved.get("test_recall"), recall),
        ("f1", saved.get("test_f1"), f1),
    ]
    drift = False
    for name, saved_val, recomputed_val in checks:
        if saved_val is None:
            continue
        if abs(saved_val - round(recomputed_val, 4)) > 0.005:
            drift = True
            print(f"  DRIFT: saved {name}={saved_val} but recomputed {name}={recomputed_val:.4f}")
    if drift:
        print(
            "  -> The data on disk no longer reproduces the metrics train_baseline.py saved. "
            "Likely cause: the .parquet files in data/cicddos2019/ changed since the model was "
            "last trained. Re-run train_baseline.py to retrain and refresh metadata.json."
        )
    else:
        print("  OK - recomputed metrics match saved metadata.json (within rounding tolerance).")


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("Loading saved model bundle...")
    model, label_encoder, feature_names = load_bundle()
    class_names = list(label_encoder.classes_)
    print(f"Model: RandomForest {MODEL_VERSION} | Classes: {class_names}")

    print("\nReproducing the original held-out test split (same seed, same data pipeline)...")
    X_test, y_test = rebuild_held_out_test_set(label_encoder)
    print(f"Held-out test set: {len(X_test)} rows")

    print("\nScoring held-out test set...")
    y_pred = model.predict(X_test)

    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred, average="weighted")
    recall = recall_score(y_test, y_pred, average="weighted")
    f1 = f1_score(y_test, y_pred, average="weighted")

    print(f"Accuracy:  {accuracy:.4f}")
    print(f"Precision: {precision:.4f}")
    print(f"Recall:    {recall:.4f}")
    print(f"F1 Score:  {f1:.4f}")

    print("\nChecking for drift against models/random_forest_v1.0_metadata.json...")
    compare_against_saved_metadata(accuracy, precision, recall, f1)

    print(f"\nWriting report files to {OUTPUT_DIR}/ ...")
    cm_csv, cm_png = write_confusion_matrix(y_test, y_pred, class_names, OUTPUT_DIR)
    fi_csv, fi_png = write_feature_importances(model, feature_names, OUTPUT_DIR)
    report_txt, report_json, report_text = write_classification_report(y_test, y_pred, class_names, OUTPUT_DIR)

    summary = {
        "version": MODEL_VERSION,
        "evaluated_at": datetime.now().isoformat(),
        "test_set_size": len(X_test),
        "classes": class_names,
        "accuracy": round(accuracy, 4),
        "precision_weighted": round(precision, 4),
        "recall_weighted": round(recall, 4),
        "f1_weighted": round(f1, 4),
        "files": {
            "confusion_matrix_csv": os.path.relpath(cm_csv, MODEL_DIR),
            "confusion_matrix_png": os.path.relpath(cm_png, MODEL_DIR),
            "feature_importances_csv": os.path.relpath(fi_csv, MODEL_DIR),
            "feature_importances_png": os.path.relpath(fi_png, MODEL_DIR),
            "classification_report_txt": os.path.relpath(report_txt, MODEL_DIR),
            "classification_report_json": os.path.relpath(report_json, MODEL_DIR),
        },
    }
    summary_path = os.path.join(OUTPUT_DIR, "summary.json")
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)

    print("\nPer-class report:")
    print(report_text)
    print(f"Wrote: {cm_csv}")
    print(f"Wrote: {cm_png}")
    print(f"Wrote: {fi_csv}")
    print(f"Wrote: {fi_png}")
    print(f"Wrote: {report_txt}")
    print(f"Wrote: {report_json}")
    print(f"Wrote: {summary_path}")


if __name__ == "__main__":
    main()
