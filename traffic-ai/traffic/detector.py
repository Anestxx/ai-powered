from .traffic_analyzer import Detection, VEHICLE_NAMES


class VehicleTracker:
    def __init__(self, model_path: str, confidence: float = 0.35,
                 device: str = "cpu", image_size: int = 640):
        from ultralytics import YOLO

        self.model = YOLO(model_path)
        self.confidence = confidence
        self.device = device
        self.image_size = image_size
        self.classes = [index for index, name in self.model.names.items() if name in VEHICLE_NAMES]
        if not self.classes:
            raise ValueError("The model has no supported vehicle classes")

    def track(self, frame) -> list[Detection]:
        # Track full frames so camera motion compensation can use their context.
        result = self.model.track(
            frame, persist=True, tracker="botsort.yaml", classes=self.classes,
            conf=self.confidence, device=self.device, imgsz=self.image_size,
            verbose=False, save=False, show=False,
        )[0]
        boxes = result.boxes
        if boxes is None or len(boxes) == 0:
            return []
        coordinates = boxes.xyxy.cpu().tolist()
        classes = boxes.cls.cpu().tolist()
        scores = boxes.conf.cpu().tolist()
        ids = boxes.id.cpu().tolist() if boxes.id is not None else [None] * len(boxes)
        return [Detection(self.model.names[int(class_id)], tuple(coords), float(score),
                          int(track_id) if track_id is not None else None)
                for coords, class_id, score, track_id in zip(coordinates, classes, scores, ids)]
