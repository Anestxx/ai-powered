import sys
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from events.confirmation import TemporalEventFilter
from events.event_generator import create_event


DETECTION = {"class_id": 0, "class_name": "pothole", "confidence": 0.91, "bbox": [10, 10, 50, 50]}


class RoadHazardTests(unittest.TestCase):
    def test_event_schema(self):
        event = create_event(DETECTION, "pothole", 42, datetime(2026, 1, 1))
        self.assertEqual(event["event_type"], "pothole")
        self.assertIsNone(event["latitude"])

        accident_event = create_event(DETECTION, "accident", 43, datetime(2026, 1, 1))
        self.assertEqual(accident_event["event_type"], "accident")

    def test_confirmation_and_suppression(self):
        filter_ = TemporalEventFilter(required_frames=3, suppression_frames=10)
        self.assertEqual(filter_.confirmed("pothole", [DETECTION], 1), [])
        self.assertEqual(filter_.confirmed("pothole", [DETECTION], 2), [])
        self.assertEqual(filter_.confirmed("pothole", [DETECTION], 3), [DETECTION])
        self.assertEqual(filter_.confirmed("pothole", [DETECTION], 4), [])

    @patch("inference.base_detector.Path.is_file", return_value=True)
    @patch("inference.base_detector.YOLO")
    def test_detectors_return_normalized_schema(self, yolo, _is_file):
        from inference.pothole_detector import PotholeDetector
        from inference.waterlogging_detector import WaterloggingDetector
        from inference.road_hazard_pipeline import RoadHazardPipeline

        class Value:
            def __init__(self, value): self.value = value
            def item(self): return self.value
        class Coordinates:
            def __getitem__(self, _): return self
            def tolist(self): return [1.2, 2.3, 30.4, 40.5]
        class Box:
            xyxy = Coordinates()
            cls = [Value(0)]
            conf = [Value(0.91)]
        class Result:
            boxes = [Box()]

        yolo.return_value.return_value = [Result()]
        pothole = PotholeDetector(ROOT / "tests" / "pothole.pt")
        waterlogging = WaterloggingDetector(ROOT / "tests" / "waterlogging.pt")
        self.assertEqual(pothole.detect(object())[0]["class_name"], "pothole")
        self.assertEqual(waterlogging.detect(object())[0]["class_name"], "waterlogging")
        output = RoadHazardPipeline(ROOT / "tests" / "pothole.pt", ROOT / "tests" / "waterlogging.pt").process_frame(object())
        self.assertEqual(set(output), {"potholes", "waterlogging", "accidents"})

    @patch("inference.base_detector.Path.is_file", return_value=True)
    @patch("inference.base_detector.YOLO")
    def test_accident_detector_rejects_generic_checkpoint(self, yolo, _is_file):
        from inference.accident_detector import AccidentDetector

        yolo.return_value.names = {0: "person", 2: "car"}
        with self.assertRaisesRegex(ValueError, "Incompatible accident checkpoint"):
            AccidentDetector(ROOT / "tests" / "generic.pt")

    @patch("inference.fall_detector.Path.is_file", return_value=True)
    @patch("inference.fall_detector.YOLO")
    def test_fall_detector_only_returns_horizontal_ground_level_people(self, yolo, _is_file):
        from inference.fall_detector import FallDetector

        class Value:
            def __init__(self, value): self.value = value
            def item(self): return self.value
        class Coordinates:
            def __getitem__(self, _): return self
            def tolist(self): return [100, 500, 350, 700]
        class Box:
            xyxy = Coordinates()
            conf = [Value(0.8)]
        class Result:
            boxes = [Box()]

        yolo.return_value.return_value = [Result()]
        detector = FallDetector(ROOT / "tests" / "generic.pt")
        self.assertEqual(detector.detect(type("Frame", (), {"shape": (720, 1280, 3)})())[0]["class_name"], "accident")


if __name__ == "__main__":
    unittest.main()
