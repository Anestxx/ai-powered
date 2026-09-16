from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from app.core.enums import EventStatus, EventType, Severity
from app.core.security import create_token, password_hasher, require_edge, require_roles, verify_password
from app.db.models import AuditLog, Event, Evidence, User, Vehicle, utcnow
from app.db.session import get_db
from app.schemas import EventRead, Login, ObservationCreate, StatusUpdate, VehicleCreate
from app.services.events import ingest, point
from app.services.live import manager

router = APIRouter(prefix="/api/v1")
dummy_hash = password_hasher.hash("dummy-login-timing-password")


@router.get("/health", tags=["Health"])
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except SQLAlchemyError:
        raise HTTPException(503, "Database unavailable")


@router.post("/auth/login", tags=["Authentication"])
def login(body: Login, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower().strip()))
    valid = verify_password(body.password, user.password_hash if user else dummy_hash)
    if not user or not valid or not user.is_active:
        raise HTTPException(401, "Invalid credentials")
    return {"access_token": create_token(user), "token_type": "bearer"}


@router.post("/vehicles", status_code=201, tags=["Vehicles"])
def register_vehicle(body: VehicleCreate, db: Session = Depends(get_db),
                     user=Depends(require_roles("admin", "transport_department"))):
    vehicle = Vehicle(**body.model_dump())
    db.add(vehicle)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Vehicle already registered")
    return {"id": vehicle.id, **body.model_dump()}


@router.post("/events/observations", tags=["Events"], dependencies=[Depends(require_edge)])
async def observation(body: ObservationCreate, response: Response, db: Session = Depends(get_db)):
    event, created, duplicate = await run_in_threadpool(ingest, db, body)
    result = EventRead.model_validate(event).model_dump(mode="json")
    response.status_code = 201 if created else 200
    if not duplicate:
        await manager.broadcast({"type": "event.created" if created else "event.updated", "data": result})
    return {"event": result, "duplicate": duplicate}


def paginated(db, query, page, page_size):
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    items = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [EventRead.model_validate(item) for item in items],
            "total": total, "page": page, "page_size": page_size}


@router.get("/events", tags=["Events"])
def events(event_type: EventType | None = None, status: EventStatus | None = None,
           severity: Severity | None = None,
           page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=100),
           order: Literal["asc", "desc"] = "desc", db: Session = Depends(get_db)):
    query = select(Event)
    for column, value in ((Event.event_type, event_type), (Event.status, status), (Event.severity, severity)):
        if value is not None:
            query = query.where(column == value)
    query = query.order_by(Event.last_seen.desc() if order == "desc" else Event.last_seen.asc(), Event.id)
    return paginated(db, query, page, page_size)


@router.get("/events/nearby", tags=["Events"])
def nearby(latitude: float = Query(ge=-90, le=90), longitude: float = Query(ge=-180, le=180),
           radius: float = Query(1000, gt=0, le=50000), page: int = Query(1, ge=1),
           page_size: int = Query(50, ge=1, le=100), db: Session = Depends(get_db)):
    location = point(latitude, longitude)
    query = select(Event).where(Event.status.not_in(("resolved", "rejected")),
        func.ST_DWithin(Event.location, location, radius)).order_by(func.ST_Distance(Event.location, location), Event.id)
    return paginated(db, query, page, page_size)


@router.get("/events/{event_id}", response_model=EventRead, tags=["Events"])
def event_detail(event_id: UUID, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(404, "Event not found")
    return event


@router.get("/events/{event_id}/evidence", tags=["Evidence"])
def evidence(event_id: UUID, db: Session = Depends(get_db),
             user=Depends(require_roles("admin", "municipality", "traffic_police"))):
    event_detail(event_id, db)
    items = db.scalars(select(Evidence).where(Evidence.event_id == event_id).limit(100)).all()
    return [{"id": item.id, "file_url": item.file_url, "captured_at": item.captured_at} for item in items]


TRANSITIONS = {
    "detected": {"confirmed", "rejected"},
    "confirmed": {"under_repair", "possibly_resolved", "resolved", "rejected"},
    "under_repair": {"confirmed", "possibly_resolved", "resolved"},
    "possibly_resolved": {"confirmed", "resolved"},
    "resolved": set(), "rejected": set(),
}


def change_status(db, event_id, status, user):
    event = db.scalar(select(Event).where(Event.id == event_id).with_for_update())
    if event is None:
        raise HTTPException(404, "Event not found")
    if status not in TRANSITIONS[event.status]:
        raise HTTPException(409, "Invalid event status transition")
    db.add(AuditLog(user_id=user.id, resource_id=event.id, action="event.status_changed",
                    details={"from": event.status, "to": status}))
    event.status = status
    event.resolved_at = utcnow() if status == "resolved" else None
    db.commit()
    return EventRead.model_validate(event).model_dump(mode="json")


@router.patch("/events/{event_id}/status", tags=["Events"])
async def status_update(event_id: UUID, body: StatusUpdate, db: Session = Depends(get_db),
                        user=Depends(require_roles("admin", "municipality"))):
    result = await run_in_threadpool(change_status, db, event_id, body.status, user)
    await manager.broadcast({"type": "event.updated", "data": result})
    return result
