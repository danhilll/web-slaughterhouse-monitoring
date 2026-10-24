import {useEffect,useRef} from 'react';
import type {Position} from './trackingPolling';
import {parseMapPoint,parseDestinationPoint,type DestinationPoint} from './mapcn/position';
// Numeric display data only. Authorization/polling stays outside the renderer.
export function DeliveryMap({position=null,destination=null,dropOff=null}:{position?:Position|null;destination?:DestinationPoint|null;dropOff?:DestinationPoint|null}){
 const frame=useRef<HTMLIFrameElement>(null);
 const point=position?parseMapPoint({latitude:position.latitude,longitude:position.longitude,accuracyMeters:position.accuracyMeters}):null;
 const target=destination?parseDestinationPoint({latitude:destination.latitude,longitude:destination.longitude}):null;
 const unloading=dropOff?parseDestinationPoint({latitude:dropOff.latitude,longitude:dropOff.longitude}):null;
 const send=()=>frame.current?.contentWindow?.postMessage({position:point,destination:target,dropOff:unloading},window.location.origin);
 useEffect(()=>{const ready=(event:MessageEvent)=>{if(event.source===frame.current?.contentWindow&&event.origin===window.location.origin&&event.data==='mapcn-ready')send();};window.addEventListener('message',ready);send();return()=>window.removeEventListener('message',ready);},[position?.latitude,position?.longitude,position?.accuracyMeters,destination?.latitude,destination?.longitude,dropOff?.latitude,dropOff?.longitude]);
 if(!point&&!target&&!unloading)return <p role="status">No authorized shared position or verified destination available.</p>;
 return <div><iframe ref={frame} title="Delivery destination, drop-off and last shared position" src="/mapcn.html" onLoad={send} referrerPolicy="origin" sandbox="allow-scripts allow-same-origin" className="delivery-map-frame w-full rounded-lg border-0"/><p className="text-xs">Online map. Car: Delivery Staff (last shared GPS). Red pin: Market destination. Blue pin: Drop-off point. None is automatic live phone GPS or proof of arrival.</p></div>;
}
