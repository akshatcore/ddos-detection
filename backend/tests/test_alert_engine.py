from backend.app.services.alert_engine import AlertEngine
from backend.app.core.config import Settings


def test_alert_engine_triggers_on_thresholds():
    engine = AlertEngine(Settings(confidence_threshold=0.8, packet_rate_threshold=50, jwt_secret_key="x"))
    decision = engine.evaluate("Attack", 0.95, 100)
    assert decision.triggered is True
    assert decision.severity in {"high", "critical"}
