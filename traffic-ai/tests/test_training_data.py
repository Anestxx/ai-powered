from collections import Counter
import io
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile

from PIL import Image

from traffic.training.visdrone import candidates, export_split, select_balanced
from traffic.training.trainer import save_json
from traffic.training.mixed import coco_candidates, normalized_labels, split_coco


class TrainingDataTests(unittest.TestCase):
    def test_coco_mapping_excludes_entire_crowd_images(self):
        import json
        content = io.BytesIO()
        data = {"images": [{"id": number, "file_name": f"{number:012d}.jpg", "width": 100, "height": 80}
                           for number in (1, 2)],
                "annotations": [{"image_id": 1, "category_id": category, "bbox": [0, 0, 20, 20], "iscrowd": 0}
                                for category in (1, 2, 3, 4, 6, 8)] +
                               [{"image_id": 2, "category_id": 3, "bbox": [0, 0, 20, 20], "iscrowd": crowd}
                                for crowd in (0, 1)]}
        with ZipFile(content, "w") as archive:
            archive.writestr("annotations/instances_val2017.json", json.dumps(data))
        content.seek(0)
        with ZipFile(content) as archive:
            records = coco_candidates(archive, "val2017")
        self.assertEqual([row["source_id"] for row in records], [1])
        self.assertEqual([box[0] for box in records[0]["rows"]], [1, 2, 3, 5, 7])

    def test_coco_splits_are_disjoint_and_reproducible(self):
        records = [{"stem": str(number), "rows": [(cls, 0, 0, 10, 10) for cls in (1, 2, 3, 5, 7)]}
                   for number in range(120)]
        splits = split_coco(records[:60], records[60:], train_count=20, eval_count=20)
        self.assertEqual(splits, split_coco(records[:60], records[60:], train_count=20, eval_count=20))
        identifiers = [{row["stem"] for row in split} for split in splits.values()]
        self.assertTrue(all(len(split) == 20 for split in identifiers))
        self.assertFalse(identifiers[0] & identifiers[1] or identifiers[0] & identifiers[2] or identifiers[1] & identifiers[2])

    def test_coco_box_clipping_discards_outside_boxes(self):
        lines = normalized_labels([(5, -5, 10, 30, 30), (2, 120, 0, 20, 20)], 100, 80)
        self.assertEqual(len(lines), 1)
        self.assertEqual(list(map(float, lines[0].split())), [5, .125, .3125, .25, .375])

    def test_metrics_report_serializes_numpy_counts(self):
        import json
        import numpy as np
        with TemporaryDirectory() as temporary:
            path = Path(temporary) / "report.json"
            save_json(path, {"instances": np.int64(42), "mAP": np.float64(.25)})
            self.assertEqual(json.loads(path.read_text()), {"instances": 42, "mAP": .25})

    def make_archive(self):
        image = io.BytesIO()
        Image.new("RGB", (100, 80), "gray").save(image, format="JPEG")
        content = io.BytesIO()
        with ZipFile(content, "w") as archive:
            archive.writestr("sample/images/scene01_001.jpg", image.getvalue())
            rows = [f"-5,10,30,30,1,{category},0,0" for category in (3, 4, 6, 9, 10)]
            rows += ["0,0,100,80,0,0,0,0", "10,10,10,10,0,4,0,0", "10,10,10,10,1,1,0,0"]
            archive.writestr("sample/annotations/scene01_001.txt", "\n".join(rows))
        content.seek(0)
        return ZipFile(content)

    def test_conversion_uses_coco_ids_and_skips_ignored_nonvehicle_boxes(self):
        with self.make_archive() as archive:
            records = candidates(archive)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["group"], "scene01")
        self.assertEqual([row[0] for row in records[0]["rows"]], [1, 2, 7, 5, 3])

    def test_export_clips_boxes_and_normalizes_coordinates(self):
        with self.make_archive() as archive, TemporaryDirectory() as temporary:
            root = Path(temporary)
            report = export_split(archive, candidates(archive), root, "train")
            lines = (root / "labels/train/scene01_001.txt").read_text().splitlines()
            self.assertEqual(len(lines), 5)
            for line in lines:
                _, x, y, width, height = map(float, line.split())
                self.assertAlmostEqual(x, .125)
                self.assertAlmostEqual(width, .25)
                self.assertAlmostEqual(y, .3125)
                self.assertAlmostEqual(height, .375)
            self.assertEqual(Counter(report["object_counts"].values()), {1: 5})

    def test_balanced_selection_is_reproducible_and_includes_rare_classes(self):
        records = [{"stem": str(index), "rows": [(cls, 0, 0, 10, 10)]}
                   for index, cls in enumerate([2] * 35 + [1, 3, 5, 7] * 5)]
        first = select_balanced(records, 20, 42)
        self.assertEqual(first, select_balanced(records, 20, 42))
        self.assertEqual(len({record["stem"] for record in first}), 20)
        self.assertEqual({record["rows"][0][0] for record in first}, {1, 2, 3, 5, 7})


if __name__ == "__main__":
    unittest.main()
