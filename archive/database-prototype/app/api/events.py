from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.connection import get_db
from app.schemas.event import EventResult, ObservationCreate
from app.services.event_service import ingest_observation, nearby_events

router = APIRouter(prefix="/events", tags=["events"])

@router.post("/observations", response_model=EventResult, status_code=201)
async def receive_observation(payload: ObservationCreate, db: AsyncSession = Depends(get_db)):
    return await ingest_observation(db, payload)

@router.get("/nearby")
async def get_nearby_events(latitude: float = Query(ge=-90, le=90), longitude: float = Query(ge=-180, le=180), radius_m: float = Query(default=500, gt=0, le=20_000), db: AsyncSession = Depends(get_db)):
    return await nearby_events(db, latitude, longitude, radius_m)
