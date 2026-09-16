export const API_BASE = (process.env.REACT_APP_API_URL || '/api/v1').replace(/\/$/, '');

export function websocketUrl() {
  if (process.env.REACT_APP_WS_URL) return process.env.REACT_APP_WS_URL;
  const url = new URL(API_BASE, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws/events';
  url.search = '';
  return url.toString();
}

export async function api(path, { token, body, signal, ...options } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort);
  const timer = setTimeout(abort, 12000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options, signal: controller.signal,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.error;
      const fields = detail?.fields?.map(field => `${field.location.slice(1).join('.')}: ${field.message}`).join('; ');
      const error = new Error(fields || detail?.message || `Request failed (${response.status}). Please try again.`);
      error.status = response.status;
      throw error;
    }
    if (!payload) throw new Error('The server returned an unexpected response. Check the API connection.');
    return payload;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error.name === 'AbortError') throw new Error('The server took too long to respond. Please retry.');
    if (error instanceof TypeError) throw new Error('Unable to reach the backend. Check the connection and retry.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function fetchSummary(signal) {
  return api('/dashboard/summary', { signal });
}
