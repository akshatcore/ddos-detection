"""RBAC boundary tests.

Every route in this project is gated with `require_roles(...)` (see
backend/app/deps.py) but until now that dependency was only ever exercised
indirectly, always logged in as an Admin (see _auth_headers in
test_incidents.py/test_auth.py). That means a bug where a route's allowed-role
list was accidentally too permissive - e.g. someone adds "Viewer" to
/incidents/{id}/mitigate by copy-pasting the list from a GET route - would
never have failed a single existing test. These tests log in as each role
explicitly and assert the 403 boundary actually holds.
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


def _viewer_headers(client):
    return _login_as(client, "rbac-viewer@example.com", "Viewer")


def _analyst_headers(client):
    return _login_as(client, "rbac-analyst@example.com", "Security Analyst")


def _admin_headers(client):
    return _login_as(client, "rbac-admin@example.com", "Admin")


# --- Viewer: read-only, must be blocked from every write/action route -----

def test_viewer_can_read_incidents(test_client):
    headers = _viewer_headers(test_client)
    response = test_client.get("/incidents", headers=headers)
    assert response.status_code == 200


def test_viewer_cannot_create_incident(test_client):
    headers = _viewer_headers(test_client)
    response = test_client.post(
        "/incidents",
        json={"title": "Should be blocked", "severity": "high", "status": "open"},
        headers=headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient role permissions"


def test_viewer_cannot_mitigate_incident(test_client):
    """require_roles runs as a FastAPI dependency, before the route body -
    so this must 403 before ever touching the (nonexistent) incident id."""
    headers = _viewer_headers(test_client)
    response = test_client.post("/incidents/999999/mitigate", headers=headers)
    assert response.status_code == 403


def test_viewer_cannot_unmitigate_incident(test_client):
    headers = _viewer_headers(test_client)
    response = test_client.post("/incidents/999999/unmitigate", headers=headers)
    assert response.status_code == 403


def test_viewer_cannot_evaluate_alert(test_client):
    headers = _viewer_headers(test_client)
    response = test_client.post(
        "/alerts/evaluate",
        json={
            "flow": {
                "src_ip": "10.0.0.5", "dst_ip": "10.0.0.1", "protocol": "TCP",
                "packet_count": 10, "byte_count": 1000, "packet_rate": 5.0, "flow_duration": 2.0,
            },
            "prediction": {"predicted_label": "Benign", "confidence": 0.5, "attack_probability": 0.1, "packet_rate": 5.0},
        },
        headers=headers,
    )
    assert response.status_code == 403


def test_viewer_can_read_settings_but_not_update(test_client):
    headers = _viewer_headers(test_client)
    assert test_client.get("/settings", headers=headers).status_code == 200
    response = test_client.put("/settings", json={"confidence_threshold": 0.5}, headers=headers)
    assert response.status_code == 403


def test_viewer_cannot_register_model(test_client):
    headers = _viewer_headers(test_client)
    response = test_client.post(
        "/models",
        json={"name": "test-model", "version": "1.0", "artifact_path": "models/x.joblib"},
        headers=headers,
    )
    assert response.status_code == 403


# --- Security Analyst: can investigate/mitigate, but Settings stay Admin-only

def test_analyst_can_create_and_mitigate_incident(test_client):
    """Security Analyst is explicitly allowed on both routes (see
    require_roles("Admin", "Security Analyst") in incidents.py) - this is the
    positive-path counterpart to the Viewer 403 tests above, so a
    too-restrictive role list would also get caught, not just a too-permissive
    one."""
    headers = _analyst_headers(test_client)
    create = test_client.post(
        "/incidents",
        json={"title": "Analyst-created incident", "severity": "high", "status": "open"},
        headers=headers,
    )
    assert create.status_code == 201

    incident_id = create.json()["id"]
    # No linked flow was set on this incident, so mitigation is expected to
    # fail with a 400 (not 403) - proves the analyst got PAST the role check.
    mitigate = test_client.post(f"/incidents/{incident_id}/mitigate", headers=headers)
    assert mitigate.status_code == 400
    assert "no linked flow" in mitigate.json()["detail"].lower()


def test_analyst_cannot_update_settings(test_client):
    headers = _analyst_headers(test_client)
    response = test_client.put("/settings", json={"confidence_threshold": 0.5}, headers=headers)
    assert response.status_code == 403


# --- Admin: full access, including Settings ---------------------------------

def test_admin_can_update_settings(test_client):
    headers = _admin_headers(test_client)
    response = test_client.put("/settings", json={"confidence_threshold": 0.77}, headers=headers)
    assert response.status_code == 200
    assert response.json()["confidence_threshold"] == 0.77


def test_inactive_user_is_blocked_from_protected_routes(test_client):
    """Documents real, verified behavior of deps.get_current_user: login
    itself does NOT check is_active (see auth.py's login() - it only
    verifies the password), so a deactivated user can still successfully
    authenticate and receive a token. is_active is only enforced afterward,
    in get_current_user, when that token is used against any protected
    route - where it correctly raises 401. Pinning this down explicitly
    matters: if someone "fixes" is_active checking by adding it only to
    login(), this test still passes; if someone removes the
    get_current_user check instead (the one that actually protects every
    route), this test catches it.
    """
    session = get_session_maker()()
    role = session.query(Role).filter(Role.name == "Admin").first()
    session.add(
        User(
            email="disabled-admin@example.com",
            full_name="Disabled",
            password_hash=hash_password(PASSWORD),
            role_id=role.id,
            is_active=False,
        )
    )
    session.commit()
    session.close()

    # Login succeeds even though the account is disabled - see docstring.
    login_response = test_client.post("/auth/login", json={"email": "disabled-admin@example.com", "password": PASSWORD})
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]

    # But that token is useless against any protected route.
    blocked = test_client.get("/incidents", headers={"Authorization": f"Bearer {token}"})
    assert blocked.status_code == 401
