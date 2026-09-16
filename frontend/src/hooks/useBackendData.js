import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fetchSummary, websocketUrl } from '../lib/api';
import { createDemoEvents } from '../lib/demo';
import { filterDemo, PAGE_SIZE } from '../lib/events';

export default function useCityData({ demo, filters, nearby, page, q = '' }) {
  const [demoEvents] = useState(createDemoEvents);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [summary, setSummary] = useState(null);
  const [health, setHealth] = useState({ state: 'checking' });
  const [stream, setStream] = useState('connecting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const liveRefresh = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    api('/health', { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      setHealth({ state: data.status === 'ok' && data.database === 'connected' ? 'online' : 'offline', ...data });
    }).catch(err => { if (!controller.signal.aborted) setHealth({ state: 'offline', message: err.message }); });
    return () => controller.abort();
  }, [revision]);

  // Clear the previous query's rows immediately; only background refreshes retain them.
  useEffect(() => { setResult({ items: [], total: 0 }); setUpdatedAt(null); }, [demo, filters, nearby, page, q]);
  useEffect(() => { setSummary(null); }, [demo]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    if (demo) {
      setResult(filterDemo(demoEvents, filters, nearby, page, q));
      setSummary({ by_type: demoEvents.reduce((counts, event) => ({ ...counts, [event.event_type]: (counts[event.event_type] || 0) + 1 }), {}), total: demoEvents.length, ...Object.fromEntries(['detected', 'under_repair', 'resolved'].map(status => [status, demoEvents.filter(event => event.status === status).length])) });
      setSummaryError('');
      setUpdatedAt(new Date());
      setLoading(false);
      return () => controller.abort();
    }
    const params = new URLSearchParams({ page, page_size: PAGE_SIZE });
    Object.entries({ ...filters, ...nearby, q }).forEach(([key, value]) => { if (value !== '' && key !== 'label') params.set(key, value); });
    api(`/events${nearby ? '/nearby' : ''}?${params}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      setResult(data);
      setUpdatedAt(new Date());
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    fetchSummary(controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setSummary(data); setSummaryError('');
    }).catch(err => { if (!controller.signal.aborted) setSummaryError(err.message); });
    return () => controller.abort();
  }, [demo, demoEvents, filters, nearby, page, q, revision]);

  useEffect(() => {
    if (demo) { setStream('demo'); return undefined; }
    let socket, reconnect, heartbeat, stopped = false, attempt = 0;
    const scheduleRefresh = () => {
      if (!liveRefresh.current) liveRefresh.current = setTimeout(() => { liveRefresh.current = null; refresh(); }, 350);
    };
    const connect = () => {
      if (stopped) return;
      setStream('connecting');
      try { socket = new WebSocket(websocketUrl()); } catch { setStream('polling'); reconnect = setTimeout(connect, 10000); return; }
      socket.onopen = () => {
        if (stopped) return;
        attempt = 0; setStream('live'); scheduleRefresh();
        heartbeat = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send('ping'); }, 25000);
      };
      socket.onmessage = message => {
        try { if (['event.created', 'event.updated'].includes(JSON.parse(message.data).type)) scheduleRefresh(); } catch { /* Ignore non-event messages. */ }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        clearInterval(heartbeat);
        if (stopped) return;
        setStream('polling');
        reconnect = setTimeout(connect, Math.min(30000, 3000 * 2 ** attempt++));
      };
    };
    connect();
    const poll = setInterval(refresh, 30000);
    return () => {
      stopped = true; clearInterval(poll); clearInterval(heartbeat);
      clearTimeout(reconnect); clearTimeout(liveRefresh.current); liveRefresh.current = null;
      if (socket) { socket.onclose = null; socket.onerror = null; socket.onopen = null; socket.onmessage = null; socket.close(); }
    };
  }, [demo, refresh]);

  return { ...result, summary, summaryError, health, stream, loading, error, updatedAt, refresh };
}
