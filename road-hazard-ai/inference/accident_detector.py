from pathlib import Path

from .base_detector import YOLODetector


class AccidentDetector(YOLODetector):
    """Detects road-accident evidence visible in a road-facing CCTV frame."""

    class_name = "accident"

    def __init__(self, model_path: str | Path | None = None, confidence_threshold: float = 0.5,
                 image_size: int = 416):
        default_path = Path(__file__).resolve().parents[1] / "models" / "accident" / "best.pt"
        super().__init__(model_path or default_path, confidence_threshold, image_size)
