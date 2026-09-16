"""Report which inputs are available for the imported road-hazard module."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def asset_status():
    weights = {name: (ROOT / f"models/{name}/best.pt").is_file() for name in ("pothole", "waterlogging")}
    dataset = ROOT / "datasets/waterlogging"
    splits = {split: {
        "images": sum(path.suffix.lower() in IMAGE_SUFFIXES for path in (dataset / "images" / split).glob("*")),
        "labels": len(list((dataset / "labels" / split).glob("*.txt"))),
    } for split in ("train", "val")}
    return {"models_present": weights, "inference_ready": all(weights.values()),
            "waterlogging_splits": splits,
            "training_inputs_present": all(split["images"] > 0 and split["labels"] > 0 for split in splits.values())
                                       and (ROOT / "yolo11n.pt").is_file(),
            "note": "Presence checks only; labels, model classes and accuracy require validation before use."}


if __name__ == "__main__":
    print(json.dumps(asset_status(), indent=2))
