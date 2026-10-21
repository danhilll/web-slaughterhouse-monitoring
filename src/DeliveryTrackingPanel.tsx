import { useEffect, useState } from 'react';
import { apiFetch } from './api';
import { DeliveryMap } from './DeliveryMap';
import { startTrackingPolling, trackingLabel, type Tracking } from './trackingPolling';
export function DeliveryTrackingPanel({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const [data, setData] = useState<Tracking | null>(null), [error, setError] = useState('');
  const [clock, setClock] = useState(Date.now()), [receivedAt, setReceivedAt] = useState(Date.now());
  const [visible, setVisible] = useState(!document.hidden), [showMap, setShowMap] = useState(false);
  useEffect(() => {
    setData(null); setError(''); setShowMap(false);
    const stop = startTrackingPolling({ invoiceId, visibility: document,
      request: signal => apiFetch(`/api/operations/invoices/${encodeURIComponent(invoiceId)}/tracking`, { signal }),
      onData: body => { setData(body); setReceivedAt(Date.now()); setClock(Date.now()); }, onError: setError,
    });
    const visibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibility);
    const tick = setInterval(() => { if (!document.hidden) setClock(Date.now()); }, 1000);
    return () => { stop(); clearInterval(tick); document.removeEventListener('visibilitychange', visibility); };
  }, [invoiceId]);
  const current = data?.invoiceId === invoiceId ? data : null;
  const position = current?.location;
  const age = position && current ? Math.max(0, Math.floor((Date.parse(current.serverTime) - Date.parse(position.capturedAt) + clock - receivedAt) / 1000)) : null;
  return <section className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
    <div className="flex items-center justify-between gap-3"><h4 className="font-semibold">Delivery tracking</h4><button className="btn-secondary" onClick={onClose}>Close tracking</button></div>
    <p role="status" className="mt-3 font-medium">{trackingLabel(current, error, age)}</p>
    {position && <>
      <button className="btn-secondary mt-3" onClick={() => setShowMap(!showMap)}>{showMap ? 'Hide map' : 'Show map'}</button>
      <p className="mt-1 text-xs">This is not the destination or this device’s current position. Opening the map requests this area from OpenStreetMap. Account and invoice details are not sent.</p>
      {showMap && visible && <DeliveryMap position={position} />}
      <p className="mt-2">Last shared delivery position: {position.latitude}, {position.longitude}</p>
      <p className="text-sm">Accuracy ±{Math.round(position.accuracyMeters)} m{position.accuracyMeters > 100 ? ' — approximate position' : ''}</p>
      <p className="text-sm">Captured {age} seconds ago · {new Date(position.capturedAt).toLocaleString()}</p>
    </>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error} Any position shown is the last received location.</p>}
    <p className="mt-3 text-xs text-slate-500">Refreshes every 10 seconds while visible. The phone shares periodic positions while its tracking screen is open. This is not continuous or screen-off tracking, or proof of arrival.</p>
  </section>;
}
