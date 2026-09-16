import React from 'react';

function Sidebar({ activeTab, setActiveTab }) {
  const items = [
    { id: 'map', label: 'Live City Map' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'route', label: 'Route Planner' },
  ];

  return (
    <aside className="sidebar">
      <h1>CODYS</h1>
      <p className="version">v1.0</p>
      <nav>
        {items.map(item => (
          <button
            key={item.id}
            className={activeTab === item.id ? 'active' : ''}
            onClick={() => setActiveTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;