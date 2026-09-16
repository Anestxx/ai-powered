import argparse
import json
from pathlib import Path

import cv2

from events.confirmation import TemporalEventFilter
from events.event_generator import create_event
from inference.road_hazard_pipeline import RoadHazardPipeline


ROOT = Path(__file__).resolve().parent


def draw_detections(frame, detections, color):
    """Draw a labeled bounding box for each independent model detection."""
    for detection in detections:
        x1, y1, x2, y2 = detection["bbox"]
        label = f'{detection["class_name"]} {detection["confidence"]:.2f}'
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        cv2.putText(frame, label, (x1, max(20, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX,
                    0.55, color, 2, cv2.LINE_AA)
    return frame


def main():
    parser = argparse.ArgumentParser(description="Run independent road-hazard models on a video.")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--video", default=ROOT / "videos" / "road_test.mp4", type=Path,
                        help="Path to a saved road video")
    source.add_argument("--camera", type=int,
                        help="Live camera index, for example 0 for the default webcam")
    source.add_argument("--rtsp", type=str,
                        help="Bus DVR/CCTV RTSP stream URL")
    parser.add_argument("--loop", action="store_true",
                        help="Restart a saved video when it reaches the end; stop with Ctrl+C")
    parser.add_argument("--confidence", default=0.5, type=float)
    parser.add_argument("--imgsz", default=416, type=int,
                        help="YOLO inference size; use 320 for faster CPU processing or 640 for higher detail")
    parser.add_argument("--confirmation-frames", default=3, type=int)
    parser.add_argument("--accident-model", type=Path,
                        help="Trained accident best.pt; enables accident detection")
    parser.add_argument("--save-evidence", action="store_true")
    parser.add_argument("--show", action="store_true",
                        help="Show the annotated detection video; press Q or Esc to stop")
    args = parser.parse_args()
    capture_source = args.rtsp if args.rtsp else (args.camera if args.camera is not None else str(args.video))
    capture = cv2.VideoCapture(capture_source)
    if not capture.isOpened():
        if args.camera is not None or args.rtsp:
            raise RuntimeError(f"Unable to open camera index {args.camera}.")
        raise FileNotFoundError(f"Unable to open video: {args.video}. Add a real test video at "
                            f"{ROOT / 'videos' / 'road_test.mp4'} or pass --video <path>.")
    pipeline = RoadHazardPipeline(accident_model=args.accident_model,
                                  confidence_threshold=args.confidence, image_size=args.imgsz)
    event_filter = TemporalEventFilter(required_frames=args.confirmation_frames)
    frame_number = 0
    event_number = 0
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                if args.loop and args.camera is None:
                    capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    print("Video ended; restarting because --loop is enabled.")
                    continue
                break
            frame_number += 1
            output = pipeline.process_frame(frame)
            annotated_frame = frame.copy()
            draw_detections(annotated_frame, output["potholes"], (0, 165, 255))       # orange
            draw_detections(annotated_frame, output["waterlogging"], (255, 180, 0))  # blue
            draw_detections(annotated_frame, output["accidents"], (180, 0, 255))     # purple
            for event_type, detections in (("pothole", output["potholes"]),
                                           ("waterlogging", output["waterlogging"]),
                                           ("accident", output["accidents"])):
                for detection in event_filter.confirmed(event_type, detections, frame_number):
                    event_number += 1
                    event = create_event(detection, event_type, frame_number)
                    print(json.dumps(event))
                    if args.save_evidence:
                        target = ROOT / "outputs" / "events" / f"{event_type}_EVT{event_number:03d}.jpg"
                        cv2.imwrite(str(target), annotated_frame)
            if args.show:
                cv2.imshow("AI Road Hazard Detection - Q or Esc to stop", annotated_frame)
                if cv2.waitKey(1) & 0xFF in (ord("q"), 27):
                    print("Road-hazard preview stopped by user.")
                    break
    except KeyboardInterrupt:
        print("Road-hazard pipeline stopped by user.")
    finally:
        capture.release()
        if args.show:
            cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
