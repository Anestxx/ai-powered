from ultralytics import YOLO
import cv2
import easyocr
import re
import math

# =========================
# CONFIG
# =========================

MODEL_PATH = "models/helmet_detector.pt"
INPUT_VIDEO = "test_video.mp4"        # <-- use a real video file
OUTPUT_VIDEO = "helmet_plate_output.mp4"

CONF_THRESHOLD = 0.35
OCR_EVERY_N_FRAMES = 5
MIN_TEXT_LEN = 4
VIOLATION_LINK_DISTANCE = 250   # px, how close a plate must be to a no-helmet box to link them

# =========================
# LOAD MODEL + OCR
# =========================

model = YOLO(MODEL_PATH)
reader = easyocr.Reader(["en"], gpu=False)

print("Model classes:", model.names)

# ---------------------------------
# Auto-detect which class ids are which,
# based on the names in your trained model.
# Adjust the keyword lists below if your
# labels are worded differently.
# ---------------------------------

NO_HELMET_IDS = set()
HELMET_IDS = set()
PLATE_IDS = set()

for class_id, name in model.names.items():
    lname = name.lower()
    if "plate" in lname:
        PLATE_IDS.add(class_id)
    elif "no" in lname and "helmet" in lname:
        NO_HELMET_IDS.add(class_id)
    elif "helmet" in lname:
        HELMET_IDS.add(class_id)

print("No-helmet class ids:", NO_HELMET_IDS)
print("Helmet class ids:", HELMET_IDS)
print("Plate class ids:", PLATE_IDS)

# =========================
# VIDEO IO
# =========================

cap = cv2.VideoCapture(INPUT_VIDEO)
if not cap.isOpened():
    print("❌ Could not open video")
    exit()

fps = cap.get(cv2.CAP_PROP_FPS) or 25
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

fourcc = cv2.VideoWriter_fourcc(*"mp4v")
writer = cv2.VideoWriter(OUTPUT_VIDEO, fourcc, fps, (width, height))

print("🚀 Starting combined helmet + plate detection...")

# =========================
# HELPERS
# =========================

def clean_text(text):
    text = text.upper()
    return re.sub(r"[^A-Z0-9]", "", text)


def box_center(x1, y1, x2, y2):
    return ((x1 + x2) / 2, (y1 + y2) / 2)


def distance(p1, p2):
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])


# track_id -> best OCR reading so far
track_best = {}

# track_ids of violations we've already logged, so we don't spam prints
logged_violations = set()

frame_count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame_count += 1

    results = model.track(
        frame,
        conf=CONF_THRESHOLD,
        imgsz=640,
        persist=True,
        tracker="bytetrack.yaml",
        verbose=False
    )

    no_helmet_boxes = []   # (track_id, x1,y1,x2,y2, center)
    plate_boxes = []       # (track_id, x1,y1,x2,y2, center)

    for result in results:

        if result.boxes is None or result.boxes.id is None:
            continue

        boxes = result.boxes

        for box, track_id in zip(boxes, boxes.id):

            class_id = int(box.cls[0])
            track_id = int(track_id)
            conf = float(box.conf[0])

            x1, y1, x2, y2 = map(int, box.xyxy[0])
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(width, x2), min(height, y2)
            if x2 <= x1 or y2 <= y1:
                continue

            center = box_center(x1, y1, x2, y2)

            # ---------------------------------
            # HELMET / NO-HELMET
            # ---------------------------------

            if class_id in NO_HELMET_IDS:
                color = (0, 0, 255)  # red = violation
                label = f"NO HELMET ({conf:.2f})"
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(frame, label, (x1, max(30, y1 - 10)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
                no_helmet_boxes.append((track_id, x1, y1, x2, y2, center))
                continue

            if class_id in HELMET_IDS:
                color = (0, 255, 0)  # green = compliant
                label = f"HELMET ({conf:.2f})"
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(frame, label, (x1, max(30, y1 - 10)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
                continue

            # ---------------------------------
            # PLATE
            # ---------------------------------

            if class_id in PLATE_IDS:

                plate = frame[y1:y2, x1:x2]
                if plate.size == 0:
                    continue

                already_confident = (
                    track_id in track_best
                    and track_best[track_id]["conf"] > 0.8
                )
                should_ocr = (
                    frame_count % OCR_EVERY_N_FRAMES == 0
                    and not already_confident
                )

                if should_ocr:
                    plate_big = cv2.resize(plate, None, fx=3, fy=3,
                                            interpolation=cv2.INTER_CUBIC)
                    gray = cv2.cvtColor(plate_big, cv2.COLOR_BGR2GRAY)
                    gray = cv2.bilateralFilter(gray, 9, 75, 75)
                    gray = cv2.equalizeHist(gray)

                    ocr_results = reader.readtext(
                        gray, detail=1, paragraph=False,
                        width_ths=0.7, mag_ratio=1.5
                    )

                    for detection in ocr_results:
                        text = clean_text(detection[1])
                        confidence = detection[2]
                        if len(text) < MIN_TEXT_LEN:
                            continue
                        current_best = track_best.get(track_id, {"conf": 0})
                        if confidence > current_best["conf"]:
                            track_best[track_id] = {"text": text, "conf": confidence}

                color = (255, 200, 0)
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                best = track_best.get(track_id)
                if best:
                    label = f"{best['text']} ({best['conf']:.2f})"
                    cv2.putText(frame, label, (x1, max(30, y1 - 10)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

                plate_boxes.append((track_id, x1, y1, x2, y2, center))

    # ---------------------------------
    # LINK NO-HELMET RIDERS TO NEARBY PLATES
    # ---------------------------------

    for nh_id, nx1, ny1, nx2, ny2, n_center in no_helmet_boxes:

        nearest_plate = None
        nearest_dist = VIOLATION_LINK_DISTANCE

        for p_id, px1, py1, px2, py2, p_center in plate_boxes:
            d = distance(n_center, p_center)
            if d < nearest_dist:
                nearest_dist = d
                nearest_plate = p_id

        if nearest_plate is not None:
            plate_info = track_best.get(nearest_plate)
            plate_text = plate_info["text"] if plate_info else "UNREADABLE"

            key = (nh_id, nearest_plate)
            if key not in logged_violations:
                logged_violations.add(key)
                print(f"⚠️  Violation: rider(track {nh_id}) no helmet, "
                      f"plate(track {nearest_plate}) = {plate_text}")

    writer.write(frame)

cap.release()
writer.release()

print()
print("✅ DONE!")
print(f"Output saved as: {OUTPUT_VIDEO}")
print()
print("All plate readings:")
for tid, info in track_best.items():
    print(f"  Track {tid}: {info['text']} (conf={info['conf']:.2f})")