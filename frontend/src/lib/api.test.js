import { api } from './api';

test('surfaces the backend validation message without exposing the input body', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: { message: 'Invalid request', fields: [{ location: ['body', 'latitude'], message: 'Must be less than or equal to 90' }] } }) });
  await expect(api('/events/nearby')).rejects.toMatchObject({ status: 422, message: 'latitude: Must be less than or equal to 90' });
});

test('times out an unresponsive backend with an actionable error', async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn((_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
  const request = expect(api('/health')).rejects.toThrow('The server took too long');
  jest.advanceTimersByTime(12000);
  await request;
  jest.useRealTimers();
});
