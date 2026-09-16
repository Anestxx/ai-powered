"""Extract evenly spaced frames from an accident video for manual YOLO annotation."""
import argparse
from pathlib import Path

import cv2


ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", default=ROOT / "videos" / "accident.mp4", type=Path)
    parser.add_argument("--fps", default=5.0, type=float, help="Frames per second to retain")
    args = parser.parse_args()
    if not args.video.is_file():
        raise FileNotFoundError(f"Video not found: {args.video}")

    image_dir = ROOT / "datasets" / "accident" / "annotation" / "images"
    label_dir = ROOT / "datasets" / "accident" / "annotation" / "labels"
    image_dir.mkdir(parents=True, exist_ok=True)
    label_dir.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(args.video))
    source_fps = capture.get(cv2.CAP_PROP_FPS)
    if source_fps <= 0:
        raise RuntimeError("Could not read the video's frame rate.")
    every = max(1, round(source_fps / args.fps))
    frame_index = saved = 0
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        if frame_index % every == 0:
            stem = f"{args.video.stem}_{frame_index:06d}"
            target = image_dir / f"{stem}.jpg"
            if cv2.imwrite(str(target), frame):
                saved += 1
        frame_index += 1
    capture.release()
    print(f"Extracted {saved} frames to {image_dir}")
    print("Annotate the accident evidence, then split the annotated files into train and val.")


if __name__ == "__main__":
    main()
