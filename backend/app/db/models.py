from datetime import datetime, timezone
from uuid import UUID, uuid4
from geoalchemy2 import Geography
from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Vehicle(Base):
    __tablename__ = "vehicles"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    external_vehicle_id: Mapped[str] = mapped_column(String(100), unique=True)
    vehicle_type: Mapped[str] = mapped_column(String(50), default="public_bus")
    route_id: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    latitude: Mapped[float | None]
    longitude: Mapped[float | None]
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (CheckConstraint("confidence >= 0 AND confidence <= 1"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    event_type: Mapped[str] = mapped_column(String(40), index=True)
    status: Mapped[str] = mapped_column(String(30), default="detected", index=True)
    severity: Mapped[str] = mapped_column(String(20), default="medium")
    confidence: Mapped[float] = mapped_column(Float, default=0)
    observation_count: Mapped[int] = mapped_column(Integer, default=0)
    latitude: Mapped[float]
    longitude: Mapped[float]
    location = mapped_column(Geography("POINT", srid=4326), nullable=False)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    assigned_department: Mapped[str | None] = mapped_column(String(100))


class Observation(Base):
    __tablename__ = "event_observations"
    __table_args__ = (CheckConstraint("model_confidence >= 0 AND model_confidence <= 1"),)
    id: Mapped[UUID] = mapped_column(primary_key=True)
    event_id: Mapped[UUID] = mapped_column(ForeignKey("events.id"), index=True)
    vehicle_id: Mapped[UUID] = mapped_column(ForeignKey("vehicles.id"), index=True)
    payload_hash: Mapped[str] = mapped_column(String(64))
    camera_id: Mapped[str | None] = mapped_column(String(100))
    model_confidence: Mapped[float]
    latitude: Mapped[float]
    longitude: Mapped[float]
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    frame_number: Mapped[int | None]


class Evidence(Base):
    __tablename__ = "evidence"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    observation_id: Mapped[UUID] = mapped_column(ForeignKey("event_observations.id"), unique=True)
    event_id: Mapped[UUID] = mapped_column(ForeignKey("events.id"), index=True)
    file_url: Mapped[str] = mapped_column(String(2048))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class User(Base):
    __tablename__ = "users"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(40))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    resource_id: Mapped[UUID]
    action: Mapped[str] = mapped_column(String(100))
    details: Mapped[dict] = mapped_column(JSON)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
