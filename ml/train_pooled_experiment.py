"""
==============================================================================
ARCHIVED / EXPLORATORY SCRIPT - kept for the project report, NOT production.
Superseded by train_baseline.py, which already applies the pooled+stratified
split this experiment validated. Do not run this to produce the shipped
model - run train_baseline.py for that, and ml/evaluate_model.py to
regenerate the persisted evaluation report from an already-trained model.
==============================================================================

EXPERIMENT: Pool all training + testing files together, then do our OWN random
stratified split, instead of relying on the dataset's fixed train/test-by-day split.

WHY: diagnose_syn_mismatch.py showed the Syn attack's absolute feature values
shift noticeably between the training-day and testing-day captures (different
scale/environment), which likely breaks Random Forest's learned split thresholds.

If pooling fixes Syn recall -> confirms this is a day-based distribution shift,
not an unlearnable pattern. This tells us the real fix is either:
  (a) train on pooled/mixed-day data going forward, or
  (b) engineer scale-invariant ratio features that generalize across days

Usage:
    python3 train_pooled_experiment.py
"""

import pandas as pd
import numpy as np
import os

from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score

DATA_DIR = "../data/cicddos2019"
ATTACK_TYPES = ["Syn", "UDP", "NetBIOS"]
RANDOM_SEED = 42

FEATURE_COLUMNS = [
    "Flow Duration", "Total Fwd Packets", "Total Backward Packets",
    "Fwd Packets Length Total", "Bwd Packets Length Total",
    "Flow Bytes/s", "Flow Packets/s", "SYN Flag Count", "ACK Flag Count",
    "Packet Length Mean", "Flow IAT Mean",
]
LABEL_COLUMN = "Label"

LABEL_NORMALIZATION = {
    "DrDoS_UDP": "UDP", "DrDoS_NetBIOS": "NetBIOS", "DrDoS_MSSQL": "MSSQL",
    "DrDoS_LDAP": "LDAP", "DrDoS_NTP": "NTP", "DrDoS_DNS": "DNS",
    "DrDoS_SNMP": "SNMP", "DrDoS_SSDP": "SSDP", "UDP-lag": "UDPLag",
    "BENIGN": "Benign",
}


def load_all():
    frames = []
    for attack in ATTACK_TYPES:
        for split in ["training", "testing"]:
            path = os.path.join(DATA_DIR, f"{attack}-{split}.parquet")
            if os.path.exists(path):
                df = pd.read_parquet(path)
                df["source_file"] = f"{attack}-{split}"
                frames.append(df)
    combined = pd.concat(frames, ignore_index=True)
    combined[LABEL_COLUMN] = combined[LABEL_COLUMN].replace(LABEL_NORMALIZATION)
    return combined


def main():
    df = load_all()
    df = df.replace([np.inf, -np.inf], np.nan).dropna(subset=FEATURE_COLUMNS + [LABEL_COLUMN])
    print(f"Total pooled rows: {len(df)}")
    print(f"Label distribution:\n{df[LABEL_COLUMN].value_counts()}\n")

    X = df[FEATURE_COLUMNS]
    le = LabelEncoder()
    y = le.fit_transform(df[LABEL_COLUMN])

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_SEED, stratify=y
    )

    model = RandomForestClassifier(
        n_estimators=150, max_depth=15, min_samples_split=5,
        class_weight="balanced", random_state=RANDOM_SEED, n_jobs=-1
    )
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    print(f"Accuracy: {accuracy_score(y_test, y_pred):.4f}\n")
    present = sorted(set(y_test) | set(y_pred))
    print(classification_report(y_test, y_pred, labels=present, target_names=le.inverse_transform(present)))
    print("Confusion Matrix:")
    print(f"Classes: {list(le.inverse_transform(present))}")
    print(confusion_matrix(y_test, y_pred, labels=present))


if __name__ == "__main__":
    main()
