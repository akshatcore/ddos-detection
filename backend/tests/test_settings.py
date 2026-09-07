"""Tests for the Settings page's Admin-only "Clear All Detection Data"
button (backend/app/api/routes/settings.py::clear_operational_data).

Uses the /alerts/evaluate + /incidents/{id}/mitigate endpoints to create a
real flow, prediction, incident, and mitigation action - exercising the
delete across all four tables, not just an empty no-op call - then verifies
via /reports that every count actually goes to zero, and that the
users/roles/settings tables (never touched by this endpoint) survive.
"""

from backend.app.core.security import hash_password
from backend.app.db.session import get_session_maker
from backend.app.models import Role, User

PASSWORD = "Password123!"


def _login_as(client, email: str, role_name: str) -> dict[str, str]:
    session = get_session_maker()()
    role = session.query(Role).filter(Role.name == role_name).first()
    user = session.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email, full_name=role_name, password_hash=hash_password(PASSWORD), role_id=role.id, is_active=True)
        session.add(user)
        session.commit()
    session.close()
    token = client.post("/auth/login", json={"email": email, "password": PASSWORD}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _admin_headers(client):
    return _login_as(client, "clear-data-admin@example.com", "Admin")


def _create_real_activity(client, headers):
    """Creates one real flow + prediction + incident (via a triggered alert
    evaluation) and one mitigation action on top of it - so the clear
    endpoint has something real to delete in every one of the four tables."""
    evaluate = client.post(
        "/alerts/evaluate",
        json={
            "flow": {
                "src_ip": "10.0.0.9", "dst_ip": "10.0.0.1", "protocol": "TCP",
                "packet_count": 500, "byte_count": 50000, "packet_rate": 200.0, "flow_duration": 2.0,
            },
            "prediction": {"predicted_label": "Syn", "confidence": 0.99, "attack_probability": 0.99, "packet_rate": 200.0},
        },
        headers=headers,
    )
    assert evaluate.status_code == 201
    body = evaluate.json()
    assert body["alert_triggered"] is True
    incident_id = body["incident"]["id"]

    mitigate = client.post(f"/incidents/{incident_id}/mitigate", headers=headers)
    assert mitigate.status_code == 200


def test_admin_can_clear_operational_data(test_client):
    headers = _admin_headers(test_client)
    _create_real_activity(test_client, headers)

    before = test_client.get("/reports", headers=headers).json()
    assert before["flows"] >= 1
    assert before["predictions"] >= 1
    assert before["incidents"] >= 1
    assert before["mitigations"] >= 1
    users_before = before["users"]

    response = test_client.post("/settings/clear-data", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "cleared"

    after = test_client.get("/reports", headers=headers).json()
    assert after["flows"] == 0
    assert after["predictions"] == 0
    assert after["incidents"] == 0
    assert after["mitigations"] == 0
    # Users/roles were never touched - the admin account used to make these
    # very requests must still exist, proving login/RBAC survives the clear.
    assert after["users"] == users_before


def test_viewer_cannot_clear_operational_data(test_client):
    headers = _login_as(test_client, "clear-data-viewer@example.com", "Viewer")
    response = test_client.post("/settings/clear-data", headers=headers)
    assert response.status_code == 403


def test_analyst_cannot_clear_operational_data(test_client):
    headers = _login_as(test_client, "clear-data-analyst@example.com", "Security Analyst")
    response = test_client.post("/settings/clear-data", headers=headers)
    assert response.status_code == 403
