from fastapi import APIRouter, Depends
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.deps import require_roles
from backend.app.models import Flow, Incident, MitigationAction, ModelVersion, Prediction, User
from backend.app.schemas import ReportSummary


router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("", response_model=ReportSummary)
def report_summary(db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Security Analyst", "Viewer"))):
    # Was 7 separate queries (7 sequential network round-trips to the
    # remote Supabase DB per call) - the Dashboard alone polls this every
    # 3s, so that was 7 round-trips every 3s just for this one endpoint.
    # Combined into a single query with scalar subqueries: one round-trip,
    # same result, Postgres evaluates all 7 counts server-side.
    stmt = select(
        select(func.count(User.id)).scalar_subquery().label("users"),
        select(func.count(Flow.id)).scalar_subquery().label("flows"),
        select(func.count(Prediction.id)).scalar_subquery().label("predictions"),
        select(func.count(Incident.id)).scalar_subquery().label("incidents"),
        select(func.count(Incident.id)).where(Incident.status == "open").scalar_subquery().label("open_incidents"),
        select(func.count(MitigationAction.id)).scalar_subquery().label("mitigations"),
        select(func.count(ModelVersion.id)).where(ModelVersion.is_active.is_(True)).scalar_subquery().label("active_models"),
    )
    row = db.execute(stmt).one()
    return ReportSummary(
        users=row.users or 0,
        flows=row.flows or 0,
        predictions=row.predictions or 0,
        incidents=row.incidents or 0,
        open_incidents=row.open_incidents or 0,
        mitigations=row.mitigations or 0,
        active_models=row.active_models or 0,
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
