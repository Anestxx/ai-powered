# Codyssey Urban Intelligence

The complete backend database layer is contained in [database/](database/README.md).

```bash
cd database
DOCKER=/Applications/Docker.app/Contents/Resources/bin/docker
$DOCKER compose up -d
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload
```
