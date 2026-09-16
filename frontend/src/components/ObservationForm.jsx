import React, { useRef, useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { api } from '../lib/api';
import { EVENT_TYPES, typeLabel } from '../lib/events';
import { canManageVehicles } from '../lib/permissions';

function observationId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function ObservationForm({ session, demo, vehicles, onSaved, onAuthError }) {
  const [form, setForm] = useState({ source_vehicle: '', event_type: 'pothole', severity: 'medium', confidence: '0.85', latitude: '12.9716', longitude: '77.5946', evidence_url: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(null);
  const retry = useRef(null);
  const change = event => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = async event => {
    event.preventDefault(); setError(''); setSaved(null); setBusy(true);
    try {
      const body = { ...form, source_vehicle: form.source_vehicle.trim(), latitude: Number(form.latitude), longitude: Number(form.longitude), confidence: Number(form.confidence) };
      if (!body.evidence_url.trim()) delete body.evidence_url;
      const fingerprint = JSON.stringify(body);
      if (!retry.current || retry.current.fingerprint !== fingerprint) retry.current = { fingerprint, body: { ...body, observation_id: observationId(), captured_at: new Date().toISOString() } };
      const result = await api('/staff/observations', { method: 'POST', token: session.token, body: retry.current.body });
      setSaved(result.event); retry.current = null; onSaved(result.event);
    } catch (err) { setError(err.message); onAuthError(err); } finally { setBusy(false); }
  };
  return <section className="panel observation-panel"><div className="panel-heading"><div><h2><Send size={19} />Record an observation</h2><p>Save a vehicle observation to the live incident feed.</p></div></div><form className="stack-form panel-form" onSubmit={submit}>
    <fieldset disabled={!canManageVehicles(session) || demo || busy}>
      <div className="form-grid"><label>Source vehicle<input name="source_vehicle" list="observation-vehicles" required maxLength={100} placeholder="Registered vehicle identifier" value={form.source_vehicle} onChange={change} /><datalist id="observation-vehicles">{vehicles.filter(vehicle => vehicle.is_active).map(vehicle => <option key={vehicle.id} value={vehicle.external_vehicle_id} />)}</datalist></label>
        <label>Incident type<select name="event_type" value={form.event_type} onChange={change}>{Object.entries(EVENT_TYPES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
        <label>Severity<select name="severity" value={form.severity} onChange={change}>{['low', 'medium', 'high', 'critical'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Observation confidence (0–1)<input type="number" name="confidence" min="0" max="1" step="0.01" required value={form.confidence} onChange={change} /></label>
        <label>Observation latitude<input type="number" name="latitude" min="-90" max="90" step="any" required value={form.latitude} onChange={change} /></label>
        <label>Observation longitude<input type="number" name="longitude" min="-180" max="180" step="any" required value={form.longitude} onChange={change} /></label></div>
      <label>Evidence URL (optional)<input type="url" name="evidence_url" maxLength={2048} placeholder="https://…" value={form.evidence_url} onChange={change} /></label>
      <button className="button primary" type="submit"><Send size={16} />{busy ? 'Saving observation…' : 'Save observation'}</button>
    </fieldset>{error && <p className="form-error" role="alert">{error}</p>}{saved && <p className="success-message" role="status"><CheckCircle2 size={17} />{typeLabel(saved.event_type)} saved to the live feed.</p>}
    <p className="form-hint">Available to admins and transport staff. The source vehicle must be registered. Observations are timestamped now and nearby duplicates are merged by the backend. Evidence URLs are visible only to authorized reviewers.</p>
  </form></section>;
}
