from contextlib import redirect_stdout
from datetime import datetime
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import cv2
import numpy as np

from traffic.main import parse_args, run
from traffic.traffic_analyzer import Detection


class PipelineTests(unittest.TestCase):
    def exercise_pipeline(self, folder, extra_args):
        source = folder / "input.mp4"
        writer = cv2.VideoWriter(str(source), cv2.VideoWriter_fourcc(*"mp4v"), 10, (128, 96))
        self.assertTrue(writer.isOpened())
        for _ in range(2):
            writer.write(np.zeros((96, 128, 3), dtype=np.uint8))
        writer.release()
        args = parse_args(["--source", str(source), "--output-dir", str(folder / "output"), *extra_args])
        with patch("traffic.detector.VehicleTracker") as tracker, redirect_stdout(io.StringIO()):
            tracker.return_value.track.return_value = [Detection("bus", (20, 40, 60, 90), .9, 5)]
            self.assertEqual(run(args), 0)
            self.assertEqual(tracker.return_value.track.call_count, 2)
        output, = (folder / "output").iterdir()
        records = [json.loads(line) for line in (output / "metrics.jsonl").read_text().splitlines()]
        return output, records

    def test_headless_export_with_unknown_capture_time(self):
        with TemporaryDirectory() as temporary:
            output, records = self.exercise_pipeline(Path(temporary), ["--save-video"])
            self.assertEqual([record["frame_index"] for record in records], [0, 1])
            self.assertEqual([record["video_time_seconds"] for record in records], [0, .1])
            self.assertTrue(all(record["captured_at"] is None for record in records))
            self.assertTrue(all(record["total_vehicles"] == 1 for record in records))
            self.assertEqual(records[1]["detections"][0]["track_id"], 5)
            self.assertEqual(json.loads((output / "summary.json").read_text())["frames_processed"], 2)
            video = cv2.VideoCapture(str(output / "annotated.mp4"))
            try:
                self.assertTrue(video.isOpened())
                self.assertTrue(video.read()[0])
                self.assertTrue(video.read()[0])
                self.assertFalse(video.read()[0])
            finally:
                video.release()

    def test_capture_timestamp_uses_recording_timeline(self):
        with TemporaryDirectory() as temporary:
            output, records = self.exercise_pipeline(Path(temporary), [
                "--recorded-at", "2026-01-02T03:04:05+05:30", "--bus-id", "TEST_BUS", "--road-id", "TEST_ROAD"])
            self.assertEqual(records[0]["captured_at"], "2026-01-01T21:34:05+00:00")
            first, second = [datetime.fromisoformat(record["captured_at"]) for record in records]
            self.assertAlmostEqual((second - first).total_seconds(), .1)
            self.assertEqual(records[0]["source_vehicle"], "TEST_BUS")
            self.assertEqual(records[0]["road_id"], "TEST_ROAD")
            self.assertFalse((output / "annotated.mp4").exists())


if __name__ == "__main__":
    unittest.main()
