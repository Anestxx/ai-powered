import uuid
from datetime import datetime
from decimal import Decimal
from geoalchemy2 import Geography
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database.base import Base

Point = Geography(geometry_type="POINT", srid=4326)

class Vehicle(Base):
    __tablename__ = "vehicles"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vehicle_number: Mapped[str] = mapped_column(String(100), unique=True)
    vehicle_type: Mapped[str] = mapped_column(String(50), server_default="bus")
    route_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("routes.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(50), server_default="active")
    camera_enabled: Mapped[bool] = mapped_column(Boolean, server_default="true")
    gps_enabled: Mapped[bool] = mapped_column(Boolean, server_default="true")
    last_location: Mapped[object | None] = mapped_column(Point)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

class VehicleLocation(Base):
    __tablename__ = "vehicle_locations"
    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vehicles.id", ondelete="CASCADE"), index=True)
    location: Mapped[object] = mapped_column(Point, nullable=False)
    speed_kmh: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    heading: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

class Event(Base):
    __tablename__ = "events"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(String(100), index=True)
    location: Mapped[object] = mapped_column(Point, nullable=False)
    road_segment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("road_segments.id", ondelete="SET NULL"))
    severity: Mapped[str | None] = mapped_column(String(50))
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    status: Mapped[str] = mapped_column(String(50), server_default="detected", index=True)
    first_detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    detection_count: Mapped[int] = mapped_column(Integer, server_default="1")
    independent_vehicle_count: Mapped[int] = mapped_column(Integer, server_default="1")
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Observation(Base):
    __tablename__ = "observations"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("vehicles.id", ondelete="SET NULL"), index=True)
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id", ondelete="SET NULL"), index=True)
    event_type: Mapped[str] = mapped_column(String(100), index=True)
    confidence: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
    location: Mapped[object] = mapped_column(Point, nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    model_name: Mapped[str | None] = mapped_column(String(100))
    model_version: Mapped[str | None] = mapped_column(String(50))
    tracking_id: Mapped[str | None] = mapped_column(String(100))
    severity: Mapped[str | None] = mapped_column(String(50))
    raw_payload: Mapped[dict | None] = mapped_column(JSONB)

Index("ix_events_location_gist", Event.location, postgresql_using="gist")
Index("ix_observations_location_gist", Observation.location, postgresql_using="gist")
Index("ix_vehicle_locations_location_gist", VehicleLocation.location, postgresql_using="gist")
