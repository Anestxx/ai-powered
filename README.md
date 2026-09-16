# Codyssey Urban Intelligence

React frontend, FastAPI + PostgreSQL/PostGIS backend, a local Traffic AI video
pipeline, a supplied helmet model and imported road-hazard code. Use `project.cmd` from this folder to run the
project. Python 3.12 and Docker Desktop are required for local development.

## Start

The Python environments and model files are already present on this laptop.

```powershell
.\project.cmd start
.\project.cmd status
```

This starts Docker Desktop if necessary, launches the backend, database and
React frontend, and checks their connection. Open http://localhost:3000 for the
application. API documentation: http://localhost:8000/docs. Frontend `/api`
requests are proxied to the backend.

For a fresh checkout, install Git LFS and run `git lfs pull`, then install the
frontend dependencies with `npm install` from `frontend/`. Run `.\project.cmd setup`
from the project root. Setup installs the pinned
Python dependencies and creates `backend/.env` with generated local credentials
only if that file does not already exist. The first Traffic AI run downloads the
original YOLO26n weights if they are missing. Available model checkpoints, the
sample road video, and saved experiment outputs are included through Git LFS.
Downloaded training datasets are recreated by the training preparation scripts.
See [snapshot contents and local-only files](docs/GITHUB_SNAPSHOT.md).

The `.cmd` launcher works with Windows' current PowerShell execution policy.
You can also invoke the underlying script directly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\project.ps1 start
```

## Run the frontend

The latest remote update includes the current [React frontend](frontend/README.md)
and two preserved variants in `frontend/legacy-codyssey/` and
`frontend/legacy-root-flat/`. Run the current app separately:

```powershell
cd frontend
npm install
npm start
```

The frontend development server proxies `/api` requests to the active backend.

## Common commands

| Task | Command |
|---|---|
| Process the supplied road clip and save annotated video | `.\project.cmd traffic -MaxFrames 100` |
| Process another video with a preview | `.\project.cmd traffic -Source .\your-video.mp4 -Show` |
| Train a new vehicle-detector experiment | `.\project.cmd train -Epochs 4` |
| Check the supplied helmet model loads | `.\project.cmd helmet-check` |
| Check road-hazard assets and missing inputs | `.\project.cmd hazard-check` |
| Run Traffic AI and backend unit tests | `.\project.cmd test` |
| Include real database integration tests | `.\project.cmd test -Integration` |
| Rebuild the backend after code/dependency changes | `.\project.cmd start -Rebuild` |
| Stop services and preserve database data | `.\project.cmd stop` |
| Show available commands | `.\project.cmd help` |

`-Source` and `-Model` paths are relative to your current terminal folder.
The launcher also works when invoked by its full path from another directory.
Use `-Model <checkpoint-path>` with `traffic` to explicitly inspect an experimental
detector. Advanced Traffic AI options remain available through its Python CLI.

## Where things live

| Folder | Purpose |
|---|---|
| [frontend/](frontend/README.md) | Current React app and preserved frontend variants |
| [backend/](backend/README.md) | Active API, database models, migrations and tests |
| [traffic-ai/](traffic-ai/README.md) | Vehicle detection, tracking, training and local results |
| [helmet-ai/](helmet-ai/README.md) | Supplied helmet checkpoint and inspection command |
| [road-hazard-ai/](road-hazard-ai/README.md) | Imported pothole/waterlogging code, labels and asset checks |
| [scripts/](scripts/) | Common PowerShell helpers and backend test runner |
| [docs/](docs/PROJECT_STRUCTURE.md) | File layout, runtime boundaries and moved-file reference |
| [archive/](archive/README.md) | Original standalone database prototype, excluded from startup |

Traffic video/JSON outputs are saved in `traffic-ai/outputs/`; training logs,
checkpoints and evaluation reports are in `traffic-ai/training-runs/`. These
saved artifacts are included in this snapshot, with binary files in Git LFS.
Downloaded training datasets, credentials, installed environments, caches, and
database volumes remain local.

## Current capabilities

The backend/database connection works. Traffic AI processes videos locally and
exports counts, tracking IDs, ROI coverage and rule-based traffic estimates.
Two detector fine-tuning experiments are saved; the original pretrained detector
remains active because the new checkpoints did not improve overall performance.
See [training results](traffic-ai/docs/TRAINING_RESULTS.md).

The dashboard reads saved Traffic AI summaries and plays annotated recordings
through the backend. Staff can register vehicles, submit observations, inspect
evidence, assign departments, and update incident statuses. Search and dashboard
totals use backend records, with WebSocket updates and polling fallback.
Traffic inference is not a live ingestion feed. The helmet checkpoint
has not been evaluated on this project's road footage. Calibrated congestion/speed,
routing and automated alerts remain later work.

The imported road-hazard module currently lacks its pothole/waterlogging weights
and waterlogging images. Its 502 labels are organized under
`road-hazard-ai/datasets/waterlogging/`; the original export is preserved in
`archive/waterlogging-export/`. This module needs those missing assets before
real inference or training can run.
