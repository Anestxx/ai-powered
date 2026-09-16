import React, { useEffect, useState } from 'react';
import { Car, Film, Gauge, Play, RefreshCw } from 'lucide-react';
import { api, API_BASE } from '../lib/api';
import { EmptyState } from './UI';

export default function TrafficAnalyses({ revision }) {
  const [runs, setRuns] = useState([]), [selectedId, setSelectedId] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true), [reload, setReload] = useState(0), [videoError, setVideoError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api('/traffic/runs', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      setRuns(result.items); setSelectedId(id => result.items.some(run => run.id === id) ? id : result.items[0]?.id || ''); setError('');
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision, reload]);
  useEffect(() => setVideoError(false), [selectedId, reload]);
  const selected = runs.find(run => run.id === selectedId);
  return <div className="traffic-workspace"><div className="inline-notice">Saved AI output · These are recorded analyses, not live road speed or traffic flow.</div>
    <div className="traffic-toolbar"><span><Film size={17} />{runs.length} saved analyses</span><button className="button secondary" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={15} />Reload analyses</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!runs.length ? <section className="panel"><EmptyState title={loading ? 'Loading analyses…' : 'No saved analyses'}>Run the local Traffic AI pipeline to generate a summary and annotated video. New results will appear here after reloading.</EmptyState></section> : <div className="traffic-grid"><section className="panel run-list"><div className="panel-heading"><h2>Analysis library</h2></div>{runs.map(run => <button key={run.id} className={`run-button ${selectedId === run.id ? 'selected' : ''}`} onClick={() => setSelectedId(run.id)} aria-pressed={selectedId === run.id}><span className="run-play"><Play size={16} /></span><span><strong>{run.name}</strong><small>{run.frames_processed} frames · {run.model}</small></span></button>)}</section>
      {selected && <section className="panel analysis-detail"><div className="panel-heading"><div><h2>Annotated recording</h2><p>{selected.name}</p></div><span className="badge confirmed">Recorded</span></div>
        {selected.has_video ? <div className="video-container"><video key={`${selected.id}-${reload}`} controls preload="metadata" playsInline src={`${API_BASE}/traffic/runs/${selected.id}/video`} onError={() => setVideoError(true)} aria-label="Annotated traffic recording" />{videoError && <p className="form-error">Video could not be loaded. Check the backend connection and reload this analysis.</p>}</div> : <EmptyState title="No recording for this run">The summary is available below.</EmptyState>}
        <div className="analysis-metrics"><div><Film size={19} /><span>Frames processed</span><strong>{selected.frames_processed}</strong></div><div><Car size={19} /><span>Peak visible vehicles</span><strong>{selected.max_visible_vehicles}</strong></div><div><Gauge size={19} /><span>Processing FPS</span><strong>{selected.processing_fps ?? '—'}</strong></div></div>
        <div className="traffic-levels"><h3>Frame classification</h3>{Object.entries(selected.traffic_level_frames).map(([label, count]) => <div className="traffic-level" key={label}><span>{label}</span><span className="bar-track"><i style={{ width: `${selected.frames_processed ? count / selected.frames_processed * 100 : 0}%`, background: 'var(--mint)' }} /></span><strong>{count} frames</strong></div>)}</div><p className="form-hint analysis-note">{selected.measurement_note}</p>
      </section>}</div>}
  </div>;
}
