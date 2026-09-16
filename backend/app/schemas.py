from datetime import datetime, timedelta, timezone
from uuid import UUID
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, HttpUrl, field_validator
from app.core.enums import EventStatus, EventType, Severity


class Coordinates(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class ObservationCreate(Coordinates):
    observation_id: UUID
    source_vehicle: str = Field(min_length=1, max_length=100)
    event_type: EventType
    confidence: float = Field(ge=0, le=1)
    severity: Severity = Severity.MEDIUM
    captured_at: AwareDatetime
    camera_id: str | None = Field(default=None, max_length=100)
    frame_number: int | None = Field(default=None, ge=0)
    evidence_url: HttpUrl | None = Field(default=None, max_length=2048)

    @field_validator("captured_at")
    @classmethod
    def validate_time(cls, value):
        now = datetime.now(timezone.utc)
        if not now - timedelta(days=30) <= value <= now + timedelta(minutes=5):
            raise ValueError("captured_at must be within the last 30 days and no more than 5 minutes ahead")
        return value.astimezone(timezone.utc)


class EventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    event_type: EventType
    status: EventStatus
    severity: Severity
    confidence: float
    observation_count: int
    latitude: float
    longitude: float
    first_seen: datetime
    last_seen: datetime
    resolved_at: datetime | None
    assigned_department: str | None


class StatusUpdate(BaseModel):
    status: EventStatus


class VehicleCreate(BaseModel):
    external_vehicle_id: str = Field(min_length=1, max_length=100)
    vehicle_type: str = Field(default="public_bus", min_length=1, max_length=50)
    route_id: str | None = Field(default=None, max_length=100)


class Login(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=1024)
