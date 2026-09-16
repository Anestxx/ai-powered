from .pothole_detector import PotholeDetector
from .waterlogging_detector import WaterloggingDetector
from .accident_detector import AccidentDetector


class RoadHazardPipeline:
    """Runs separate models without mixing their classes or weights."""

    def __init__(self, pothole_model=None, waterlogging_model=None, accident_model=None,
                 confidence_threshold=0.5, image_size=416):
        self.pothole_detector = PotholeDetector(pothole_model, confidence_threshold, image_size)
        self.waterlogging_detector = WaterloggingDetector(waterlogging_model, confidence_threshold, image_size)
        self.accident_detector = (AccidentDetector(accident_model, confidence_threshold, image_size)
                                  if accident_model else None)

    def process_frame(self, frame):
        output = {
            "potholes": self.pothole_detector.detect(frame),
            "waterlogging": self.waterlogging_detector.detect(frame),
        }
        output["accidents"] = self.accident_detector.detect(frame) if self.accident_detector else []
        return output
