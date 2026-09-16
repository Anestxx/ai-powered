from sqlalchemy import String, cast, func, or_
from app.db.models import Event


def filter_events(query, event_type=None, status=None, severity=None, q=None):
    for column, value in ((Event.event_type, event_type), (Event.status, status), (Event.severity, severity)):
        if value:
            query = query.where(column == value)
    if q and q.strip():
        # Escape SQL wildcard characters: search text is literal, not a pattern.
        columns = (cast(Event.id, String), func.replace(Event.event_type, '_', ' '),
                   func.replace(Event.status, '_', ' '), Event.severity,
                   Event.assigned_department, cast(Event.latitude, String), cast(Event.longitude, String))
        for term in q.strip().lower().replace(',', ' ').split():
            value = '%' + term.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
            query = query.where(or_(*(func.lower(column).like(value, escape='\\') for column in columns)))
    return query
