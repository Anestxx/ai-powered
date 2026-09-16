from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from uuid import UUID
from app.core.security import current_user, require_roles
from app.db.models import AuditLog, Event, Vehicle
from app.db.session import get_db
from app.schemas import EventRead, ObservationCreate
from app.services.events import ingest
from app.services.live import manager

router = APIRouter(prefix='/api/v1')


@router.get('/auth/me', tags=['Authentication'])
def profile(user=Depends(current_user)):
    return {'id': str(user.id), 'email': user.email, 'role': user.role}


@router.get('/dashboard/summary', tags=['Dashboard'])
def summary(db: Session = Depends(get_db)):
    # One grouped query keeps all counters consistent and includes every page.
    groups = db.execute(select(Event.status, Event.event_type, func.count()).group_by(Event.status, Event.event_type)).all()
    statuses, types = {}, {}
    for status, event_type, count in groups:
        statuses[status] = statuses.get(status, 0) + count
        types[event_type] = types.get(event_type, 0) + count
    return {'total': sum(statuses.values()), 'detected': statuses.get('detected', 0),
            'under_repair': statuses.get('under_repair', 0), 'resolved': statuses.get('resolved', 0),
            'by_status': statuses, 'by_type': types}


@router.get('/vehicles', tags=['Vehicles'])
def vehicles(q: str = Query('', max_length=100), page: int = Query(1, ge=1),
             page_size: int = Query(50, ge=1, le=100), db: Session = Depends(get_db),
             user=Depends(require_roles('admin', 'municipality', 'traffic_police', 'transport_department'))):
    query = select(Vehicle)
    if q.strip():
        query = query.where(Vehicle.external_vehicle_id.icontains(q.strip(), autoescape=True))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = db.scalars(query.order_by(Vehicle.external_vehicle_id, Vehicle.id).offset((page-1)*page_size).limit(page_size)).all()
    return {'total': total, 'page': page, 'page_size': page_size,
            'items': [{'id': str(v.id), 'external_vehicle_id': v.external_vehicle_id,
                       'vehicle_type': v.vehicle_type, 'route_id': v.route_id,
                       'is_active': v.is_active, 'latitude': v.latitude, 'longitude': v.longitude,
                       'last_seen': v.last_seen} for v in items]}


@router.post('/staff/observations', tags=['Events'])
async def staff_observation(body: ObservationCreate, response: Response,
                            db: Session = Depends(get_db),
                            user=Depends(require_roles('admin', 'transport_department'))):
    event, created, duplicate = await run_in_threadpool(ingest, db, body)
    result = EventRead.model_validate(event).model_dump(mode='json')
    response.status_code = 201 if created else 200
    if not duplicate:
        await manager.broadcast({'type': 'event.created' if created else 'event.updated', 'data': result})
    return {'event': result, 'duplicate': duplicate}


class Assignment(BaseModel):
    assigned_department: str | None = Field(default=None, max_length=100)

    @field_validator('assigned_department')
    @classmethod
    def clean_department(cls, value):
        return value.strip() or None if value is not None else None


def save_assignment(db, event_id, department, user):
    event = db.scalar(select(Event).where(Event.id == event_id).with_for_update())
    if event is None:
        raise HTTPException(404, 'Event not found')
    db.add(AuditLog(user_id=user.id, resource_id=event.id, action='event.department_assigned',
                    details={'from': event.assigned_department, 'to': department}))
    event.assigned_department = department
    db.commit()
    return EventRead.model_validate(event).model_dump(mode='json')


@router.patch('/events/{event_id}/assignment', tags=['Events'])
async def assignment(event_id: UUID, body: Assignment, db: Session = Depends(get_db),
                     user=Depends(require_roles('admin', 'municipality'))):
    result = await run_in_threadpool(save_assignment, db, event_id, body.assigned_department, user)
    await manager.broadcast({'type': 'event.updated', 'data': result})
    return result
