import React, { useState } from 'react';
import { Crosshair, MapPin, Search } from 'lucide-react';

export default function NearbySearch({ nearby, onSearch, onClear }) {
  const [latitude, setLatitude] = useState(nearby?.latitude ?? 12.9716), [longitude, setLongitude] = useState(nearby?.longitude ?? 77.5946), [radius, setRadius] = useState(nearby?.radius ?? 5000);
  const [error, setError] = useState(''), [locating, setLocating] = useState(false);
  const submit = event => { event.preventDefault(); setError(''); onSearch({ latitude: Number(latitude), longitude: Number(longitude), radius: Number(radius) }); };
  const locate = () => {
    if (!navigator.geolocation) { setError('Location access is unavailable. Enter coordinates instead.'); return; }
    setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(position => { setLatitude(Number(position.coords.latitude.toFixed(6))); setLongitude(Number(position.coords.longitude.toFixed(6))); setLocating(false); }, () => { setError('Could not get your location. Allow location access or enter coordinates.'); setLocating(false); }, { timeout: 10000 });
  };
  return <section className="panel nearby-panel"><div className="nearby-intro"><MapPin size={20} /><div><h2>Explore an area</h2><p>Find active incidents around any coordinates.</p></div></div><form className="nearby-form" onSubmit={submit}>
    <label>Latitude<input type="number" required step="any" min="-90" max="90" value={latitude} onChange={event => setLatitude(event.target.value)} /></label>
    <label>Longitude<input type="number" required step="any" min="-180" max="180" value={longitude} onChange={event => setLongitude(event.target.value)} /></label>
    <label>Search radius<select value={radius} onChange={event => setRadius(event.target.value)}>{[500, 1000, 5000, 10000, 25000, 50000].map(value => <option key={value} value={value}>{value / 1000} km</option>)}</select></label>
    <button type="button" className="button secondary" disabled={locating} onClick={locate}><Crosshair size={16} />{locating ? 'Locating…' : 'My location'}</button><button className="button primary" type="submit"><Search size={16} />Search area</button>{nearby && <button type="button" className="text-button" onClick={onClear}>Clear area</button>}
  </form>{error && <p className="form-error" role="alert">{error}</p>}</section>;
}
