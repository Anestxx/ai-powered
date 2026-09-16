import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fetchSummary, websocketUrl } from '../lib/api';
import { createDemoEvents } from '../lib/demo';
import { filterDemo, PAGE_SIZE } from '../lib/events';

export default function useCityData({ demo, filters, nearby, page }) {
  const [demoEvents] = useState(createDemoEvents);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [summary, setSummary] = useState(null);
  const [health, setHealth] = useState({ state: 'checking' });
  const [stream, setStream] = useState('connecting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summaryError, setSummaryError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const liveRefresh = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setHealth({ state: 'checking' });
    api('/health', { signal: controller.signal }).then(data => {
      setHealth({ state: data.status === 'ok' && data.database === 'connected' ? 'online' : 'offline', ...data });
    }).catch(err => { if (!controller.signal.aborted) setHealth({ state: 'offline', message: err.message }); });
    return () => controller.abort();
  }, [revision]);

  // Clear the previous query's rows immediately; only background refreshes retain them.
  useEffect(() => { setResult({ items: [], total: 0 }); setUpdatedAt(null); }, [demo, filters, nearby, page]);
  useEffect(() => { setSummary(null); }, [demo]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    if (demo) {
      setResult(filterDemo(demoEvents, filters, nearby, page));
      setSummary({ total: demoEvents.length, ...Object.fromEntries(['detected', 'under_repair', 'resolved'].map(status => [status, demoEvents.filter(event => event.status === status).length])) });
      setSummaryError(false);
      setUpdatedAt(new Date());
      setLoading(false);
      return () => controller.abort();
    }
    const params = new URLSearchParams({ page, page_size: PAGE_SIZE });
    Object.entries(nearby || filters).forEach(([key, value]) => { if (value !== '' && key !== 'label') params.set(key, value); });
    api(`/events${nearby ? '/nearby' : ''}?${params}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      setResult(data);
      setUpdatedAt(new Date());
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    fetchSummary(controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setSummary(data); setSummaryError(false);
    }).catch(() => { if (!controller.signal.aborted) setSummaryError(true); });
    return () => controller.abort();
  }, [demo, demoEvents, filters, nearby, page, revision]);

  useEffect(() => {
    if (demo) { setStream('demo'); return undefined; }
    let socket, reconnect, heartbeat, stopped = false, attempt = 0;
    const scheduleRefresh = () => {
      clearTimeout(liveRefresh.current);
      liveRefresh.current = setTimeout(refresh, 350);
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
      clearTimeout(reconnect); clearTimeout(liveRefresh.current);
      if (socket) { socket.onclose = null; socket.onerror = null; socket.onopen = null; socket.onmessage = null; socket.close(); }
    };
  }, [demo, refresh]);

  return { ...result, summary, summaryError, health, stream, loading, error, updatedAt, refresh };
}
