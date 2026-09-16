"""Download and prepare a reproducible, modest VisDrone vehicle subset."""

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import random
import time
from zipfile import ZipFile

import requests
import yaml
from PIL import Image

from ..paths import ROOT
SOURCE = "https://github.com/ultralytics/assets/releases/download/v0.0.0"
MAPPING = {3: 1, 4: 2, 6: 7, 9: 5, 10: 3}  # VisDrone -> original COCO class IDs
VEHICLES = {1: "bicycle", 2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}


def download_archive(split, folder):
    filename = f"VisDrone2019-DET-{split}.zip"
    target = folder / filename
    if target.is_file():
        with ZipFile(target) as archive:
            archive.infolist()
        print(f"Using downloaded {filename}", flush=True)
        return target
    folder.mkdir(parents=True, exist_ok=True)
    temporary = folder / (filename + ".part")
    print(f"Downloading {filename} from the Ultralytics dataset mirror", flush=True)
    with requests.get(f"{SOURCE}/{filename}", stream=True, timeout=(30, 90)) as response:
        response.raise_for_status()
        expected = int(response.headers.get("Content-Length", 0))
        received, last_report = 0, time.monotonic()
        with temporary.open("wb") as output:
            for chunk in response.iter_content(1024 * 1024):
                output.write(chunk)
                received += len(chunk)
                if time.monotonic() - last_report >= 10:
                    print(f"{filename}: {received / 1024**2:.0f} MiB downloaded", flush=True)
                    last_report = time.monotonic()
    if expected and received != expected:
        raise RuntimeError(f"Incomplete download of {filename}")
    with ZipFile(temporary) as archive:
        archive.infolist()
    temporary.replace(target)
    print(f"Download complete: {filename} ({received / 1024**2:.1f} MiB)", flush=True)
    return target


def candidates(archive):
    images = {Path(name).stem: name for name in archive.namelist()
              if "/images/" in name and name.lower().endswith(".jpg")}
    records = []
    for name in sorted(archive.namelist()):
        if "/annotations/" not in name or not name.endswith(".txt"):
            continue
        stem = Path(name).stem
        if stem not in images:
            continue
        rows = []
        for line in archive.read(name).decode("utf-8-sig").splitlines():
            values = line.strip().rstrip(",").split(",")
            if len(values) < 6:
                continue
            left, top, width, height = map(float, values[:4])
            score, category = int(values[4]), int(values[5])
            if score > 0 and category in MAPPING and width > 0 and height > 0:
                rows.append((MAPPING[category], left, top, width, height))
        if rows:
            records.append({"stem": stem, "image": images[stem], "group": stem.split("_")[0], "rows": rows})
    return records


def select_balanced(records, size, seed):
    """Seeded selection with a rare-class quota; source groups are already split."""
    if len(records) < size:
        raise ValueError(f"Requested {size} images but only {len(records)} candidates exist")
    shuffled = list(records)
    random.Random(seed).shuffle(shuffled)
    selected = {}
    quota = max(1, size // (len(VEHICLES) * 2))
    by_class = {cls: [row for row in shuffled if any(box[0] == cls for box in row["rows"])] for cls in VEHICLES}
    for cls in sorted(VEHICLES, key=lambda value: len(by_class[value])):
        for row in by_class[cls][:quota]:
            selected[row["stem"]] = row
    for row in shuffled:
        if len(selected) >= size:
            break
        selected[row["stem"]] = row
    return list(selected.values())[:size]


def export_split(archive, records, root, split):
    image_dir, label_dir = root / "images" / split, root / "labels" / split
    image_dir.mkdir(parents=True, exist_ok=True)
    label_dir.mkdir(parents=True, exist_ok=True)
    counts, hashes = Counter(), set()
    entries = []
    for record in records:
        data = archive.read(record["image"])
        digest = hashlib.sha256(data).hexdigest()
        if digest in hashes:
            raise ValueError(f"Duplicate image within {split}: {record['stem']}")
        hashes.add(digest)
        destination = image_dir / (record["stem"] + ".jpg")
        destination.write_bytes(data)
        with Image.open(destination) as image:
            width, height = image.size
            image.verify()
        lines = []
        for cls, left, top, box_width, box_height in record["rows"]:
            x1, y1 = max(0, left), max(0, top)
            x2, y2 = min(width, left + box_width), min(height, top + box_height)
            if x2 <= x1 or y2 <= y1:
                continue
            lines.append(f"{cls} {(x1+x2)/(2*width):.8f} {(y1+y2)/(2*height):.8f} {(x2-x1)/width:.8f} {(y2-y1)/height:.8f}")
            counts[VEHICLES[cls]] += 1
        (label_dir / (record["stem"] + ".txt")).write_text("\n".join(lines) + "\n", encoding="utf-8")
        entries.append({"image": destination.name, "source_group": record["group"], "sha256": digest})
    if any(counts[name] == 0 for name in VEHICLES.values()):
        raise ValueError(f"Some vehicle classes have no annotations in {split}: {counts}")
    print(f"{split}: {len(entries)} images; labeled objects: {dict(counts)}", flush=True)
    return {"images": entries, "object_counts": dict(counts)}


def prepare(train_count=512, val_count=96, test_count=96, seed=42):
    root = ROOT / "datasets" / f"visdrone_vehicles_{train_count}_{val_count}_{test_count}_seed{seed}"
    manifest_path = root / "manifest.json"
    if manifest_path.is_file() and (root / "data.yaml").is_file():
        print(f"Using prepared dataset: {root}", flush=True)
        return root / "data.yaml"
    downloads = ROOT / "datasets" / "downloads"
    train_zip = download_archive("train", downloads)
    val_zip = download_archive("val", downloads)
    with ZipFile(train_zip) as training, ZipFile(val_zip) as evaluation:
        train_rows, eval_rows = candidates(training), candidates(evaluation)
        # Preserve official train separation; additionally split validation by scene
        # prefix so frames from one source group cannot cross val/test boundaries.
        train_groups = {row["group"] for row in train_rows}
        eval_rows = [row for row in eval_rows if row["group"] not in train_groups]
        groups = sorted({row["group"] for row in eval_rows})
        random.Random(seed).shuffle(groups)
        val_groups = set(groups[:len(groups) // 2])
        split_rows = {
            "train": select_balanced(train_rows, train_count, seed),
            "val": select_balanced([row for row in eval_rows if row["group"] in val_groups], val_count, seed + 1),
            "test": select_balanced([row for row in eval_rows if row["group"] not in val_groups], test_count, seed + 2),
        }
        reports = {split: export_split(training if split == "train" else evaluation, records, root, split)
                   for split, records in split_rows.items()}
    hash_sets = [{entry["sha256"] for entry in reports[split]["images"]} for split in ("train", "val", "test")]
    if any(hash_sets[a] & hash_sets[b] for a, b in ((0, 1), (0, 2), (1, 2))):
        raise ValueError("An image appears in more than one dataset split")
    coco_config = ROOT / ".venv" / "Lib" / "site-packages" / "ultralytics" / "cfg" / "datasets" / "coco.yaml"
    if not coco_config.is_file():
        from importlib.util import find_spec
        coco_config = Path(next(iter(find_spec("ultralytics").submodule_search_locations))) / "cfg/datasets/coco.yaml"
    names = yaml.safe_load(coco_config.read_text(encoding="utf-8"))["names"]
    for split, report in reports.items():
        (root / f"{split}.txt").write_text("".join(f"./images/{split}/{entry['image']}\n" for entry in report["images"]), encoding="utf-8")
    config = {"path": root.as_posix(), "train": "train.txt", "val": "val.txt", "test": "test.txt", "names": names}
    (root / "data.yaml").write_text(yaml.safe_dump(config, sort_keys=False), encoding="utf-8")
    manifest = {"dataset": "VisDrone2019-DET vehicle subset", "source": "https://github.com/VisDrone/VisDrone-Dataset",
                "download_mirror": SOURCE, "seed": seed, "classes": VEHICLES,
                "note": "Aerial traffic imagery, not BMTC bus-camera data. Keep original COCO IDs/head; train only the five vehicle classes. Ignored regions and nonselected categories are omitted.",
                "splits": reports}
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Dataset prepared: {root / 'data.yaml'}", flush=True)
    return root / "data.yaml"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train-count", type=int, default=512)
    parser.add_argument("--val-count", type=int, default=96)
    parser.add_argument("--test-count", type=int, default=96)
    args = parser.parse_args()
    if min(args.train_count, args.val_count, args.test_count) < 10:
        parser.error("each split must contain at least 10 images")
    prepare(args.train_count, args.val_count, args.test_count)


if __name__ == "__main__":
    main()
