// Deliberately separate from live data. Never sent to the backend.
const samples = [
  ['accident_suspected', 'critical', 'detected', 12.9716, 77.6046, 0.86, 3, 'Traffic police'],
  ['pothole', 'high', 'confirmed', 12.9791, 77.5913, 0.94, 8, 'Municipality'],
  ['waterlogging', 'high', 'confirmed', 12.9632, 77.5815, 0.91, 5, 'Municipality'],
  ['congestion', 'medium', 'detected', 12.987, 77.617, 0.78, 2, 'Traffic police'],
  ['road_damage', 'high', 'under_repair', 12.9587, 77.6125, 0.96, 9, 'Municipality'],
  ['construction', 'medium', 'confirmed', 12.9943, 77.5742, 0.89, 4, 'Municipality'],
  ['stalled_vehicle', 'medium', 'detected', 12.9492, 77.5986, 0.82, 1, null],
  ['pothole', 'low', 'resolved', 12.9823, 77.6438, 0.97, 12, 'Municipality'],
  ['road_obstacle', 'high', 'under_repair', 12.9738, 77.5564, 0.88, 6, 'Municipality'],
  ['emergency_vehicle', 'critical', 'confirmed', 12.9428, 77.6274, 0.92, 3, 'Traffic police'],
  ['waterlogging', 'medium', 'possibly_resolved', 13.0098, 77.5891, 0.81, 4, 'Municipality'],
  ['road_damage', 'low', 'rejected', 12.9545, 77.5673, 0.42, 1, null],
];
export function createDemoEvents() {
  const now = Date.now();
  return samples.map(([event_type, severity, status, latitude, longitude, confidence, observation_count, assigned_department], index) => ({
    id: `demo-${String(index + 1).padStart(4, '0')}`, event_type, severity, status, latitude, longitude,
    confidence, observation_count, assigned_department,
    first_seen: new Date(now - (index + 1) * 3600000).toISOString(),
    last_seen: new Date(now - (index * 7 + 2) * 60000).toISOString(),
    resolved_at: status === 'resolved' ? new Date(now - index * 420000).toISOString() : null,
  }));
}
