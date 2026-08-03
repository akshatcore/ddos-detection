from dataclasses import dataclass

from backend.app.core.config import Settings


@dataclass(frozen=True)
class AlertDecision:
    triggered: bool
    reason: str
    severity: str


class AlertEngine:
    def __init__(self, settings: Settings):
        self.settings = settings

    def evaluate(self, predicted_label: str, confidence: float, packet_rate: float) -> AlertDecision:
        attack_like = predicted_label.lower() != "benign"
        confidence_hit = confidence >= self.settings.confidence_threshold
        rate_hit = packet_rate >= self.settings.packet_rate_threshold

        if attack_like and confidence_hit and rate_hit:
            severity = "critical" if confidence >= 0.95 or packet_rate >= self.settings.packet_rate_threshold * 2 else "high"
            return AlertDecision(True, "Confidence and packet-rate thresholds exceeded", severity)

        if attack_like and confidence_hit:
            return AlertDecision(True, "Confidence threshold exceeded", "medium")

        return AlertDecision(False, "No alert thresholds exceeded", "info")
