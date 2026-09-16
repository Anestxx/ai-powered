# Project structure

```text
ai-powered/
|-- project.cmd                 One command for setup, startup, checks and AI
|-- project.ps1                 PowerShell implementation invoked by project.cmd
|-- scripts/                    Shared launcher helpers and backend test runner
|-- frontend/                   React app and preserved earlier frontend variants
|-- backend/
|   |-- app/                    FastAPI routes, configuration, services and models
|   |-- migrations/             Active PostgreSQL/PostGIS schema migrations
|   |-- scripts/                Administrative commands
|   |-- tests/                  Unit/API and real PostGIS integration tests
|   |-- docker-compose.yml      Active API and database containers
|   `-- .env                    Local credentials, excluded from Git
|-- traffic-ai/
|   |-- traffic/                Vehicle inference, tracking and traffic estimates
|   |   `-- training/           Labeled dataset preparation and fine-tuning
|   |-- tests/                  Detection analysis, video export and data tests
|   |-- docs/                   Training instructions and recorded results
|   |-- models/                 Original and experimental detector weights
|   |-- datasets/               Downloaded annotations and prepared datasets
|   |-- videos/                 Input videos
|   |-- outputs/                Timestamped JSON and annotated-video results
|   |-- training-runs/          Logs, checkpoints and evaluation reports
|   `-- .venv/                  Local AI Python environment
|-- helmet-ai/
|   |-- inspect_model.py        Explicit checkpoint-load/class inspection command
|   `-- models/                 Supplied helmet checkpoint
|-- road-hazard-ai/             Imported pothole/waterlogging module
|   |-- check_assets.py         Reports missing weights and training inputs
|   `-- datasets/waterlogging/  Canonical labels; matching images still required
|-- docs/                       Project-wide documentation
`-- archive/                   Database prototype and original waterlogging export
```

## Runtime boundaries

The backend serves HTTP/WebSocket APIs on port 8000 and uses the PostGIS database
on local port 5432. Its Compose project name is explicitly `backend`, preserving
the existing `backend_postgres_data` volume regardless of the terminal directory.

Traffic AI runs locally in its own Python environment. It currently exports
JSON and annotated video; those traffic measurements are not yet published to the
backend. The helmet command only loads the supplied model and reports its classes.
The latest remote update includes a React frontend in `frontend/`. Its integration
with the active backend has not been verified.

The road-hazard module was merged during organization. Its three unit tests pass,
but its model weights and dataset images are missing. `project.cmd hazard-check`
reports these explicitly; this module is not part of backend startup.

## Models and datasets

`traffic-ai/models/yolo26n.pt` remains the active traffic detector. The two trained
checkpoints remain experimental; see the
[training results](../traffic-ai/docs/TRAINING_RESULTS.md).

The supplied helmet checkpoint is kept separately because its four classes are
different from the traffic detector's classes. The archived duplicate is retained
with the original prototype. No checkpoint or dataset was deleted or retrained
during organization.

Virtual environments, datasets, local videos and generated outputs are excluded
from normal source control. They remain at their original Traffic AI paths, so
existing dataset manifests and training logs still resolve correctly.

## Source locations changed

| Previous location | Current location |
|---|---|
| `database/` | `archive/database-prototype/` |
| `ai/traffic/models/helmet_detector.pt` | `helmet-ai/models/helmet_detector.pt` |
| `ai/traffic/test_helmet.py` | `helmet-ai/inspect_model.py` |
| `traffic-ai/src/` | `traffic-ai/traffic/` |
| Traffic AI root training implementation | `traffic-ai/traffic/training/` |
| `traffic-ai/TRAINING*.md` | `traffic-ai/docs/TRAINING*.md` |
| `01_ai_edge/` | `road-hazard-ai/` |
| `water logging.v3i.yolov8/` | `archive/waterlogging-export/` |

The root Traffic AI Python scripts remain as entry points, so previously
documented inference, training and dataset-preparation commands still work.

## Reorganization verification

Verified locally on 16 September 2026:

- Setup preserves existing credentials; fresh setup generates matching database
  credentials and distinct secrets, then leaves them intact on subsequent runs.
- Backend startup and health checks confirm the API and PostGIS connection.
- All 16 Traffic AI tests and 14 backend tests pass, including real PostGIS tests
  in the dedicated `urban_ai_connection_test` database.
- The imported road-hazard module has three passing unit tests; no inference or
  training accuracy is claimed without its missing models and images.
- The traffic command works from another directory, including paths containing
  spaces, and the original detector detects the bus in all 12 smoke-test frames.
- The helmet checkpoint loads and reports its four expected classes.
- Both prepared training datasets still resolve at their original paths.
- Archived source contents, retained model checksums and documentation links
  were verified. The archived README was updated to identify the active backend.
