import argparse
import shutil
import subprocess
import sys
from pathlib import Path

from ultralytics import YOLO


ROOT = Path(__file__).resolve().parents[1]
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def validate_dataset(data_path: Path):
    """Fail early with an actionable message before initializing YOLO training."""
    dataset_root = ROOT / "datasets" / "waterlogging"
    missing = []
    for split in ("train", "val"):
        image_dir = dataset_root / "images" / split
        images = [path for path in image_dir.glob("*") if path.suffix.lower() in IMAGE_SUFFIXES] if image_dir.exists() else []
        if not images:
            missing.append(str(image_dir))
    if missing:
        paths = "\n  - ".join(missing)
        raise FileNotFoundError(
            "Waterlogging training needs labeled images before it can start. Add at least one "
            "image to each directory below, with a same-named YOLO label .txt file in labels/<split>:\n"
            f"  - {paths}\nSee datasets/waterlogging/README.md for the required format."
        )
    if not data_path.is_file():
        raise FileNotFoundError(f"Dataset YAML not found: {data_path}")


def parse_args():
    parser = argparse.ArgumentParser(description="Train only the waterlogging YOLO model.")
    parser.add_argument("--data", default=ROOT / "configs" / "waterlogging.yaml", type=Path)
    parser.add_argument("--model", default=ROOT / "yolo11n.pt", type=Path,
                        help="Pretrained checkpoint used only for waterlogging transfer learning")
    parser.add_argument("--epochs", default=80, type=int)
    parser.add_argument("--imgsz", default=640, type=int)
    parser.add_argument("--batch", default=16, type=int)
    parser.add_argument("--cache", choices=("none", "disk", "ram"), default="none",
                        help="Cache images to speed later epochs; 'disk' is safest for this laptop")
    parser.add_argument("--workers", default=0, type=int,
                        help="Data-loader workers; keep 0 on this Windows CPU-only laptop")
    parser.add_argument("--fast", action="store_true",
                        help="Use a faster local prototype profile: 40 epochs, 416px images, disk cache")
    parser.add_argument("--project", default=ROOT / "outputs" / "waterlogging", type=Path,
                        help="Directory for training logs and intermediate checkpoints")
    parser.add_argument("--name", default="training")
    parser.add_argument("--video", type=Path,
                        help="Optional test video to process automatically after successful training")
    parser.add_argument("--save-evidence", action="store_true",
                        help="Save confirmed-event frames when --video is supplied")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    if args.fast:
        args.epochs = 40
        args.imgsz = 320
        args.batch = 4
        args.cache = "disk"
        args.workers = 0
        print("Fast low-memory profile enabled: epochs=40, imgsz=320, batch=4, cache=disk, workers=0")
    validate_dataset(args.data)
    if not args.model.is_file():
        raise FileNotFoundError(f"Pretrained waterlogging checkpoint not found: {args.model}")
    YOLO(args.model).train(data=str(args.data), epochs=args.epochs, imgsz=args.imgsz,
                           batch=args.batch, cache=False if args.cache == "none" else args.cache,
                           workers=args.workers,
                           project=str(args.project), name=args.name, exist_ok=True)
    trained_weights = args.project / args.name / "weights" / "best.pt"
    if not trained_weights.is_file():
        raise FileNotFoundError(f"Training completed but weights were not found: {trained_weights}")
    target = ROOT / "models" / "waterlogging" / "best.pt"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(trained_weights, target)
    YOLO(str(target))  # confirm the deployed inference file can be loaded
    print(f"Waterlogging inference weights saved and verified: {target}")

    if args.video:
        if not args.video.is_file():
            raise FileNotFoundError(f"Training completed, but the requested video was not found: {args.video}")
        command = [sys.executable, str(ROOT / "main.py"), "--video", str(args.video)]
        if args.save_evidence:
            command.append("--save-evidence")
        print("Starting the dual-model road-hazard pipeline...")
        subprocess.run(command, check=True)
