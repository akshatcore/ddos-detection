from fastapi import APIRouter, Depends
from sqlalchemy import func
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
