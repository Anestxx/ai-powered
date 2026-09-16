# Codyssey Urban Intelligence

Codyssey is organized as a frontend and a PostGIS-backed API:

- [`frontend/`](frontend/) — the current React application.
- [`frontend/legacy-codyssey/`](frontend/legacy-codyssey/) — preserved earlier frontend variant.
- [`frontend/legacy-root-flat/`](frontend/legacy-root-flat/) — preserved flat-file frontend copy.
- [`database/`](database/README.md) — FastAPI, Alembic, PostgreSQL, and PostGIS service.

## Run the frontend

```bash
cd frontend
npm install
npm start
```

## Run the backend

```bash
cd database
DOCKER=/Applications/Docker.app/Contents/Resources/bin/docker
$DOCKER compose up -d
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload
```
