"""
Diagnostic: compare feature distributions between Syn-training and Syn-testing
to understand WHY the model fails to generalize on the Syn attack class.

Usage:
    python3 diagnose_syn_mismatch.py
"""

import pandas as pd

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
    "Packet Length Mean",
    "Flow IAT Mean",
]

train = pd.read_parquet("../data/cicddos2019/Syn-training.parquet")
test = pd.read_parquet("../data/cicddos2019/Syn-testing.parquet")

train_syn = train[train["Label"] == "Syn"]
test_syn = test[test["Label"] == "Syn"]
train_benign = train[train["Label"] == "Benign"]
test_benign = test[test["Label"] == "Benign"]

print(f"Train Syn rows: {len(train_syn)} | Test Syn rows: {len(test_syn)}")
print(f"Train Benign rows: {len(train_benign)} | Test Benign rows: {len(test_benign)}\n")

print("=" * 90)
print(f"{'Feature':<30}{'TrainSyn mean':>15}{'TestSyn mean':>15}{'TrainBenign mean':>18}{'TestBenign mean':>17}")
print("=" * 90)
for col in FEATURE_COLUMNS:
    print(f"{col:<30}{train_syn[col].mean():>15.2f}{test_syn[col].mean():>15.2f}"
          f"{train_benign[col].mean():>18.2f}{test_benign[col].mean():>17.2f}")

print("\nSYN Flag Count unique values overall (train):", train["SYN Flag Count"].unique()[:10])
print("SYN Flag Count unique values overall (test):", test["SYN Flag Count"].unique()[:10])
