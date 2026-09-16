import React from 'react';

function Sidebar({ activeTab, setActiveTab }) {
  const items = [
    { id: 'map', label: 'Live Map', icon: '🗺️' },
    { id: 'alerts', label: 'Alerts', icon: '⚠️' },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <span className="lens-dot"></span>
          <span className="lens-dot"></span>
          <span className="lens-dot"></span>
        </div>
        <h1>CityLens</h1>
        <p className="tagline">Live Urban Intelligence</p>
      </div>

      <nav>
        {items.map(item => (
          <button
            key={item.id}
            className={activeTab === item.id ? 'active' : ''}
            onClick={() => setActiveTab(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="status-dot"></div>
        <span>System Live</span>
      </div>
    </aside>
  );
}

export default Sidebar;