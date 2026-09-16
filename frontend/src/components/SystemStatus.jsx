import React from 'react';
import { Activity, ArrowRight, CheckCircle2, Database, Radio, Server, Waypoints } from 'lucide-react';
import { API_BASE } from '../lib/api';

export const MODULES = [
  { name: 'Event intelligence', description: 'Observation ingestion, spatial deduplication, confidence scoring, and incident review.', status: 'Available', tone: 'available' },
  { name: 'Traffic AI', description: 'Local video analysis is available. Traffic results are not yet published to this dashboard.', status: 'Local only', tone: 'pending' },
  { name: 'Helmet detection', description: 'A model checkpoint is supplied. Evaluation and a dashboard feed are pending.', status: 'Not connected', tone: 'pending' },
  { name: 'Road-hazard AI', description: 'Pothole and waterlogging inference needs the missing model weights and input assets.', status: 'Assets needed', tone: 'pending' },
  { name: 'Route planning', description: 'A routing service is not yet available. Use area search to inspect nearby recorded hazards.', status: 'Planned', tone: 'pending' },
];

export function ModuleList({ compact = false }) {
  return <div className={`module-list ${compact ? 'compact' : ''}`}>{MODULES.map(module => <div className="module-row" key={module.name}><span className={`module-dot ${module.tone}`} /><div><strong>{module.name}</strong>{!compact && <p>{module.description}</p>}</div><span className={`module-status ${module.tone}`}>{module.status}</span></div>)}</div>;
}

export default function SystemStatus({ health, stream, updatedAt, refresh, demo }) {
  const services = [
    { name: 'API service', icon: Server, ok: health.state === 'online', value: health.state === 'checking' ? 'Checking' : health.state === 'online' ? 'Connected' : 'Unavailable', detail: 'Public events and protected staff actions' },
    { name: 'PostgreSQL / PostGIS', icon: Database, ok: health.database === 'connected', value: health.database === 'connected' ? 'Connected' : health.state === 'checking' ? 'Checking' : 'Unverified', detail: 'Database connectivity checked by the API' },
    { name: 'Live event channel', icon: Radio, ok: stream === 'live', value: demo ? 'Paused for demo' : stream === 'live' ? 'Connected' : stream === 'connecting' ? 'Connecting' : 'Polling fallback', detail: demo ? 'Return to live data to resume the event feed' : 'Automatic refresh every 30 seconds' },
  ];
  return <div className="system-layout"><div className="service-grid">{services.map(({ name, icon: Icon, ok, value, detail }) => <section className="panel service-card" key={name}><div className="service-title"><Icon size={22} /><span className={`badge ${ok ? 'confirmed' : 'medium'}`}>{value}</span></div><h2>{name}</h2><p>{detail}</p></section>)}</div>
    <div className="system-grid"><section className="panel"><div className="panel-heading"><div><h2>Platform capabilities</h2><p>Available features and integration readiness</p></div><Waypoints size={20} /></div><ModuleList /></section>
      <section className="panel connection-panel"><div className="panel-heading"><h2>Connection details</h2><Activity size={19} /></div><dl><div><dt>Data source</dt><dd>{demo ? 'Local demo preview' : 'Urban Intelligence API'}</dd></div><div><dt>API address</dt><dd className="mono">{API_BASE}</dd></div><div><dt>Last successful sync</dt><dd>{updatedAt ? updatedAt.toLocaleTimeString() : 'Waiting for first sync'}{demo && ' (demo)'}</dd></div><div><dt>Updates</dt><dd>Live channel + 30 second refresh</dd></div></dl>{health.message && <p className="form-error">{health.message}</p>}<button className="button secondary" onClick={refresh}>Check connection<ArrowRight size={15} /></button><p className="form-hint">Start the local services with <code>project.cmd start</code> if the backend is unavailable.</p></section></div>
    <section className="panel data-note"><CheckCircle2 size={21} /><div><h3>Every incident has a source</h3><p>Live views display saved backend records. Sample events are isolated in demo preview. An empty feed means no matching observations have been recorded.</p></div></section>
  </div>;
}
