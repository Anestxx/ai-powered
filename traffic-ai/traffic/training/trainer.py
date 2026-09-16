"""Fine-tune and evaluate the vehicle detector locally; retain the original model."""

import argparse
import csv
from datetime import datetime, timezone
import gc
import hashlib
import json
import os
from pathlib import Path
import shutil
import time

from ..paths import ROOT
CLASSES = [1, 2, 3, 5, 7]


def save_json(path, value):
    temporary = path.with_suffix(".tmp")
    def scalar(value):
        if hasattr(value, "item"):
            return value.item()
        raise TypeError(f"Cannot serialize {type(value).__name__}")
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False, default=scalar), encoding="utf-8")
    temporary.replace(path)


def measured(metrics):
    return {"overall": {key: float(value) for key, value in metrics.results_dict.items()},
            "per_class": metrics.summary()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path)
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--imgsz", type=int, default=416)
    parser.add_argument("--batch", type=int, default=2)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--freeze", type=int, default=10)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--lr", type=float, default=0.00005)
    args = parser.parse_args()
    if min(args.epochs, args.batch, args.threads) < 1 or args.imgsz < 64 or args.freeze < 0:
        parser.error("epochs/batch/threads must be positive; imgsz >= 64; freeze >= 0")
    if not 0 < args.lr <= 0.1:
        parser.error("lr must be between 0 (exclusive) and 0.1")
    os.environ["YOLO_CONFIG_DIR"] = str(ROOT / ".cache" / "ultralytics")
    os.environ["YOLO_AUTOINSTALL"] = "false"
    os.environ["YOLO_VERBOSE"] = "false"
    os.environ["OMP_NUM_THREADS"] = str(args.threads)
    os.environ["MKL_NUM_THREADS"] = str(args.threads)
    import torch
    import ultralytics
    from ultralytics import YOLO
    import yaml

    from .mixed import prepare_mixed
    data = args.data.resolve() if args.data else prepare_mixed()
    config = yaml.safe_load(data.read_text(encoding="utf-8"))
    base = ROOT / "models" / "yolo26n.pt"
    baseline = YOLO(str(base))
    if config["names"] != baseline.names:
        raise ValueError("This trainer requires the prepared COCO-ID vehicle dataset to compare the pretrained baseline fairly")
    dataset_manifest = json.loads((data.parent / "manifest.json").read_text(encoding="utf-8"))
    run = ROOT / "training-runs" / datetime.now(timezone.utc).strftime("vehicles_%Y%m%dT%H%M%SZ")
    run.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    state = {"stage": "baseline_validation", "run_directory": str(run), "pid": os.getpid(),
             "epochs_requested": args.epochs, "device": args.device, "image_size": args.imgsz,
             "dataset": str(data), "learning_rate": args.lr,
             "started_at": datetime.now(timezone.utc).isoformat()}

    def update(**changes):
        state.update(changes)
        state["elapsed_seconds"] = round(time.monotonic() - started, 1)
        state["updated_at"] = datetime.now(timezone.utc).isoformat()
        save_json(run / "progress.json", state)

    def limit_threads(_):
        torch.set_num_threads(args.threads)

    common = {"data": str(data), "imgsz": args.imgsz, "batch": args.batch,
              "device": args.device, "workers": 0, "classes": CLASSES,
              "plots": False, "verbose": False, "project": str(run)}
    baseline.add_callback("on_val_start", limit_threads)
    update()
    print(f"Training run: {run}", flush=True)
    print("Measuring pretrained baseline on the validation split...", flush=True)
    try:
        before = measured(baseline.val(**common, name="baseline_val", split="val"))
        save_json(run / "baseline-validation.json", before)
    except BaseException as error:
        update(stage="interrupted" if isinstance(error, KeyboardInterrupt) else "failed", error=str(error))
        raise
    print("Baseline validation:", json.dumps(before["overall"]), flush=True)
    del baseline
    gc.collect()
    model = YOLO(str(base))
    batch_state = {"count": 0, "last_log": time.monotonic()}

    def epoch_started(trainer):
        batch_state.update(count=0, last_log=time.monotonic())
        update(stage="training", epoch=trainer.epoch + 1, batch=0, batches_in_epoch=len(trainer.train_loader))
        print(f"Epoch {trainer.epoch + 1}/{trainer.epochs} started", flush=True)

    def batch_finished(trainer):
        batch_state["count"] += 1
        if time.monotonic() - batch_state["last_log"] >= 20:
            update(batch=batch_state["count"])
            print(f"Epoch {trainer.epoch + 1}: batch {batch_state['count']}/{len(trainer.train_loader)}", flush=True)
            batch_state["last_log"] = time.monotonic()

    def epoch_finished(trainer):
        if trainer.epoch >= trainer.epochs:
            return
        values = {key: float(value) for key, value in trainer.metrics.items()}
        update(stage="epoch_complete", epoch=trainer.epoch + 1, metrics=values)
        print(f"Epoch {trainer.epoch + 1} validation: {json.dumps(values)}", flush=True)

    model.add_callback("on_train_start", limit_threads)
    model.add_callback("on_val_start", limit_threads)
    model.add_callback("on_train_epoch_start", epoch_started)
    model.add_callback("on_train_batch_end", batch_finished)
    model.add_callback("on_fit_epoch_end", epoch_finished)
    try:
        model.train(**common, name="fit", epochs=args.epochs, freeze=args.freeze, pretrained=True,
                    optimizer="AdamW", lr0=args.lr, lrf=0.1, nbs=16, weight_decay=0.0005,
                    warmup_epochs=0.5, warmup_bias_lr=0.0, patience=args.epochs, seed=42, deterministic=True,
                    cache=False, amp=False, save=True, save_period=1,
                    mosaic=0.0, close_mosaic=0, mixup=0.0, scale=0.2, translate=0.1,
                    fliplr=0.5, hsv_s=0.3, hsv_v=0.3)
        checkpoint = Path(model.trainer.best)
        if not checkpoint.is_file():
            raise RuntimeError("Training did not produce best.pt")
        with (checkpoint.parent.parent / "results.csv").open(newline="", encoding="utf-8") as stream:
            completed_epochs = len(list(csv.DictReader(stream)))
        del model
        gc.collect()
        update(stage="final_evaluation", completed_epochs=completed_epochs)
        print("Evaluating best checkpoint and original baseline on the held-out test split...", flush=True)
        trained = YOLO(str(checkpoint))
        trained.add_callback("on_val_start", limit_threads)
        after_val = measured(trained.val(**common, name="trained_val", split="val"))
        after_test = measured(trained.val(**common, name="trained_test", split="test"))
        save_json(run / "trained-evaluation.json", {"validation": after_val, "test": after_test})
        domain_results = {}
        for domain, filename in dataset_manifest.get("evaluation_domains", {}).items():
            update(stage="domain_evaluation", domain=domain, evaluated_model="trained")
            domain_options = {**common, "data": str(data.parent / filename)}
            domain_results[domain] = {"trained_test": measured(trained.val(
                **domain_options, name=f"trained_{domain}_test", split="test"))}
        # This packaged image is a qualitative regression check, not held-out accuracy evidence.
        bus_sample = Path(ultralytics.__file__).parent / "assets/bus.jpg"
        def bus_check(detector):
            torch.set_num_threads(args.threads)
            result = detector.predict(str(bus_sample), imgsz=args.imgsz, device=args.device,
                                      classes=CLASSES, conf=0.35, verbose=False)[0]
            return [{"class": result.names[int(box.cls.item())], "confidence": float(box.conf.item())}
                    for box in result.boxes]
        regression = {"image": str(bus_sample), "confidence_threshold": 0.35,
                      "note": "Qualitative packaged-image regression check, not an accuracy measurement.",
                      "trained_detections": bus_check(trained)} if bus_sample.is_file() else None
        del trained
        gc.collect()
        original = YOLO(str(base))
        original.add_callback("on_val_start", limit_threads)
        before_test = measured(original.val(**common, name="baseline_test", split="test"))
        for domain, filename in dataset_manifest.get("evaluation_domains", {}).items():
            update(stage="domain_evaluation", domain=domain, evaluated_model="baseline")
            domain_options = {**common, "data": str(data.parent / filename)}
            domain_results[domain]["baseline_test"] = measured(original.val(
                **domain_options, name=f"baseline_{domain}_test", split="test"))
        if regression is not None:
            regression["baseline_detections"] = bus_check(original)
            regression["bus_retained"] = any(row["class"] == "bus" for row in regression["trained_detections"])
        exported = ROOT / "models" / f"{run.name}.pt"
        shutil.copy2(checkpoint, exported)
        report = {"status": "completed", "completed_epochs": completed_epochs, "dataset": str(data),
                  "dataset_splits": {split: {"images": len(details["images"]), "object_counts": details["object_counts"]}
                                     for split, details in dataset_manifest["splits"].items()},
                  "base_model": str(base), "trained_model": str(exported),
                  "sha256": hashlib.sha256(exported.read_bytes()).hexdigest(),
                  "device": args.device, "image_size": args.imgsz, "batch": args.batch,
                  "learning_rate": args.lr, "warmup_bias_learning_rate": 0.0,
                  "frozen_backbone_layers": args.freeze,
                  "pytorch": torch.__version__, "ultralytics": ultralytics.__version__,
                  "baseline_validation": before, "trained_validation": after_val,
                  "baseline_test": before_test, "trained_test": after_test,
                  "domain_evaluations": domain_results, "bus_regression_check": regression,
                  "active_model": str(base), "automatic_promotion": False,
                  "elapsed_seconds": round(time.monotonic() - started, 1),
                  "limitations": [*dataset_manifest.get("limitations", [dataset_manifest.get("note", "Small public dataset subset.")]),
                                  "Only five vehicle classes were fine-tuned; the original COCO class IDs/head were retained.",
                                  "Traffic-level thresholds, tracking, flow and speed were not trained.",
                                  "The original default checkpoint is preserved. Use --model to select the trained checkpoint."]}
        save_json(run / "training-report.json", report)
        lines = ["# Vehicle detector training results", "", f"Completed {completed_epochs} epochs on {args.device}.",
                 f"Trained checkpoint: `{exported}`", "", "| Evaluation | mAP50 | mAP50-95 |", "|---|---:|---:|"]
        comparisons = [("Baseline validation", before), ("Trained validation", after_val),
                       ("Baseline test", before_test), ("Trained test", after_test)]
        for domain, values in domain_results.items():
            comparisons += [(f"Baseline {domain} test", values["baseline_test"]),
                            (f"Trained {domain} test", values["trained_test"])]
        for title, result in comparisons:
            values = result["overall"]
            lines.append(f"| {title} | {values['metrics/mAP50(B)']:.4f} | {values['metrics/mAP50-95(B)']:.4f} |")
        if regression is not None:
            lines += ["", f"Packaged bus image retained bus detection at confidence 0.35: {regression['bus_retained']}."]
        lines += ["", *[f"- {note}" for note in report["limitations"]], "", "Dataset sources:",
                  *dataset_manifest.get("sources", [dataset_manifest.get("source", "See dataset manifest.")]), ""]
        (run / "training-report.md").write_text("\n".join(lines), encoding="utf-8")
        update(stage="completed", trained_model=str(exported), report=str(run / "training-report.json"))
        print("TRAINING COMPLETE", flush=True)
        print("Checkpoint:", exported, flush=True)
        print("Test metrics:", json.dumps(after_test["overall"]), flush=True)
        print("Report:", run / "training-report.md", flush=True)
    except BaseException as error:
        update(stage="interrupted" if isinstance(error, KeyboardInterrupt) else "failed", error=str(error))
        raise


if __name__ == "__main__":
    main()
