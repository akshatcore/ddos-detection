"""Unit tests for feature_extraction/build_features.py's flow aggregation -
the exact bug (grouping by (window, src_ip) instead of a proper bidirectional
5-tuple flow key, and computing the wrong 11 columns) documented in that
file's own module docstring as previously breaking the capture -> features ->
model pipeline end-to-end. These tests build small synthetic packet frames
and assert the aggregation actually produces the columns
ml/train_baseline.py's model expects, with correct values for both a normal
bidirectional exchange and a one-directional SYN-flood shape.
"""

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "feature_extraction"))
import build_features  # noqa: E402


def _packets(rows):
    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    return df


def test_flow_key_is_direction_independent():
    """Both directions of the same conversation (client->server and its
    replies, server->client) must land in the same undirected flow key -
    this is exactly the bug fix the module docstring describes."""
    forward = {"src_ip": "10.0.0.5", "src_port": 51000, "dst_ip": "10.0.0.1", "dst_port": 80, "protocol": "TCP"}
    reply = {"src_ip": "10.0.0.1", "src_port": 80, "dst_ip": "10.0.0.5", "dst_port": 51000, "protocol": "TCP"}
    assert build_features._flow_key(pd.Series(forward)) == build_features._flow_key(pd.Series(reply))


def test_flow_key_differs_by_protocol():
    same_endpoints_tcp = {"src_ip": "10.0.0.5", "src_port": 1, "dst_ip": "10.0.0.1", "dst_port": 2, "protocol": "TCP"}
    same_endpoints_udp = {**same_endpoints_tcp, "protocol": "UDP"}
    assert build_features._flow_key(pd.Series(same_endpoints_tcp)) != build_features._flow_key(pd.Series(same_endpoints_udp))


def test_normal_handshake_produces_expected_columns_and_bidirectional_counts():
    group = _packets([
        {"timestamp": "2026-01-01 00:00:00.000", "src_ip": "10.0.0.5", "src_port": 51000, "dst_ip": "10.0.0.1", "dst_port": 80, "protocol": "TCP", "packet_size": 60, "tcp_flags": "S"},
        {"timestamp": "2026-01-01 00:00:00.010", "src_ip": "10.0.0.1", "src_port": 80, "dst_ip": "10.0.0.5", "dst_port": 51000, "protocol": "TCP", "packet_size": 60, "tcp_flags": "SA"},
        {"timestamp": "2026-01-01 00:00:00.020", "src_ip": "10.0.0.5", "src_port": 51000, "dst_ip": "10.0.0.1", "dst_port": 80, "protocol": "TCP", "packet_size": 54, "tcp_flags": "A"},
    ])
    group["window"] = group["timestamp"].dt.floor("5s")
    features = build_features._compute_flow_features(group)

    assert set(build_features.FEATURE_COLUMNS).issubset(features.keys())
    assert features["Total Fwd Packets"] == 2  # the two packets FROM 10.0.0.5:51000 (first packet's direction)
    assert features["Total Backward Packets"] == 1  # the SYN-ACK reply
    assert features["SYN Flag Count"] == 2  # "S" appears in both "S" and "SA"
    assert features["ACK Flag Count"] == 2  # "A" appears in both "SA" and "A"


def test_syn_flood_shape_has_zero_backward_and_zero_ack():
    """A real SYN flood: many packets from one attacker on one source port,
    no replies, no ACKs - this is the exact shape AlertEngine's heuristic
    layer checks for, and matches the real diagnosed live-capture bug
    (2420 packets, one flow, zero ACKs - see alert_engine.py's docstring).
    Note: a source-port-RANDOMIZED flood is a different, harder case - each
    packet would get its own flow_key upstream in build_features() and
    never reach this function as one 50-packet group at all; that gap is
    exactly what alert_engine.py's own docstring already documents as a
    known limitation, not something asserted here."""
    rows = [
        {"timestamp": f"2026-01-01 00:00:00.{i:03d}", "src_ip": "203.0.113.9", "src_port": 40000, "dst_ip": "10.0.0.1", "dst_port": 80, "protocol": "TCP", "packet_size": 60, "tcp_flags": "S"}
        for i in range(50)
    ]
    group = _packets(rows)
    group["window"] = group["timestamp"].dt.floor("5s")
    features = build_features._compute_flow_features(group)

    assert features["Total Fwd Packets"] == 50
    assert features["Total Backward Packets"] == 0
    assert features["SYN Flag Count"] == 50
    assert features["ACK Flag Count"] == 0


def test_flow_duration_is_never_zero_even_for_single_packet():
    """Flow Bytes/s and Flow Packets/s divide by duration - a single-packet
    window must not produce a divide-by-zero (the code clamps to 1e-6s)."""
    group = _packets([
        {"timestamp": "2026-01-01 00:00:00.000", "src_ip": "10.0.0.5", "src_port": 1, "dst_ip": "10.0.0.1", "dst_port": 2, "protocol": "UDP", "packet_size": 512, "tcp_flags": ""},
    ])
    group["window"] = group["timestamp"].dt.floor("5s")
    features = build_features._compute_flow_features(group)

    assert features["Flow Duration"] > 0
    assert features["Flow Bytes/s"] == pytest.approx(512 / 1e-6)
