"""
Step 2: Flow-window feature extractor.
Reads raw packet log (from capture/live_capture.py output) and aggregates
into 5-second windows per source IP, computing flow-level features.

Usage:
    python3 build_features.py
"""

import pandas as pd
import numpy as np
from collections import Counter

RAW_PACKETS_FILE = "../data/raw_packets.csv"
OUTPUT_FEATURES_FILE = "../data/flow_features.csv"
WINDOW_SECONDS = 5


def shannon_entropy(values):
    """Calculate Shannon entropy of a list of values (used for IP entropy)."""
    counts = Counter(values)
    total = len(values)
    probs = [c / total for c in counts.values()]
    return -sum(p * np.log2(p) for p in probs if p > 0)


def build_features():
    df = pd.read_csv(RAW_PACKETS_FILE, parse_dates=["timestamp"])
    if df.empty:
        print("No packets captured yet. Run live_capture.py first.")
        return

    df = df.sort_values("timestamp")
    df["window"] = df["timestamp"].dt.floor(f"{WINDOW_SECONDS}s")

    feature_rows = []

    for (window, src_ip), group in df.groupby(["window", "src_ip"]):
        packet_count = len(group)
        byte_count = group["packet_size"].sum()
        avg_packet_size = group["packet_size"].mean()

        tcp_group = group[group["protocol"] == "TCP"]
        syn_count = tcp_group["tcp_flags"].astype(str).str.contains("S", na=False).sum()
        ack_count = tcp_group["tcp_flags"].astype(str).str.contains("A", na=False).sum()
        syn_ratio = syn_count / packet_count if packet_count else 0
        ack_ratio = ack_count / packet_count if packet_count else 0

        flow_duration = (group["timestamp"].max() - group["timestamp"].min()).total_seconds()
        dst_ip_entropy = shannon_entropy(group["dst_ip"].tolist())

        # packet rate = packets per second within this window
        packet_rate = packet_count / WINDOW_SECONDS

        feature_rows.append({
            "window_start": window,
            "src_ip": src_ip,
            "packet_count": packet_count,
            "byte_count": byte_count,
            "avg_packet_size": avg_packet_size,
            "packet_rate": packet_rate,
            "syn_ratio": syn_ratio,
            "ack_ratio": ack_ratio,
            "flow_duration": flow_duration,
            "dst_ip_entropy": dst_ip_entropy,
        })

    features_df = pd.DataFrame(feature_rows)
    features_df.to_csv(OUTPUT_FEATURES_FILE, index=False)
    print(f"Wrote {len(features_df)} flow-window feature rows to {OUTPUT_FEATURES_FILE}")
    print(features_df.head())


if __name__ == "__main__":
    build_features()
