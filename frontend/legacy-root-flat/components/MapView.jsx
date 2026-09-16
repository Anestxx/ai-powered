import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const USER_LOCATION = { lat: 12.9716, lng: 77.5946 };

const PRESETS = [
  { name: 'Yelahanka, Bengaluru', lat: 13.1007, lng: 77.5963 },
  { name: 'Whitefield, Bengaluru', lat: 12.9698, lng: 77.7500 },
  { name: 'Koramangala, Bengaluru', lat: 12.9352, lng: 77.6245 },
  { name: 'Electronic City, Bengaluru', lat: 12.8452, lng: 77.6602 },
  { name: 'Marathahalli, Bengaluru', lat: 12.9569, lng: 77.7011 },
  { name: 'Indiranagar, Bengaluru', lat: 12.9784, lng: 77.6408 },
];

// -------- Icons --------
const userIcon = L.divIcon({
  className: 'user-dot',
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#4285F4;border:3px solid white;box-shadow:0 0 0 4px rgba(66,133,244,0.25), 0 0 16px rgba(66,133,244,0.7);animation:pulse 2s infinite;"></div>`,
  iconSize: [16, 16], iconAnchor: [8, 8],
});

const destIcon = L.divIcon({
  className: 'dest-pin',
  html: `<div style="position:relative;width:30px;height:40px;"><div style="position:absolute;bottom:0;left:50%;width:22px;height:22px;background:#EA4335;border:2px solid white;transform:translateX(-50%) rotate(-45deg);border-radius:50% 50% 50% 0;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div></div>`,
  iconSize: [30, 40], iconAnchor: [15, 40],
});

const issueIcon = (color) =>
  L.divIcon({
    className: 'issue-pin',
    html: `<div style="width:20px;height:20px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5);animation:pulse 2s infinite;"></div>`,
    iconSize: [20, 20], iconAnchor: [10, 10],
  });

const issueColors = {
  accident: '#EA4335',
  pothole: '#FBBC04',
  water: '#4285F4',
  jam: '#EA4335',
  protest: '#9333EA',
  construction: '#F97316',
};

const issueLabels = {
  pothole: 'Pothole',
  water: 'Waterlogging',
  accident: 'Accident',
  jam: 'Traffic Jam',
  protest: 'Protest',
  construction: 'Road Work',
};

// -------- Builders --------
function buildRoute(from, to) {
  const steps = 40;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const curve = Math.sin(t * Math.PI) * 0.006;
    points.push([
      from.lat + (to.lat - from.lat) * t + curve,
      from.lng + (to.lng - from.lng) * t - curve,
    ]);
  }
  return points;
}

function buildIssues(from, to, count) {
  const types = ['pothole', 'water', 'accident', 'jam', 'protest', 'construction'];
  const issues = [];
  for (let i = 0; i < count; i++) {
    const p = 0.15 + Math.random() * 0.7;
    const type = types[Math.floor(Math.random() * types.length)];
    issues.push({
      id: i + 1,
      type,
      label: issueLabels[type],
      lat: from.lat + (to.lat - from.lat) * p + (Math.random() - 0.5) * 0.003,
      lng: from.lng + (to.lng - from.lng) * p + (Math.random() - 0.5) * 0.003,
    });
  }
  return issues;
}

function computeDistance(from, to) {
  const R = 6371;
  const dLat = (to.lat - from.lat) * Math.PI / 180;
  const dLng = (to.lng - from.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(from.lat * Math.PI / 180) *
    Math.cos(to.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

// -------- Map camera controller --------
function MapController({ destination }) {
  const map = useMap();
  useEffect(() => {
    if (destination) {
      const bounds = L.latLngBounds([
        [USER_LOCATION.lat, USER_LOCATION.lng],
        [destination.lat, destination.lng],
      ]);
      map.flyToBounds(bounds, { padding: [100, 100], duration: 1.5 });
    }
  }, [destination, map]);
  return null;
}

// -------- Main component --------
function MapView() {
  const [query, setQuery] = useState('Yelahanka, Bengaluru');
  const [destination, setDestination] = useState(PRESETS[0]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [detected, setDetected] = useState(false);
  const [visibleIssues, setVisibleIssues] = useState([]);
  const [route, setRoute] = useState([]);
  const [routeProgress, setRouteProgress] = useState(1);
  const [allIssues, setAllIssues] = useState([]);
  const scanTimer = useRef(null);

  // Build the route + issues whenever destination changes
  useEffect(() => {
    setRoute(buildRoute(USER_LOCATION, destination));
    setRouteProgress(0);
    setDetected(false);
    setVisibleIssues([]);

    const issueCount = 3 + Math.floor(Math.random() * 2);
    const fresh = buildIssues(USER_LOCATION, destination, issueCount);
    setAllIssues(fresh);

    // Animate route drawing
    let t = 0;
    const routeInt = setInterval(() => {
      t += 0.05;
      setRouteProgress(Math.min(t, 1));
      if (t >= 1) clearInterval(routeInt);
    }, 40);

    // Simulate "detecting" issues after arrival
    if (scanTimer.current) clearTimeout(scanTimer.current);
    scanTimer.current = setTimeout(() => {
      setScanning(true);
      fresh.forEach((issue, i) => {
        setTimeout(() => {
          setVisibleIssues(prev => [...prev, issue]);
          if (i === fresh.length - 1) {
            setTimeout(() => {
              setScanning(false);
              setDetected(true);
            }, 400);
          }
        }, i * 600);
      });
    }, 1600);

    return () => {
      clearInterval(routeInt);
      if (scanTimer.current) clearTimeout(scanTimer.current);
    };
  }, [destination]);

  const suggestions = PRESETS.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  const distance = computeDistance(USER_LOCATION, destination);
  const eta = Math.round(distance * 2.2);

  const handleSelect = (loc) => {
    setDestination(loc);
    setQuery(loc.name);
    setShowSuggestions(false);
  };

  const handleGo = () => {
    if (suggestions.length > 0) handleSelect(suggestions[0]);
  };

  // Trim route polyline for animated draw-in
  const drawRoute = route.slice(0, Math.max(2, Math.floor(route.length * routeProgress)));

  return (
    <div style={{
      position: 'relative',
      height: 'calc(100vh - 60px)',
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid #334155',
      fontFamily: 'Roboto, -apple-system, sans-serif',
      background: '#e5e3df',
    }}>

      <MapContainer
        center={[USER_LOCATION.lat, USER_LOCATION.lng]}
        zoom={12}
        zoomControl={true}
        attributionControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <MapController destination={destination} />

        {/* Animated route */}
        {drawRoute.length > 1 && (
          <>
            <Polyline
              positions={drawRoute}
              pathOptions={{ color: '#4285F4', weight: 8, opacity: 0.95, lineCap: 'round' }}
            />
            <Polyline
              positions={drawRoute}
              pathOptions={{ color: '#8AB4F8', weight: 3, opacity: 1, lineCap: 'round' }}
            />
          </>
        )}

        {/* User location */}
        <Marker position={[USER_LOCATION.lat, USER_LOCATION.lng]} icon={userIcon}>
          <Popup>You are here</Popup>
        </Marker>

        {/* Destination */}
        <Marker position={[destination.lat, destination.lng]} icon={destIcon}>
          <Popup>{destination.name}</Popup>
        </Marker>

        {/* Issues appear one by one as "detected" */}
        {visibleIssues.map(issue => (
          <Marker key={issue.id} position={[issue.lat, issue.lng]} icon={issueIcon(issueColors[issue.type])}>
            <Popup>
              <div style={{ color: '#202124', fontWeight: 600 }}>{issue.label} — on your route</div>
            </Popup>
          </Marker>
        ))}

        {visibleIssues.map(issue => (
          <Circle
            key={`c-${issue.id}`}
            center={[issue.lat, issue.lng]}
            radius={250}
            pathOptions={{ color: issueColors[issue.type], fillColor: issueColors[issue.type], fillOpacity: 0.15, weight: 0 }}
          />
        ))}
      </MapContainer>

      {/* Search card — top-left */}
      <div style={{
        position: 'absolute', top: 16, left: 16, right: 16, maxWidth: 420,
        background: 'white', borderRadius: 12, padding: 12,
        boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
        zIndex: 10000,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E8F0FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>☰</div>
          <div style={{ flex: 1, background: '#F1F3F4', borderRadius: 24, padding: '8px 16px', fontSize: 13, color: '#5F6368' }}>Search CityLens</div>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#4285F4', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}>J</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#4285F4' }}></span>
            <input value="Your location" readOnly style={{ flex: 1, background: '#F1F3F4', border: 'none', borderRadius: 20, padding: '8px 12px', color: '#202124', fontSize: 13, outline: 'none' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: '2px', background: '#EA4335' }}></span>
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => e.key === 'Enter' && handleGo()}
              placeholder="Choose destination"
              style={{
                flex: 1, background: '#F1F3F4', border: 'none',
                borderRadius: 20, padding: '8px 12px',
                color: '#202124', fontSize: 13, outline: 'none',
              }}
            />
          </div>

          {showSuggestions && suggestions.length > 0 && query !== destination.name && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6,
              background: 'white', borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              maxHeight: 240, overflowY: 'auto', zIndex: 11000,
            }}>
              {suggestions.map((loc) => (
                <div
                  key={loc.name}
                  onClick={() => handleSelect(loc)}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F1F3F4'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  style={{
                    padding: '10px 14px', fontSize: 13, color: '#202124',
                    cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  <span style={{ fontSize: 16 }}>📍</span>
                  <span>{loc.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Scanning indicator — top-right */}
      {scanning && (
        <div style={{
          position: 'absolute', top: 16, right: 16,
          background: 'white', borderRadius: 20,
          padding: '8px 14px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: '#202124', fontWeight: 500,
          zIndex: 10000,
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: '#4285F4',
            animation: 'pulse 1s infinite',
          }}></span>
          Detecting issues…
        </div>
      )}

      {/* Bottom info card */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16, right: 16, maxWidth: 420,
        background: 'white', borderRadius: 12, padding: 16,
        boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
        zIndex: 1000,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 24, fontWeight: 600, color: '#188038' }}>{eta} min</span>
          <span style={{ fontSize: 15, color: '#5F6368' }}>{distance} km</span>
        </div>
        <div style={{ fontSize: 13, color: '#5F6368', marginTop: 4 }}>
          to {destination.name}
        </div>

        <div style={{ marginTop: 12 }}>
          {scanning ? (
            <div style={{ fontSize: 13, color: '#1a73e8', background: '#E8F0FE', padding: '6px 10px', borderRadius: 6, display: 'inline-block' }}>
              Scanning route…
            </div>
          ) : detected && visibleIssues.length > 0 ? (
            <div style={{ fontSize: 13, color: '#C5221F', background: '#FCE8E6', padding: '6px 10px', borderRadius: 6, display: 'inline-block' }}>
              ⚠ {visibleIssues.length} issue{visibleIssues.length > 1 ? 's' : ''} detected on this route
            </div>
          ) : detected ? (
            <div style={{ fontSize: 13, color: '#188038', background: '#E6F4EA', padding: '6px 10px', borderRadius: 6, display: 'inline-block' }}>
              ✓ Your route is clear
            </div>
          ) : null}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.85; }
        }
        .leaflet-container { background: #e5e3df; font-family: inherit; }
        .leaflet-top.leaflet-left { top: 130px; left: auto; right: 16px; }
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.18) !important;
          border-radius: 8px !important;
          overflow: hidden !important;
        }
        .leaflet-control-zoom a {
          background: white !important;
          color: #5F6368 !important;
          width: 40px !important;
          height: 40px !important;
          line-height: 40px !important;
          font-size: 22px !important;
          border: none !important;
          border-bottom: 1px solid #E0E0E0 !important;
        }
        .leaflet-control-zoom a:hover { background: #F1F3F4 !important; }
        .leaflet-control-attribution { display: none !important; }
        .leaflet-popup-content-wrapper {
          border-radius: 8px !important;
          box-shadow: 0 4px 16px rgba(0,0,0,0.2) !important;
        }
      `}</style>
    </div>
  );
}

export default MapView;