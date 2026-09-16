import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, useMap } from 'react-leaflet';
import { Crosshair, Layers, MapPin } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { Badge } from './UI';
import { coordinates, EVENT_TYPES, isActive, timeAgo, typeLabel } from '../lib/events';

const DEFAULT_CENTER = [12.9716, 77.5946];
function MapController({ events, nearby, fitKey }) {
  const map = useMap();
  const boundsKey = events.map(event => `${event.id}:${event.latitude}:${event.longitude}`).join('|');
  useEffect(() => {
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(map.getContainer());
    return () => resize.disconnect();
  }, [map]);
  useEffect(() => {
    if (nearby) {
      const offset = nearby.radius / 111320;
      const longitudeOffset = Math.min(180, offset / Math.max(0.01, Math.cos(nearby.latitude * Math.PI / 180)));
      map.fitBounds([[Math.max(-90, nearby.latitude - offset), nearby.longitude - longitudeOffset], [Math.min(90, nearby.latitude + offset), nearby.longitude + longitudeOffset]], { padding: [35, 35], maxZoom: 15 });
    } else if (events.length) map.fitBounds(events.map(event => [event.latitude, event.longitude]), { padding: [48, 48], maxZoom: 14 });
    else map.setView(DEFAULT_CENTER, 12);
    // A status-only update must not interrupt someone exploring the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, boundsKey, nearby, fitKey]);
  return null;
}
export default function MapView({ events = [], nearby, onSelect, loading, demo, expanded = false }) {
  const [fitKey, setFitKey] = useState(0), [showClosed, setShowClosed] = useState(false), [tileError, setTileError] = useState(false);
  const visible = useMemo(() => events.filter(event => (showClosed || isActive(event)) && Number.isFinite(event.latitude) && Number.isFinite(event.longitude)), [events, showClosed]);
  return <div className={`map-view ${expanded ? 'map-expanded' : ''}`}>
    <MapContainer center={DEFAULT_CENTER} zoom={12} scrollWheelZoom={expanded} style={{ height: '100%', width: '100%' }}>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'} eventHandlers={{ tileerror: () => setTileError(true), tileload: () => setTileError(false) }} />
      <MapController events={visible} nearby={nearby} fitKey={fitKey} />
      {nearby && <Circle center={[nearby.latitude, nearby.longitude]} radius={nearby.radius} pathOptions={{ color: '#67d8b4', weight: 1, dashArray: '5 5', fillOpacity: 0.06 }} />}
      {visible.map(event => <CircleMarker key={event.id} center={[event.latitude, event.longitude]} radius={event.severity === 'critical' ? 10 : 7} pathOptions={{ color: '#e8eef4', weight: 2, fillColor: EVENT_TYPES[event.event_type]?.color || '#92a3b5', fillOpacity: 1, opacity: isActive(event) ? 1 : 0.5 }}>
        <Popup><div className="map-popup"><strong>{typeLabel(event.event_type)}</strong><Badge value={event.status} status /><p>{coordinates(event)}</p><p>{Math.round(event.confidence * 100)}% confidence · {timeAgo(event.last_seen)}</p><button onClick={() => onSelect(event)}>View incident details →</button></div></Popup>
      </CircleMarker>)}
    </MapContainer>
    <div className="map-top-label"><span className={`status-dot ${demo ? 'demo' : 'online'}`} />{demo ? 'DEMO EVENT MAP' : 'EVENT MAP'}<span className="map-label-divider" />{visible.length} visible</div>
    <div className="map-tools"><button className="map-tool" aria-label="Fit map to events" title="Fit map to events" onClick={() => setFitKey(value => value + 1)}><Crosshair size={18} /></button><button className={`map-tool ${showClosed ? 'selected' : ''}`} aria-label="Include resolved and rejected events" title="Include resolved and rejected events" aria-pressed={showClosed} onClick={() => setShowClosed(value => !value)}><Layers size={18} /></button></div>
    {!visible.length && <div className="map-empty"><MapPin size={17} /><span>{loading ? 'Loading events…' : events.length ? 'No active events in these results' : 'Waiting for events in this area'}</span></div>}
    {tileError && <div className="map-tile-warning" role="status">Map tiles are unavailable. Incident coordinates are still available in the list.</div>}
    <div className="map-legend"><span><i style={{ background: '#d99823' }} />Road hazards</span><span><i style={{ background: '#4c9ec6' }} />Waterlogging</span><span><i style={{ background: '#df5c62' }} />Accidents</span><span><i style={{ background: '#a477c9' }} />Other events</span></div>
  </div>;
}
