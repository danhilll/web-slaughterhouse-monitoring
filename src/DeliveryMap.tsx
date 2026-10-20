import { useEffect, useRef } from 'react';
import type { Position } from './trackingPolling';
import { parseMapPoint } from './mapcn/position';
// API polling/authorization stays with DeliveryTrackingPanel. Never forward identity data.
export function DeliveryMap({ position }: { position: Position }) {
 const frame = useRef<HTMLIFrameElement>(null);
 const point = parseMapPoint({latitude:position.latitude,longitude:position.longitude,accuracyMeters:position.accuracyMeters});
 const send = () => frame.current?.contentWindow?.postMessage(point, window.location.origin);
 useEffect(() => {
 const ready=(event:MessageEvent)=>{if(event.source===frame.current?.contentWindow&&event.origin===window.location.origin&&event.data==='mapcn-ready')send();};
 window.addEventListener('message',ready);send();
 return()=>window.removeEventListener('message',ready);
 }, [position.latitude,position.longitude,position.accuracyMeters]);
 if (!point) return <p role="status">No authorized position available.</p>;
 return <div className="mt-3"><iframe ref={frame} title="Latest reported delivery position" src="/mapcn.html" onLoad={send}
 referrerPolicy="origin" sandbox="allow-scripts allow-same-origin" className="h-80 w-full rounded-lg border-0" />
 <p className="text-xs">Online map; no offline support. The position is reported, not proof of arrival.</p></div>;
}
