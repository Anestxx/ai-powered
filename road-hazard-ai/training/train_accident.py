"""Train the accident-scene YOLO model independently from other road hazards."""
import argparse
import shutil
from pathlib import Path

from ultralytics import YOLO


ROOT = Path(__file__).resolve().parents[1]
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def validate_dataset(data_path: Path):
    dataset_root = ROOT / "datasets" / "accident"
    missing = []
    for split in ("train", "val"):
        image_dir = dataset_root / "images" / split
        images = [p for p in image_dir.glob("*") if p.suffix.lower() in IMAGE_SUFFIXES] if image_dir.exists() else []
        if not images:
            missing.append(str(image_dir))
    if missing:
        raise FileNotFoundError(
            "Add labelled accident and non-accident bus-camera frames first. Missing image folders:\n  - "
            + "\n  - ".join(missing)
            + "\nLabels belong in datasets/accident/labels/<split>, with matching YOLO .txt names."
        )
    if not data_path.is_file():
        raise FileNotFoundError(f"Dataset YAML not found: {data_path}")


def parse_args():
    parser = argparse.ArgumentParser(description="Train an accident-scene YOLO model for bus CCTV.")
    parser.add_argument("--data", default=ROOT / "configs" / "accident.yaml", type=Path)
    parser.add_argument("--model", default=ROOT / "yolo11n.pt", type=Path)
    parser.add_argument("--epochs", default=100, type=int)
    parser.add_argument("--imgsz", default=640, type=int)
    parser.add_argument("--batch", default=8, type=int)
    parser.add_argument("--project", default=ROOT / "outputs" / "accident", type=Path)
    parser.add_argument("--name", default="training")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    validate_dataset(args.data)
    if not args.model.is_file():
        raise FileNotFoundError(f"Pretrained checkpoint not found: {args.model}")
    YOLO(args.model).train(data=str(args.data), epochs=args.epochs, imgsz=args.imgsz,
                           batch=args.batch, workers=0, project=str(args.project),
                           name=args.name, exist_ok=True)
    best = args.project / args.name / "weights" / "best.pt"
    if not best.is_file():
        raise FileNotFoundError(f"Training finished but weights were not found: {best}")
    target = ROOT / "models" / "accident" / "best.pt"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best, target)
    YOLO(str(target))
    print(f"Accident model saved and verified: {target}")
