from backend.app.core.security import hash_password
from backend.app.db.session import get_session_maker
from backend.app.models import Role, User


def _auth_headers(client):
    session = get_session_maker()()
    role = session.query(Role).filter(Role.name == "Admin").first()
    user = session.query(User).filter(User.email == "incident-admin@example.com").first()
    if not user:
        user = User(email="incident-admin@example.com", full_name="Admin", password_hash=hash_password("Password123!"), role_id=role.id)
        session.add(user)
        session.commit()
    session.close()
    token = client.post("/auth/login", json={"email": "incident-admin@example.com", "password": "Password123!"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_and_list_incident(test_client):
    headers = _auth_headers(test_client)
    response = test_client.post(
        "/incidents",
        json={"title": "Test incident", "description": "manual", "severity": "high", "status": "open"},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["title"] == "Test incident"

    list_response = test_client.get("/incidents", headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.json()) >= 1
