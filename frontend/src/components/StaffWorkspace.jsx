import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bus, CheckCircle2, FileCheck2, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { Modal } from './UI';
import FleetPanel from './FleetPanel';
import ObservationForm from './ObservationForm';
import { canManageVehicles, canViewFleet } from '../lib/permissions';

export function LoginDialog({ onClose, onLogin }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api('/auth/login', { method: 'POST', body: { email: email.trim(), password } });
      const profile = result.user || await api('/auth/me', { token: result.access_token });
      onLogin({ token: result.access_token, ...profile });
      setPassword(''); onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <Modal title="Staff sign in" onClose={onClose}><div className="login-intro"><span className="large-icon"><ShieldCheck size={27} /></span><h3>Your city. Your workspace.</h3><p>Sign in with your existing staff account to review incidents and manage registered vehicles.</p></div><form className="stack-form" onSubmit={submit}>
    <label>Email address<input type="email" required maxLength={254} autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} placeholder="officer@example.gov" /></label>
    <label>Password<input type="password" required maxLength={1024} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" /></label>
    {error && <p className="form-error" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={16} /></button>
    <p className="form-hint">Accounts are provided by your administrator. Your session ends when this page is reloaded.</p>
  </form></Modal>;
}

export default function StaffWorkspace({ session, onSignIn, onSignOut, onAuthError, demo, navigate, revision, onObservation }) {
  const [vehicleId, setVehicleId] = useState(''), [routeId, setRouteId] = useState(''), [vehicleType, setVehicleType] = useState('public_bus');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [registered, setRegistered] = useState(null);
  const [fleet, setFleet] = useState({ items: [], total: 0 }), [fleetError, setFleetError] = useState(''), [fleetLoading, setFleetLoading] = useState(false);
  const [fleetQuery, setFleetQuery] = useState(''), [fleetPage, setFleetPage] = useState(1), [fleetVersion, setFleetVersion] = useState(0);
  const authErrorRef = useRef(onAuthError); authErrorRef.current = onAuthError;
  useEffect(() => {
    if (!canViewFleet(session) || demo) { setFleet({ items: [], total: 0 }); setFleetError(''); return undefined; }
    const controller = new AbortController(); setFleetLoading(true);
    api(`/vehicles?${new URLSearchParams({ q: fleetQuery, page: fleetPage, page_size: 50 })}`, { token: session.token, signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setFleet(result); setFleetError(''); } }).catch(err => { if (!controller.signal.aborted) { setFleetError(err.message); authErrorRef.current(err); } }).finally(() => { if (!controller.signal.aborted) setFleetLoading(false); });
    return () => controller.abort();
  }, [session, demo, fleetQuery, fleetPage, fleetVersion, revision]);
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError(''); setRegistered(null);
    try {
      const result = await api('/vehicles', { method: 'POST', token: session.token, body: { external_vehicle_id: vehicleId.trim(), vehicle_type: vehicleType, route_id: routeId.trim() || null } });
      setRegistered(result); setVehicleId(''); setRouteId(''); setFleetVersion(value => value + 1);
    } catch (err) { setError(err.status === 403 ? 'Vehicle registration requires an admin or transport department account.' : err.message); onAuthError(err); } finally { setBusy(false); }
  };
  return <div className="staff-layout">
    <section className="panel staff-welcome"><div className="large-icon"><ShieldCheck size={28} /></div><div><span className="eyebrow">STAFF ACCESS</span><h2>{session ? 'Welcome to your workspace' : 'Coordinate the response'}</h2><p>{session ? `Signed in as ${session.email} · ${session.role?.replaceAll('_', ' ')}` : 'Review evidence, update incident statuses, and register observation vehicles from one workspace.'}</p></div><button className={`button ${session ? 'secondary' : 'primary'}`} onClick={session ? onSignOut : onSignIn} disabled={demo}>{session ? <><LogOut size={16} />Sign out</> : <><LockKeyhole size={16} />Staff sign in</>}</button></section>
    <div className="staff-grid"><section className="panel"><div className="panel-heading"><div><h2><Bus size={19} />Register a vehicle</h2><p>Connect a source vehicle to observation ingestion.</p></div></div><form className="stack-form panel-form" onSubmit={submit}>
      <fieldset disabled={!canManageVehicles(session) || demo || busy}><label>Vehicle identifier<input required maxLength={100} pattern=".*\S.*" placeholder="e.g. BUS_001" value={vehicleId} onChange={event => setVehicleId(event.target.value)} /></label><label>Vehicle type<select value={vehicleType} onChange={event => setVehicleType(event.target.value)}><option value="public_bus">Public bus</option><option value="municipal_vehicle">Municipal vehicle</option><option value="service_vehicle">Service vehicle</option></select></label><label>Route identifier <span className="muted">(optional)</span><input maxLength={100} placeholder="e.g. 500D" value={routeId} onChange={event => setRouteId(event.target.value)} /></label><button className="button primary" type="submit">{busy ? 'Registering…' : 'Register vehicle'}<ArrowRight size={16} /></button></fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}{registered && <div className="success-message" role="status"><CheckCircle2 size={18} /><span><strong>{registered.external_vehicle_id} registered</strong><small>Vehicle ID: {registered.id}</small></span></div>}
      <p className="form-hint">Requires an admin or transport department account. Registered vehicles appear in the fleet below.</p>
    </form></section><div className="staff-actions"><section className="panel action-card"><FileCheck2 size={24} /><h2>Review and resolve</h2><p>Open an incident to inspect its observations, view available evidence, and move it through the response workflow.</p><div className="workflow"><span>Detected</span><ArrowRight size={14} /><span>Confirmed</span><ArrowRight size={14} /><span>Resolved</span></div><button className="button secondary" onClick={() => navigate('events')}>Open incident register<ArrowRight size={16} /></button></section><section className="panel permission-card"><LockKeyhole size={19} /><div><h3>Access follows your role</h3><p>Admins and municipality staff can change statuses. Evidence is available to admins, municipality staff, and traffic police. The backend checks every staff action.</p></div></section></div></div>
    <ObservationForm session={session} demo={demo} vehicles={fleet.items} onAuthError={onAuthError} onSaved={event => { setFleetVersion(value => value + 1); onObservation(event); }} />
    {canViewFleet(session) && !demo && <FleetPanel fleet={fleet} error={fleetError} loading={fleetLoading} query={fleetQuery} setQuery={setFleetQuery} page={fleetPage} setPage={setFleetPage} />}
  </div>;
}
