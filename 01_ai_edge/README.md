# AI Edge Road Hazards

Two independent YOLO models are used: potholes and waterlogging. The supplied pothole model is at `models/pothole/best.pt`. Train waterlogging separately to create `models/waterlogging/best.pt`.

## Before training or running video inference

- Add real annotated waterlogging images and labels to `datasets/waterlogging/`; see [its dataset guide](datasets/waterlogging/README.md).
- Add a real test video at `videos/road_test.mp4`, or provide a path with `--video`.
- Training uses the project-local `yolo11n.pt` checkpoint for waterlogging transfer learning only. It never trains or overwrites the pothole weights.

Run from this directory:

```powershell
python main.py --video videos/road_test.mp4
python main.py --video videos/road_test.mp4 --loop --save-evidence
python main.py --camera 0 --save-evidence
python main.py --video videos/road_test.mp4 --show --save-evidence
python training/train_waterlogging.py
python -m unittest discover -s tests -v
```

`--loop` continuously restarts a saved video. For a live webcam, use `--camera 0`. Stop either mode safely with `Ctrl+C`.

Inference uses 416px by default to be practical on CPU. Use `--imgsz 320` for faster processing or `--imgsz 640` for more detail.

Use `--show` to view the annotated video live. Orange boxes are potholes, blue boxes are waterlogging; press `Q` or `Esc` to close the preview.

To automatically run the complete road-hazard pipeline after successful waterlogging training:

```powershell
python training/train_waterlogging.py --video videos/road_test.mp4 --save-evidence
```

For a lower-memory CPU-only prototype run (40 epochs at 320px, batch 4, disk caching), use:

```powershell
python training/train_waterlogging.py --fast --video videos/road_test.mp4 --save-evidence
```
