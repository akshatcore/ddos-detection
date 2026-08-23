"""
Step 2: Flow-window feature extractor.

Reads the raw packet log produced by capture/live_capture.py and aggregates
packets into bidirectional, 5-second-windowed flows, computing the SAME
feature set the trained model in ml/train_baseline.py was trained on
(CICFlowMeter-style features from CICDDoS2019).

BUG FIX (documented for the project report):
    The original version of this script grouped packets by (window, src_ip)
    only and emitted a completely different feature set (packet_count,
    byte_count, packet_rate, syn_ratio, ack_ratio, dst_ip_entropy, ...) than
    the 11 columns the trained RandomForest model actually expects
    (Flow Duration, Total Fwd Packets, Flow Bytes/s, SYN Flag Count, ...).
    That meant detect_live.py / ml/service.py would raise
    "Feature file is missing required columns" the moment you tried to score
    real captured traffic — the capture -> features -> model vertical slice
    described in the README was never actually connected end-to-end.

    Fix: define a proper bidirectional flow key
    (src_ip, dst_ip, src_port, dst_port, protocol), track the FIRST packet's
    direction as "forward", and compute the exact 11 columns
    ml/train_baseline.py's FEATURE_COLUMNS lists, per 5-second window.

Usage:
    python3 build_features.py
"""

from pathlib import Path

import numpy as np
import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
RAW_PACKETS_FILE = REPO_ROOT / "data" / "raw_packets.csv"
OUTPUT_FEATURES_FILE = REPO_ROOT / "data" / "flow_features.csv"
WINDOW_SECONDS = 5

# Must match ml/train_baseline.py FEATURE_COLUMNS exactly (order doesn't
# matter since detect_live.py/ml/service.py select columns by name, but the
# names must match verbatim).
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


def _flow_key(row):
    """Undirected 5-tuple flow key so both directions of a conversation land
    in the same flow (e.g. client->server and server->client)."""
    a = (row["src_ip"], row["src_port"])
    b = (row["dst_ip"], row["dst_port"])
    endpoints = tuple(sorted([a, b])) + (row["protocol"],)
    return endpoints


def _compute_flow_features(group: pd.DataFrame) -> dict:
    group = group.sort_values("timestamp")
    first = group.iloc[0]

    # "Forward" = same direction as the first packet observed in this
    # window for this flow; "backward" = the reply direction.
    fwd_mask = (group["src_ip"] == first["src_ip"]) & (group["src_port"] == first["src_port"])
    fwd = group[fwd_mask]
    bwd = group[~fwd_mask]

    duration_seconds = (group["timestamp"].max() - group["timestamp"].min()).total_seconds()
    # CICFlowMeter reports Flow Duration in microseconds.
    flow_duration_us = max(duration_seconds, 1e-6) * 1_000_000

    total_bytes = group["packet_size"].sum()
    total_packets = len(group)

    tcp_group = group[group["protocol"] == "TCP"]
    syn_count = tcp_group["tcp_flags"].astype(str).str.contains("S", na=False).sum()
    ack_count = tcp_group["tcp_flags"].astype(str).str.contains("A", na=False).sum()

    iat = group["timestamp"].diff().dropna().dt.total_seconds() * 1_000_000  # microseconds
    flow_iat_mean = iat.mean() if not iat.empty else 0.0

    return {
        "Flow Duration": flow_duration_us,
        "Total Fwd Packets": len(fwd),
        "Total Backward Packets": len(bwd),
        "Fwd Packets Length Total": fwd["packet_size"].sum(),
        "Bwd Packets Length Total": bwd["packet_size"].sum(),
        "Flow Bytes/s": total_bytes / (flow_duration_us / 1_000_000),
        "Flow Packets/s": total_packets / (flow_duration_us / 1_000_000),
        "SYN Flag Count": syn_count,
        "ACK Flag Count": ack_count,
        "Packet Length Mean": group["packet_size"].mean(),
        "Flow IAT Mean": flow_iat_mean,
        # Extra context columns kept for the dashboard/alerting layer -
        # NOT fed to the model (detect_live.py selects FEATURE_COLUMNS only).
        "window_start": first["window"],
        "src_ip": first["src_ip"],
        "dst_ip": first["dst_ip"],
        "protocol": first["protocol"],
    }


def build_features():
    if not RAW_PACKETS_FILE.exists():
        print(f"No packet file found at {RAW_PACKETS_FILE}. Run capture/live_capture.py first.")
        return

    df = pd.read_csv(RAW_PACKETS_FILE, parse_dates=["timestamp"])
    if df.empty:
        print("No packets captured yet. Run live_capture.py first.")
        return

    df = df.sort_values("timestamp")
    df["window"] = df["timestamp"].dt.floor(f"{WINDOW_SECONDS}s")
    df["flow_key"] = df.apply(_flow_key, axis=1)

    feature_rows = [
        _compute_flow_features(group)
        for _, group in df.groupby(["window", "flow_key"])
    ]

    features_df = pd.DataFrame(feature_rows)
    features_df = features_df.replace([np.inf, -np.inf], 0)

    ordered_cols = ["window_start", "src_ip", "dst_ip", "protocol"] + FEATURE_COLUMNS
    features_df = features_df[ordered_cols]

    OUTPUT_FEATURES_FILE.parent.mkdir(parents=True, exist_ok=True)
    features_df.to_csv(OUTPUT_FEATURES_FILE, index=False)
    print(f"Wrote {len(features_df)} flow-window feature rows to {OUTPUT_FEATURES_FILE}")
    print(f"Columns: {list(features_df.columns)}")
    print(features_df.head())


if __name__ == "__main__":
    build_features()
