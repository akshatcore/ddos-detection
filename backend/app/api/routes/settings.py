import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.core.config import get_settings
from backend.app.db.session import get_db
from backend.app.deps import require_roles
from backend.app.models import Flow, Incident, MitigationAction, Prediction, SystemSetting, User
from backend.app.schemas import SettingsRead, SettingsUpdate


router = APIRouter(prefix="/settings", tags=["settings"])
logger = logging.getLogger(__name__)


def _upsert_setting(db: Session, key: str, value, description: str | None = None):
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if setting:
        setting.value = value
        if description is not None:
            setting.description = description
    else:
        setting = SystemSetting(key=key, value=value, description=description)
        db.add(setting)
    return setting


@router.get("", response_model=SettingsRead)
def get_settings_route(db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Security Analyst", "Viewer"))):
    settings = get_settings()
    _upsert_setting(db, "confidence_threshold", settings.confidence_threshold, "Alert engine confidence threshold")
    _upsert_setting(db, "packet_rate_threshold", settings.packet_rate_threshold, "Alert engine packet-rate threshold")
    _upsert_setting(db, "session_timeout_minutes", settings.session_timeout_minutes, "JWT session timeout window")
    db.commit()
    return SettingsRead(
        confidence_threshold=settings.confidence_threshold,
        packet_rate_threshold=settings.packet_rate_threshold,
        session_timeout_minutes=settings.session_timeout_minutes,
    )


@router.put("", response_model=SettingsRead)
def update_settings_route(payload: SettingsUpdate, db: Session = Depends(get_db), user: User = Depends(require_roles("Admin"))):
    settings = get_settings()
    if payload.confidence_threshold is not None:
        settings.confidence_threshold = payload.confidence_threshold
    if payload.packet_rate_threshold is not None:
        settings.packet_rate_threshold = payload.packet_rate_threshold
    if payload.session_timeout_minutes is not None:
        settings.session_timeout_minutes = payload.session_timeout_minutes

    _upsert_setting(db, "confidence_threshold", settings.confidence_threshold, "Alert engine confidence threshold")
    _upsert_setting(db, "packet_rate_threshold", settings.packet_rate_threshold, "Alert engine packet-rate threshold")
    _upsert_setting(db, "session_timeout_minutes", settings.session_timeout_minutes, "JWT session timeout window")
    db.commit()

    logger.info("Settings updated by %s", user.email)
    return SettingsRead(
        confidence_threshold=settings.confidence_threshold,
        packet_rate_threshold=settings.packet_rate_threshold,
        session_timeout_minutes=settings.session_timeout_minutes,
    )


@router.post("/clear-data")
def clear_operational_data(db: Session = Depends(get_db), user: User = Depends(require_roles("Admin"))):
    """Admin-only reset button (Settings page): wipes all accumulated
    detection activity - mitigation actions, incidents, predictions, flows -
    so the dashboard starts from zero before a demo instead of showing
    thousands of rows from past testing sessions.

    Deliberately does NOT touch users, roles, system_settings, or
    model_versions - those are configuration, not activity data. Wiping them
    would break login (no admin account left) or lose the registered model
    (would need retraining).

    Uses plain ORM deletes in FK-safe order (children before parents) rather
    than Postgres's TRUNCATE, so this also works against the sqlite DB the
    test suite runs on - not just the real Supabase/Postgres database.
    """
    # mitigation_actions -> incidents -> predictions -> flows: each one is
    # referenced by (or references) the one before it, so this order avoids
    # any foreign-key violation regardless of dialect.
    db.query(MitigationAction).delete()
    db.query(Incident).delete()
    db.query(Prediction).delete()
    db.query(Flow).delete()

    # Cosmetic, Postgres-only: reset auto-increment counters back to 1 so
    # the next real incident/flow starts at #1 instead of continuing from
    # wherever the old data left off. Best-effort - if the sequence names
    # ever differ from SQLAlchemy's default convention this is skipped
    # rather than failing the actual deletion above.
    if db.get_bind().dialect.name == "postgresql":
        for seq in ("mitigation_actions_id_seq", "incidents_id_seq", "predictions_id_seq", "flows_id_seq"):
            try:
                # A savepoint, not a plain try/except: if the sequence name
                # doesn't exist, Postgres aborts the whole transaction until
                # a rollback happens - without this, that failure would also
                # discard the deletes above instead of just skipping the
                # cosmetic reset.
                with db.begin_nested():
                    db.execute(text(f"ALTER SEQUENCE {seq} RESTART WITH 1"))
            except Exception:
                logger.warning("Could not reset sequence %s (non-fatal, data is still cleared)", seq)

    db.commit()
    logger.warning("Operational data (incidents/flows/predictions/mitigations) cleared by %s", user.email)
    return {"status": "cleared"}
