# Traffic AI MVP

The first Traffic Intelligence module for the BMTC urban intelligence project:

`Video -> YOLO26n -> BoT-SORT tracks -> image ROI -> visible counts + box coverage -> traffic estimate`

For supervised vehicle-detector fine-tuning, dataset preparation, saved checkpoints
and measured evaluation reports, see [TRAINING.md](docs/TRAINING.md).
Completed runs and the current model choice are recorded in
[TRAINING_RESULTS.md](docs/TRAINING_RESULTS.md).

Detects cars, motorcycles, buses, trucks and bicycles. The pretrained classes do
not provide dedicated auto-rickshaw or ambulance recognition.

## Run on Windows

From the project root, the common launcher handles working directories:

```powershell
.\project.cmd traffic -MaxFrames 100 -Show
.\project.cmd traffic -Source .\traffic-ai\videos\road_test.mp4
.\project.cmd train -Epochs 4
```

The launcher uses `road_test.mp4` when `-Source` is omitted and always saves an
annotated video. Source paths are relative to your current terminal folder.
The Python CLI below remains available for all advanced options.

From this folder, using Python 3.12:

```powershell
# First-time setup; already installed in this workspace:
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt -c requirements-lock.txt

# Use your own video path, or put a clip at videos/traffic.mp4:
.venv\Scripts\python traffic_ai.py --source "videos/traffic.mp4" --save-video --show
```

Press Q to stop the preview. Omit `--show` to run without a window. CPU is the
default device. The first run downloads the official `yolo26n.pt` weights into
`models/`; the current workspace already has them. A compatible GPU-enabled
PyTorch installation is needed before selecting a CUDA device with `--device`.

On macOS/Linux, use `.venv/bin/python` in place of `.venv\Scripts\python`.
The dependency constraints record the versions tested on Windows/Python 3.12.

Useful options:

```powershell
# Quick headless check of an actual road clip:
.venv\Scripts\python traffic_ai.py --source "C:\path\to\traffic.mp4" --max-frames 100 --save-video

# Change the approximate road region (default ignores the top 30%):
.venv\Scripts\python traffic_ai.py --source videos/traffic.mp4 --roi-top 0.4

# Supply the actual first-frame capture time and optional source metadata:
.venv\Scripts\python traffic_ai.py --source videos/traffic.mp4 --recorded-at "2026-09-16T19:15:34+05:30" --bus-id BMTC_2047 --road-id ROAD_001

# Explicitly open a local camera:
.venv\Scripts\python traffic_ai.py --camera-index 0 --show
```

`--fps` overrides missing/incorrect source FPS, including fractional values.
No camera opens unless `--camera-index` is requested. Missing/unreadable videos
produce an error instead of a successful empty run.

## Outputs and meaning

Every run creates a separate timestamped folder under `outputs/`:

- `metrics.jsonl`: one JSON record per processed frame, including per-class
  counts, current visible total, track IDs/boxes, ROI occupancy and traffic label.
- `summary.json`: processed frames, highest simultaneous visible count,
  processing speed and output filenames.
- `annotated.mp4`: bounding boxes, IDs and metrics, when `--save-video` is used.

`total_vehicles` is the number currently visible in the selected image region.
It is not the number of vehicles that passed the road. Track IDs may change
after occlusion; they are not permanent vehicle identities.

`roi_occupancy` is the union of vehicle bounding-box areas inside the rectangular
image ROI, divided by that ROI's area. Overlaps count once, and boxes are clipped
at the ROI boundaries, keeping this fraction between zero and one. Vehicles are
selected by their bottom-center relative to the ROI. This is image coverage,
not a measured percentage of physical road area or vehicles per kilometre.

Tracking uses full frames for camera motion compensation, followed by ROI
filtering. It does not yet segment lanes or the drivable road surface.

The supplied MVP traffic rules are retained:

| Label | Visible vehicles | ROI occupancy |
|---|---:|---:|
| LOW | At most 5 | Below 0.10 |
| MODERATE | At most 12 | Below 0.25 |
| HIGH | At most 25 | Below 0.45 |
| SEVERE | Otherwise | Otherwise |

Evaluate rows in order; both conditions must hold. Thus 26 vehicles with 39%
coverage returns SEVERE, correcting the inconsistent example in the proposal.
These are uncalibrated rules: a single nearby bus can cover most of the frame
and produce SEVERE. Ground-truth traffic footage, road segmentation and motion
measurements are needed before interpreting these labels as actual congestion.

For recordings, `video_time_seconds` is frame index divided by source FPS;
constant-frame-rate footage is expected. `captured_at` stays null unless the
real first-frame time is provided via `--recorded-at`. `processed_at` is always
the actual processing time. For a live camera, `captured_at` records frame
receipt time, not a hardware timestamp. GPS is not inferred or fabricated.

## Backend integration scope

This milestone exports observations locally. It does not send them to the
backend yet. The existing `/api/v1/events/observations` endpoint accepts individual
road events, whereas these outputs are per-frame traffic measurements. A traffic
snapshot API/schema, authenticated publishing and GPS/road-segment association
are later integration work. The backend/database services keep their existing
dependencies and schema.

Vehicle flow, calibrated speed, queue length, traffic prediction, route
optimization, violation detection and emergency alerts are future milestones.

## File layout

- `traffic/`: inference, tracking, analysis and shared project paths.
- `traffic/training/`: dataset preparation and detector training.
- `tests/`: unit and video-pipeline tests.
- `docs/`: training instructions and completed experiment results.
- `models/`, `videos/`, `outputs/`, `training-runs/`: saved artifacts included in
  the GitHub snapshot; binary files use Git LFS.
- `datasets/`: local training data recreated by the preparation scripts.
- Root Python scripts and `train.ps1`: stable terminal entry points.

Inference and training share `traffic/paths.py`, so artifact paths do not depend
on the terminal's current directory. Local datasets, models and environments
were preserved during the source-code reorganization.

## Verification

```powershell
.venv\Scripts\python -m unittest discover -s tests -v
.venv\Scripts\python -m pip check
```

Tests cover overlap and ROI clipping, vehicle filtering, per-frame count
semantics, threshold boundaries, timestamps and real video/JSON export with an
injected detector. The actual YOLO26/BoT-SORT pipeline was also exercised on a
12-frame synthetic pan of Ultralytics' packaged `bus.jpg`; that is a software
smoke test, not validation on real Bengaluru traffic. Its outputs are under
`outputs/smoke-test/`. A real bus-camera clip is still needed for field validation.

References: [Ultralytics tracking](https://docs.ultralytics.com/modes/track/)
and [YOLO26](https://docs.ultralytics.com/models/yolo26/).
