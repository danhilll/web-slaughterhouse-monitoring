import { useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';
import {parseDestinationView,type DestinationView} from './destinationMap';
import {parseDropOffView,DROP_OFF_LABEL,DROP_OFF_EXPLANATION,type DropOffView} from './dropOffPoint';
import { DeliveryMap } from './DeliveryMap';
import { manilaTime } from './displayTime';
import { startTrackingPolling, trackingLabel, type Tracking } from './trackingPolling';
export function DeliveryTrackingPanel({ invoiceId, onClose, deliveryCompleted = false, onCompleted }: { invoiceId: string; onClose: () => void; deliveryCompleted?: boolean; onCompleted?: (invoiceId: string) => void }) {
  const [data, setData] = useState<Tracking | null>(null), [error, setError] = useState('');
  const [destination,setDestination]=useState<DestinationView|null>(null),[destinationError,setDestinationError]=useState(''),[destinationLoading,setDestinationLoading]=useState(false),[destinationRefresh,setDestinationRefresh]=useState(0);
  useEffect(()=>{const controller=new AbortController();setDestinationError('');setDestinationLoading(true);const timeout=setTimeout(()=>{controller.abort();setDestinationLoading(false);setDestinationError('Destination request timed out. Saved pin freshness is unconfirmed.');},8000);void(async()=>{try{const r=await apiFetch(`/api/operations/invoices/${encodeURIComponent(invoiceId)}/destination-map`,{signal:controller.signal});if(controller.signal.aborted)return;if([401,403,404].includes(r.status)){setDestination(null);throw Error('Destination access is unavailable.');}if(!r.ok)throw Error('Destination refresh failed; saved pin freshness is unconfirmed.');const d=parseDestinationView(await r.json(),invoiceId);if(!controller.signal.aborted)setDestination(d);}catch(e){if(!controller.signal.aborted)setDestinationError((e as Error).message);}finally{clearTimeout(timeout);if(!controller.signal.aborted)setDestinationLoading(false);}})();return()=>{clearTimeout(timeout);controller.abort();};},[invoiceId,destinationRefresh]);
  const [dropOff,setDropOff]=useState<DropOffView|null>(null),[dropOffError,setDropOffError]=useState(''),[dropOffLoading,setDropOffLoading]=useState(false),[dropOffRefresh,setDropOffRefresh]=useState(0);
  useEffect(()=>{const c=new AbortController();setDropOffError('');setDropOffLoading(true);const timer=setTimeout(()=>{c.abort();setDropOffLoading(false);setDropOffError('Drop-off request timed out. Saved pin freshness is unconfirmed.');},8000);void(async()=>{try{const r=await apiFetch(`/api/operations/invoices/${encodeURIComponent(invoiceId)}/drop-off-point`,{signal:c.signal});if(c.signal.aborted)return;if([401,403,404].includes(r.status)){setDropOff(null);throw Error('Drop-off access is unavailable.');}if(!r.ok)throw Error('Drop-off refresh failed; saved pin freshness is unconfirmed.');const v=parseDropOffView(await r.json(),invoiceId);if(!c.signal.aborted)setDropOff(v);}catch(e){if(!c.signal.aborted)setDropOffError((e as Error).message);}finally{clearTimeout(timer);if(!c.signal.aborted)setDropOffLoading(false);}})();return()=>{c.abort();clearTimeout(timer);};},[invoiceId,dropOffRefresh]);
  const [clock, setClock] = useState(Date.now()), [receivedAt, setReceivedAt] = useState(Date.now());
  const [visible, setVisible] = useState(!document.hidden), [showMap, setShowMap] = useState(false), [detailsOpen, setDetailsOpen] = useState(true);
  const completedRef = useRef(deliveryCompleted);
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;
  if (deliveryCompleted) completedRef.current = true;
  useEffect(() => {
    completedRef.current = deliveryCompleted;
    setData(null); setError(''); setShowMap(false); setDetailsOpen(true);
  }, [invoiceId]);
  useEffect(() => {
    if (deliveryCompleted) completedRef.current = true;
    const tick = deliveryCompleted ? undefined : setInterval(() => { if (!document.hidden) setClock(Date.now()); }, 1000);
    const stop = deliveryCompleted ? () => {} : startTrackingPolling({ invoiceId, visibility: document,
      request: signal => apiFetch(`/api/operations/invoices/${encodeURIComponent(invoiceId)}/tracking`, { signal }),
      onData: body => { if (body?.deliveryStatus === 'delivered') { completedRef.current = true; if (tick) clearInterval(tick); onCompletedRef.current?.(invoiceId); } if (!completedRef.current || body?.deliveryStatus === 'delivered') setData(body); setReceivedAt(Date.now()); setClock(Date.now()); }, onError: message => { if (!completedRef.current) setError(message); },
    });
    const visibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => { stop(); if (tick) clearInterval(tick); document.removeEventListener('visibilitychange', visibility); };
  }, [invoiceId, deliveryCompleted]);
  const current = data?.invoiceId === invoiceId ? data : null;
  const completed = deliveryCompleted || completedRef.current || current?.deliveryStatus === 'delivered';
  const position = completed ? null : current?.location;
  const verifiedDestination=destination?.invoiceId===invoiceId?destination.destination:null;
  const savedDropOff=dropOff?.invoiceId===invoiceId?dropOff.point:null;
  // An open map sits beside the compact details where the panel is wide, and above them where it is narrow.
  const mapOpen = showMap && visible && Boolean(position || verifiedDestination || savedDropOff);
  const age = position && current ? Math.max(0, Math.floor((Date.parse(current.serverTime) - Date.parse(position.capturedAt) + clock - receivedAt) / 1000)) : null;
  const hasPins = Boolean(position || verifiedDestination || savedDropOff);
  const statusText = completed ? 'Delivery completed' : trackingLabel(current, error, age);
  // Phone width: opening the map collapses the details beneath it; they stay one tap away.
  const toggleMap = () => { const next = !showMap; setShowMap(next); if (next && window.matchMedia?.('(max-width: 700px)').matches) setDetailsOpen(false); };
  return <section className="tracking-panel mt-4" aria-label="Delivery tracking">
    <div className="tracking-head"><h4 className="font-semibold">Delivery tracking</h4><div className="tracking-head-actions">{hasPins&&<button className="btn-secondary" aria-expanded={showMap} onClick={toggleMap}>{showMap?'Hide map':'Show map'}</button>}<button className="btn-secondary" onClick={onClose}>Close tracking</button></div></div>
    <div className={`tracking-layout${mapOpen?' has-map':''}`}>
    {mapOpen&&<div className="tracking-map"><DeliveryMap position={position} destination={verifiedDestination} dropOff={savedDropOff}/></div>}
    <details className="tracking-summary" open={detailsOpen} onToggle={event=>setDetailsOpen((event.currentTarget as HTMLDetailsElement).open)}>
    <summary><span>Delivery details</span>{!detailsOpen&&<span className="tracking-summary-hint">· {statusText}</span>}</summary>
    <div className="tracking-facts">
    <div className="tracking-fact"><span className="tracking-key">Status</span><p role="status" className="font-medium">{statusText}</p></div>
    {position && <div className="tracking-fact"><span className="tracking-key"><span className="tracking-dot is-car" aria-hidden="true"/>Delivery Staff (last shared GPS)</span>
      <p>Last shared delivery position: {position.latitude}, {position.longitude}</p>
      <p className="text-sm">Accuracy ±{Math.round(position.accuracyMeters)} m{position.accuracyMeters > 100 ? ' — approximate position' : ''}</p>
      <p className="text-sm">Captured {age} seconds ago · {manilaTime(position.capturedAt)}</p></div>}
    <div className="tracking-fact"><span className="tracking-key"><span className="tracking-dot is-destination" aria-hidden="true"/>Market destination</span>
      <p role="status">{destinationLoading?'Loading verified destination…':verifiedDestination?`Verified destination · confirmed ${manilaTime(verifiedDestination.verifiedAt)}`:destinationError?'Destination pin availability unconfirmed.':'Text-only destination: no verified coordinate pin available.'}</p>
      {destinationError&&<p role="alert">{destinationError} Shared-position tracking is independent.</p>}<button className="btn-secondary tracking-small-button" onClick={()=>setDestinationRefresh(v=>v+1)}>Refresh destination pin</button></div>
    <div className="tracking-fact"><span className="tracking-key"><span className="tracking-dot is-dropoff" aria-hidden="true"/>{DROP_OFF_LABEL}</span>
      <p role="status">{dropOffLoading?'Loading optional drop-off point…':savedDropOff?`Saved ${manilaTime(savedDropOff.selectedAt)} · ${savedDropOff.latitude}, ${savedDropOff.longitude}`:dropOffError?'Drop-off pin availability unconfirmed.':'No optional drop-off point selected. Delivery may proceed without it.'}</p>
      {dropOffError&&<p role="alert">{dropOffError}</p>}<p className="text-xs">{DROP_OFF_EXPLANATION}</p><button className="btn-secondary tracking-small-button" onClick={()=>setDropOffRefresh(v=>v+1)}>Refresh drop-off point</button></div>
    {error && !completed && <p role="alert" className="text-sm text-red-700">{error} Any position shown is the last received location.</p>}
    <div className="tracking-notes">
    {hasPins&&<p className="text-xs">Map key: green car = Delivery Staff (last shared GPS) · red pin = Market destination · blue pin = Drop-off point · dashed line = straight-line direction, not a road route. No automatic live-device preview.</p>}
    {position&&<p className="text-xs">The car marker is the last shared position, not this device’s current position. Opening the map requests this area from OpenStreetMap. Account and invoice details are not sent.</p>}
    <p className="text-xs">{completed ? 'Tracking ended. Saved destination and drop-off pins remain available; historical positions are not shown as current.' : 'Refreshes every 10 seconds while visible. The phone shares periodic positions while its tracking screen is open. This is not continuous or screen-off tracking, or proof of arrival.'}</p>
    </div></div></details></div>
  </section>;
}
