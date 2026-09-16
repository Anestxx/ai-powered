import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';

jest.mock('./components/MapView', () => function MockMap({ events }) {
  return <div data-testid="map">{events.length} events on map</div>;
});

const record = (id, changes = {}) => ({ id, event_type: 'pothole', status: 'detected', severity: 'high', confidence: 0.85, observation_count: 2, latitude: 12.97, longitude: 77.59, first_seen: new Date().toISOString(), last_seen: new Date().toISOString(), resolved_at: null, assigned_department: null, ...changes });
let records, requests, failure;
const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });

beforeEach(() => {
  window.location.hash = '';
  window.scrollTo = jest.fn();
  records = [record('event-1'), record('event-2', { event_type: 'waterlogging', status: 'confirmed' }), record('event-3', { status: 'resolved' })];
  requests = []; failure = false;
  Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => 'b0a360f8-2c0a-4a00-908e-a694b3155555' } });
  global.WebSocket = class { static OPEN = 1; close() {} send() {} };
  global.fetch = jest.fn((address, options = {}) => {
    const url = new URL(address, 'http://localhost');
    requests.push({ url, options });
    if (failure) return Promise.reject(new TypeError('Network error'));
    if (url.pathname.endsWith('/health')) return json({ status: 'ok', database: 'connected' });
    if (url.pathname.endsWith('/dashboard/summary')) return json({ total: records.length, detected: records.filter(x => x.status === 'detected').length, under_repair: records.filter(x => x.status === 'under_repair').length, resolved: records.filter(x => x.status === 'resolved').length, by_type: records.reduce((counts, x) => ({ ...counts, [x.event_type]: (counts[x.event_type] || 0) + 1 }), {}) });
    if (url.pathname.endsWith('/traffic/runs')) return json({ items: [{ id: 'run-1', name: 'Saved road run', frames_processed: 120, max_visible_vehicles: 7, processing_fps: 12, model: 'yolo26n.pt', traffic_level_frames: { LOW: 120 }, has_video: true }], total: 1 });
    if (url.pathname.endsWith('/auth/login')) return json({ access_token: `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`, token_type: 'bearer', user: { email: 'officer@example.gov', role: 'admin' } });
    if (url.pathname.endsWith('/staff/observations')) { const input = JSON.parse(options.body); const saved = record('event-new', input); records.push(saved); return json({ event: saved, duplicate: false }, 201); }
    if (url.pathname.endsWith('/vehicles') && options.method !== 'POST') return json({ items: [{ id: 'vehicle-1', external_vehicle_id: 'BUS_42', vehicle_type: 'public_bus', is_active: true, route_id: '500D', latitude: null, longitude: null, last_seen: null }], total: 1 });
    if (url.pathname.endsWith('/vehicles')) return json({ id: 'vehicle-1', ...JSON.parse(options.body) }, 201);
    if (url.pathname.endsWith('/evidence')) return json([{ id: 'evidence-1', captured_at: new Date().toISOString(), file_url: 'https://example.com/evidence.jpg' }]);
    if (url.pathname.endsWith('/status') || url.pathname.endsWith('/assignment')) {
      const item = records.find(event => event.id === url.pathname.split('/').at(-2));
      Object.assign(item, JSON.parse(options.body));
      return json({ ...item });
    }
    if (/\/events\/event-/.test(url.pathname)) return json(records.find(event => url.pathname.endsWith(event.id)));
    let items = records.filter(event => ['event_type', 'status', 'severity'].every(key => !url.searchParams.get(key) || event[key] === url.searchParams.get(key)));
    if (url.searchParams.get('q')) items = items.filter(x => [x.id, x.event_type, x.assigned_department].join(' ').toLowerCase().includes(url.searchParams.get('q').toLowerCase()));
    const page = Number(url.searchParams.get('page') || 1), pageSize = Number(url.searchParams.get('page_size') || 50);
    return json({ items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, page_size: pageSize });
  });
});

async function openEvents() {
  render(<App />);
  await screen.findByText('Backend connected');
  fireEvent.click(screen.getByRole('button', { name: /^Incidents/ }));
  await screen.findByRole('table');
}
async function signIn() {
  fireEvent.click(screen.getByRole('button', { name: 'Staff sign in' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Email address'), { target: { value: 'officer@example.gov' } });
  fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'test-password' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

test('loads backend records and applies type and status filters on the server', async () => {
  await openEvents();
  await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4));
  fireEvent.change(screen.getByLabelText('Event type'), { target: { value: 'waterlogging' } });
  await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2));
  expect(requests.some(({ url }) => url.searchParams.get('event_type') === 'waterlogging')).toBe(true);
  fireEvent.change(screen.getByLabelText('Event status'), { target: { value: 'detected' } });
  await screen.findByText('No matching incidents');
  expect(screen.queryByText('Waterlogging', { selector: '.table-event strong' })).not.toBeInTheDocument();
});

test('browses every backend page and keeps global overview totals', async () => {
  records = Array.from({ length: 61 }, (_, i) => record(`event-${i + 1}`));
  await openEvents();
  await screen.findByText('1–50 of 61 events');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByText('51–61 of 61 events');
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(12);
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
});

test('shows connection failures and keeps demo records isolated when returning to live data', async () => {
  failure = true;
  render(<App />);
  await screen.findByText('Event feed unavailable');
  fireEvent.click(screen.getAllByRole('button', { name: 'Explore demo' })[0]);
  await screen.findByText('Demo preview');
  await waitFor(() => expect(document.querySelector('.summary-number')).toHaveTextContent('12'));
  fireEvent.click(screen.getAllByRole('button', { name: /Return to live data/ })[0]);
  await screen.findByText('Event feed unavailable');
  expect(document.querySelector('.summary-number')).toHaveTextContent('—');
  expect(screen.queryByText('Suspected accident', { selector: '.feed-copy strong' })).not.toBeInTheDocument();
});

test('staff can sign in, inspect evidence, and save an allowed incident status', async () => {
  await openEvents();
  await signIn();
  fireEvent.click(screen.getByRole('button', { name: 'View Pothole event-1' }));
  const dialog = screen.getByRole('dialog');
  await waitFor(() => expect(within(dialog).getByLabelText('New status')).not.toBeDisabled());
  fireEvent.click(within(dialog).getByRole('button', { name: 'Load evidence' }));
  expect(await within(dialog).findByRole('link', { name: 'Open file' })).toHaveAttribute('href', 'https://example.com/evidence.jpg');
  fireEvent.change(within(dialog).getByLabelText('New status'), { target: { value: 'confirmed' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Update status' }));
  await within(dialog).findByText('Status updated to Confirmed.');
  const patch = requests.find(({ options }) => options.method === 'PATCH');
  expect(patch.options.headers.Authorization).toMatch(/^Bearer /);
  expect(JSON.parse(patch.options.body)).toEqual({ status: 'confirmed' });
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('registers a vehicle with the protected API and displays its saved identifier', async () => {
  await openEvents();
  await signIn();
  fireEvent.click(screen.getByRole('button', { name: 'Staff workspace' }));
  fireEvent.change(screen.getByLabelText('Vehicle identifier'), { target: { value: 'BUS_42' } });
  fireEvent.change(screen.getByLabelText(/Route identifier/), { target: { value: '500D' } });
  fireEvent.click(screen.getByRole('button', { name: 'Register vehicle' }));
  await screen.findByText('BUS_42 registered');
  expect(requests.find(({ url }) => url.pathname.endsWith('/vehicles')).options.headers.Authorization).toMatch(/^Bearer /);
});

test('area search uses backend nearby coordinates and radius', async () => {
  await openEvents();
  fireEvent.click(screen.getByRole('button', { name: 'Live map' }));
  fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '13.1' } });
  fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '77.6' } });
  fireEvent.change(screen.getByLabelText('Search radius'), { target: { value: '1000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search area' }));
  await waitFor(() => expect(requests.some(({ url }) => url.pathname.endsWith('/nearby') && url.searchParams.get('latitude') === '13.1' && url.searchParams.get('longitude') === '77.6' && url.searchParams.get('radius') === '1000')).toBe(true));
  expect(screen.getByLabelText('Event type')).toBeInTheDocument();
});

test('denied staff actions show the permission error and expired sessions disable writes', async () => {
  await openEvents();
  await signIn();
  const fetchApi = global.fetch;
  let status = 403;
  global.fetch = jest.fn((address, options) => address.endsWith('/vehicles') && options.method === 'POST'
    ? json({ error: { message: status === 403 ? 'Insufficient permissions' : 'Invalid or expired access token' } }, status)
    : fetchApi(address, options));
  fireEvent.click(screen.getByRole('button', { name: 'Staff workspace' }));
  fireEvent.change(screen.getByLabelText('Vehicle identifier'), { target: { value: 'BUS_42' } });
  fireEvent.click(screen.getByRole('button', { name: 'Register vehicle' }));
  await screen.findByText('Vehicle registration requires an admin or transport department account.');
  expect(screen.queryByText('BUS_42 registered')).not.toBeInTheDocument();
  status = 401;
  fireEvent.click(screen.getByRole('button', { name: 'Register vehicle' }));
  await screen.findByText('Your session is no longer valid. Please sign in again.');
  expect(screen.getByLabelText('Vehicle identifier')).toBeDisabled();
});

test('search finds backend records beyond the currently loaded page', async () => {
  records = Array.from({ length: 61 }, (_, i) => record(`event-${i + 1}`, { assigned_department: i === 60 ? 'Unique drainage team' : null }));
  await openEvents();
  fireEvent.change(screen.getByLabelText('Search all incidents'), { target: { value: 'Unique drainage' } });
  await screen.findByText('1 matching incidents across all pages');
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
  expect(requests.some(({ url }) => url.searchParams.get('q') === 'Unique drainage')).toBe(true);
});

test('records a real observation request from a registered vehicle and opens its details', async () => {
  await openEvents(); await signIn();
  fireEvent.click(screen.getByRole('button', { name: 'Staff workspace' }));
  await screen.findByText('BUS_42', { selector: 'td strong' });
  fireEvent.change(screen.getByLabelText('Source vehicle'), { target: { value: 'BUS_42' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save observation' }));
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByText('#event-new');
  const request = requests.find(({ url }) => url.pathname.endsWith('/staff/observations'));
  expect(JSON.parse(request.options.body)).toMatchObject({ source_vehicle: 'BUS_42', latitude: 12.9716, longitude: 77.5946, confidence: 0.85 });
  expect(request.options.headers.Authorization).toMatch(/^Bearer /);
});

test('department changes are persisted through the backend', async () => {
  await openEvents(); await signIn();
  fireEvent.click(screen.getByRole('button', { name: 'View Pothole event-1' }));
  const dialog = screen.getByRole('dialog');
  await waitFor(() => expect(within(dialog).getByLabelText('Assigned department')).not.toBeDisabled());
  fireEvent.change(within(dialog).getByLabelText('Assigned department'), { target: { value: 'Municipality' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save assignment' }));
  await within(dialog).findByText('Department assignment saved.');
  expect(records[0].assigned_department).toBe('Municipality');
});

test('traffic analyses display backend measurements and a playable media endpoint', async () => {
  await openEvents();
  fireEvent.click(screen.getByRole('button', { name: 'Traffic AI' }));
  await screen.findByText('Peak visible vehicles');
  expect(document.querySelector('video')).toHaveAttribute('src', '/api/v1/traffic/runs/run-1/video');
  expect(screen.getByText('7', { selector: '.analysis-metrics strong' })).toBeInTheDocument();
});
