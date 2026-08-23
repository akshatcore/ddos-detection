from fastapi import APIRouter, Depends
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.deps import require_roles
from backend.app.models import Flow, Incident, MitigationAction, ModelVersion, Prediction, User
from backend.app.schemas import ReportSummary


router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("", response_model=ReportSummary)
def report_summary(db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Security Analyst", "Viewer"))):
    return ReportSummary(
        users=db.query(func.count(User.id)).scalar() or 0,
        flows=db.query(func.count(Flow.id)).scalar() or 0,
        predictions=db.query(func.count(Prediction.id)).scalar() or 0,
        incidents=db.query(func.count(Incident.id)).scalar() or 0,
        open_incidents=db.query(func.count(Incident.id)).filter(Incident.status == "open").scalar() or 0,
        mitigations=db.query(func.count(MitigationAction.id)).scalar() or 0,
        active_models=db.query(func.count(ModelVersion.id)).filter(ModelVersion.is_active.is_(True)).scalar() or 0,
    )


@router.get("/mitigations")
def mitigation_breakdown(db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Security Analyst", "Viewer"))):
    """Real counts of mitigation actions grouped by action_type, plus the
    most recent few - powers the Mitigation Actions panel with actual data
    (this project currently only ever creates "iptables_block" actions, so
    the breakdown will be a single category until more action types exist)."""
    rows = (
        db.query(MitigationAction.action_type, func.count(MitigationAction.id))
        .group_by(MitigationAction.action_type)
        .all()
    )
    recent = (
        db.query(MitigationAction)
        .order_by(desc(MitigationAction.created_at))
        .limit(5)
        .all()
    )
    return {
        "by_type": {action_type: count for action_type, count in rows},
        "total": sum(count for _, count in rows),
        "recent": [
            {
                "id": action.id,
                "action_type": action.action_type,
                "command": action.command,
                "status": action.status,
                "created_at": action.created_at.isoformat(),
            }
            for action in recent
        ],
    }
