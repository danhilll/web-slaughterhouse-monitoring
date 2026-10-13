export type Position = { latitude: number; longitude: number; accuracyMeters: number; capturedAt: string; receivedAt: string };
export type Tracking = { invoiceId: string; deliveryStatus: string; trackingState: string; location: Position | null; serverTime: string; updateIntervalSeconds: number };
export function validateTracking(body: Tracking, invoiceId: string): Tracking {
  const p = body.location;
  if (body.invoiceId !== invoiceId || !Number.isFinite(Date.parse(body.serverTime)) ||
      !['unassigned', 'assigned', 'in_transit', 'delivered'].includes(body.deliveryStatus) ||
      !['completed', 'not_started', 'waiting', 'stale', 'recent'].includes(body.trackingState) ||
      p === undefined || (p && (!Number.isFinite(p.latitude) || Math.abs(p.latitude) > 90 ||
      !Number.isFinite(p.longitude) || Math.abs(p.longitude) > 180 || !Number.isFinite(p.accuracyMeters) || p.accuracyMeters < 0 ||
      !Number.isFinite(Date.parse(p.capturedAt)) || !Number.isFinite(Date.parse(p.receivedAt))))) throw new Error('Tracking response requires review.');
  return body;
}
export function trackingLabel(data: Tracking | null, error: string, age: number | null): string {
  if (error) return 'Connection unavailable';
  if (!data) return 'Loading location…';
  if (data.deliveryStatus === 'delivered') return 'Delivery completed';
  if (data.deliveryStatus !== 'in_transit') return 'Tracking not started';
  if (!data.location) return 'Waiting for location';
  return age !== null && age > 45 ? 'Location outdated' : 'Recent location';
}
// Closing/hiding cancels requests; access loss removes the previous location.
export function startTrackingPolling(options: {
  invoiceId: string; request: (signal: AbortSignal) => Promise<Response>;
  onData: (data: Tracking | null) => void; onError: (message: string) => void;
  visibility: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
  interval?: number; timeout?: number;
}) {
  let disposed = false, pending = false, ended = false, retryAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined;
  const schedule = () => {
    if (!disposed && !ended && !options.visibility.hidden)
      timer = setTimeout(() => void poll(), Math.max(options.interval ?? 10000, retryAt - Date.now()));
  };
  async function poll() {
    if (disposed || pending || ended || options.visibility.hidden) return;
    if (Date.now() < retryAt) { schedule(); return; }
    pending = true;
    const current = new AbortController(); controller = current;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; current.abort(); }, options.timeout ?? 8000);
    try {
      const response = await options.request(current.signal);
      if (disposed || current.signal.aborted) return;
      if ([401, 403, 404].includes(response.status)) { ended = true; options.onData(null); }
      if (response.status === 429) {
        const seconds = Number(response.headers.get('Retry-After'));
        if (Number.isFinite(seconds)) retryAt = Date.now() + Math.max(0, seconds * 1000);
      }
      const body = await response.json();
      if (disposed || current.signal.aborted) return;
      if (!response.ok) throw new Error(body.message || 'Tracking unavailable.');
      const data = validateTracking(body, options.invoiceId);
      ended = data.deliveryStatus === 'delivered'; options.onData(data); options.onError('');
    } catch (e) {
      if (!disposed && (timedOut || !current.signal.aborted))
        options.onError(timedOut ? 'Tracking request timed out. Retrying when visible.' : (e as Error).message);
    } finally { clearTimeout(timeout); pending = false; schedule(); }
  }
  const visible = () => { clearTimeout(timer); if (options.visibility.hidden) controller?.abort(); else void poll(); };
  options.visibility.addEventListener('visibilitychange', visible); void poll();
  return () => { disposed = true; controller?.abort(); clearTimeout(timer); options.visibility.removeEventListener('visibilitychange', visible); };
}
