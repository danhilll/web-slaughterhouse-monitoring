import {useEffect,useRef,useState} from 'react';
import type {Position} from './trackingPolling';
import {parseMapPoint,parseDestinationPoint,type DestinationPoint} from './mapcn/position';
const currentTheme=()=>document.documentElement.classList.contains('dark')?'dark':'light';
// Numeric display data and the display theme only. Authorization/polling stays outside the renderer.
export function DeliveryMap({position=null,destination=null,dropOff=null}:{position?:Position|null;destination?:DestinationPoint|null;dropOff?:DestinationPoint|null}){
 const frame=useRef<HTMLIFrameElement>(null),[theme,setTheme]=useState(currentTheme);
 useEffect(()=>{const watch=new MutationObserver(()=>setTheme(currentTheme()));watch.observe(document.documentElement,{attributes:true,attributeFilter:['class']});return()=>watch.disconnect();},[]);
 const point=position?parseMapPoint({latitude:position.latitude,longitude:position.longitude,accuracyMeters:position.accuracyMeters}):null;
 const target=destination?parseDestinationPoint({latitude:destination.latitude,longitude:destination.longitude}):null;
 const unloading=dropOff?parseDestinationPoint({latitude:dropOff.latitude,longitude:dropOff.longitude}):null;
 const send=()=>frame.current?.contentWindow?.postMessage({position:point,destination:target,dropOff:unloading,theme},window.location.origin);
 useEffect(()=>{const ready=(event:MessageEvent)=>{if(event.source===frame.current?.contentWindow&&event.origin===window.location.origin&&event.data==='mapcn-ready')send();};window.addEventListener('message',ready);send();return()=>window.removeEventListener('message',ready);},[position?.latitude,position?.longitude,position?.accuracyMeters,destination?.latitude,destination?.longitude,dropOff?.latitude,dropOff?.longitude,theme]);
 if(!point&&!target&&!unloading)return <p role="status">No authorized shared position or verified destination available.</p>;
 return <iframe ref={frame} title="Delivery map: destination, drop-off and last shared position" src="/mapcn.html" onLoad={send} referrerPolicy="origin" sandbox="allow-scripts allow-same-origin" className="delivery-map-frame"/>;
}
