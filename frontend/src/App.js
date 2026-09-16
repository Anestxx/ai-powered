import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, CalendarDays, CheckCheck, CircleDot, Clock3, Expand, FlaskConical, LayoutGrid, LockKeyhole, Radio, RefreshCw, TriangleAlert, Wrench } from 'lucide-react';
import './App.css';
import Sidebar, { NAV_ITEMS } from './components/Sidebar';
import AlertsPanel, { EventFeed, EventFilters } from './components/AlertsPanel';
import EventDetails from './components/EventDetails';
import NearbySearch from './components/NearbySearch';
import StaffWorkspace, { LoginDialog } from './components/StaffWorkspace';
import SystemStatus, { ModuleList } from './components/SystemStatus';
import useCityData from './hooks/useCityData';
import { coordinates, DEFAULT_FILTERS, EVENT_TYPES, exportEvents, PAGE_SIZE, STATUSES, typeLabel } from './lib/events';

const MapView = lazy(() => import('./components/MapView'));
const readTab = () => NAV_ITEMS.some(item => item.id === window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'overview';
const PAGE_COPY = {
  overview: ['OPERATIONS OVERVIEW', 'A clearer view of your city.', 'Road conditions, emerging incidents, and your response. All in one place.'],
  map: ['SPATIAL INTELLIGENCE', 'The city, in context.', 'Explore recorded events and find active incidents near any location.'],
  events: ['INCIDENT MANAGEMENT', 'Every observation matters.', 'Find, inspect, and track the incidents reported to your city.'],
  operations: ['CITY OPERATIONS', 'Turn observations into action.', 'A shared workspace for the teams keeping your city moving.'],
  system: ['PLATFORM HEALTH', 'Connected. Visible. Accountable.', 'Check service connections and see which capabilities are available.'],
};

function SummaryCards({ summary, stale }) {
  const cards = [
    { key: 'total', label: 'Total incidents', note: 'All recorded events', icon: LayoutGrid, tone: 'mint' },
    { key: 'detected', label: 'Awaiting review', note: 'Detected, awaiting confirmation', icon: TriangleAlert, tone: 'amber' },
    { key: 'under_repair', label: 'Under repair', note: 'Response in progress', icon: Wrench, tone: 'blue' },
    { key: 'resolved', label: 'Resolved', note: 'Closed after review', icon: CheckCheck, tone: 'purple' },
  ];
  return <div className="summary-grid">{cards.map(({ key, label, note, icon: Icon, tone }) => <section className={`summary-card ${tone}`} key={key}><div className="summary-top"><span>{label}</span><span className="summary-icon"><Icon size={18} /></span></div><strong className="summary-number">{summary ? summary[key].toLocaleString() : '—'}</strong><div className="summary-note"><span className="tiny-dot" />{stale ? 'Last known total · sync unavailable' : note}</div></section>)}</div>;
}

function Breakdown({ events, onType }) {
  const counts = Object.entries(EVENT_TYPES).map(([type, config]) => ({ type, ...config, count: events.filter(event => event.event_type === type).length })).sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...counts.map(type => type.count));
  return <section className="panel breakdown-panel"><div className="panel-heading"><div><h2>Incident breakdown</h2><p>By type · current page of results</p></div><span className="count-pill">{events.length} events</span></div><div className="breakdown-bars">{counts.map(type => <button className="breakdown-row" key={type.type} onClick={() => onType(type.type)} aria-label={`Filter by ${type.label}`}><span className="breakdown-label"><i style={{ background: type.color }} />{type.label}</span><span className="bar-track"><i style={{ width: `${type.count / max * 100}%`, background: type.color }} /></span><strong>{type.count}</strong></button>)}</div></section>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState(readTab), [demo, setDemo] = useState(false);
  const [filters, updateFilters] = useState(DEFAULT_FILTERS), [query, setQuery] = useState(''), [nearby, setNearby] = useState(null), [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null), [session, setSession] = useState(null), [loginOpen, setLoginOpen] = useState(false), [notice, setNotice] = useState('');
  const data = useCityData({ demo, filters, nearby, page });
  const [eyebrow, heading, description] = PAGE_COPY[activeTab];
  const events = useMemo(() => data.items.filter(event => [event.id, typeLabel(event.event_type), coordinates(event), event.assigned_department, STATUSES[event.status], event.severity].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase())), [data.items, query]);
  useEffect(() => { const onHash = () => setActiveTab(readTab()); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  useEffect(() => { document.title = `${NAV_ITEMS.find(item => item.id === activeTab).label} · CityLens`; }, [activeTab]);
  useEffect(() => { if (!data.loading && !data.error && page > Math.max(1, Math.ceil(data.total / PAGE_SIZE))) setPage(Math.max(1, Math.ceil(data.total / PAGE_SIZE))); }, [data.loading, data.error, data.total, page]);
  useEffect(() => {
    if (!session) return undefined;
    try {
      const claims = JSON.parse(atob(session.token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')));
      const timer = setTimeout(() => { setSession(null); setNotice('Your staff session expired. Sign in again to continue.'); }, Math.max(0, claims.exp * 1000 - Date.now()));
      return () => clearTimeout(timer);
    } catch { return undefined; }
  }, [session]);
  const navigate = tab => { setActiveTab(tab); window.location.hash = tab; window.scrollTo({ top: 0 }); };
  const reset = () => { updateFilters(DEFAULT_FILTERS); setNearby(null); setQuery(''); setPage(1); };
  const setFilters = value => { updateFilters(value); setPage(1); };
  const toggleDemo = () => { setDemo(value => !value); reset(); setSelected(null); setLoginOpen(false); };
  const openLogin = () => { setSelected(null); setLoginOpen(true); };
  const authError = error => { if (error.status === 401) { setSession(null); setNotice('Your session is no longer valid. Please sign in again.'); } };
  const filterType = type => { setNearby(null); setQuery(''); setFilters({ ...DEFAULT_FILTERS, event_type: type }); navigate('events'); };
  const hasFilters = query || nearby || Object.entries(filters).some(([key, value]) => value !== DEFAULT_FILTERS[key]);
  const map = expanded => <Suspense fallback={<div className="map-loading">Loading city map…</div>}><MapView events={events} nearby={nearby} onSelect={setSelected} loading={data.loading} demo={demo} expanded={expanded} /></Suspense>;

  return <div className="app"><a href="#main-content" className="skip-link" onClick={event => { event.preventDefault(); document.getElementById('main-content').focus(); }}>Skip to content</a>
    <Sidebar activeTab={activeTab} navigate={navigate} health={data.health} demo={demo} toggleDemo={toggleDemo} total={data.summary?.total} />
    <div className="main-shell"><header className="topbar"><div className="breadcrumb">Workspace<span>/</span><strong>{NAV_ITEMS.find(item => item.id === activeTab).label}</strong></div><div className="topbar-actions"><span className="date-display"><CalendarDays size={14} />{new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span><span className="topbar-divider" /><button className="account-button" onClick={session ? () => navigate('operations') : openLogin} disabled={demo}><span className="account-avatar">{session ? session.email[0].toUpperCase() : <LockKeyhole size={14} />}</span><span>{session ? 'Staff account' : 'Staff sign in'}</span></button></div></header>
      <main className="main" id="main-content" tabIndex={-1}>
        {demo && <div className="demo-banner" role="status"><FlaskConical size={18} /><div><strong>Demo preview</strong><span>Sample events for exploration. Your backend data is unchanged.</span></div><button onClick={toggleDemo}>Return to live data<ArrowRight size={15} /></button></div>}
        {notice && <div className="notice-banner" role="status">{notice}<button className="text-button" onClick={() => setNotice('')}>Dismiss</button></div>}
        <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{heading}</h1><p>{description}</p></div><div className="page-actions"><button className={`button secondary ${data.loading ? 'is-loading' : ''}`} onClick={data.refresh} disabled={data.loading}><RefreshCw size={15} />Refresh</button>{['overview', 'map'].includes(activeTab) && <button className="button primary" onClick={() => exportEvents(events)} disabled={!events.length}><ArrowDownToLine size={15} />Export page</button>}</div></div>
        {!demo && (data.error || data.health.state === 'offline') && <div className="error-banner" role="alert"><TriangleAlert size={18} /><div><strong>{data.error ? 'Event feed unavailable' : 'Backend connection needs attention'}</strong><p>{data.error || data.health.message}{data.updatedAt && ' Showing the last successful event sync.'}</p></div><button className="button secondary small" onClick={data.refresh}>Retry</button></div>}
        {['overview', 'map', 'events'].includes(activeTab) && <>
          <div className="data-context"><span><span className={`status-dot ${demo ? 'demo' : data.error ? 'offline' : data.stream === 'live' ? 'online' : 'checking'}`} />{demo ? 'DEMO DATA' : data.error ? 'SYNC INTERRUPTED' : data.stream === 'live' ? 'LIVE EVENT FEED' : data.stream === 'connecting' ? 'CONNECTING LIVE FEED' : 'UPDATES EVERY 30 SECONDS'}</span><span><Clock3 size={12} />{data.updatedAt ? `Synced ${data.updatedAt.toLocaleTimeString()}` : 'Waiting for data'}</span></div>
          {activeTab === 'overview' && <SummaryCards summary={data.summary} stale={data.summaryError} />}
          <div className="filter-section"><EventFilters filters={filters} setFilters={setFilters} query={query} setQuery={setQuery} nearby={nearby} clearNearby={() => { setNearby(null); setPage(1); }} />{hasFilters && <button className="text-button reset-button" onClick={reset}>Reset filters</button>}</div>
        </>}
        {activeTab === 'overview' && <>
          <div className="overview-grid"><section className="panel map-panel"><div className="panel-heading"><div><h2><span className="heading-dot" />City event map</h2><p>Active events from the current page of results</p></div><button className="icon-button" onClick={() => navigate('map')} aria-label="Expand city map"><Expand size={17} /></button></div>{map(false)}</section><section className="panel feed-panel"><div className="panel-heading"><div><h2>Recent incidents</h2><p>Latest observations in your results</p></div><Radio size={17} className="muted" /></div><EventFeed events={events} loading={data.loading} onSelect={setSelected} onDemo={toggleDemo} demo={demo} /><button className="feed-footer" onClick={() => navigate('events')}>View all incidents<ArrowRight size={15} /></button></section></div>
          <div className="overview-bottom"><Breakdown events={events} onType={filterType} /><section className="panel"><div className="panel-heading"><div><h2>Intelligence modules</h2><p>Your platform at a glance</p></div><CircleDot size={18} className="muted" /></div><ModuleList compact /><button className="feed-footer" onClick={() => navigate('system')}>View integration status<ArrowUpRight size={15} /></button></section></div>
          <div className="scope-note">Overview totals cover all recorded events. Map, breakdown, and recent incidents use up to {PAGE_SIZE} events from page {page}.<button className="text-button" onClick={() => navigate('events')}>Browse all pages<ArrowRight size={13} /></button></div>
        </>}
        {activeTab === 'map' && <><NearbySearch nearby={nearby} onSearch={area => { setNearby(area); setQuery(''); setPage(1); }} onClear={reset} /><section className="panel map-panel full-map"><div className="panel-heading"><div><h2>{nearby ? 'Nearby active incidents' : 'City event map'}</h2><p>{nearby ? `Within ${nearby.radius / 1000} km · nearest first` : 'Active events from your current results'} · {events.length} loaded of {data.total}</p></div><button className="text-button" onClick={() => navigate('events')}>Browse results<ArrowRight size={15} /></button></div>{map(true)}</section></>}
        {activeTab === 'events' && <AlertsPanel events={events} total={data.total} page={page} setPage={setPage} onSelect={setSelected} loading={data.loading} query={query} onReset={reset} error={data.error} />}
        {activeTab === 'operations' && <StaffWorkspace session={session} onSignIn={openLogin} onSignOut={() => setSession(null)} onAuthError={authError} demo={demo} navigate={navigate} />}
        {activeTab === 'system' && <SystemStatus health={data.health} stream={data.stream} updatedAt={data.updatedAt} refresh={data.refresh} demo={demo} />}
        <footer className="main-footer"><span><span className="footer-mark">◈</span> Built for safer streets.</span><span>CityLens Urban Intelligence<span className="footer-separator">·</span>{demo ? 'Demo workspace' : 'Connected city workspace'}</span></footer>
      </main>
    </div>
    {selected && <EventDetails key={selected.id} event={selected} demo={demo} session={session} onClose={() => setSelected(null)} onSignIn={openLogin} onAuthError={authError} onChange={data.refresh} revision={data.updatedAt} />}
    {loginOpen && <LoginDialog onClose={() => setLoginOpen(false)} onLogin={value => { setSession(value); setNotice('Signed in. Staff actions are now available for your account.'); }} />}
  </div>;
}
