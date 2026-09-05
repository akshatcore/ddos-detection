from backend.app.core.security import hash_password
from backend.app.db.session import get_session_maker
from backend.app.models import Role, User


def _admin_headers(client):
    session = get_session_maker()()
    role = session.query(Role).filter(Role.name == "Admin").first()
    user = session.query(User).filter(User.email == "models-admin@example.com").first()
    if not user:
        user = User(email="models-admin@example.com", full_name="Admin", password_hash=hash_password("Password123!"), role_id=role.id)
        session.add(user)
        session.commit()
    session.close()
    token = client.post("/auth/login", json={"email": "models-admin@example.com", "password": "Password123!"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_register_model_version(test_client):
    headers = _admin_headers(test_client)
    response = test_client.post(
        "/models",
        json={"name": "random_forest", "version": "test-1.0", "artifact_path": "models/x.joblib"},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["name"] == "random_forest"


def test_duplicate_model_version_returns_409_not_500(test_client):
    """Real bug this pins down: (name, version) has a UniqueConstraint at
    the DB level - re-registering the same version used to surface as an
    unhandled IntegrityError (raw 500 with a leaked SQL error) instead of a
    clean, expected 409."""
    headers = _admin_headers(test_client)
    payload = {"name": "random_forest", "version": "dup-1.0", "artifact_path": "models/x.joblib"}

    first = test_client.post("/models", json=payload, headers=headers)
    assert first.status_code == 201

    second = test_client.post("/models", json=payload, headers=headers)
    assert second.status_code == 409
    assert "already registered" in second.json()["detail"]

    # The session must still be usable after the rollback - a route that
    # left the SQLAlchemy session in a broken state after handling the
    # error would fail here even though the endpoint itself "worked".
    listing = test_client.get("/models", headers=headers)
    assert listing.status_code == 200
