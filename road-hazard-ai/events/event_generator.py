from datetime import datetime, timezone


def create_event(detection, event_type, frame_number, timestamp=None):
    """Create a backend-ready event; location is deliberately an external input."""
    if event_type not in {"pothole", "waterlogging", "accident"}:
        raise ValueError("event_type must be pothole, waterlogging, or accident")
    return {
        "event_type": event_type,
        "confidence": detection["confidence"],
        "bbox": detection["bbox"],
        "frame_number": frame_number,
        "timestamp": (timestamp or datetime.now(timezone.utc)).isoformat(),
        "latitude": None,
        "longitude": None,
    }
