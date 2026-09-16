import React, { useState, useEffect } from 'react';

const initialAlerts = [
  { id: 1, type: 'Accident', location: 'Ring Road, Sector 14', severity: 'Critical', time: '5 min ago', bus: 'KA-01-2345', onRoute: true, action: 'Avoid this road. Reroute via 100 Ft Road.' },
  { id: 2, type: 'Pothole', location: 'MG Road, near Metro Station', severity: 'High', time: '2 min ago', bus: 'KA-05-1122', onRoute: true, action: 'Drive slowly. Two-wheeler risk.' },
  { id: 3, type: 'Waterlogging', location: 'Underpass, Anna Salai', severity: 'Medium', time: '12 min ago', bus: 'KA-03-7788', onRoute: false, action: 'Water level rising. Avoid if possible.' },
  { id: 4, type: 'Traffic Jam', location: 'Outer Ring Road', severity: 'High', time: '18 min ago', bus: 'KA-02-9911', onRoute: false, action: 'Expect 15 min delay.' },
  { id: 5, type: 'Helmet Violation', location: 'Silk Board Junction', severity: 'Medium', time: '22 min ago', bus: 'KA-07-4455', onRoute: false, action: 'Enforcement zone.' },
];

const incomingAlerts = [
  { type: 'Pothole', location: 'Hosur Road, Bommanahalli', severity: 'High', bus: 'KA-04-3321', action: 'Drive carefully.' },
  { type: 'Accident', location: 'Old Airport Road', severity: 'Critical', bus: 'KA-06-8899', action: 'Reroute recommended.' },
  { type: 'Waterlogging', location: 'KR Puram Bridge', severity: 'Medium', bus: 'KA-08-2233', action: 'Slow traffic expected.' },
  { type: 'Traffic Jam', location: 'Bellandur Junction', severity: 'High', bus: 'KA-09-6677', action: 'Expect delay.' },
];

const severityColor = (s) => {
  if (s === 'Critical') return '#ef4444';
  if (s === 'High') return '#f97316';
  if (s === 'Medium') return '#eab308';
  return '#22c55e';
};

function AlertsPanel() {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [filter, setFilter] = useState('myRoute');

  // Simulate live new alerts every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const template = incomingAlerts[Math.floor(Math.random() * incomingAlerts.length)];
      const newAlert = {
        id: Date.now(),
        ...template,
        time: 'just now',
        onRoute: Math.random() > 0.5,
      };
      setAlerts(prev => [newAlert, ...prev].slice(0, 8));
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const filtered = filter === 'myRoute'
    ? alerts.filter(a => a.onRoute)
    : alerts;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ fontSize: 22 }}>Live Alerts</h2>
        <span style={{ fontSize: 12, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
          LIVE
        </span>
      </div>
      <p style={{ color: '#94a3b8', marginBottom: 20, fontSize: 13 }}>
        Detected in real-time by the public transport fleet
      </p>

      {/* Filter toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => setFilter('myRoute')}
          style={{
            background: filter === 'myRoute' ? '#0ea5e9' : '#1e293b',
            color: 'white', border: 'none', padding: '8px 16px',
            borderRadius: 20, fontSize: 13, cursor: 'pointer'
          }}
        >
          My Route ({alerts.filter(a => a.onRoute).length})
        </button>
        <button
          onClick={() => setFilter('all')}
          style={{
            background: filter === 'all' ? '#0ea5e9' : '#1e293b',
            color: 'white', border: 'none', padding: '8px 16px',
            borderRadius: 20, fontSize: 13, cursor: 'pointer'
          }}
        >
          All City ({alerts.length})
        </button>
      </div>

      {/* Alerts list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.length === 0 && (
          <p style={{ color: '#64748b', fontSize: 14 }}>No alerts on your route. Smooth sailing. 🚌</p>
        )}

        {filtered.map(alert => (
          <div
            key={alert.id}
            style={{
              background: '#1e293b',
              borderLeft: `4px solid ${severityColor(alert.severity)}`,
              borderRadius: 8,
              padding: 16,
              animation: alert.time === 'just now' ? 'fadeIn 0.6s ease' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{
                    background: severityColor(alert.severity),
                    color: 'white',
                    padding: '2px 8px',
                    borderRadius: 10,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.5
                  }}>
                    {alert.severity.toUpperCase()}
                  </span>
                  <span style={{ color: '#f1f5f9', fontSize: 15, fontWeight: 600 }}>
                    {alert.type}
                  </span>
                  {alert.onRoute && (
                    <span style={{
                      background: '#1e40af',
                      color: '#93c5fd',
                      padding: '2px 8px',
                      borderRadius: 10,
                      fontSize: 10,
                      fontWeight: 600
                    }}>
                      ON YOUR ROUTE
                    </span>
                  )}
                </div>

                <div style={{ color: '#cbd5e1', fontSize: 14, marginBottom: 6 }}>
                  📍 {alert.location}
                </div>

                <div style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                  Detected {alert.time} · {alert.bus}
                </div>

                <div style={{ color: '#fbbf24', fontSize: 13, fontStyle: 'italic' }}>
                  ⚠ {alert.action}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default AlertsPanel;