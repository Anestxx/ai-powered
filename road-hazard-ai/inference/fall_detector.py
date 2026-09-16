from pathlib import Path

from ultralytics import YOLO


class FallDetector:
    """Conservative person-only fallback for an untrained accident checkpoint."""

    def __init__(self, model_path: str | Path, confidence_threshold: float = 0.45,
                 image_size: int = 416):
        self.model_path = Path(model_path)
        if not self.model_path.is_file():
            raise FileNotFoundError(f"Fall detector weights not found: {self.model_path}")
        self.model = YOLO(str(self.model_path))
        self.confidence_threshold = confidence_threshold
        self.image_size = image_size
        self._hold_frames = 0
        self._last_fall = None

    def detect(self, frame):
        height, _ = frame.shape[:2]
        results = self.model(frame, classes=[0], conf=min(self.confidence_threshold, 0.25),
                             imgsz=self.image_size, verbose=False)
        detections = []
        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = (int(value) for value in box.xyxy[0].tolist())
                width = x2 - x1
                box_height = y2 - y1
                is_horizontal = width / max(box_height, 1) >= 0.9
                is_on_ground = y2 >= height * 0.78
                if not (is_horizontal and is_on_ground):
                    continue
                detections.append({
                    "class_id": 0,
                    "class_name": "accident",
                    "label": "accident/fallen rider",
                    "confidence": round(float(box.conf[0].item()), 4),
                    "bbox": [x1, y1, x2, y2],
                })
        if detections:
            self._last_fall = detections[0]
            self._hold_frames = 45
        elif self._hold_frames:
            self._hold_frames -= 1
            detections = [self._last_fall]
        return detections