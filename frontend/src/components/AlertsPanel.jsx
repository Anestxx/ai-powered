import React from 'react';
import { ArrowDownToLine, ArrowRight, ChevronLeft, ChevronRight, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import { Badge, EmptyState, TypeIcon } from './UI';
import { coordinates, EVENT_TYPES, exportEvents, fullDate, PAGE_SIZE, STATUSES, timeAgo, typeLabel } from '../lib/events';

export function EventFilters({ filters, setFilters, query, setQuery, nearby, clearNearby }) {
  return <div className="filters">
    <label className="search-input"><Search size={16} /><input aria-label="Search all incidents" placeholder="Search all incidents…" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}</label>
    {nearby && <button className="filter-chip" onClick={clearNearby}><MapPin size={14} />Within {nearby.radius / 1000} km<X size={14} /></button>}<>
      <SlidersHorizontal size={16} className="filter-icon" />
      <select aria-label="Event type" value={filters.event_type} onChange={event => setFilters({ ...filters, event_type: event.target.value })}><option value="">All event types</option>{Object.entries(EVENT_TYPES).map(([value, type]) => <option key={value} value={value}>{type.label}</option>)}</select>
      <select aria-label="Event status" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option>{Object.entries(STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="Event severity" value={filters.severity} onChange={event => setFilters({ ...filters, severity: event.target.value })}><option value="">All severities</option>{['critical', 'high', 'medium', 'low'].map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select>
      <select aria-label="Event order" value={filters.order} onChange={event => setFilters({ ...filters, order: event.target.value })}><option value="desc">Latest first</option><option value="asc">Oldest first</option></select>
    </>
  </div>;
}
export function EventFeed({ events, onSelect, loading, onDemo, demo }) {
  return <div className="event-feed">
    {events.length === 0 ? <EmptyState title={loading ? 'Loading incidents…' : 'No incidents yet'} action={!loading && !demo && <button className="button secondary small" onClick={onDemo}>Explore demo <ArrowRight size={14} /></button>}>{loading ? 'Fetching the latest observations.' : 'Events will appear here as connected vehicles report observations.'}</EmptyState>
      : events.slice(0, 5).map(event => <button key={event.id} className="feed-item" onClick={() => onSelect(event)}><TypeIcon type={event.event_type} /><span className="feed-copy"><strong>{typeLabel(event.event_type)}</strong><span><MapPin size={11} />{coordinates(event)}</span><small>{timeAgo(event.last_seen)}<span>·</span>{STATUSES[event.status]}</small></span><span className="feed-trailing"><span className={`severity-dot ${event.severity}`} /><ArrowRight size={15} /></span></button>)}
  </div>;
}
export default function AlertsPanel({ events, total, page, setPage, onSelect, loading, query, onReset, error }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return <section className="panel incidents-panel">
    <div className="panel-heading"><div><h2>Incident register <span className="count-pill">{total}</span></h2><p>{query ? `${total} matching incidents across all pages` : 'Recorded observations, their confidence, and current status'}</p></div><button className="button secondary small" onClick={() => exportEvents(events)} disabled={!events.length}><ArrowDownToLine size={15} />Export page</button></div>
    <div className="table-scroll"><table className="event-table"><thead><tr><th>Incident</th><th>Location</th><th>Severity</th><th>Status</th><th>Confidence</th><th>Observations</th><th>Last seen</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>
      {events.map(event => <tr key={event.id}><td><button className="table-event" onClick={() => onSelect(event)}><TypeIcon type={event.event_type} size={17} /><span><strong>{typeLabel(event.event_type)}</strong><small>#{event.id.slice(0, 8)}</small></span></button></td><td className="coordinates">{coordinates(event)}</td><td><Badge value={event.severity} /></td><td><Badge value={event.status} status /></td><td><span className="confidence-value">{Math.round(event.confidence * 100)}%<span className="confidence-track"><i style={{ width: `${event.confidence * 100}%` }} /></span></span></td><td>{event.observation_count}</td><td><time dateTime={event.last_seen} title={fullDate(event.last_seen)}>{timeAgo(event.last_seen)}</time></td><td><button className="icon-button" onClick={() => onSelect(event)} aria-label={`View ${typeLabel(event.event_type)} ${event.id}`}><ArrowRight size={17} /></button></td></tr>)}
    </tbody></table></div>
    {!events.length && <EmptyState title={loading ? 'Loading incidents…' : error ? 'Could not load incidents' : 'No matching incidents'} action={!loading && !error && <button className="button secondary small" onClick={onReset}>Clear filters</button>}>{error ? 'Retry the connection using the refresh button above.' : 'Try another filter or check back after new observations arrive.'}</EmptyState>}
    <div className="table-footer"><span>{total ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} events` : '0 events'}{loading && ' · Updating…'}</span><div className="pagination"><button className="icon-button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={17} /></button><span>Page {page} of {pages}</span><button className="icon-button" disabled={page >= pages || loading} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={17} /></button></div></div>
  </section>;
}
