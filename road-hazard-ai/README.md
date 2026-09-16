# AI Edge Road Hazards

This module was imported as `01_ai_edge/` and is now grouped with the other AI
modules. It runs separate pothole and waterlogging models when their weights
are available. **Both inference checkpoints and the waterlogging images are
currently missing from this checkout.** Training argument logs alone are not
trained weights.

From the project root, inspect asset readiness with:

```powershell
.\project.cmd hazard-check
```

The canonical dataset contains 471 training labels and 31 validation labels;
matching images belong in `datasets/waterlogging/images/train` and `images/val`.
The original dataset export, source attribution and duplicate labels are retained
in `../archive/waterlogging-export/`. `configs/waterlogging.yaml` is the active
dataset configuration; the archived export's relative paths are historical.

Use the installed `../traffic-ai/.venv/Scripts/python.exe` environment for this
module. Its dependencies are covered by the pinned Traffic AI requirements.
The common project test command includes this module's three unit tests.
Events are local detections; this code does not publish them to the backend.

Required inference weights: `models/pothole/best.pt` and
`models/waterlogging/best.pt`. These are distinct from the general vehicle model.

## Before training or running video inference

- Add real annotated waterlogging images and labels to `datasets/waterlogging/`; see [its dataset guide](datasets/waterlogging/README.md).
- Add a real test video at `videos/road_test.mp4`, or provide a path with `--video`.
- Training uses the project-local `yolo11n.pt` checkpoint for waterlogging transfer learning only. It never trains or overwrites the pothole weights.

Run from this directory:

```powershell
..\traffic-ai\.venv\Scripts\python.exe main.py --video videos/road_test.mp4
..\traffic-ai\.venv\Scripts\python.exe main.py --video videos/road_test.mp4 --loop --save-evidence
..\traffic-ai\.venv\Scripts\python.exe main.py --camera 0 --save-evidence
..\traffic-ai\.venv\Scripts\python.exe main.py --video videos/road_test.mp4 --show --save-evidence
..\traffic-ai\.venv\Scripts\python.exe training/train_waterlogging.py
..\traffic-ai\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

`--loop` continuously restarts a saved video. For a live webcam, use `--camera 0`. Stop either mode safely with `Ctrl+C`.

Inference uses 416px by default to be practical on CPU. Use `--imgsz 320` for faster processing or `--imgsz 640` for more detail.

Use `--show` to view the annotated video live. Orange boxes are potholes, blue boxes are waterlogging; press `Q` or `Esc` to close the preview.

To automatically run the complete road-hazard pipeline after successful waterlogging training:

```powershell
..\traffic-ai\.venv\Scripts\python.exe training/train_waterlogging.py --video videos/road_test.mp4 --save-evidence
```

For a lower-memory CPU-only prototype run (40 epochs at 320px, batch 4, disk caching), use:

```powershell
..\traffic-ai\.venv\Scripts\python.exe training/train_waterlogging.py --fast --video videos/road_test.mp4 --save-evidence
```
