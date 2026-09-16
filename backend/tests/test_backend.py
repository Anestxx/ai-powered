import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import jwt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.core.config import get_settings
from app.core.security import create_token, current_user, password_hasher, require_roles, verify_password
from app.db.models import Event, Vehicle
from app.main import app
from app.schemas import ObservationCreate
from app.services.events import confidence_score, ingest
from app.services.live import ConnectionManager


def payload(**changes):
    return dict(observation_id=str(uuid4()), source_vehicle="BUS_001", event_type="pothole",
                confidence=0.85, latitude=13.1, longitude=77.59,
                captured_at=datetime.now(timezone.utc).isoformat()) | changes


@pytest.mark.parametrize("changes", [dict(latitude=500), dict(confidence=1.1),
    dict(event_type="unknown"), dict(captured_at="2026-01-01T00:00:00"),
    dict(captured_at=(datetime.now(timezone.utc) + timedelta(days=1)).isoformat()),
    dict(longitude=float("nan"))])
def test_invalid_observations(changes):
    with pytest.raises(ValidationError):
        ObservationCreate(**payload(**changes))


def test_independent_confirmation():
    assert confidence_score(0.85, 1) == 0.85
    assert confidence_score(0.85, 2) == pytest.approx(0.90)
    assert confidence_score(0.99, 20) == 1


def test_password_and_token():
    from types import SimpleNamespace
    hashed = password_hasher.hash("test-password")
    assert verify_password("test-password", hashed)
    assert not verify_password("wrong", hashed)
    user = SimpleNamespace(id=uuid4())
    claims = jwt.decode(create_token(user), get_settings().jwt_secret, algorithms=["HS256"])
    assert claims["sub"] == str(user.id)
    assert claims["exp"] > claims["iat"]


def test_write_auth_and_validation():
    with TestClient(app) as client:
        assert client.post("/api/v1/events/observations", json=payload()).status_code == 401
        response = client.post("/api/v1/events/observations", json=payload(latitude=500),
                               headers={"X-Edge-Key": get_settings().edge_api_key})
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"
        assert client.get("/openapi.json").status_code == 200


def test_role_restriction():
    from types import SimpleNamespace
    with pytest.raises(HTTPException) as error:
        require_roles("admin", "municipality")(SimpleNamespace(role="viewer"))
    assert error.value.status_code == 403


def test_websocket_origin():
    from starlette.websockets import WebSocketDisconnect
    with TestClient(app) as client:
        with client.websocket_connect("/ws/events", headers={"origin": "http://localhost:3000"}) as ws:
            ws.send_text("ping")
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/events", headers={"origin": "https://untrusted.invalid"}):
                pass


def test_broadcast_removes_failed_client():
    class Socket:
        def __init__(self, fail=False):
            self.fail, self.messages = fail, []
        async def send_json(self, message):
            if self.fail:
                raise RuntimeError("closed")
            self.messages.append(message)
    manager = ConnectionManager()
    good, bad = Socket(), Socket(True)
    manager.connections.update([good, bad])
    asyncio.run(manager.broadcast({"type": "event.created"}))
    assert good.messages == [{"type": "event.created"}]
    assert bad not in manager.connections


def test_postgis_ingestion_and_retry(db):
    db.add_all([Vehicle(external_vehicle_id="BUS_001"), Vehicle(external_vehicle_id="BUS_002")])
    db.flush()
    first = ObservationCreate(**payload())
    event, created, duplicate = ingest(db, first)
    assert created and not duplicate
    second = ObservationCreate(**payload(source_vehicle="BUS_002", latitude=13.100045))
    merged, created, duplicate = ingest(db, second)
    assert merged.id == event.id and not created
    assert merged.observation_count == 2
    assert merged.status == "confirmed"
    assert merged.confidence == pytest.approx(0.90)
    retried, _, duplicate = ingest(db, second)
    assert duplicate and retried.observation_count == 2
    with pytest.raises(HTTPException) as error:
        ingest(db, second.model_copy(update={"confidence": 0.5}))
    assert error.value.status_code == 409
    distant, created, _ = ingest(db, ObservationCreate(**payload(latitude=13.2)))
    assert created and distant.id != event.id


def test_api_ingestion_live_update_and_audit(db):
    from app.db.models import AuditLog, User
    from app.db.session import get_db
    from sqlalchemy import select
    db.add(Vehicle(external_vehicle_id="BUS_001"))
    officer = User(email="test@example.gov", password_hash=password_hasher.hash("test-password"), role="municipality")
    db.add(officer)
    db.flush()
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            token = client.post("/api/v1/auth/login", json={"email": officer.email, "password": "test-password"}).json()["access_token"]
            with client.websocket_connect("/ws/events") as socket:
                response = client.post("/api/v1/events/observations", json=payload(),
                    headers={"X-Edge-Key": get_settings().edge_api_key})
                assert response.status_code == 201
                event_id = response.json()["event"]["id"]
                message = socket.receive_json()
                assert message["type"] == "event.created"
                assert message["data"]["id"] == event_id
                nearby = client.get("/api/v1/events/nearby", params={"latitude": 13.1, "longitude": 77.59})
                assert nearby.json()["total"] == 1
                changed = client.patch(f"/api/v1/events/{event_id}/status", json={"status": "confirmed"},
                    headers={"Authorization": f"Bearer {token}"})
                assert changed.status_code == 200
                assert socket.receive_json()["data"]["status"] == "confirmed"
                assert db.scalar(select(AuditLog)).details == {"from": "detected", "to": "confirmed"}
    finally:
        app.dependency_overrides.clear()
