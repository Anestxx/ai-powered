import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CheckCircle2, FileImage, LockKeyhole, MapPin } from 'lucide-react';
import { api } from '../lib/api';
import { coordinates, fullDate, STATUSES, TRANSITIONS, typeLabel } from '../lib/events';
import { Badge, Modal, TypeIcon } from './UI';

const safeEvidenceUrl = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };

export default function EventDetails({ event, demo, session, onClose, onSignIn, onAuthError, onChange, revision }) {
  const [item, setItem] = useState(event), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [nextStatus, setNextStatus] = useState(''), [busy, setBusy] = useState(false), [success, setSuccess] = useState('');
  const [evidence, setEvidence] = useState(null), [evidenceError, setEvidenceError] = useState(''), [evidenceBusy, setEvidenceBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const evidenceController = useRef(null);
  useEffect(() => {
    if (demo) return undefined;
    const controller = new AbortController();
    setLoading(true);
    api(`/events/${event.id}`, { signal: controller.signal }).then(data => { setItem(data); setError(''); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [event.id, demo, revision, reload]);
  useEffect(() => {
    setEvidence(null); setEvidenceError(''); setEvidenceBusy(false);
    return () => evidenceController.current?.abort();
  }, [session, event.id]);
  const transitions = TRANSITIONS[item.status] || [];
  const updateStatus = async e => {
    e.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try {
      const updated = await api(`/events/${item.id}/status`, { method: 'PATCH', token: session.token, body: { status: nextStatus } });
      setItem(updated); setNextStatus(''); setSuccess(`Status updated to ${STATUSES[updated.status]}.`); onChange();
    } catch (err) { setError(err.status === 403 ? 'Status updates require an admin or municipality account.' : err.message); onAuthError(err); if (err.status === 409) setReload(value => value + 1); } finally { setBusy(false); }
  };
  const loadEvidence = async () => {
    evidenceController.current?.abort();
    const controller = new AbortController();
    evidenceController.current = controller;
    setEvidenceBusy(true); setEvidenceError('');
    try {
      const records = await api(`/events/${item.id}/evidence`, { token: session.token, signal: controller.signal });
      if (!controller.signal.aborted) setEvidence(records);
    } catch (err) {
      if (!controller.signal.aborted) { setEvidenceError(err.status === 403 ? 'Evidence requires an admin, municipality, or traffic police account.' : err.message); onAuthError(err); }
    } finally { if (!controller.signal.aborted) setEvidenceBusy(false); }
  };
  return <Modal title="Incident details" wide onClose={onClose}>
    <div className="detail-title"><TypeIcon type={item.event_type} size={25} /><div><h3>{typeLabel(item.event_type)}</h3><span className="mono">#{item.id}</span></div><Badge value={item.severity} /></div>
    {demo && <div className="inline-notice">Sample incident · Staff actions are available with live data.</div>}
    {loading && <p className="form-hint" role="status">Refreshing incident details…</p>}
    <div className="detail-metrics"><div><span>Current status</span><Badge value={item.status} status /></div><div><span>Confidence score</span><strong>{Math.round(item.confidence * 100)}<small>%</small></strong></div><div><span>Observations</span><strong>{item.observation_count}</strong></div></div>
    <p className="confidence-note">Confidence combines model scores and independent vehicle observations. It is a prototype score, not a calibrated probability.</p>
    <dl className="detail-fields"><div><dt>Coordinates</dt><dd><MapPin size={14} />{coordinates(item)}</dd></div><div><dt>Assigned department</dt><dd>{item.assigned_department || 'Unassigned'}</dd></div><div><dt>First observed</dt><dd>{fullDate(item.first_seen)}</dd></div><div><dt>Last observed</dt><dd>{fullDate(item.last_seen)}</dd></div>{item.resolved_at && <div><dt>Resolved</dt><dd>{fullDate(item.resolved_at)}</dd></div>}</dl>
    <section className="detail-section"><h3>Response workflow</h3>{!demo && session ? <>{transitions.length ? <form className="status-form" onSubmit={updateStatus}><label className="sr-only" htmlFor="next-status">New status</label><select id="next-status" required value={transitions.includes(nextStatus) ? nextStatus : ''} onChange={e => setNextStatus(e.target.value)} disabled={busy || loading}><option value="">Select next status</option>{transitions.map(status => <option key={status} value={status}>{STATUSES[status]}</option>)}</select><button className="button primary" disabled={!transitions.includes(nextStatus) || busy || loading}>{busy ? 'Saving…' : 'Update status'}</button></form> : <p className="form-hint">This incident is closed. No further status transitions are available.</p>}</> : <p className="form-hint">{demo ? 'Switch to live data and sign in to update incident statuses.' : <><button className="text-button" onClick={onSignIn}>Sign in</button> with an admin or municipality account to update this incident.</>}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}{success && <p className="success-message" role="status"><CheckCircle2 size={16} />{success}</p>}
    </section>
    <section className="detail-section"><div className="section-inline"><h3><FileImage size={17} />Evidence</h3>{session && !demo && <button className="button secondary small" disabled={evidenceBusy} onClick={loadEvidence}>{evidenceBusy ? 'Loading…' : evidence ? 'Refresh evidence' : 'Load evidence'}</button>}</div>
      {!session || demo ? <p className="form-hint"><LockKeyhole size={14} />Evidence is available to authorized staff on live incidents.</p> : <>{evidence === null && <p className="form-hint">Load the evidence records linked to this incident.</p>}{evidence?.length === 0 && <p className="form-hint">No evidence has been attached to this incident.</p>}{evidence?.map((entry, index) => <div className="evidence-item" key={entry.id}><FileImage size={18} /><span><strong>Evidence {index + 1}</strong><small>{fullDate(entry.captured_at)}</small></span>{safeEvidenceUrl(entry.file_url) ? <a href={safeEvidenceUrl(entry.file_url)} className="text-button" target="_blank" rel="noopener noreferrer">Open file<ArrowUpRight size={15} /></a> : <span className="muted">Link unavailable</span>}</div>)}</>}
      {evidenceError && <p className="form-error" role="alert">{evidenceError}</p>}
    </section>
  </Modal>;
}
