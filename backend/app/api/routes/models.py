import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.deps import require_roles
from backend.app.models import ModelVersion, User
from backend.app.schemas import ModelVersionCreate, ModelVersionRead


router = APIRouter(prefix="/models", tags=["models"])
logger = logging.getLogger(__name__)


@router.get("", response_model=list[ModelVersionRead])
def list_models(db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Security Analyst", "Viewer"))):
    return db.query(ModelVersion).order_by(ModelVersion.created_at.desc()).all()


@router.post("", response_model=ModelVersionRead, status_code=status.HTTP_201_CREATED)
def register_model(payload: ModelVersionCreate, db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Security Analyst"))):
    model = ModelVersion(**payload.model_dump(), created_by_user_id=user.id, deployed_at=datetime.utcnow() if payload.is_active else None)
    if payload.is_active:
        db.query(ModelVersion).filter(ModelVersion.is_active.is_(True)).update({"is_active": False}, synchronize_session=False)
    db.add(model)
    try:
        db.commit()
    except IntegrityError:
        # Real, easily-triggered case: (name, version) has a UniqueConstraint
        # (see models.py) - re-registering the same model version (e.g. a
        # setup script run twice) used to surface as a raw 500 with a leaked
        # SQL error instead of a clean, expected 409.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Model version '{payload.name} {payload.version}' is already registered.",
        )
    db.refresh(model)
    logger.info("Model version registered by %s: %s %s", user.email, model.name, model.version)
    return model


@router.patch("/{model_id}/activate", response_model=ModelVersionRead)
def activate_model(model_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("Admin", "Security Analyst"))):
    model = db.query(ModelVersion).filter(ModelVersion.id == model_id).first()
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model version not found")

    db.query(ModelVersion).filter(ModelVersion.is_active.is_(True)).update({"is_active": False}, synchronize_session=False)
    model.is_active = True
    model.deployed_at = datetime.utcnow()
    db.commit()
    db.refresh(model)
    logger.warning("Model version activated by %s: %s %s", user.email, model.name, model.version)
    return model
