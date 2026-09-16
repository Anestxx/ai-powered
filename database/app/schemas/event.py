from datetime import datetime
from typing import Any
from uuid import UUID
from pydantic import BaseModel, Field

class ObservationCreate(BaseModel):
    event_type: str = Field(min_length=1, max_length=100)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    confidence: float = Field(ge=0, le=1)
    observed_at: datetime
    vehicle_id: UUID | None = None
    severity: str | None = Field(default=None, max_length=50)
    model_name: str | None = Field(default=None, max_length=100)
    model_version: str | None = Field(default=None, max_length=50)
    tracking_id: str | None = Field(default=None, max_length=100)
    raw_payload: dict[str, Any] | None = None

class EventResult(BaseModel):
    event_id: UUID
    observation_id: UUID
    merged: bool
    detection_count: int
