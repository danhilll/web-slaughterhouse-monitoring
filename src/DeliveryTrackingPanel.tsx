import { useEffect, useState } from 'react';
import { apiFetch } from './api';
import {parseDestinationView,type DestinationView} from './destinationMap';
import { DeliveryMap } from './DeliveryMap';
import { startTrackingPolling, trackingLabel, type Tracking } from './trackingPolling';
export function DeliveryTrackingPanel({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const [data, setData] = useState<Tracking | null>(null), [error, setError] = useState('');
  const [destination,setDestination]=useState<DestinationView|null>(null),[destinationError,setDestinationError]=useState(''),[destinationLoading,setDestinationLoading]=useState(false),[destinationRefresh,setDestinationRefresh]=useState(0);
  useEffect(()=>{const controller=new AbortController();setDestination(null);setDestinationError('');setDestinationLoading(true);const timeout=setTimeout(()=>{controller.abort();setDestinationLoading(false);setDestinationError('Destination request timed out. Shared-position tracking is independent.');},8000);void(async()=>{try{const r=await apiFetch(`/api/operations/invoices/${encodeURIComponent(invoiceId)}/destination-map`,{signal:controller.signal});if(!r.ok)throw Error(r.status===404?'Destination map requires the compatible server update or authorized assignment.':'Destination verification could not be loaded.');const d=parseDestinationView(await r.json(),invoiceId);if(!controller.signal.aborted)setDestination(d);}catch(e){if(!controller.signal.aborted)setDestinationError((e as Error).message);}finally{clearTimeout(timeout);if(!controller.signal.aborted)setDestinationLoading(false);}})();return()=>{clearTimeout(timeout);controller.abort();};},[invoiceId,destinationRefresh]);
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
  const verifiedDestination=destination?.invoiceId===invoiceId?destination.destination:null;
  const age = position && current ? Math.max(0, Math.floor((Date.parse(current.serverTime) - Date.parse(position.capturedAt) + clock - receivedAt) / 1000)) : null;
  return <section className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
    <div className="flex items-center justify-between gap-3"><h4 className="font-semibold">Delivery tracking</h4><button className="btn-secondary" onClick={onClose}>Close tracking</button></div>
    <p role="status" className="mt-3 font-medium">{trackingLabel(current, error, age)}</p>
    <p role="status">{destinationLoading?'Loading verified destination…':verifiedDestination?`Verified destination · confirmed ${verifiedDestination.verifiedAt}`:'Text-only destination: no verified coordinate pin available.'}</p><button className="btn-secondary" onClick={()=>setDestinationRefresh(v=>v+1)}>Refresh destination pin</button>{destinationError&&<p role="alert">{destinationError} Shared-position tracking is independent.</p>}
    {(position||verifiedDestination)&&<><button className="btn-secondary mt-3" onClick={()=>setShowMap(!showMap)}>{showMap?'Hide map':'Show map'}</button><p className="text-xs">Markers distinguish the verified destination from the last shared delivery position. No automatic live-device preview.</p>{showMap&&visible&&<DeliveryMap position={position} destination={verifiedDestination}/>}</>}
    {position && <>
      <p className="mt-1 text-xs">The shared-position marker is not this device’s current position. Opening the map requests this area from OpenStreetMap. Account and invoice details are not sent.</p>
      <p className="mt-2">Last shared delivery position: {position.latitude}, {position.longitude}</p>
      <p className="text-sm">Accuracy ±{Math.round(position.accuracyMeters)} m{position.accuracyMeters > 100 ? ' — approximate position' : ''}</p>
      <p className="text-sm">Captured {age} seconds ago · {new Date(position.capturedAt).toLocaleString()}</p>
    </>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error} Any position shown is the last received location.</p>}
    <p className="mt-3 text-xs text-slate-500">Refreshes every 10 seconds while visible. The phone shares periodic positions while its tracking screen is open. This is not continuous or screen-off tracking, or proof of arrival.</p>
  </section>;
}
