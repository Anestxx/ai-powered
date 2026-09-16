# AI Edge Road Hazards

Three independent YOLO models are supported: potholes, waterlogging, and road accidents.
- Potholes: `models/pothole/best.pt` (orange boxes)
- Waterlogging: `models/waterlogging/best.pt` (blue boxes)
- Accidents: `models/accident/best.pt` (purple boxes)

## Before training or running video inference

- Add real annotated waterlogging images and labels to `datasets/waterlogging/`; see [its dataset guide](datasets/waterlogging/README.md).
- Add real annotated accident images and labels to `datasets/accident/`; see [its dataset guide](datasets/accident/README.md).
- Add test videos in `videos/road_test.mp4` and `videos/accident.mp4`, or provide a path with `--video`.
- Training uses the project-local `yolo11n.pt` checkpoint for transfer learning. It trains models independently without overwriting weights from other classes.

Run from this directory:

```powershell
# Run road hazard detection on accident video
python main.py --video videos/accident.mp4 --show

# Run only accident detection on accident video
python main.py --video videos/accident.mp4 --accident-only --show

# Run road hazard detection on general road test video
python main.py --video videos/road_test.mp4 --show --save-evidence

# Train accident model
python training/train_accident.py

# Train waterlogging model
python training/train_waterlogging.py

# Run all unit tests
python -m unittest discover -s tests -v
```

`--loop` continuously restarts a saved video. For a live webcam, use `--camera 0`. Stop either mode safely with `Ctrl+C`.

Inference uses 416px by default to be practical on CPU. Use `--imgsz 320` for faster processing or `--imgsz 640` for more detail.

Use `--show` to view the annotated video live:
- **Orange boxes**: Potholes
- **Blue boxes**: Waterlogging
- **Purple boxes**: Accidents
Press `Q` or `Esc` to close the preview.

To automatically run the complete road-hazard pipeline after successful waterlogging training:

```powershell
python training/train_waterlogging.py --video videos/road_test.mp4 --save-evidence
```

For a lower-memory CPU-only prototype run (40 epochs at 320px, batch 4, disk caching), use:

```powershell
python training/train_waterlogging.py --fast --video videos/road_test.mp4 --save-evidence
```
