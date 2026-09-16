# Codyssey Urban Intelligence — database layer

This service uses PostgreSQL 16 with PostGIS. AI detections are stored as immutable **observations** and clustered into persistent **events** within a configurable geographic radius (15 m by default).

## Start locally

1. From this `database/` folder, copy `.env.example` to `.env` if you need different connection settings.
2. Start PostgreSQL: `/Applications/Docker.app/Contents/Resources/bin/docker compose up -d`.
3. Create a virtual environment and install: `pip install -r requirements.txt`.
4. Apply the schema: `alembic upgrade head`.
5. Run the API: `uvicorn app.main:app --reload`.

The interactive API is at `/docs`.

## Core endpoint

`POST /events/observations` accepts an AI detection. It atomically finds an active same-type event within 15 m, updates it when present, and always saves the incoming observation. `GET /events/nearby` uses PostGIS distance filtering for the citizen app or dashboard.

Example payload:

```json
{"event_type":"pothole","latitude":12.9716,"longitude":77.5946,"confidence":0.93,"observed_at":"2026-09-16T14:31:20Z","severity":"high"}
```
