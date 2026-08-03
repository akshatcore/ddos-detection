import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from backend.app.core.config import get_settings
from backend.app.db.session import get_db
from backend.app.deps import require_roles
from backend.app.models import Flow, Incident, MitigationAction, User
from backend.app.schemas import IncidentCreate, IncidentRead, MitigationActionRead
from backend.app.services.mitigation import build_mitigation_payload


router = APIRouter(prefix="/incidents", tags=["incidents"])
logger = logging.getLogger(__name__)


def _incident_query(db: Session):
    return db.query(Incident).options(joinedload(Incident.flow), joinedload(Incident.prediction)).order_by(desc(Incident.created_at))


@router.get("", response_model=list[IncidentRead])
def list_incidents(db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Security Analyst", "Viewer"))):
    logger.info("User %s requested incident list", user.email)
    return _incident_query(db).all()


@router.post("", response_model=IncidentRead, status_code=status.HTTP_201_CREATED)
def create_incident(payload: IncidentCreate, db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Security Analyst"))):
    incident = Incident(**payload.model_dump())
    db.add(incident)
    db.commit()
    db.refresh(incident)
    logger.warning("Incident created by %s: %s", user.email, incident.title)
    return incident


@router.post("/{incident_id}/mitigate", response_model=list[MitigationActionRead])
def mitigate_incident(incident_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Security Analyst"))):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    flow = db.query(Flow).filter(Flow.id == incident.flow_id).first() if incident.flow_id else None
    if not flow:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incident has no linked flow to mitigate")

    settings = get_settings()
    payload = build_mitigation_payload(flow.src_ip, settings.mitigation_interface, incident.description or incident.title)
    action = MitigationAction(
        incident_id=incident.id,
        action_type=payload["action_type"],
        command=payload["command"],
        status=payload["status"],
        executed_by_user_id=user.id,
        executed_at=datetime.utcnow(),
    )
    db.add(action)
    incident.status = "mitigated"
    db.commit()
    db.refresh(action)

    logger.critical("Mitigation simulated for incident %s: %s", incident.id, action.command)
    return [MitigationActionRead.model_validate(action)]
