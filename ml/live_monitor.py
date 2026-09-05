"""
Fully automated live detection loop - the "one command" version of the
capture -> feature_extraction -> ml -> backend pipeline described in the
README's Build Order.

Starts packet capture in the background and, every --interval seconds,
scores every newly-COMPLETED flow window and pushes it to the backend's
POST /alerts/evaluate endpoint - the same hybrid ML+heuristic AlertEngine
used everywhere else in this project decides whether to open an Incident.
Because every settled flow gets evaluated (not just ones matching one
attack shape), this works for any attack the traffic actually produces -
SYN floods, UDP floods, NetBIOS-shaped traffic, etc. - not just the one
this project happened to be demoed against.

Works identically whether Kali is a VirtualBox VM on THIS machine (use the
host-only adapter's IP, e.g. 192.168.56.1) or a separate physical laptop
on the same Wi-Fi/LAN (use whatever IP `ipconfig` shows for the network
adapter Kali can actually reach you on).

Usage (Administrator terminal, venv active):
    python ml/live_monitor.py --bind-ip 192.168.56.1
    python ml/live_monitor.py --bind-ip 192.168.1.13 --backend-url http://localhost:8000

Ctrl+C stops both the analysis loop and the background capture cleanly.
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_PACKETS_FILE = REPO_ROOT / "data" / "raw_packets.csv"
FEATURES_FILE = REPO_ROOT / "data" / "flow_features.csv"
CAPTURE_LOG_FILE = REPO_ROOT / "data" / "capture.log"
MODEL_PATH = REPO_ROOT / "models" / "random_forest_v1.0.joblib"
WINDOW_SECONDS = 5
SETTLE_SECONDS = 0.5  # don't finalize a window until it's safely in the past

FEATURE_COLUMNS = [
    "Flow Duration", "Total Fwd Packets", "Total Backward Packets",
    "Fwd Packets Length Total", "Bwd Packets Length Total",
    "Flow Bytes/s", "Flow Packets/s", "SYN Flag Count", "ACK Flag Count",
    "Packet Length Mean", "Flow IAT Mean",
]


def parse_args():
    parser = argparse.ArgumentParser(description="Continuous capture -> detect -> alert loop")
    parser.add_argument("--bind-ip", required=True, help="Your machine's IP on the network Kali can reach (see ipconfig)")
    parser.add_argument("--backend-url", default="http://localhost:8000")
    parser.add_argument("--email", default="admin@local")
    parser.add_argument("--password", default="Admin123!")
    parser.add_argument("--interval", type=float, default=1.0, help="Seconds between each analysis cycle")
    parser.add_argument("--push-threshold", type=float, default=0.3, help="Push a flow if attack_probability is at least this...")
    parser.add_argument("--min-packet-rate", type=float, default=50.0, help="...OR packet rate is at least this many pkt/s (whichever hits first)")
    return parser.parse_args()


def flow_key(row):
    a = (row["src_ip"], row["src_port"])
    b = (row["dst_ip"], row["dst_port"])
    return tuple(sorted([a, b])) + (row["protocol"],)


def compute_flow_features(group: pd.DataFrame) -> dict:
    group = group.sort_values("timestamp")
    first = group.iloc[0]
    fwd_mask = (group["src_ip"] == first["src_ip"]) & (group["src_port"] == first["src_port"])
    fwd, bwd = group[fwd_mask], group[~fwd_mask]

    duration_seconds = (group["timestamp"].max() - group["timestamp"].min()).total_seconds()
    flow_duration_us = max(duration_seconds, 1e-6) * 1_000_000
    total_bytes = group["packet_size"].sum()
    total_packets = len(group)

    tcp_group = group[group["protocol"] == "TCP"]
    syn_count = tcp_group["tcp_flags"].astype(str).str.contains("S", na=False).sum()
    ack_count = tcp_group["tcp_flags"].astype(str).str.contains("A", na=False).sum()

    iat = group["timestamp"].diff().dropna().dt.total_seconds() * 1_000_000
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
        "window_start": first["window"],
        "src_ip": first["src_ip"],
        "dst_ip": first["dst_ip"],
        "protocol": first["protocol"],
    }


def login(backend_url: str, email: str, password: str) -> str:
    resp = requests.post(f"{backend_url}/auth/login", json={"email": email, "password": password}, timeout=10)
    resp.raise_for_status()
    return resp.json()["access_token"]


def main():
    args = parse_args()

    print(f"Starting background packet capture on {args.bind_ip} (Ctrl+C to stop everything)...")
    # Previously piped to DEVNULL - meant a capture crash (by far the most
    # common real cause: --bind-ip isn't actually one of THIS machine's own
    # interface IPs, or the process isn't Administrator) was completely
    # silent. This loop would just sit there "watching for attacks" forever
    # against a dead capture process, with zero visible error and an empty
    # raw_packets.csv - exactly the kind of failure that eats a viva slot.
    # Capturing output to a real file (and checking the process is still
    # alive below) turns that into an immediate, readable error instead.
    CAPTURE_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    capture_log = open(CAPTURE_LOG_FILE, "w")
    capture_proc = subprocess.Popen(
        [sys.executable, str(REPO_ROOT / "capture" / "live_capture_raw_socket.py"), "--bind-ip", args.bind_ip],
        cwd=str(REPO_ROOT),
        stdout=capture_log,
        stderr=subprocess.STDOUT,
    )

    # Give it a moment to fail fast rather than silently limping along -
    # a bad bind IP or a missing-Administrator socket error surfaces within
    # well under a second in practice.
    time.sleep(1.5)
    if capture_proc.poll() is not None:
        capture_log.flush()
        capture_log.close()
        print(f"\n[FATAL] Capture process exited immediately (code {capture_proc.returncode}) - it never started capturing.")
        print(f"Most likely cause: --bind-ip {args.bind_ip} isn't one of THIS machine's own real")
        print("interface IPs (run 'ipconfig' and check), or this terminal isn't running as Administrator.")
        print(f"\nFull output from {CAPTURE_LOG_FILE}:")
        print(CAPTURE_LOG_FILE.read_text(errors="replace"))
        return

    print("Loading model...")
    bundle = joblib.load(MODEL_PATH)
    model = bundle["model"]
    feature_columns = bundle["features"]
    label_encoder = bundle.get("label_encoder")

    print("Logging in to backend...")
    token = None
    for _ in range(15):
        try:
            token = login(args.backend_url, args.email, args.password)
            break
        except requests.RequestException:
            time.sleep(2)
    if token is None:
        print("Could not log in to the backend after 30s - is uvicorn running? Stopping capture and exiting.")
        capture_proc.terminate()
        return
    headers = {"Authorization": f"Bearer {token}"}

    processed_keys: set[tuple[str, tuple]] = set()
    FEATURES_FILE.parent.mkdir(parents=True, exist_ok=True)
    header_written = FEATURES_FILE.exists()

    # Rolling in-memory buffer of recent packets, fed incrementally so each
    # cycle's cost depends only on NEW packets since last time - not on how
    # many packets have accumulated in raw_packets.csv over the whole
    # session (which was the real cause of things slowing down over time).
    buffer_df = pd.DataFrame()

    # If raw_packets.csv already has data from a PREVIOUS run (nothing here
    # ever truncates it, by design - feature_extraction/build_features.py
    # can do post-hoc analysis over full history), start reading from the
    # END of it, not the beginning. Without this, a normal restart mid-demo
    # would re-read every old packet as if it just arrived, aggregate it
    # into "new" flows, and push a burst of stale predictions/alerts to the
    # backend within the very first cycle - confusing to watch happen live.
    lines_read = 0  # data rows already consumed from raw_packets.csv
    if RAW_PACKETS_FILE.exists():
        with open(RAW_PACKETS_FILE) as f:
            lines_read = max(sum(1 for _ in f) - 1, 0)  # -1 for the header row
        if lines_read > 0:
            print(
                f"Found {lines_read} existing packet(s) in {RAW_PACKETS_FILE} from a previous run - "
                f"skipping them, only NEW packets captured from now on will be scored."
            )

    print(f"Watching for attacks every {args.interval:.0f}s. Run your attack from Kali (or anywhere reaching {args.bind_ip}) now.")
    total_pushed = total_triggered = 0

    try:
        while True:
            time.sleep(args.interval)

            if capture_proc.poll() is not None:
                print(f"\n[FATAL] Capture process died unexpectedly (code {capture_proc.returncode}) mid-session.")
                print(f"See {CAPTURE_LOG_FILE} for details. Stopping - restart live_monitor.py once fixed.")
                break

            if not RAW_PACKETS_FILE.exists():
                continue
            try:
                new_data = pd.read_csv(
                    RAW_PACKETS_FILE,
                    parse_dates=["timestamp"],
                    skiprows=range(1, lines_read + 1) if lines_read else None,
                )
            except (pd.errors.EmptyDataError, ValueError):
                continue
            if new_data.empty:
                continue

            lines_read += len(new_data)
            buffer_df = pd.concat([buffer_df, new_data], ignore_index=True) if not buffer_df.empty else new_data

            buffer_df["window"] = buffer_df["timestamp"].dt.floor(f"{WINDOW_SECONDS}s")
            latest = buffer_df["timestamp"].max()
            settled_cutoff = latest - pd.Timedelta(seconds=WINDOW_SECONDS + SETTLE_SECONDS)
            settled = buffer_df[buffer_df["window"] <= settled_cutoff].copy()

            # Drop fully-processed history from the buffer so it stays small
            # regardless of how long the session runs.
            buffer_df = buffer_df[buffer_df["window"] > settled_cutoff].reset_index(drop=True)

            if settled.empty:
                continue

            settled["flow_key"] = settled.apply(flow_key, axis=1)

            new_rows = []
            for (window, key), group in settled.groupby(["window", "flow_key"]):
                state_key = (str(window), key)
                if state_key in processed_keys:
                    continue
                processed_keys.add(state_key)
                new_rows.append(compute_flow_features(group))

            if not new_rows:
                continue

            features_df = pd.DataFrame(new_rows).replace([np.inf, -np.inf], 0)
            ordered_cols = ["window_start", "src_ip", "dst_ip", "protocol"] + FEATURE_COLUMNS
            features_df = features_df[ordered_cols]
            features_df.to_csv(FEATURES_FILE, mode="a", header=not header_written, index=False)
            header_written = True

            X = features_df[feature_columns]
            probs = model.predict_proba(X)
            preds = model.predict(X)
            classes = list(label_encoder.classes_) if label_encoder is not None else list(range(probs.shape[1]))
            labels = label_encoder.inverse_transform(preds) if label_encoder is not None else preds
            benign_idx = next((i for i, c in enumerate(classes) if str(c).lower() == "benign"), None)
            attack_prob = 1.0 - probs[:, benign_idx] if benign_idx is not None else probs.max(axis=1)
            confidence = probs.max(axis=1)

            for i, (_, row) in enumerate(features_df.iterrows()):
                packet_count = int(row["Total Fwd Packets"] + row["Total Backward Packets"])
                byte_count = int(row["Fwd Packets Length Total"] + row["Bwd Packets Length Total"])
                duration_s = max(row["Flow Duration"] / 1_000_000, 1e-6)
                packet_rate = packet_count / duration_s

                # Cheap pre-filter so idle background noise doesn't spam the
                # backend with thousands of trivially-benign 1-packet flows -
                # anything with real attack-probability OR real volume still
                # gets through to the AlertEngine, which makes the actual call.
                if attack_prob[i] < args.push_threshold and packet_rate < args.min_packet_rate:
                    continue

                flow_payload = {
                    "src_ip": str(row["src_ip"]),
                    "dst_ip": str(row["dst_ip"]),
                    "protocol": str(row["protocol"]),
                    "packet_count": packet_count,
                    "byte_count": byte_count,
                    "packet_rate": packet_rate,
                    "flow_duration": duration_s,
                    "feature_snapshot": {c: row[c] for c in FEATURE_COLUMNS},
                }
                prediction_payload = {
                    "predicted_label": labels[i],
                    "confidence": float(confidence[i]),
                    "attack_probability": float(attack_prob[i]),
                    "packet_rate": packet_rate,
                }
                try:
                    resp = requests.post(
                        f"{args.backend_url}/alerts/evaluate",
                        json={"flow": flow_payload, "prediction": prediction_payload},
                        headers=headers,
                        timeout=10,
                    )
                    resp.raise_for_status()
                except requests.RequestException as exc:
                    print(f"(failed to push flow: {exc})")
                    continue

                total_pushed += 1
                result = resp.json()
                if result.get("alert_triggered"):
                    total_triggered += 1
                    print(
                        f"[ALERT] {row['src_ip']} -> {row['dst_ip']} | {labels[i]} | "
                        f"confidence={confidence[i]:.2f} rate={packet_rate:.0f}pkt/s | {result.get('reason')}"
                    )
                else:
                    print(f"(scored) {row['src_ip']} -> {row['dst_ip']} | {labels[i]} | rate={packet_rate:.0f}pkt/s | no alert")

    except KeyboardInterrupt:
        print(f"\nStopping. Pushed {total_pushed} flows to the backend, {total_triggered} triggered incidents.")
    finally:
        capture_proc.terminate()
        try:
            capture_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            capture_proc.kill()
        if not capture_log.closed:
            capture_log.close()


if __name__ == "__main__":
    main()
