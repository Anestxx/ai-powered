from pathlib import Path

from .base_detector import YOLODetector


class AccidentDetector(YOLODetector):
    """Detects road-accident evidence visible in a road-facing CCTV frame."""

    class_name = "accident"

    def __init__(self, model_path: str | Path | None = None, confidence_threshold: float = 0.5,
                 image_size: int = 416):
        default_path = Path(__file__).resolve().parents[1] / "models" / "accident" / "best.pt"
        super().__init__(model_path or default_path, confidence_threshold, image_size)
        model_names = set(self.model.names.values()) if isinstance(self.model.names, dict) else set(self.model.names)
        if model_names != {"accident"}:
            raise ValueError(
                f"Incompatible accident checkpoint {self.model_path}: expected one class named "
                f"'accident', found {sorted(model_names)}. Do not pass yolo11n.pt here; train "
                "datasets/accident first."
            )
