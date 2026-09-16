import React from 'react';
import { Activity, ArrowUpRight, Film, LayoutDashboard, Map, Radio, Server, ShieldCheck, TriangleAlert } from 'lucide-react';

export const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'map', label: 'Live map', icon: Map },
  { id: 'events', label: 'Incidents', icon: TriangleAlert },
  { id: 'traffic', label: 'Traffic AI', icon: Film },
  { id: 'operations', label: 'Staff workspace', icon: ShieldCheck },
  { id: 'system', label: 'System status', icon: Server },
];

export default function Sidebar({ activeTab, navigate, health, demo, toggleDemo, total }) {
  return <aside className="sidebar">
    <a className="brand" href="#overview" onClick={() => navigate('overview')} aria-label="CityLens home">
      <span className="brand-symbol"><Activity size={25} strokeWidth={2.6} /></span>
      <span><strong>citylens<span className="brand-period">.</span></strong><small>URBAN INTELLIGENCE</small></span>
    </a>
    <div className="workspace-label"><span className="workspace-avatar">B</span><span>Bengaluru workspace<small>City operations</small></span><span className="workspace-dot" /></div>
    <span className="nav-label">WORKSPACE</span>
    <nav aria-label="Main navigation">
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${activeTab === id ? 'active' : ''}`} aria-current={activeTab === id ? 'page' : undefined} onClick={() => navigate(id)}>
        <Icon size={18} /><span>{label}</span>{id === 'events' && total > 0 && <span className="nav-count">{total}</span>}
      </button>)}
    </nav>
    <div className="sidebar-bottom">
      <div className="preview-card"><Radio size={21} /><strong>See the whole picture</strong><p>Explore the dashboard with a sample city event feed.</p><button onClick={toggleDemo}>{demo ? 'Return to live data' : 'Explore demo'}<ArrowUpRight size={15} /></button></div>
      <button className="sidebar-health" onClick={() => navigate('system')}><span className={`status-dot ${health.state}`} /><span>{health.state === 'online' ? 'Backend connected' : health.state === 'offline' ? 'Backend unavailable' : 'Checking connection'}<small>View system status</small></span><ArrowUpRight size={14} /></button>
      <div className="sidebar-version">CITYLENS PLATFORM <span>v0.1</span></div>
    </div>
  </aside>;
}
