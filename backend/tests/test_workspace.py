from datetime import datetime, timezone
from uuid import uuid4
import json
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.core.config import get_settings
from app.core.security import current_user, password_hasher
from app.db.models import AuditLog, Event, User
from app.db.session import get_db
from app.main import app
from app.services.events import point


def test_staff_workflow_with_database(db):
    user = User(email='workspace@example.gov', password_hash=password_hasher.hash('workspace-test-password'), role='admin')
    db.add(user); db.flush()
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            login = client.post('/api/v1/auth/login', json={'email': user.email, 'password': 'workspace-test-password'})
            assert login.status_code == 200
            assert login.json()['user']['role'] == 'admin'
            headers = {'Authorization': 'Bearer ' + login.json()['access_token']}
            assert client.get('/api/v1/auth/me', headers=headers).json()['email'] == user.email
            vehicle = client.post('/api/v1/vehicles', json={'external_vehicle_id': ' TEST_BUS ', 'route_id': '500D'}, headers=headers)
            assert vehicle.status_code == 201
            assert vehicle.json()['external_vehicle_id'] == 'TEST_BUS'
            assert client.get('/api/v1/vehicles?q=TEST_BUS', headers=headers).json()['total'] == 1
            body = {'observation_id': str(uuid4()), 'source_vehicle': 'TEST_BUS', 'event_type': 'pothole',
                    'confidence': .88, 'latitude': 12.9716, 'longitude': 77.5946,
                    'captured_at': datetime.now(timezone.utc).isoformat(), 'evidence_url': 'https://example.com/evidence.jpg'}
            with client.websocket_connect('/ws/events') as socket:
                response = client.post('/api/v1/staff/observations', json=body, headers=headers)
                assert response.status_code == 201
                event = response.json()['event']
                assert socket.receive_json()['data']['id'] == event['id']
                retry = client.post('/api/v1/staff/observations', json=body, headers=headers)
                assert retry.json()['duplicate'] is True
                assert retry.json()['event']['observation_count'] == 1
                assignment = client.patch(f"/api/v1/events/{event['id']}/assignment", json={'assigned_department': 'Drainage %_team'}, headers=headers)
                assert assignment.status_code == 200
                assert socket.receive_json()['data']['assigned_department'] == 'Drainage %_team'
                status = client.patch(f"/api/v1/events/{event['id']}/status", json={'status': 'confirmed'}, headers=headers)
                assert status.status_code == 200
                assert socket.receive_json()['data']['status'] == 'confirmed'
            assert client.get('/api/v1/events', params={'q': '%_team'}).json()['total'] == 1
            nearby = client.get('/api/v1/events/nearby', params={'latitude': 12.9716, 'longitude': 77.5946, 'q': 'Drainage', 'severity': 'high'})
            assert nearby.json()['total'] == 0
            nearby = client.get('/api/v1/events/nearby', params={'latitude': 12.9716, 'longitude': 77.5946, 'q': 'Drainage', 'status': 'confirmed'})
            assert nearby.json()['total'] == 1
            assert len(client.get(f"/api/v1/events/{event['id']}/evidence", headers=headers).json()) == 1
            summary = client.get('/api/v1/dashboard/summary').json()
            assert summary['total'] == 1 and summary['by_type']['pothole'] == 1
            fleet = client.get('/api/v1/vehicles', headers=headers).json()['items'][0]
            assert fleet['last_seen'] and fleet['latitude'] == 12.9716
            assert len(db.scalars(select(AuditLog)).all()) == 2
    finally:
        app.dependency_overrides.clear()


def test_search_and_summary_include_records_beyond_first_page(db):
    now = datetime.now(timezone.utc)
    for index in range(55):
        db.add(Event(event_type='road_damage', status='confirmed', severity='high', confidence=.9,
                     latitude=12.97, longitude=77.59, location=point(12.97, 77.59),
                     first_seen=now, last_seen=now, assigned_department='Unique department' if index == 54 else None))
    db.flush()
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            assert len(client.get('/api/v1/events').json()['items']) == 50
            assert len(client.get('/api/v1/events?page=2').json()['items']) == 5
            assert client.get('/api/v1/events?q=Unique').json()['total'] == 1
            assert client.get('/api/v1/events?q=road%20damage').json()['total'] == 55
            assert client.get('/api/v1/dashboard/summary').json()['by_type']['road_damage'] == 55
    finally:
        app.dependency_overrides.clear()


def test_workspace_permissions():
    with TestClient(app) as client:
        assert client.get('/api/v1/vehicles').status_code == 401
        assert client.get('/api/v1/auth/me').status_code == 401
        app.dependency_overrides[current_user] = lambda: SimpleNamespace(id=uuid4(), email='viewer@example.gov', role='viewer')
        try:
            assert client.get('/api/v1/vehicles').status_code == 403
            assert client.post('/api/v1/staff/observations', json={}).status_code == 403
            assert client.patch(f'/api/v1/events/{uuid4()}/assignment', json={'assigned_department': 'Test'}).status_code == 403
        finally:
            app.dependency_overrides.clear()


def test_traffic_library_hides_paths_and_rejects_unknown_ids(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), 'traffic_outputs_dir', tmp_path)
    folder = tmp_path / 'run-01'; folder.mkdir()
    (folder / 'summary.json').write_text(json.dumps({'frames_processed': 10, 'model': r'C:\private\models\detector.pt', 'max_visible_vehicles': 3}))
    (tmp_path / 'summary.json').write_text('invalid-json')
    with TestClient(app) as client:
        response = client.get('/api/v1/traffic/runs')
        assert response.status_code == 200
        data = response.json()
        assert data['total'] == 1
        assert data['items'][0]['model'] == 'detector.pt'
        assert 'private' not in response.text
        run_id = data['items'][0]['id']
        assert client.get(f'/api/v1/traffic/runs/{run_id}').status_code == 200
        assert client.get(f'/api/v1/traffic/runs/{run_id}/video').status_code == 404
        assert client.get('/api/v1/traffic/runs/unknown/video').status_code == 404
