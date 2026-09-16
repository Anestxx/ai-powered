from pathlib import Path

from .pothole_detector import PotholeDetector
from .waterlogging_detector import WaterloggingDetector
from .accident_detector import AccidentDetector
from .fall_detector import FallDetector


class RoadHazardPipeline:
    """Runs separate models without mixing their classes or weights."""

    def __init__(self, pothole_model=None, waterlogging_model=None, accident_model=None,
                 fall_detection=False, fall_model=None, accident_only=False,
                 confidence_threshold=0.5, image_size=416):
        self.pothole_detector = (None if accident_only else
                                 PotholeDetector(pothole_model, confidence_threshold, image_size))
        self.waterlogging_detector = (None if accident_only else
                                      WaterloggingDetector(waterlogging_model, confidence_threshold, image_size))
        default_accident = Path(__file__).resolve().parents[1] / "models" / "accident" / "best.pt"
        if accident_model:
            self.accident_detector = AccidentDetector(accident_model, confidence_threshold, image_size)
        elif default_accident.is_file():
            try:
                self.accident_detector = AccidentDetector(default_accident, confidence_threshold, image_size)
            except Exception:
                self.accident_detector = None
        else:
            self.accident_detector = None

        self.fall_detector = (FallDetector(fall_model, confidence_threshold, image_size)
                      if fall_detection else None)

    def process_frame(self, frame):
        output = {
            "potholes": self.pothole_detector.detect(frame) if self.pothole_detector else [],
            "waterlogging": self.waterlogging_detector.detect(frame) if self.waterlogging_detector else [],
        }
        if self.accident_detector:
            output["accidents"] = self.accident_detector.detect(frame)
        elif self.fall_detector:
            output["accidents"] = self.fall_detector.detect(frame)
        else:
            output["accidents"] = []
        return output
