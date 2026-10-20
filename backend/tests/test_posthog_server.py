"""Server errors to PostHog (services/posthog_server.py): off without a key,
ids stripped from the route, the account id from the bearer token."""
from types import SimpleNamespace

from services import posthog_server as ps


def test_route_ids_are_stripped():
    assert ps.route_pattern("/api/schedules/6b1f2c3d-aaaa-bbbb-cccc-123456789abc/tasks/42/guide") == \
        "/api/schedules/:id/tasks/:id/guide"
    assert ps.route_pattern("/api/users/me") == "/api/users/me"


def test_no_key_means_no_client(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "posthog_api_key", "", raising=False)
    monkeypatch.setattr(ps, "_tried", False)
    monkeypatch.setattr(ps, "_client", None)
    assert ps.client() is None
    ps.capture_server_error(SimpleNamespace(url=SimpleNamespace(path="/x"), method="GET", headers={}),
                            RuntimeError("boom"), 500)       # silently off


def test_user_id_comes_from_the_token():
    from jose import jwt
    from config import settings
    tok = jwt.encode({"sub": "user-123"}, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    req = SimpleNamespace(headers={"authorization": f"Bearer {tok}"})
    assert ps.user_id_from_request(req) == "user-123"
    assert ps.user_id_from_request(SimpleNamespace(headers={})) is None
    assert ps.user_id_from_request(SimpleNamespace(headers={"authorization": "Bearer junk"})) is None


def test_errors_are_sent_with_route_and_user(monkeypatch):
    sent = {}

    class Fake:
        def capture_exception(self, exc, distinct_id=None, properties=None):
            sent.update(exc=exc, uid=distinct_id, props=properties)
    monkeypatch.setattr(ps, "client", lambda: Fake())
    req = SimpleNamespace(url=SimpleNamespace(path="/api/schedules/123/x"), method="POST", headers={})
    err = ValueError("bad")
    ps.capture_server_error(req, err, 500)
    assert sent["exc"] is err and sent["props"] == {"endpoint": "/api/schedules/:id/x", "method": "POST",
                                                    "status": 500, "source": "backend"}
