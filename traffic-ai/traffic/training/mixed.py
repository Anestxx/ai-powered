"""Prepare a small COCO/VisDrone vehicle dataset without downloading all COCO images."""

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
import json
from pathlib import Path
import random
import shutil
import time
from zipfile import ZipFile

import ijson
from PIL import Image
import requests
import yaml

from .visdrone import ROOT, VEHICLES, prepare, select_balanced

# The public COCO bucket, addressed through S3 so HTTPS validates its hostname.
COCO_SOURCE = "https://s3.amazonaws.com/images.cocodataset.org"
COCO_MAPPING = {2: 1, 3: 2, 4: 3, 6: 5, 8: 7}


def download_annotations():
    target = ROOT / "datasets/downloads/annotations_trainval2017.zip"
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file():
        with ZipFile(target) as archive:
            archive.getinfo("annotations/instances_train2017.json")
        return target
    temporary = target.with_suffix(".zip.part")
    url = f"{COCO_SOURCE}/annotations/{target.name}"
    print(f"Downloading COCO annotations: {url}", flush=True)
    with requests.get(url, stream=True, timeout=(30, 90)) as response:
        response.raise_for_status()
        expected = int(response.headers.get("Content-Length", 0))
        received, last_log = 0, time.monotonic()
        with temporary.open("wb") as stream:
            for chunk in response.iter_content(1024 * 1024):
                stream.write(chunk)
                received += len(chunk)
                if time.monotonic() - last_log > 10:
                    print(f"Annotations: {received / 1024**2:.1f} MiB", flush=True)
                    last_log = time.monotonic()
    if expected and received != expected:
        raise RuntimeError("Incomplete COCO annotation download")
    with ZipFile(temporary) as archive:
        archive.getinfo("annotations/instances_train2017.json")
        archive.getinfo("annotations/instances_val2017.json")
    temporary.replace(target)
    return target


def coco_candidates(archive, split):
    """Stream JSON; omit images with crowd vehicle regions instead of false negatives."""
    member = f"annotations/instances_{split}.json"
    rows, crowd_images = defaultdict(list), set()
    with archive.open(member) as stream:
        for annotation in ijson.items(stream, "annotations.item"):
            category = annotation["category_id"]
            if category not in COCO_MAPPING:
                continue
            image_id = annotation["image_id"]
            if annotation.get("iscrowd", 0):
                crowd_images.add(image_id)
                continue
            left, top, width, height = map(float, annotation["bbox"])
            if width > 0 and height > 0:
                rows[image_id].append((COCO_MAPPING[category], left, top, width, height))
    records = []
    with archive.open(member) as stream:
        for metadata in ijson.items(stream, "images.item"):
            image_id = metadata["id"]
            if image_id in crowd_images or image_id not in rows:
                continue
            filename = f"{int(image_id):012d}.jpg"
            if metadata["file_name"] != filename:
                raise ValueError("Unexpected COCO image filename")
            records.append({"stem": f"coco_{image_id:012d}", "source_id": image_id,
                            "source_split": split, "filename": filename,
                            "width": metadata["width"], "height": metadata["height"],
                            "license_id": metadata.get("license"), "rows": rows[image_id]})
    return sorted(records, key=lambda record: record["source_id"])


def split_coco(train, evaluation, train_count=256, eval_count=80, seed=42):
    shuffled = list(evaluation)
    random.Random(seed).shuffle(shuffled)
    midpoint = len(shuffled) // 2
    return {"train": select_balanced(train, train_count, seed),
            "val": select_balanced(shuffled[:midpoint], eval_count, seed + 1),
            "test": select_balanced(shuffled[midpoint:], eval_count, seed + 2)}


def fetch_image(record):
    target = ROOT / "datasets/downloads/coco-images" / record["source_split"] / record["filename"]
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file():
        data = target.read_bytes()
    else:
        url = f"{COCO_SOURCE}/{record['source_split']}/{record['filename']}"
        for attempt in range(3):
            try:
                response = requests.get(url, timeout=(20, 60))
                response.raise_for_status()
                data = response.content
                break
            except requests.RequestException:
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)
        with Image.open(io.BytesIO(data)) as image:
            image.verify()
        temporary = target.with_suffix(".part")
        temporary.write_bytes(data)
        temporary.replace(target)
    with Image.open(io.BytesIO(data)) as image:
        if image.size != (record["width"], record["height"]):
            raise ValueError(f"Image dimensions differ from annotations: {target.name}")
        image.verify()
    return record, target, hashlib.sha256(data).hexdigest()


def normalized_labels(rows, width, height):
    lines = []
    for cls, left, top, box_width, box_height in rows:
        x1, y1 = max(0, left), max(0, top)
        x2, y2 = min(width, left + box_width), min(height, top + box_height)
        if x2 <= x1 or y2 <= y1:
            continue
        lines.append(f"{cls} {(x1+x2)/(2*width):.8f} {(y1+y2)/(2*height):.8f} {(x2-x1)/width:.8f} {(y2-y1)/height:.8f}")
    return lines


def prepare_mixed():
    root = ROOT / "datasets/mixed_vehicles_512_128_128_seed42"
    if (root / "manifest.json").is_file() and (root / "data.yaml").is_file():
        print(f"Using prepared mixed dataset: {root}", flush=True)
        return root / "data.yaml"
    archive_path = download_annotations()
    with ZipFile(archive_path) as archive:
        print("Reading COCO train annotations with a streaming parser...", flush=True)
        training = coco_candidates(archive, "train2017")
        print("Reading COCO validation annotations...", flush=True)
        evaluation = coco_candidates(archive, "val2017")
        coco_rows = split_coco(training, evaluation)
    vis_config_path = prepare()
    vis_root = vis_config_path.parent
    vis_config = yaml.safe_load(vis_config_path.read_text(encoding="utf-8"))
    vis_manifest = json.loads((vis_root / "manifest.json").read_text(encoding="utf-8"))
    reports = {}
    for split in ("train", "val", "test"):
        image_dir, label_dir = root / "images" / split, root / "labels" / split
        image_dir.mkdir(parents=True, exist_ok=True)
        label_dir.mkdir(parents=True, exist_ok=True)
        entries, counts = [], Counter()
        with ThreadPoolExecutor(max_workers=4) as pool:
            for index, (record, source, digest) in enumerate(pool.map(fetch_image, coco_rows[split]), 1):
                name = record["stem"] + ".jpg"
                shutil.copy2(source, image_dir / name)
                labels = normalized_labels(record["rows"], record["width"], record["height"])
                (label_dir / (record["stem"] + ".txt")).write_text("\n".join(labels) + "\n", encoding="utf-8")
                counts.update(VEHICLES[int(line.split()[0])] for line in labels)
                entries.append({"image": name, "source": "coco", "source_split": record["source_split"],
                                "source_id": record["source_id"], "sha256": digest,
                                "license_id": record["license_id"]})
                if index % 20 == 0 or index == len(coco_rows[split]):
                    print(f"{split}: COCO images {index}/{len(coco_rows[split])}", flush=True)
        vis_records = []
        for entry in vis_manifest["splits"][split]["images"]:
            stem = Path(entry["image"]).stem
            lines = (vis_root / "labels" / split / f"{stem}.txt").read_text().splitlines()
            vis_records.append({"stem": stem, "rows": [tuple(map(float, line.split())) for line in lines],
                                "entry": entry, "lines": lines})
        for record in select_balanced(vis_records, 256 if split == "train" else 48, 42):
            name = "visdrone_" + record["stem"] + ".jpg"
            source = vis_root / "images" / split / record["entry"]["image"]
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            if digest != record["entry"]["sha256"]:
                raise ValueError(f"VisDrone image changed: {source.name}")
            shutil.copy2(source, image_dir / name)
            (label_dir / (Path(name).stem + ".txt")).write_text("\n".join(record["lines"]) + "\n", encoding="utf-8")
            counts.update(VEHICLES[int(line.split()[0])] for line in record["lines"])
            entries.append({**record["entry"], "image": name, "source": "visdrone"})
        reports[split] = {"images": entries, "object_counts": dict(counts)}
        print(f"{split}: {len(entries)} total images, objects {dict(counts)}", flush=True)
    hashes = [{entry["sha256"] for entry in reports[split]["images"]} for split in reports]
    if any(len(hashes[index]) != len(reports[split]["images"]) for index, split in enumerate(reports)):
        raise ValueError("Duplicate image within split")
    if any(hashes[a] & hashes[b] for a, b in ((0, 1), (0, 2), (1, 2))):
        raise ValueError("Duplicate image across splits")
    config = {"path": root.as_posix(), "names": vis_config["names"]}
    for split, report in reports.items():
        config[split] = f"{split}.txt"
        for domain in ("mixed", "coco", "visdrone"):
            entries = [row for row in report["images"] if domain == "mixed" or row["source"] == domain]
            filename = f"{split}.txt" if domain == "mixed" else f"{domain}_{split}.txt"
            (root / filename).write_text("".join(f"./images/{split}/{row['image']}\n" for row in entries), encoding="utf-8")
    (root / "data.yaml").write_text(yaml.safe_dump(config, sort_keys=False), encoding="utf-8")
    domains = {}
    for domain in ("coco", "visdrone"):
        domain_config = {**config, "val": f"{domain}_val.txt", "test": f"{domain}_test.txt"}
        filename = f"{domain}.yaml"
        (root / filename).write_text(yaml.safe_dump(domain_config, sort_keys=False), encoding="utf-8")
        domains[domain] = filename
    with archive_path.open("rb") as stream:
        annotation_digest = hashlib.file_digest(stream, "sha256").hexdigest()
    manifest = {"dataset": "COCO2017 + VisDrone vehicle replay subset", "seed": 42,
                "sources": ["https://cocodataset.org/#download", "https://github.com/VisDrone/VisDrone-Dataset"],
                "download_mirror": COCO_SOURCE, "classes": VEHICLES, "evaluation_domains": domains,
                "annotation_sha256": annotation_digest,
                "limitations": ["General COCO vehicle imagery plus aerial VisDrone scenes; not BMTC camera footage.",
                                "COCO val2017 images are held out from this fine-tuning, but belong to the baseline model's original benchmark.",
                                "COCO images with crowd vehicle annotations are excluded; nonvehicle categories are omitted.",
                                "VisDrone ignored regions are omitted; these are custom subset metrics, not official challenge scores.",
                                "Only vehicle-positive images are sampled; road-scene negatives and local footage are still needed."],
                "splits": reports}
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Prepared: {root / 'data.yaml'}", flush=True)
    return root / "data.yaml"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    prepare_mixed()


if __name__ == "__main__":
    main()
