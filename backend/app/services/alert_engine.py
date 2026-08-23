from dataclasses import dataclass
from typing import Any

from backend.app.core.config import Settings


@dataclass(frozen=True)
class AlertDecision:
    triggered: bool
    reason: str
    severity: str


class AlertEngine:
    """Hybrid ML + heuristic alerting.

    The ML classifier is the primary signal, but it can miss volumetric
    floods that fall outside its training distribution - e.g. a live
    capture's flow-aggregation shape doesn't match how CICDDoS2019's Syn
    attack samples were built (source-port randomization changes whether a
    flood aggregates into one huge flow or many tiny ones). A model
    confidently predicting "Benign" for a flow with a 500+ packet/s,
    all-SYN, zero-ACK, zero-reply-traffic shape is a known failure mode of
    ML-based NIDS, not something you can just retrain your way out of
    overnight.

    Real DDoS mitigation stacks (and NIDS like Suricata/Snort) handle this
    exact gap the same way: defense in depth. The ML model stays the
    primary detector for nuanced/behavioral attacks, and a small set of
    rate/flag-based heuristics acts as a safety net that still catches the
    unambiguous cases regardless of what the model predicts. This keeps
    the model dumb-simple and auditable, and the heuristic thresholds are
    explicit and explainable in an incident's `reason` field - important
    for anyone triaging alerts to trust *why* something fired.
    """

    def __init__(self, settings: Settings):
        self.settings = settings

    def evaluate(
        self,
        predicted_label: str,
        confidence: float,
        packet_rate: float,
        feature_snapshot: dict[str, Any] | None = None,
    ) -> AlertDecision:
        attack_like = predicted_label.lower() != "benign"
        confidence_hit = confidence >= self.settings.confidence_threshold
        rate_hit = packet_rate >= self.settings.packet_rate_threshold

        if attack_like and confidence_hit and rate_hit:
            severity = "critical" if confidence >= 0.95 or packet_rate >= self.settings.packet_rate_threshold * 2 else "high"
            return AlertDecision(True, "Confidence and packet-rate thresholds exceeded", severity)

        if attack_like and confidence_hit:
            return AlertDecision(True, "Confidence threshold exceeded", "medium")

        heuristic = self._heuristic_flood_check(packet_rate, feature_snapshot)
        if heuristic is not None:
            return heuristic

        return AlertDecision(False, "No alert thresholds exceeded", "info")

    def _heuristic_flood_check(
        self, packet_rate: float, feature_snapshot: dict[str, Any] | None
    ) -> AlertDecision | None:
        """Rate/flag-based safety net, independent of the ML model's opinion.

        Only fires on genuinely unambiguous shapes - a real client
        conversation always has backward (reply) traffic; a one-directional
        wall of SYNs at many multiples of the configured baseline rate does
        not happen in legitimate traffic.
        """
        if not feature_snapshot:
            return None

        try:
            syn = float(feature_snapshot.get("SYN Flag Count", 0) or 0)
            ack = float(feature_snapshot.get("ACK Flag Count", 0) or 0)
            fwd = float(feature_snapshot.get("Total Fwd Packets", 0) or 0)
            bwd = float(feature_snapshot.get("Total Backward Packets", 0) or 0)
        except (TypeError, ValueError):
            return None

        total = fwd + bwd
        if total <= 0:
            return None

        syn_ratio = syn / total
        ack_ratio = ack / total
        extreme_rate = packet_rate >= self.settings.packet_rate_threshold * 3

        if extreme_rate and syn_ratio >= 0.9 and ack_ratio <= 0.05 and bwd == 0:
            return AlertDecision(
                True,
                f"Heuristic SYN-flood signature detected independently of model "
                f"classification (rate={packet_rate:.0f} pkt/s, SYN ratio={syn_ratio:.0%}, "
                f"zero reply traffic)",
                "critical",
            )

        if packet_rate >= self.settings.packet_rate_threshold * 10:
            return AlertDecision(
                True,
                f"Heuristic volumetric-flood signature: packet rate {packet_rate:.0f}/s "
                f"is far beyond the configured baseline, regardless of model output",
                "critical",
            )

        return None
