import { Component, useCallback, useEffect, useRef, useState, type ReactNode, type MutableRefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { Map, MapMarker, MarkerContent, MapGeoJSON, useMap } from './map';
import type { StyleSpecification } from 'maplibre-gl';
import {Maximize2, Minus, Plus, RefreshCw} from 'lucide-react';
import {parseRendererMessage, markerBounds, tileRequest, straightLineMeters, distanceText, type MapPoint, type DestinationPoint, type MapMarkers, type MapTheme} from './position';
import {CarGlyph,PinGlyph,MARKER_COLORS,MARKER_LABELS} from './markerGlyphs';
import './renderer.css';
// Both themes use the existing OSM raster tiles (see README); dark mode restyles only the map chrome.
const style: StyleSpecification = {version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]};
const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
class Boundary extends Component<{children:ReactNode},{failed:boolean}> {
 state={failed:false}; static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<p role="alert" className="map-banner">Map unavailable on this device. Use the authorized coordinates in the workspace.</p>:this.props.children;}
}
type Status={loaded:boolean;tilesFailed:boolean};
// Fits the markers on first display and on each refresh until the viewer pans or zooms; after that the
// viewer's camera is kept. "Show all markers" fits again and resumes following. No device location is used.
function Camera({points,fitRequest,userMoved,onStatus}:{points:DestinationPoint[];fitRequest:number;userMoved:MutableRefObject<boolean>;onStatus:(s:Partial<Status>)=>void}) {
 const {map,isLoaded}=useMap();
 const key=points.map(p=>`${p.latitude},${p.longitude}`).join(';');
 const fit=useCallback(()=>{if(!map)return;const b=markerBounds(points);if(!b)return;
  // Keep markers clear of the floating controls (right) and the map key (bottom), using the key's real height.
  const small=map.getContainer().clientWidth<480,legendHeight=document.querySelector('.map-legend')?.getBoundingClientRect().height??0;
  const padding=small?{top:52,bottom:Math.round(legendHeight)+28,left:36,right:76}:{top:64,bottom:Math.round(legendHeight)+40,left:56,right:92};
  if(points.length>1)map.fitBounds(b,{padding,maxZoom:16,duration:0});else map.jumpTo({center:[points[0].longitude,points[0].latitude],zoom:Math.max(map.getZoom(),15)});
 },[map,key]);
 useEffect(()=>{if(!userMoved.current)fit();},[fit]);
 useEffect(()=>{if(fitRequest){userMoved.current=false;fit();}},[fitRequest]);
 useEffect(()=>{if(!map)return;
  const resize=()=>{if(!userMoved.current)fit();};
  const moved=(e:{originalEvent?:unknown})=>{if(e.originalEvent)userMoved.current=true;};
  // Tile/source failures are network or provider problems, reported apart from styling or marker issues.
  const error=(e:object)=>{const detail=e as {sourceId?:string;tile?:unknown};if(detail.sourceId==='osm'||detail.tile)onStatus({tilesFailed:true});};
  // Any camera change caused by an input event (drag, wheel, trackpad, keyboard) counts as the viewer's own view.
  const events=['movestart','zoomstart','rotatestart','pitchstart'] as const;
  map.on('resize',resize);for(const name of events)map.on(name,moved);map.on('error',error);
  return()=>{map.off('resize',resize);for(const name of events)map.off(name,moved);map.off('error',error);};
 },[map,fit,onStatus]);
 // MAPCN tracks load from map creation, so a load that happens before this component subscribes is not missed.
 useEffect(()=>{if(isLoaded)onStatus({loaded:true});},[isLoaded,onStatus]);
 return null;
}
function Controls({userMoved,onFitAll}:{userMoved:MutableRefObject<boolean>;onFitAll:()=>void}){
 const {map}=useMap();
 const zoom=(delta:number)=>{if(!map)return;userMoved.current=true;map.zoomTo(map.getZoom()+delta,{duration:reducedMotion()?0:250});};
 return <div className="map-controls"><div className="map-control-group" role="group" aria-label="Zoom">
  <button type="button" aria-label="Zoom in" title="Zoom in" onClick={()=>zoom(1)}><Plus size={18} aria-hidden="true"/></button>
  <button type="button" aria-label="Zoom out" title="Zoom out" onClick={()=>zoom(-1)}><Minus size={18} aria-hidden="true"/></button></div>
  <div className="map-control-group"><button type="button" aria-label="Show all markers" title="Show all markers" onClick={onFitAll}><Maximize2 size={17} aria-hidden="true"/></button></div></div>;
}
function accuracyArea(p:MapPoint):GeoJSON.Feature<GeoJSON.Polygon> {
 const lat=p.latitude*Math.PI/180,lon=p.longitude*Math.PI/180,d=p.accuracyMeters/6371008.8;
 const ring=Array.from({length:65},(_,i)=>{const b=i/64*2*Math.PI;
 const y=Math.asin(Math.sin(lat)*Math.cos(d)+Math.cos(lat)*Math.sin(d)*Math.cos(b));
 const x=lon+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(lat),Math.cos(d)-Math.sin(lat)*Math.sin(y));
 return [x*180/Math.PI,y*180/Math.PI];});
 return {type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[ring]}};
}
// Direction only: a straight line from the last shared position to where the delivery is headed. Not a road route;
// no routing service is called, so no coordinates leave this page beyond the existing map tiles.
function directionLine(from:MapPoint,to:DestinationPoint):GeoJSON.Feature<GeoJSON.LineString>{return {type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[from.longitude,from.latitude],[to.longitude,to.latitude]]}};}
function Attribution(){return <p className="attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> · <a href="/mapcn-licenses/MAPCN-LICENSE" target="_blank" rel="noopener noreferrer">Component license</a></p>;}
function Renderer(){
 const [markers,setMarkers]=useState<MapMarkers>({position:null,destination:null}),[theme,setTheme]=useState<MapTheme>('light');
 const [status,setStatus]=useState<Status>({loaded:false,tilesFailed:false}),[attempt,setAttempt]=useState(0),[fitRequest,setFitRequest]=useState(0);
 const userMoved=useRef(false);
 const point=markers.position,destination=markers.destination,dropOff=markers.dropOff??null,center=point??destination??dropOff;
 const target=destination??dropOff,targetLabel=destination?MARKER_LABELS.destination:MARKER_LABELS.dropOff,distance=point&&target?straightLineMeters(point,target):null;
 const points=[point,destination,dropOff].filter((p):p is DestinationPoint=>p!==null);
 const onStatus=useCallback((s:Partial<Status>)=>setStatus(prev=>({...prev,...s})),[]);
 useEffect(()=>{document.documentElement.dataset.theme=theme;},[theme]);
 useEffect(()=>{const receive=(event:MessageEvent)=>{if(event.source!==window.parent||event.origin!==window.location.origin)return;const message=parseRendererMessage(event.data);setMarkers(message?.markers??{position:null,destination:null});if(message)setTheme(message.theme);};
 const hide=()=>{if(document.hidden)setMarkers({position:null,destination:null});};
 window.addEventListener('message',receive);document.addEventListener('visibilitychange',hide);
 window.parent.postMessage('mapcn-ready',window.location.origin);
 return()=>{window.removeEventListener('message',receive);document.removeEventListener('visibilitychange',hide);};},[]);
 const retry=()=>{setStatus({loaded:false,tilesFailed:false});setAttempt(a=>a+1);};
 if(!center)return <main className="map-empty"><p role="status">No authorized shared position or verified destination available.</p><Attribution/></main>;
 return <main><Boundary><div className="mapcn-host">
  <Map key={attempt} theme="light" styles={{light:style,dark:style}} center={[center.longitude,center.latitude]} zoom={16} maxZoom={19}
   attributionControl={false} transformRequest={tileRequest} renderWorldCopies={false} cancelPendingTileRequestsWhileZooming={true} fadeDuration={0}>
   {point&&point.accuracyMeters>0&&point.accuracyMeters<20000000&&<MapGeoJSON data={accuracyArea(point)} fillPaint={{'fill-color':'#166534','fill-opacity':0.1}} linePaint={{'line-color':'#166534','line-width':1}}/>}
   {point&&target&&<MapGeoJSON data={directionLine(point,target)} fillPaint={false} linePaint={{'line-color':MARKER_COLORS.delivery,'line-width':2,'line-dasharray':[2,2]}}/>}
   <Camera points={points} fitRequest={fitRequest} userMoved={userMoved} onStatus={onStatus}/>
   <Controls userMoved={userMoved} onFitAll={()=>setFitRequest(n=>n+1)}/>
   {destination&&<MapMarker longitude={destination.longitude} latitude={destination.latitude} anchor="bottom"><MarkerContent><span className="map-glyph" role="img" aria-label={MARKER_LABELS.destination}><PinGlyph fill={MARKER_COLORS.destination}/></span></MarkerContent></MapMarker>}
   {dropOff&&<MapMarker longitude={dropOff.longitude} latitude={dropOff.latitude} anchor="bottom"><MarkerContent><span className="map-glyph" role="img" aria-label={MARKER_LABELS.dropOff}><PinGlyph fill={MARKER_COLORS.dropOff}/></span></MarkerContent></MapMarker>}
   {point&&<MapMarker longitude={point.longitude} latitude={point.latitude}><MarkerContent><span className="map-glyph" role="img" aria-label={MARKER_LABELS.delivery}><CarGlyph/></span></MarkerContent></MapMarker>}
  </Map>
  {!status.loaded&&!status.tilesFailed&&<p className="map-banner" role="status">Loading map…</p>}
  {status.tilesFailed&&<div className="map-banner is-error" role="alert"><span>Map tiles could not load. Markers and the coordinates in the workspace are still correct.</span><button type="button" onClick={retry}><RefreshCw size={14} aria-hidden="true"/>Retry map</button></div>}
  <ul className="map-legend" aria-label="Map key">
   {point&&<li><CarGlyph size={18}/><span>{MARKER_LABELS.delivery}</span></li>}
   {destination&&<li><PinGlyph fill={MARKER_COLORS.destination} size={18}/><span>{MARKER_LABELS.destination}</span></li>}
   {dropOff&&<li><PinGlyph fill={MARKER_COLORS.dropOff} size={18}/><span>{MARKER_LABELS.dropOff}</span></li>}
   {distance!==null&&<li><span className="route-key" aria-hidden="true"/><span>Direction to {targetLabel} · {distanceText(distance)} straight line, not a road route</span></li>}
  </ul>
  <Attribution/>
 </div></Boundary></main>;
}
createRoot(document.getElementById('root')!).render(<Renderer/>);
