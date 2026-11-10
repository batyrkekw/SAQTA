from sqlalchemy import func, select

from app.api import admin, auth
from app.models import AuthSession
from test_auth_hardening import access_client as inherited_access_client, signup


access_client = inherited_access_client


def test_password_reset_during_verification_cannot_issue_stale_session(access_client, monkeypatch):
    client, factory = access_client
    owner = signup(client)
    other = signup(client, "other")
    credentials = {"email": "owner@example.com", "password": "test-password-123"}
    replacement = "replacement-password-456"
    original_check = auth.check_password

    def reset_after_verification(password, encoded):
        valid = original_check(password, encoded)
        assert valid
        # Deterministically reproduce another request completing its password
        # reset after scrypt verified the old hash but before session issuance.
        with factory() as db:
            admin.reset_password(admin.ResetPasswordRequest(email=credentials["email"], password=replacement), db)
        return valid

    with monkeypatch.context() as patch:
        patch.setattr(auth, "check_password", reset_after_verification)
        result = client.post("/api/auth/login", json=credentials)

    assert result.status_code == 401
    assert "token" not in result.json()
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(AuthSession).where(AuthSession.user_id == owner["user"]["id"])) == 0
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {owner['token']}"}).status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {other['token']}"}).status_code == 200
    assert client.post("/api/auth/login", json=credentials).status_code == 401
    assert client.post("/api/auth/login", json={**credentials, "password": replacement}).status_code == 200
