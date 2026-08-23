import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.core.config import get_settings
from backend.app.core.security import create_access_token, verify_password
from backend.app.db.session import get_db
from backend.app.models import User
from backend.app.schemas import LoginRequest, TokenResponse, UserRead


router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        logger.warning("Failed login attempt for %s", payload.email)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    settings = get_settings()
    access_token, expires_at = create_access_token(
        user.email,
        settings,
        claims={"role": user.role.name, "session_started_at": int(datetime.now(timezone.utc).timestamp())},
    )
    user.last_login_at = datetime.utcnow()
    db.commit()

    logger.info("User logged in: %s", user.email)
    return TokenResponse(access_token=access_token, expires_at=expires_at, user=UserRead.model_validate(user))
