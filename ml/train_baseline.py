"""
==============================================================================
DDoS DETECTION - MODEL TRAINING SCRIPT (Production-Ready Baseline)
==============================================================================

WHAT THIS SCRIPT DOES (read this before running):
1. Loads the CICDDoS2019 dataset CSVs
2. Cleans the data (removes broken/infinite values - very common in this dataset)
3. Splits data into Train (80%) / Test (20%)
4. Runs 5-fold cross-validation on the Train set (sanity check before final training)
5. Trains the final Random Forest model on the full Train set
6. Evaluates on Test set (the "final exam" - untouched until now)
7. Saves the model WITH metadata (version, date, accuracy, features used)
   -> this metadata is what makes it "production-ready" instead of a throwaway file

HOW TO RUN:
    1. Download CICDDoS2019 CSV subset from https://www.unb.ca/cic/datasets/ddos-2019.html
    2. Place CSV files in: ../data/cicddos2019/
    3. Run: python3 train_baseline.py
    4. Read the printed report - especially "Recall (Attack class)" - that's the
       number that tells you if this model will actually catch real attacks

WHAT TO DO IF ACCURACY LOOKS WEIRD:
    - Train accuracy 99%+ but Test accuracy much lower -> overfitting, reduce max_depth
    - Recall on attack class is low (<90%) -> model is missing real attacks, this is
      the most dangerous failure mode for this project, investigate before shipping
    - If everything is exactly 100% -> suspicious, check for data leakage
      (e.g. did you accidentally include the label in your features?)
==============================================================================
"""

import pandas as pd
import numpy as np
import glob
import os
import json
import joblib
from datetime import datetime

from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    classification_report, confusion_matrix, accuracy_score,
    precision_score, recall_score, f1_score
)

# ==============================================================================
# CONFIG - change these if your folder structure or dataset columns differ
# ==============================================================================

DATA_DIR = "../data/cicddos2019/*.csv"
MODEL_DIR = "../models"
MODEL_VERSION = "v1.0"
RANDOM_SEED = 42          # fixes randomness so results are reproducible every run

# IMPORTANT: open one CSV first and check actual column names before running.
# CICDDoS2019 versions vary slightly - these are the common ones, adjust as needed.
FEATURE_COLUMNS = [
    "Flow Duration",
    "Total Fwd Packets",
    "Total Backward Packets",
    "Fwd Packets Length Total",
    "Bwd Packets Length Total",
    "Flow Bytes/s",
    "Flow Packets/s",
    "SYN Flag Count",
    "ACK Flag Count",
]
LABEL_COLUMN = "Label"


# ==============================================================================
# STEP 1: LOAD DATA
# ==============================================================================

def load_dataset():
    files = glob.glob(DATA_DIR)
    if not files:
        print(f"ERROR: No CSV files found in {DATA_DIR}")
        print("Download the CICDDoS2019 CSV subset and place it there first.")
        return None

    print(f"Found {len(files)} CSV file(s). Loading...")
    dfs = [pd.read_csv(f, low_memory=False) for f in files]
    df = pd.concat(dfs, ignore_index=True)
    df.columns = df.columns.str.strip()  # CICDDoS2019 columns often have stray spaces
    print(f"Loaded {len(df)} total rows.")
    return df


# ==============================================================================
# STEP 2: CLEAN DATA
# ==============================================================================

def clean_data(df):
    missing_cols = [c for c in FEATURE_COLUMNS + [LABEL_COLUMN] if c not in df.columns]
    if missing_cols:
        print(f"ERROR: These expected columns were not found: {missing_cols}")
        print(f"Actual columns in your CSV: {list(df.columns)}")
        raise ValueError("Fix FEATURE_COLUMNS to match your actual CSV column names.")

    before = len(df)

    # Replace infinity values with NaN, then drop rows with any missing values
    # (CICDDoS2019 commonly has inf values in Flow Bytes/s and Flow Packets/s
    # when Flow Duration is 0 - a divide-by-zero artifact in the original capture tool)
    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.dropna(subset=FEATURE_COLUMNS + [LABEL_COLUMN])

    after = len(df)
    print(f"Cleaned data: {before} -> {after} rows ({before - after} rows dropped)")
    return df


# ==============================================================================
# STEP 3-6: TRAIN, CROSS-VALIDATE, EVALUATE, SAVE
# ==============================================================================

def train_and_evaluate():
    df = load_dataset()
    if df is None:
        return

    df = clean_data(df)

    X = df[FEATURE_COLUMNS]
    y_raw = df[LABEL_COLUMN]

    # Convert text labels (e.g. "BENIGN", "DrDoS_SYN") into numbers the model can use
    label_encoder = LabelEncoder()
    y = label_encoder.fit_transform(y_raw)
    print(f"\nClasses found: {list(label_encoder.classes_)}")
    print(f"Class distribution:\n{y_raw.value_counts()}")

    # ---- Train/Test split ----
    # stratify=y ensures both sets have the same proportion of attack/benign samples
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_SEED, stratify=y
    )
    print(f"\nTrain size: {len(X_train)} | Test size: {len(X_test)}")

    # ---- Cross-validation sanity check (BEFORE final training) ----
    # This trains 5 separate models on different slices of the Train data and
    # checks consistency. If scores vary wildly between folds, something is unstable.
    print("\nRunning 5-fold cross-validation...")
    cv_model = RandomForestClassifier(n_estimators=150, max_depth=15, random_state=RANDOM_SEED, n_jobs=-1)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_SEED)
    cv_scores = cross_val_score(cv_model, X_train, y_train, cv=cv, scoring="f1_weighted")
    print(f"Cross-validation F1 scores: {cv_scores}")
    print(f"Mean: {cv_scores.mean():.4f} | Std Dev: {cv_scores.std():.4f}")
    print("(Std Dev should be small - large variance means the model is unstable)")

    # ---- Final training on full Train set ----
    print("\nTraining final model on full training set...")
    model = RandomForestClassifier(
        n_estimators=150,
        max_depth=15,
        min_samples_split=5,      # prevents trees from splitting on tiny, noisy groups
        class_weight="balanced",  # automatically up-weights the minority class (helps with imbalance)
        random_state=RANDOM_SEED,
        n_jobs=-1
    )
    model.fit(X_train, y_train)

    # ---- Evaluate on Test set (the honest, untouched grade) ----
    y_pred = model.predict(X_test)

    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred, average="weighted")
    recall = recall_score(y_test, y_pred, average="weighted")
    f1 = f1_score(y_test, y_pred, average="weighted")

    print("\n" + "=" * 60)
    print("FINAL TEST SET RESULTS (this is the number that matters)")
    print("=" * 60)
    print(f"Accuracy:  {accuracy:.4f}")
    print(f"Precision: {precision:.4f}")
    print(f"Recall:    {recall:.4f}")
    print(f"F1 Score:  {f1:.4f}")
    print("\nFull classification report (per class):")
    print(classification_report(y_test, y_pred, target_names=label_encoder.classes_))
    print("Confusion Matrix (rows=actual, columns=predicted):")
    print(confusion_matrix(y_test, y_pred))

    # ---- Feature importance (which features actually mattered) ----
    print("\nFeature importance (higher = more useful for the model's decisions):")
    importances = sorted(
        zip(FEATURE_COLUMNS, model.feature_importances_),
        key=lambda x: x[1], reverse=True
    )
    for name, score in importances:
        print(f"  {name}: {score:.4f}")

    save_model(model, label_encoder, accuracy, precision, recall, f1)


# ==============================================================================
# SAVE MODEL - production-ready means: save metadata alongside the model,
# not just the raw model file. This lets you track versions, know how it was
# trained, and reload it consistently in the backend later.
# ==============================================================================

def save_model(model, label_encoder, accuracy, precision, recall, f1):
    os.makedirs(MODEL_DIR, exist_ok=True)
    model_path = os.path.join(MODEL_DIR, f"random_forest_{MODEL_VERSION}.joblib")
    metadata_path = os.path.join(MODEL_DIR, f"random_forest_{MODEL_VERSION}_metadata.json")

    bundle = {
        "model": model,
        "label_encoder": label_encoder,
        "features": FEATURE_COLUMNS,
        "version": MODEL_VERSION,
    }
    joblib.dump(bundle, model_path)

    metadata = {
        "version": MODEL_VERSION,
        "trained_at": datetime.now().isoformat(),
        "algorithm": "RandomForestClassifier",
        "features": FEATURE_COLUMNS,
        "classes": list(label_encoder.classes_),
        "test_accuracy": round(accuracy, 4),
        "test_precision": round(precision, 4),
        "test_recall": round(recall, 4),
        "test_f1": round(f1, 4),
        "random_seed": RANDOM_SEED,
    }
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"\nModel saved to: {model_path}")
    print(f"Metadata saved to: {metadata_path}")
    print("\nTo load this model later in your backend:")
    print(f'  bundle = joblib.load("{model_path}")')
    print('  model = bundle["model"]')
    print('  prediction = model.predict([[your, feature, values, here]])')


if __name__ == "__main__":
    train_and_evaluate()
