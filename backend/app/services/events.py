import hashlib
import logging
from sqlalchemy import func, select, text
from fastapi import HTTPException
from geoalchemy2.elements import WKTElement
from app.db.models import Event, Evidence, Observation, Vehicle

logger = logging.getLogger(__name__)
RADII = {"pothole": 10, "road_damage": 12, "road_obstacle": 15,
         "stalled_vehicle": 20, "accident_suspected": 30, "congestion": 100,
         "waterlogging": 30, "construction": 30, "emergency_vehicle": 15}
TERMINAL = ("resolved", "rejected")


def point(latitude, longitude):
    return WKTElement(f"POINT({longitude} {latitude})", srid=4326)


def confidence_score(average, independent_vehicles):
    return min(1.0, average + min(max(independent_vehicles - 1, 0) * 0.05, 0.20))


def ingest(db, data):
    # Serialize MVP ingestion, including retries, across API processes. Replace with
    # spatial partition locks when throughput requires it; transaction releases lock.
    db.execute(text("SELECT pg_advisory_xact_lock(7142026)"))
    fingerprint = hashlib.sha256(data.model_dump_json().encode()).hexdigest()
    existing = db.get(Observation, data.observation_id)
    if existing:
        if existing.payload_hash != fingerprint:
            raise HTTPException(409, "Observation ID already belongs to a different payload")
        return db.get(Event, existing.event_id), False, True
    vehicle = db.scalar(select(Vehicle).where(Vehicle.external_vehicle_id == data.source_vehicle,
                                            Vehicle.is_active.is_(True)))
    if vehicle is None:
        raise HTTPException(422, "Unknown or inactive source vehicle")
    location = point(data.latitude, data.longitude)
    event = db.scalar(select(Event).where(
        Event.event_type == data.event_type, Event.status.not_in(TERMINAL),
        func.ST_DWithin(Event.location, location, RADII[data.event_type])
    ).order_by(func.ST_Distance(Event.location, location), Event.id).limit(1).with_for_update())
    created = event is None
    if created:
        event = Event(event_type=data.event_type, severity=data.severity,
                      latitude=data.latitude, longitude=data.longitude, location=location,
                      first_seen=data.captured_at, last_seen=data.captured_at)
        db.add(event)
        db.flush()
    observation = Observation(id=data.observation_id, event_id=event.id, vehicle_id=vehicle.id,
                              payload_hash=fingerprint, camera_id=data.camera_id,
                              model_confidence=data.confidence, latitude=data.latitude,
                              longitude=data.longitude, captured_at=data.captured_at,
                              frame_number=data.frame_number)
    db.add(observation)
    db.flush()
    if data.evidence_url:
        db.add(Evidence(observation_id=observation.id, event_id=event.id,
                        file_url=str(data.evidence_url), captured_at=data.captured_at))
    count, average, buses = db.execute(select(func.count(Observation.id),
        func.avg(Observation.model_confidence), func.count(func.distinct(Observation.vehicle_id))
    ).where(Observation.event_id == event.id)).one()
    event.observation_count = count
    event.confidence = confidence_score(average, buses)
    event.first_seen = min(event.first_seen, data.captured_at)
    event.last_seen = max(event.last_seen, data.captured_at)
    if event.status in ("detected", "possibly_resolved") and buses >= 2 and event.confidence >= 0.8:
        event.status = "confirmed"
    if vehicle.last_seen is None or data.captured_at >= vehicle.last_seen:
        vehicle.latitude, vehicle.longitude = data.latitude, data.longitude
        vehicle.last_seen = data.captured_at
    db.commit()
    logger.info("Event %s %s", event.id, "created" if created else "merged")
    return event, created, False
