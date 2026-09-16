export const EVENT_TYPES = {
  pothole: { label: 'Pothole', color: '#d99823', icon: 'road' },
  road_damage: { label: 'Road damage', color: '#d87941', icon: 'road' },
  road_obstacle: { label: 'Road obstacle', color: '#957052', icon: 'alert' },
  stalled_vehicle: { label: 'Stalled vehicle', color: '#8070b4', icon: 'car' },
  accident_suspected: { label: 'Suspected accident', color: '#df5c62', icon: 'alert' },
  congestion: { label: 'Congestion', color: '#e58b40', icon: 'car' },
  waterlogging: { label: 'Waterlogging', color: '#4c9ec6', icon: 'water' },
  construction: { label: 'Construction', color: '#bd9856', icon: 'road' },
  emergency_vehicle: { label: 'Emergency vehicle', color: '#a477c9', icon: 'car' },
};

export const STATUSES = {
  detected: 'Detected', confirmed: 'Confirmed', under_repair: 'Under repair',
  possibly_resolved: 'Possibly resolved', resolved: 'Resolved', rejected: 'Rejected',
};

export const TRANSITIONS = {
  detected: ['confirmed', 'rejected'],
  confirmed: ['under_repair', 'possibly_resolved', 'resolved', 'rejected'],
  under_repair: ['confirmed', 'possibly_resolved', 'resolved'],
  possibly_resolved: ['confirmed', 'resolved'], resolved: [], rejected: [],
};

export const DEFAULT_FILTERS = { event_type: '', status: '', severity: '', order: 'desc' };
export const PAGE_SIZE = 50;
export const typeLabel = (type) => EVENT_TYPES[type]?.label || type?.replaceAll('_', ' ') || 'Event';
export const coordinates = (event) => `${Number(event.latitude).toFixed(5)}, ${Number(event.longitude).toFixed(5)}`;
export const isActive = (event) => !['resolved', 'rejected'].includes(event.status);
export const fullDate = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
export function timeAgo(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

export function distanceMetres(a, b) {
  const rad = Math.PI / 180;
  const deltaLat = (a.latitude - b.latitude) * rad;
  const deltaLng = (a.longitude - b.longitude) * rad;
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(deltaLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function filterDemo(events, filters, nearby, page) {
  let items = events.filter(event => nearby
    ? isActive(event) && distanceMetres(event, nearby) <= nearby.radius
    : (!filters.event_type || event.event_type === filters.event_type) &&
      (!filters.status || event.status === filters.status) && (!filters.severity || event.severity === filters.severity));
  items.sort((a, b) => nearby ? distanceMetres(a, nearby) - distanceMetres(b, nearby)
    : (new Date(b.last_seen) - new Date(a.last_seen)) * (filters.order === 'asc' ? -1 : 1));
  return { items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: items.length, page, page_size: PAGE_SIZE };
}

export function exportEvents(events) {
  const columns = ['id', 'event_type', 'status', 'severity', 'confidence', 'observation_count', 'latitude', 'longitude', 'first_seen', 'last_seen', 'assigned_department'];
  const cell = (value) => `"${String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""')}"`;
  const csv = [columns, ...events.map(event => columns.map(key => event[key]))].map(row => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `citylens-events-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
