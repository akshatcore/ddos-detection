import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import get_settings
from backend.app.db.base import Base
from backend.app.db.session import get_engine, get_session_maker
from backend.app.main import create_app


@pytest.fixture()
def test_client(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./test-backend.db")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret")
    monkeypatch.setenv("SESSION_TIMEOUT_MINUTES", "30")
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_maker.cache_clear()

    engine = get_engine()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    app = create_app()
    with TestClient(app) as client:
        yield client
