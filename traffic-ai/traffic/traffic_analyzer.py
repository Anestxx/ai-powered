"""Per-frame observations, not road flow or calibrated physical congestion."""

from dataclasses import dataclass
from math import isfinite

VEHICLE_NAMES = ("car", "motorcycle", "bus", "truck", "bicycle")


@dataclass(frozen=True)
class Detection:
    class_name: str
    bbox: tuple[float, float, float, float]
    confidence: float
    track_id: int | None = None


def classify_traffic(total_vehicles: int, occupancy: float) -> str:
    """Uncalibrated thresholds from the proposed MVP; higher signal wins."""
    if total_vehicles < 0 or not isfinite(occupancy) or not 0 <= occupancy <= 1:
        raise ValueError("Count must be nonnegative and occupancy must be between 0 and 1")
    if total_vehicles <= 5 and occupancy < 0.10:
        return "LOW"
    if total_vehicles <= 12 and occupancy < 0.25:
        return "MODERATE"
    if total_vehicles <= 25 and occupancy < 0.45:
        return "HIGH"
    return "SEVERE"


def union_area(rectangles: list[tuple[float, float, float, float]]) -> float:
    """Exact rectangle union: overlapping detections never count pixels twice."""
    edges = sorted({x for x1, _, x2, _ in rectangles for x in (x1, x2)})
    area = 0.0
    for left, right in zip(edges, edges[1:]):
        intervals = sorted((y1, y2) for x1, y1, x2, y2 in rectangles
                           if x1 < right and x2 > left)
        length, end = 0.0, float("-inf")
        for bottom, top in intervals:
            length += max(0.0, top - max(bottom, end))
            end = max(end, top)
        area += (right - left) * length
    return area


def analyze_frame(detections: list[Detection], width: int, height: int,
                  roi_top: float = 0.30) -> tuple[dict, list[Detection]]:
    """Filter by bottom-center in the ROI, then measure clipped box coverage.

    roi_top is a fraction of frame height. It is an image-region approximation,
    not a road segmentation mask. Counts reset on every frame.
    """
    if width <= 0 or height <= 0 or not isfinite(roi_top) or not 0 <= roi_top < 1:
        raise ValueError("Frame dimensions must be positive; roi_top must be in [0, 1)")
    start_y = int(height * roi_top)
    counts = dict.fromkeys(VEHICLE_NAMES, 0)
    accepted, rectangles, seen_ids = [], [], set()
    for detection in sorted(detections, key=lambda item: item.confidence, reverse=True):
        if detection.class_name not in counts:
            continue
        x1, y1, x2, y2 = detection.bbox
        if not all(isfinite(value) for value in (*detection.bbox, detection.confidence)):
            continue
        if x2 <= x1 or y2 <= y1 or not 0 <= detection.confidence <= 1:
            continue
        if not 0 <= (x1 + x2) / 2 < width or y2 <= start_y:
            continue
        # A box partly beyond the bottom edge may still contain a visible vehicle.
        clipped = (max(0.0, x1), max(float(start_y), y1), min(float(width), x2), min(float(height), y2))
        if clipped[2] <= clipped[0] or clipped[3] <= clipped[1]:
            continue
        if detection.track_id is not None:
            if detection.track_id in seen_ids:
                continue
            seen_ids.add(detection.track_id)
        counts[detection.class_name] += 1
        rectangles.append(clipped)
        accepted.append(Detection(detection.class_name, clipped, detection.confidence, detection.track_id))
    total = sum(counts.values())
    occupancy = min(1.0, max(0.0, union_area(rectangles) / (width * (height - start_y))))
    return {
        "vehicles": counts,
        "total_vehicles": total,
        "roi_occupancy": occupancy,
        "traffic_level": classify_traffic(total, occupancy),
    }, accepted
