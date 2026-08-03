from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.router import api_router
from backend.app.core.config import get_settings
from backend.app.core.logging import configure_logging
from backend.app.core.security import hash_password
from backend.app.db.base import Base
from backend.app.db.session import get_engine, get_session_maker
from backend.app.models import Role, SystemSetting, User


def seed_initial_data():
    session = get_session_maker()()
    try:
        default_roles = {
            "Admin": "Full system access",
            "Security Analyst": "Investigate and mitigate alerts",
            "Viewer": "Read-only access",
        }
        for role_name, description in default_roles.items():
            if not session.query(Role).filter(Role.name == role_name).first():
                session.add(Role(name=role_name, description=description))

        session.flush()

        if not session.query(User).filter(User.email == "admin@local").first():
            admin_role = session.query(Role).filter(Role.name == "Admin").first()
            if admin_role:
                session.add(
                    User(
                        email="admin@local",
                        full_name="System Admin",
                        password_hash=hash_password("Admin123!"),
                        role_id=admin_role.id,
                        is_active=True,
                    )
                )

        defaults = {
            "confidence_threshold": 0.85,
            "packet_rate_threshold": 100.0,
            "session_timeout_minutes": 30,
            "mitigation_interface": "eth0",
        }
        for key, value in defaults.items():
            if not session.query(SystemSetting).filter(SystemSetting.key == key).first():
                session.add(SystemSetting(key=key, value=value, description=f"Default {key}"))

        session.commit()
    finally:
        session.close()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    Base.metadata.create_all(bind=get_engine())
    seed_initial_data()

    app = FastAPI(title=settings.app_name)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.backend_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)

    @app.get("/health")
    def health_check():
        return {"status": "ok"}

    return app


app = create_app()
