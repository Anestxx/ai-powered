from dataclasses import dataclass, field


def _iou(left, right):
    ax1, ay1, ax2, ay2 = left
    bx1, by1, bx2, by2 = right
    intersection = max(0, min(ax2, bx2) - max(ax1, bx1)) * max(0, min(ay2, by2) - max(ay1, by1))
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - intersection
    return intersection / union if union else 0.0


@dataclass
class TemporalEventFilter:
    required_frames: int = 3
    iou_threshold: float = 0.3
    suppression_frames: int = 90
    _streaks: dict = field(default_factory=dict)
    _emitted: dict = field(default_factory=dict)

    def confirmed(self, event_type, detections, frame_number):
        """Return newly confirmed detections, once per nearby hazard occurrence."""
        candidates = self._streaks.setdefault(event_type, [])
        next_candidates = []
        confirmed = []
        for detection in detections:
            match = next((item for item in candidates if _iou(item["detection"]["bbox"], detection["bbox"]) >= self.iou_threshold), None)
            count = match["count"] + 1 if match and match["last_frame"] == frame_number - 1 else 1
            next_candidates.append({"detection": detection, "count": count, "last_frame": frame_number})
            prior = self._emitted.get(event_type)
            recently_emitted = prior and frame_number - prior["frame"] <= self.suppression_frames and _iou(prior["bbox"], detection["bbox"]) >= self.iou_threshold
            if count >= self.required_frames and not recently_emitted:
                self._emitted[event_type] = {"bbox": detection["bbox"], "frame": frame_number}
                confirmed.append(detection)
        self._streaks[event_type] = next_candidates
        return confirmed
