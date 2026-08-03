from backend.app.core.security import hash_password
from backend.app.db.session import get_session_maker
from backend.app.models import Role, User


def test_login_returns_token(test_client):
    session = get_session_maker()()
    role = session.query(Role).filter(Role.name == "Admin").first()
    user = session.query(User).filter(User.email == "tester@example.com").first()
    if not user:
        user = User(email="tester@example.com", full_name="Tester", password_hash=hash_password("Password123!"), role_id=role.id)
        session.add(user)
        session.commit()
    session.close()

    response = test_client.post("/login", json={"email": "tester@example.com", "password": "Password123!"})
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert "access_token" in body
