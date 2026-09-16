"""Load the supplied helmet checkpoint and report its class vocabulary."""

import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=ROOT / "models/helmet_detector.pt")
    args = parser.parse_args()
    if not args.model.is_file():
        parser.error(f"Checkpoint does not exist: {args.model}")
    os.environ.setdefault("YOLO_CONFIG_DIR", str(ROOT / ".cache/ultralytics"))
    os.environ.setdefault("YOLO_AUTOINSTALL", "false")
    Path(os.environ["YOLO_CONFIG_DIR"]).mkdir(parents=True, exist_ok=True)
    from ultralytics import YOLO

    model = YOLO(str(args.model.resolve()))
    print(json.dumps({"model": str(args.model.resolve()), "classes": model.names,
                      "status": "loaded", "validation": "Not evaluated on this project's road footage."}, indent=2))


if __name__ == "__main__":
    main()
