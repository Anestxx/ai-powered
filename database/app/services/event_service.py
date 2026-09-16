import json
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.schemas.event import ObservationCreate

POINT_SQL = "ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography"

async def ingest_observation(db: AsyncSession, data: ObservationCreate) -> dict:
    params = {"event_type": data.event_type, "latitude": data.latitude, "longitude": data.longitude, "radius": settings.event_merge_radius_m}
    nearby = await db.execute(text(f"""
        SELECT id, confidence, detection_count, independent_vehicle_count
        FROM events
        WHERE event_type = :event_type AND status NOT IN ('resolved', 'dismissed')
          AND ST_DWithin(location, {POINT_SQL}, :radius)
        ORDER BY ST_Distance(location, {POINT_SQL}) LIMIT 1 FOR UPDATE
    """), params)
    row = nearby.mappings().first()
    merged = row is not None
    if row:
        event_id = row["id"]
        existing_vehicle = False
        if data.vehicle_id:
            existing_vehicle = bool((await db.execute(text("SELECT 1 FROM observations WHERE event_id = :event_id AND vehicle_id = :vehicle_id LIMIT 1"), {"event_id": event_id, "vehicle_id": data.vehicle_id})).first())
        old = float(row["confidence"] or 0)
        confidence = max(old, 1 - (1 - old) * (1 - data.confidence))
        await db.execute(text("""
            UPDATE events SET last_detected_at=:observed_at, detection_count=detection_count+1,
              independent_vehicle_count=independent_vehicle_count+:new_vehicle,
              confidence=:confidence, severity=COALESCE(:severity, severity), updated_at=now()
            WHERE id=:event_id
        """), {"event_id": event_id, "observed_at": data.observed_at, "new_vehicle": int(bool(data.vehicle_id) and not existing_vehicle), "confidence": confidence, "severity": data.severity})
        count = int(row["detection_count"]) + 1
    else:
        created = await db.execute(text(f"""
            INSERT INTO events (event_type, location, severity, confidence, first_detected_at, last_detected_at)
            VALUES (:event_type, {POINT_SQL}, :severity, :confidence, :observed_at, :observed_at)
            RETURNING id, detection_count
        """), {**params, "severity": data.severity, "confidence": data.confidence, "observed_at": data.observed_at})
        new = created.mappings().one()
        event_id, count = new["id"], new["detection_count"]
    observation = await db.execute(text(f"""
        INSERT INTO observations (vehicle_id,event_id,event_type,confidence,location,observed_at,model_name,model_version,tracking_id,severity,raw_payload)
        VALUES (:vehicle_id,:event_id,:event_type,:confidence,{POINT_SQL},:observed_at,:model_name,:model_version,:tracking_id,:severity,CAST(:raw_payload AS jsonb))
        RETURNING id
    """), {**data.model_dump(), "raw_payload": json.dumps(data.raw_payload) if data.raw_payload is not None else None, "event_id": event_id})
    await db.commit()
    return {"event_id": event_id, "observation_id": observation.scalar_one(), "merged": merged, "detection_count": count}

async def nearby_events(db: AsyncSession, latitude: float, longitude: float, radius_m: float) -> list[dict]:
    rows = await db.execute(text(f"""
        SELECT id, event_type, severity, confidence, status, first_detected_at, last_detected_at,
               detection_count, independent_vehicle_count,
               ROUND(ST_Distance(location, {POINT_SQL})::numeric, 1) AS distance_m
        FROM events WHERE status NOT IN ('resolved', 'dismissed')
          AND ST_DWithin(location, {POINT_SQL}, :radius)
        ORDER BY distance_m
    """), {"latitude": latitude, "longitude": longitude, "radius": radius_m})
    return [dict(row) for row in rows.mappings()]
