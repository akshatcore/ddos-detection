from fastapi import APIRouter

from backend.app.api.routes import alerts, auth, incidents, models, reports, settings


api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(incidents.router)
api_router.include_router(alerts.router)
api_router.include_router(reports.router)
api_router.include_router(models.router)
api_router.include_router(settings.router)
