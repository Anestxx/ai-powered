import unittest

from traffic.traffic_analyzer import Detection, analyze_frame, classify_traffic


class TrafficAnalyzerTests(unittest.TestCase):
    def test_overlapping_boxes_count_area_once(self):
        boxes = [Detection("car", (0, 0, 60, 100), 0.9, 1),
                 Detection("bus", (20, 0, 80, 100), 0.9, 2)]
        metrics, _ = analyze_frame(boxes, 100, 100, roi_top=0)
        self.assertEqual(metrics["total_vehicles"], 2)
        self.assertAlmostEqual(metrics["roi_occupancy"], 0.8)

    def test_roi_filter_and_clipping(self):
        boxes = [Detection("car", (-10, 20, 50, 110), 0.9, 1),
                 Detection("bus", (50, 0, 100, 20), 0.9, 2),
                 Detection("person", (0, 40, 100, 100), 0.9, 3)]
        metrics, accepted = analyze_frame(boxes, 100, 100, roi_top=0.3)
        self.assertEqual(metrics["total_vehicles"], 1)
        self.assertAlmostEqual(metrics["roi_occupancy"], 0.5)
        self.assertEqual(accepted[0].bbox, (0, 30, 50, 100))

    def test_counts_are_current_frame_not_cumulative_flow(self):
        detection = Detection("motorcycle", (10, 40, 20, 60), 0.8, 7)
        first, _ = analyze_frame([detection], 100, 100)
        second, _ = analyze_frame([detection], 100, 100)
        empty, _ = analyze_frame([], 100, 100)
        self.assertEqual(first["total_vehicles"], 1)
        self.assertEqual(second["total_vehicles"], 1)
        self.assertEqual(empty["total_vehicles"], 0)
        self.assertEqual(empty["roi_occupancy"], 0)
        self.assertEqual(empty["traffic_level"], "LOW")

    def test_duplicate_track_ids_and_untracked_detections(self):
        metrics, accepted = analyze_frame([
            Detection("car", (0, 40, 10, 60), 0.8, 7),
            Detection("car", (0, 40, 10, 60), 0.9, 7),
            Detection("bicycle", (20, 40, 30, 60), 0.8),
            Detection("truck", (40, 40, 50, 60), 0.8),
        ], 100, 100)
        self.assertEqual(metrics["total_vehicles"], 3)
        self.assertEqual(accepted[0].confidence, 0.9)
        self.assertEqual(metrics["vehicles"]["bicycle"], 1)

    def test_invalid_and_outside_boxes_are_excluded(self):
        metrics, _ = analyze_frame([
            Detection("car", (10, 40, 10, 60), 0.9),
            Detection("car", (float("nan"), 40, 10, 60), 0.9),
            Detection("car", (110, 40, 120, 60), 0.9),
            Detection("car", (0, 110, 10, 120), 0.9),
        ], 100, 100)
        self.assertEqual(metrics["total_vehicles"], 0)

    def test_mvp_thresholds_and_sample_correction(self):
        for count, occupancy, expected in [(5, .09, "LOW"), (5, .10, "MODERATE"),
                (12, .24, "MODERATE"), (12, .25, "HIGH"), (25, .44, "HIGH"),
                (25, .45, "SEVERE"), (26, .39, "SEVERE"), (2, .8, "SEVERE")]:
            with self.subTest(count=count, occupancy=occupancy):
                self.assertEqual(classify_traffic(count, occupancy), expected)

    def test_invalid_roi_and_occupancy_rejected(self):
        for top in (-1, 1, float("nan")):
            with self.assertRaises(ValueError):
                analyze_frame([], 100, 100, top)
        for occupancy in (-.1, 1.1, float("nan")):
            with self.assertRaises(ValueError):
                classify_traffic(0, occupancy)


if __name__ == "__main__":
    unittest.main()
