"""
Small "what is this backend actually running on" endpoint - powers the
System Status panel on the frontend. Every value here is read live from
the running process/engine/settings, nothing is hardcoded for demo purposes.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.core.config import get_settings
from backend.app.db.session import get_db, get_engine
from backend.app.deps import require_roles
from backend.app.models import User

router = APIRouter(prefix="/system", tags=["system"])

# Approximates process start time - this module is imported once when the
# API router is built at app startup, so this is set within a second or two
# of the actual `uvicorn` process starting.
_PROCESS_STARTED_AT = datetime.utcnow()


@router.get("/status")
def system_status(db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Security Analyst", "Viewer"))):
    settings = get_settings()
    engine = get_engine()

    db_connected = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_connected = False

    dialect = engine.dialect.name  # e.g. "postgresql", "sqlite"
    driver = engine.dialect.driver  # e.g. "psycopg2"
    # Never leak the DB host/credentials to the frontend - only report which
    # *kind* of database this is, not where it lives.
    is_supabase = "supabase.co" in str(engine.url)

    return {
        "app_name": settings.app_name,
        "environment": settings.environment,
        "database": {
            "dialect": dialect,
            "driver": driver,
            "provider": "Supabase (Postgres)" if is_supabase else dialect.capitalize(),
            "connected": db_connected,
        },
        "server_time": datetime.utcnow().isoformat(),
        "uptime_seconds": (datetime.utcnow() - _PROCESS_STARTED_AT).total_seconds(),
    }
