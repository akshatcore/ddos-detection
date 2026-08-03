import logging

from fastapi import APIRouter, Depends, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from backend.app.core.config import get_settings
from backend.app.db.session import get_db
from backend.app.deps import require_roles
from backend.app.models import Flow, Incident, Prediction, User
from backend.app.schemas import AlertEvaluationRequest, AlertEvaluationResponse, IncidentRead
from backend.app.services.alert_engine import AlertEngine


router = APIRouter(prefix="/alerts", tags=["alerts"])
logger = logging.getLogger(__name__)


@router.get("", response_model=list[IncidentRead])
def list_alerts(db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Security Analyst", "Viewer"))):
    logger.info("User %s requested alert list", user.email)
    return db.query(Incident).filter(Incident.status.in_(["open", "mitigated"])).order_by(desc(Incident.created_at)).all()


@router.post("/evaluate", response_model=AlertEvaluationResponse, status_code=status.HTTP_201_CREATED)
def evaluate_alert(payload: AlertEvaluationRequest, db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Security Analyst"))):
    settings = get_settings()
    engine = AlertEngine(settings)

    flow = Flow(**payload.flow.model_dump())
    db.add(flow)
    db.flush()

    prediction = Prediction(
        flow_id=flow.id,
        model_version_id=None,
        predicted_label=payload.prediction.get("predicted_label", "unknown"),
        confidence=float(payload.prediction.get("confidence", 0.0)),
        attack_probability=float(payload.prediction.get("attack_probability", 0.0)),
        packet_rate=float(payload.prediction.get("packet_rate", flow.packet_rate)),
        raw_score=payload.prediction,
    )
    db.add(prediction)
    db.flush()

    decision = engine.evaluate(prediction.predicted_label, prediction.confidence, prediction.packet_rate)
    if not decision.triggered:
        db.commit()
        logger.info("Alert evaluation completed without trigger for flow %s", flow.id)
        return AlertEvaluationResponse(alert_triggered=False, reason=decision.reason)

    incident = Incident(
        flow_id=flow.id,
        prediction_id=prediction.id,
        title=f"{decision.severity.title()} DDoS alert",
        description=decision.reason,
        severity=decision.severity,
        status="open",
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    logger.warning("Alert triggered by %s: flow=%s severity=%s", user.email, flow.id, decision.severity)
    return AlertEvaluationResponse(alert_triggered=True, reason=decision.reason, incident=IncidentRead.model_validate(incident))
