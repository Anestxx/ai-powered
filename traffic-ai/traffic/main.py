import argparse
from collections import Counter
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
import json
import math
import os
from pathlib import Path
import sys
from time import perf_counter

from .traffic_analyzer import analyze_frame
from .paths import ROOT


def positive_int(value):
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("must be positive")
    return number


def fraction(value):
    number = float(value)
    if not math.isfinite(number) or not 0 <= number < 1:
        raise argparse.ArgumentTypeError("must be between 0 (inclusive) and 1 (exclusive)")
    return number


def positive_float(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("must be a finite positive number")
    return number


def timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise argparse.ArgumentTypeError("use a full ISO timestamp with timezone") from error
    if parsed.tzinfo is None:
        raise argparse.ArgumentTypeError("timestamp must include a timezone")
    return parsed.astimezone(timezone.utc)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="BMTC Traffic AI: current vehicles and image ROI occupancy")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--source", type=Path, help="Recorded video; default: videos/traffic.mp4")
    source.add_argument("--camera-index", type=int, help="Explicitly open a local camera, e.g. 0")
    parser.add_argument("--model", default=str(ROOT / "models" / "yolo26n.pt"))
    parser.add_argument("--confidence", type=fraction, default=0.35)
    parser.add_argument("--roi-top", type=fraction, default=0.30, help="Ignore this fraction of the frame from the top")
    parser.add_argument("--device", default="cpu", help="cpu, or a CUDA device supported by your PyTorch install")
    parser.add_argument("--image-size", type=positive_int, default=640)
    parser.add_argument("--fps", type=positive_float, help="Override missing/incorrect source FPS")
    parser.add_argument("--max-frames", type=positive_int)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "outputs", help="Parent folder; each run gets a new subfolder")
    parser.add_argument("--save-video", action="store_true", help="Save annotated.mp4 alongside JSON metrics")
    parser.add_argument("--show", action="store_true", help="Open live preview; press Q to stop")
    parser.add_argument("--recorded-at", type=timestamp, help="Known capture time of the FIRST video frame, including timezone")
    parser.add_argument("--bus-id", help="Optional source vehicle metadata; not inferred from the video")
    parser.add_argument("--road-id", help="Optional road metadata; not inferred or map-matched")
    args = parser.parse_args(argv)
    if args.camera_index is not None and args.camera_index < 0:
        parser.error("--camera-index must be nonnegative")
    if args.camera_index is not None and args.recorded_at is not None:
        parser.error("--recorded-at is only for recorded videos")
    if args.camera_index is None:
        args.source = (args.source or ROOT / "videos" / "traffic.mp4").resolve()
        if not args.source.is_file():
            parser.error(f"Video does not exist: {args.source}. Supply --source with a video file.")
    return args


def annotate(frame, metrics, detections, roi_top):
    import cv2

    height, width = frame.shape[:2]
    top = int(height * roi_top)
    cv2.line(frame, (0, top), (width - 1, top), (255, 160, 0), 2)
    for detection in detections:
        x1, y1, x2, y2 = map(int, detection.bbox)
        cv2.rectangle(frame, (x1, y1), (min(x2, width - 1), min(y2, height - 1)), (0, 230, 90), 2)
    lines = [f"Visible vehicles: {metrics['total_vehicles']}",
             f"ROI box coverage: {metrics['roi_occupancy']:.1%}",
             f"Traffic estimate: {metrics['traffic_level']}"]
    lines.extend(f"{name}: {count}" for name, count in metrics["vehicles"].items())
    panel_right, panel_bottom = min(width - 1, 365), min(height - 1, 24 * len(lines) + 10)
    cv2.rectangle(frame, (0, 0), (panel_right, panel_bottom), (25, 25, 25), -1)
    for index, line in enumerate(lines):
        cv2.putText(frame, line, (10, 24 * (index + 1)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
    # Keep identities visible when the dashboard covers the box's upper edge.
    for detection in detections:
        x1, y1, _, _ = map(int, detection.bbox)
        identity = str(detection.track_id) if detection.track_id is not None else "untracked"
        label = f"{detection.class_name} ID:{identity} {detection.confidence:.2f}"
        label_y = max(y1 - 5, 16)
        if label_y <= panel_bottom + 10 and x1 < panel_right:
            label_y = min(height - 5, max(y1 + 16, panel_bottom + 16))
        text_width = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)[0][0]
        label_x = max(0, min(x1, width - text_width - 2))
        for color, thickness in [((0, 0, 0), 3), ((0, 230, 90), 1)]:
            cv2.putText(frame, label, (label_x, label_y), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, thickness)


def run(args):
    # Keep model settings and downloads out of the user's global Python setup.
    os.environ.setdefault("YOLO_CONFIG_DIR", str(ROOT / ".cache" / "ultralytics"))
    os.environ.setdefault("YOLO_AUTOINSTALL", "false")
    Path(os.environ["YOLO_CONFIG_DIR"]).mkdir(parents=True, exist_ok=True)
    (ROOT / "models").mkdir(exist_ok=True)
    import cv2
    from .detector import VehicleTracker

    live = args.camera_index is not None
    capture = cv2.VideoCapture(args.camera_index if live else str(args.source))
    writer = None
    frames, max_visible, levels = 0, 0, Counter()
    try:
        if not capture.isOpened():
            raise RuntimeError("Cannot open the video source. Check the file/codec or camera index.")
        success, frame = capture.read()
        frame_received_at = datetime.now(timezone.utc)
        if not success or frame is None:
            raise RuntimeError("The source opened but contains no readable frames")
        fps = float(args.fps or capture.get(cv2.CAP_PROP_FPS))
        if not math.isfinite(fps) or fps <= 0:
            if not live:
                raise ValueError("The video has no valid FPS. Specify --fps using its known frame rate.")
            fps = 30.0
        tracker = VehicleTracker(args.model, args.confidence, args.device, args.image_size)
        output = args.output_dir.resolve() / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S_%fZ")
        output.mkdir(parents=True, exist_ok=False)
        height, width = frame.shape[:2]
        if args.save_video:
            writer = cv2.VideoWriter(str(output / "annotated.mp4"), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
            if not writer.isOpened():
                raise RuntimeError("Cannot create the annotated MP4; rerun without --save-video or check the codec")
        start = perf_counter()
        with (output / "metrics.jsonl").open("w", encoding="utf-8") as metrics_file:
            while success and frame is not None:
                if frame.shape[:2] != (height, width):
                    raise RuntimeError("Source dimensions changed during this run")
                metrics, detections = analyze_frame(tracker.track(frame), width, height, args.roi_top)
                video_time = None if live else frames / fps
                captured_at = frame_received_at if live else (
                    args.recorded_at + timedelta(seconds=video_time) if args.recorded_at else None)
                record = {
                    "schema_version": 1, "frame_index": frames,
                    "video_time_seconds": video_time,
                    "captured_at": captured_at.isoformat() if captured_at else None,
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                    "source_vehicle": args.bus_id, "road_id": args.road_id,
                    "roi_top": args.roi_top,
                    "occupancy_method": "bounding_box_union_fraction_of_image_roi",
                    **metrics, "detections": [asdict(detection) for detection in detections],
                }
                metrics_file.write(json.dumps(record, allow_nan=False) + "\n")
                frames += 1
                max_visible = max(max_visible, metrics["total_vehicles"])
                levels[metrics["traffic_level"]] += 1
                if writer is not None or args.show:
                    annotate(frame, metrics, detections, args.roi_top)
                    if writer is not None:
                        writer.write(frame)
                    if args.show:
                        cv2.imshow("BMTC Traffic AI", frame)
                        if cv2.waitKey(1) & 0xFF == ord("q"):
                            break
                if args.max_frames and frames >= args.max_frames:
                    break
                success, frame = capture.read()
                frame_received_at = datetime.now(timezone.utc)
        elapsed = perf_counter() - start
        summary = {
            "frames_processed": frames, "max_visible_vehicles": max_visible,
            "traffic_level_frames": dict(levels), "source_fps": fps,
            "processing_fps": round(frames / elapsed, 2) if elapsed else 0,
            "model": args.model, "tracker": "botsort.yaml", "roi_top": args.roi_top,
            "metrics": "metrics.jsonl", "annotated_video": "annotated.mp4" if writer is not None else None,
            "measurement_note": "Visible vehicle counts and image ROI box coverage; uncalibrated traffic labels, not flow or speed.",
        }
        (output / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(json.dumps({"output_directory": str(output), **summary}, indent=2))
        return 0
    finally:
        capture.release()
        if writer is not None:
            writer.release()
        if args.show:
            cv2.destroyAllWindows()


def main(argv=None):
    args = parse_args(argv)
    try:
        return run(args)
    except KeyboardInterrupt:
        print("Stopped; any completed frame records remain in the output folder.", file=sys.stderr)
        return 130
    except Exception as error:
        print(f"Traffic AI failed: {error}", file=sys.stderr)
        return 1
