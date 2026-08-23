from backend.app.services.alert_engine import AlertEngine
from backend.app.core.config import Settings


def test_alert_engine_triggers_on_thresholds():
    engine = AlertEngine(Settings(confidence_threshold=0.8, packet_rate_threshold=50, jwt_secret_key="x"))
    decision = engine.evaluate("Attack", 0.95, 100)
    assert decision.triggered is True
    assert decision.severity in {"high", "critical"}


def test_alert_engine_heuristic_catches_syn_flood_the_model_calls_benign():
    """A live capture can produce a flow shape the ML model has never seen
    (see docs/PBL_Report.md) - the model confidently predicts "Benign" for
    an unambiguous, all-SYN, zero-reply-traffic flood. The heuristic safety
    net must still trigger regardless of the model's classification."""
    engine = AlertEngine(Settings(confidence_threshold=0.85, packet_rate_threshold=100, jwt_secret_key="x"))
    decision = engine.evaluate(
        "Benign",
        0.5865,
        532.3,
        feature_snapshot={
            "SYN Flag Count": 2420,
            "ACK Flag Count": 0,
            "Total Fwd Packets": 2420,
            "Total Backward Packets": 0,
        },
    )
    assert decision.triggered is True
    assert decision.severity == "critical"
    assert "Heuristic" in decision.reason


def test_alert_engine_ignores_normal_traffic_shape():
    """A real client conversation always has reply (backward) traffic -
    the heuristic must not fire on ordinary flows just because packet rate
    is momentarily elevated."""
    engine = AlertEngine(Settings(confidence_threshold=0.85, packet_rate_threshold=100, jwt_secret_key="x"))
    decision = engine.evaluate(
        "Benign",
        0.9,
        120,
        feature_snapshot={
            "SYN Flag Count": 1,
            "ACK Flag Count": 40,
            "Total Fwd Packets": 20,
            "Total Backward Packets": 18,
        },
    )
    assert decision.triggered is False
