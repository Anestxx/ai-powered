from pathlib import Path
import os

os.environ.setdefault("YOLO_CONFIG_DIR", str(Path(__file__).resolve().parents[1] / ".cache/ultralytics"))
os.environ.setdefault("YOLO_AUTOINSTALL", "false")
Path(os.environ["YOLO_CONFIG_DIR"]).mkdir(parents=True, exist_ok=True)

from ultralytics import YOLO


class YOLODetector:
    """Small adapter that normalizes a single-class YOLO model's output."""

    class_name = ""

    def __init__(self, model_path: str | Path, confidence_threshold: float = 0.5, image_size: int = 416):
        self.model_path = Path(model_path)
        self.confidence_threshold = confidence_threshold
        self.image_size = image_size
        if not self.model_path.is_file():
            raise FileNotFoundError(f"Model weights not found: {self.model_path}")
        self.model = YOLO(str(self.model_path))

    def detect(self, frame):
        """Return only this model's detections in the project event schema."""
        results = self.model(frame, conf=self.confidence_threshold, imgsz=self.image_size, verbose=False)
        detections = []
        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = (int(value) for value in box.xyxy[0].tolist())
                detections.append({
                    "class_id": int(box.cls[0].item()),
                    "class_name": self.class_name,
                    "confidence": round(float(box.conf[0].item()), 4),
                    "bbox": [x1, y1, x2, y2],
                })
        return detections
