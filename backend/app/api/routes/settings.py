import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.core.config import get_settings
from backend.app.db.session import get_db
from backend.app.deps import require_roles
from backend.app.models import SystemSetting, User
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
