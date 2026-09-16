import { act, renderHook, waitFor } from '@testing-library/react';
import useCityData from './useCityData';
import { DEFAULT_FILTERS } from '../lib/events';

test('re-fetches REST after websocket messages and reconnects after a dropped connection', async () => {
  jest.useFakeTimers();
  const sockets = [];
  global.WebSocket = class {
    static OPEN = 1;
    constructor() { this.readyState = 1; sockets.push(this); }
    close() {} send() {}
  };
  global.fetch = jest.fn(url => Promise.resolve({ ok: true, json: async () => url.endsWith('/health') ? { status: 'ok', database: 'connected' } : { items: [], total: 0 } }));
  const { result, unmount } = renderHook(() => useCityData({ demo: false, filters: DEFAULT_FILTERS, nearby: null, page: 1 }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  const initial = fetch.mock.calls.length;
  act(() => sockets[0].onopen());
  expect(result.current.stream).toBe('live');
  await act(async () => { jest.advanceTimersByTime(350); });
  expect(fetch.mock.calls.length).toBeGreaterThan(initial);
  const connected = fetch.mock.calls.length;
  act(() => sockets[0].onmessage({ data: JSON.stringify({ type: 'event.created', data: { id: 'event-1' } }) }));
  await act(async () => { jest.advanceTimersByTime(350); });
  expect(fetch.mock.calls.length).toBeGreaterThan(connected);
  act(() => sockets[0].onclose());
  expect(result.current.stream).toBe('polling');
  act(() => { jest.advanceTimersByTime(3000); });
  expect(sockets).toHaveLength(2);
  const beforeReconnect = fetch.mock.calls.length;
  act(() => sockets[1].onopen());
  await act(async () => { jest.advanceTimersByTime(350); });
  expect(fetch.mock.calls.length).toBeGreaterThan(beforeReconnect);
  unmount();
  jest.useRealTimers();
});
