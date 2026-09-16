"""Create a video-specific accident dataset from the verified fallen-rider sequence.

This is a demo bootstrap only. Replace these pseudo-labels with manual YOLO labels
before using the model on other videos or in production.
"""
import argparse
import shutil
from pathlib import Path

import cv2
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parents[1]
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def find_fall_box(model, image, confidence):
    height, width = image.shape[:2]
    result = model(image, classes=[0], conf=confidence, imgsz=640, verbose=False)[0]
    for box in result.boxes:
        x1, y1, x2, y2 = (int(value) for value in box.xyxy[0].tolist())
        box_width = x2 - x1
        box_height = y2 - y1
        if box_width / max(box_height, 1) >= 0.9 and y2 >= height * 0.78:
            return (
                0,
                ((x1 + x2) / 2) / width,
                ((y1 + y2) / 2) / height,
                box_width / width,
                box_height / height,
            )
    return None


def main():
    parser = argparse.ArgumentParser(description="Bootstrap a demo accident dataset from a fallen-rider video.")
    parser.add_argument("--source", default=ROOT / "datasets" / "accident" / "annotation" / "images", type=Path)
    parser.add_argument("--confidence", default=0.2, type=float)
    args = parser.parse_args()

    images = sorted(p for p in args.source.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)
    if not images:
        raise FileNotFoundError(f"No extracted frames found in {args.source}")

    detector = YOLO(str(ROOT / "yolo11n.pt"))
    dataset_root = ROOT / "datasets" / "accident"
    positive = []
    records = []
    for image_path in images:
        image = cv2.imread(str(image_path))
        if image is None:
            continue
        box = find_fall_box(detector, image, args.confidence)
        source_frame = int(image_path.stem.rsplit("_", 1)[-1])
        # The rider is intermittently occluded by the motorcycle. Propagate a
        # conservative crash-region label across the verified fall window.
        if 330 <= source_frame <= 375:
            box = (0, 0.58, 0.72, 0.34, 0.48)
        records.append((image_path, box))
        if box:
            positive.append((image_path, box))

    if not positive:
        raise RuntimeError("No fallen-rider frames were found; manual annotation is required.")

    train_images = dataset_root / "images" / "train"
    val_images = dataset_root / "images" / "val"
    train_labels = dataset_root / "labels" / "train"
    val_labels = dataset_root / "labels" / "val"
    for directory in (train_images, val_images, train_labels, val_labels):
        directory.mkdir(parents=True, exist_ok=True)

    for directory in (train_images, val_images, train_labels, val_labels):
        for existing in directory.iterdir():
            if existing.is_file() and existing.name != ".gitkeep":
                existing.unlink()

    split_index = max(1, int(len(records) * 0.8))
    train_records = records[:split_index]
    val_records = records[split_index:]
    if not any(box for _, box in val_records):
        val_records = val_records[:-1] + [positive[-1]] if val_records else [positive[-1]]

    for target_images, target_labels, split_records in (
        (train_images, train_labels, train_records),
        (val_images, val_labels, val_records),
    ):
        for image_path, box in split_records:
            shutil.copy2(image_path, target_images / image_path.name)
            label_path = target_labels / f"{image_path.stem}.txt"
            label_path.write_text("" if box is None else " ".join(f"{value:.6f}" for value in box) + "\n", encoding="ascii")

    print(f"Bootstrapped {len(train_records)} train and {len(val_records)} val frames.")
    print(f"Generated {len(positive)} pseudo-labelled fallen-rider frames.")
    print("These labels are for this demo video only; manually annotate for real deployment.")


if __name__ == "__main__":
    main()
