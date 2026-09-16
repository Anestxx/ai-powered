# Urban Intelligence backend

Independent FastAPI service for the first three milestones in the supplied backend plan: AI observation ingestion, PostGIS deduplication and public live event updates. No inference runs here.

## Run with Docker

From the project root, `project.cmd start` starts Docker Desktop if needed,
launches this Compose project and verifies its database health. Use
`project.cmd test -Integration` for all tests including the dedicated PostGIS
test database. The common launcher preserves existing `backend/.env` credentials.

From this folder in PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Edit .env: replace JWT_SECRET and EDGE_API_KEY with random secrets.
docker compose up --build -d --wait
docker compose exec api python -m scripts.create_admin officer@example.gov
```

Swagger: http://localhost:8000/docs. Health: http://localhost:8000/api/v1/health.
Database migrations run before API startup. PostgreSQL data persists in the Compose volume.
The API health check verifies a database query, and `--wait` waits for both services
to be healthy. Database connection attempts time out after five seconds.
Both services restart when Docker restarts unless you explicitly stop them.
The example database password is for local development; use a URL-safe random password when replacing it in Compose.

## Run without Docker

Requires Python 3.12+ and a running PostgreSQL database with PostGIS available.

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt -c requirements-lock.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Set DATABASE_URL and secrets in .env.
.venv\Scripts\alembic upgrade head
.venv\Scripts\python -m scripts.create_admin officer@example.gov
.venv\Scripts\uvicorn app.main:app --reload
```

## Try the workflow

1. POST `/api/v1/auth/login` with JSON `email` and `password`. Use the returned bearer token in Swagger's Authorize dialog.
2. POST `/api/v1/vehicles` with `{"external_vehicle_id":"BUS_001"}`. Register `BUS_002` as well.
3. Authorize the edge API key, then POST `/api/v1/events/observations`:

```json
{
  "observation_id": "a6fc44bd-8e53-423a-9447-9ecffeb03f52",
  "source_vehicle": "BUS_001",
  "event_type": "pothole",
  "confidence": 0.85,
  "latitude": 13.1,
  "longitude": 77.59,
  "captured_at": "REPLACE_WITH_CURRENT_ISO_TIMESTAMP_WITH_TIMEZONE"
}
```

Use `X-Edge-Key` for edge writes. Generate a new UUID for every detection. A retry with the same UUID and payload returns the existing event; a changed payload returns 409. Timestamps must include a timezone, be at most 30 days old, and at most 5 minutes in the future.

4. Send a new observation UUID from `BUS_002` at latitude `13.100045` (~5 m away). It should return the same event with count 2 and confidence 0.90, confirmed.
5. GET `/api/v1/events` or `/api/v1/events/nearby?latitude=13.1&longitude=77.59&radius=1000`.
6. Connect to `ws://localhost:8000/ws/events` before sending another observation. Messages contain `type` (`event.created` or `event.updated`) and public event `data`.

## Implemented behavior

- Separate vehicle, event, observation, evidence, user and audit tables with spatial indexes.
- Same-type nearest active event matching, using radii of 10–100 metres by event type.
- Transactional ingestion serialized by a PostgreSQL advisory lock for MVP correctness under concurrent retries.
- Confidence = average model confidence + 0.05 per additional independent bus, bonus capped at 0.20, total capped at 1. This is a prototype score, not a calibrated probability.
- Pagination, type/status/severity filters, nearby queries and event details.
- Argon2 password hashes, expiring JWTs, role-protected vehicle registration and status transitions with audit records.
- Evidence URL metadata is protected and excluded from public event responses; referenced files are neither downloaded nor served by this API.
- UTC capture times and monotonic vehicle/latest-event timestamps; invalid input returns consistent errors.
- Restricted CORS and WebSocket browser origins; post-commit live broadcasts.

Public reads show detected events as well as confirmed events; consumers should display status and confidence. WebSockets are best-effort, process-local and require **one API worker**. Re-fetch the REST list after reconnecting. No replay or guaranteed delivery is implemented.

## Tests

```powershell
.venv\Scripts\python -m pytest -q
# Optional real PostGIS test (dedicated database name must end in _test):
$env:TEST_DATABASE_URL = 'postgresql+psycopg://urban:urban_local@127.0.0.1:5432/urban_ai_test'
.venv\Scripts\python -m pytest -q
```

The PostGIS test skips explicitly without TEST_DATABASE_URL. It creates missing tables in that dedicated database and rolls back test data. Unit/API tests cover validation, edge authentication, JWT/password behavior, permissions and live connections.

## Frontend integration

The frontend also uses these implemented endpoints:

- `GET /api/v1/auth/me`: authenticated staff identity and role; login also returns this profile.
- `GET /api/v1/dashboard/summary`: global totals grouped by status and incident type.
- `GET /api/v1/events?q=...`: global text search combined with filters and pagination; nearby search accepts the same filters.
- `GET /api/v1/vehicles`: role-protected fleet search and pagination.
- `POST /api/v1/staff/observations`: admin/transport ingestion using the existing validation, deduplication, and live broadcasts.
- `PATCH /api/v1/events/{id}/assignment`: audited department assignment for admin/municipality staff.
- `GET /api/v1/traffic/runs`, `/runs/{id}`, and `/runs/{id}/video`: saved analysis metadata and browser-compatible annotated recordings.

The Docker API mounts `traffic-ai/outputs` read-only and includes FFmpeg. Video
conversion is cached in the container's temporary directory. For a directly
launched API, install FFmpeg on PATH and optionally set `TRAFFIC_OUTPUTS_DIR`.
Saved analyses do not create live road events or calibrated traffic measurements.

## Next stages

Live traffic snapshots/road segments, vehicle telemetry endpoint, emergency expiration/alerts, suspected violation review, advanced dashboard analytics, evidence uploads/object storage, user-management API, time-range filtering, demo data and scheduled confidence decay remain to be implemented. Auto-resolution must wait for bus pass-by evidence. Routing algorithms belong to the GIS team.

Before deployment add HTTPS at the proxy, per-device edge credentials, login rate limiting and a durable notification broker if using multiple workers. This is the initial backend milestone, not the entire 105-section platform.

Implementation references: [FastAPI JWT security](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/) and [GeoAlchemy2](https://geoalchemy-2.readthedocs.io/en/stable/core_tutorial.html).
