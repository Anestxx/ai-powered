import React from 'react';
import { Bus, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { EmptyState } from './UI';
import { coordinates, fullDate } from '../lib/events';

export default function FleetPanel({ fleet, error, loading, query, setQuery, page, setPage }) {
  return <section className="panel fleet-panel"><div className="panel-heading"><div><h2><Bus size={18} />Registered fleet <span className="count-pill">{fleet.total}</span></h2><p>Vehicles registered in your backend</p></div><label className="search-input"><Search size={15} /><input aria-label="Search fleet" placeholder="Search vehicle identifier…" value={query} maxLength={100} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label></div>
    {error && <p className="form-error panel-message" role="alert">{error}</p>}
    {fleet.items.length ? <div className="table-scroll"><table className="event-table"><thead><tr><th>Vehicle</th><th>Type</th><th>Route</th><th>Status</th><th>Last observation</th><th>Last location</th></tr></thead><tbody>{fleet.items.map(vehicle => <tr key={vehicle.id}><td><strong>{vehicle.external_vehicle_id}</strong></td><td>{vehicle.vehicle_type.replaceAll('_', ' ')}</td><td>{vehicle.route_id || 'Unassigned'}</td><td><span className={`badge ${vehicle.is_active ? 'confirmed' : 'rejected'}`}>{vehicle.is_active ? 'Active' : 'Inactive'}</span></td><td>{fullDate(vehicle.last_seen)}</td><td>{vehicle.latitude != null && vehicle.longitude != null ? coordinates(vehicle) : 'Not recorded'}</td></tr>)}</tbody></table></div> : !error && <EmptyState title={loading ? 'Loading fleet…' : 'No vehicles found'}>Register a vehicle above, or try another identifier.</EmptyState>}
    <div className="table-footer"><span>{loading ? 'Refreshing…' : `${fleet.total} registered vehicles`}</span><div className="pagination"><button className="icon-button" aria-label="Previous fleet page" disabled={page === 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button><span>Page {page} of {Math.max(1, Math.ceil(fleet.total / 50))}</span><button className="icon-button" aria-label="Next fleet page" disabled={page * 50 >= fleet.total || loading} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button></div></div>
  </section>;
}
