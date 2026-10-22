import { Component, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Map, MapMarker, MarkerContent, MapGeoJSON, useMap } from './map';
import type { StyleSpecification } from 'maplibre-gl';
import {parseMapMarkers, tileRequest, type MapPoint, type DestinationPoint,type MapMarkers} from './position';
import './renderer.css';
const style: StyleSpecification = {version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]};
class Boundary extends Component<{children:ReactNode},{failed:boolean}> {
 state={failed:false}; static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<p role="alert">Map unavailable on this device. Use the authorized coordinates in the workspace.</p>:this.props.children;}
}
function Updates({point,destination,dropOff,onFailure}:{point:MapPoint|null;destination:DestinationPoint|null;dropOff:DestinationPoint|null;onFailure:()=>void}) {
 const {map}=useMap();
 useEffect(()=>{if(!map)return;const all=[point,destination,dropOff].filter((p):p is DestinationPoint=>p!==null);if(all.length>1)map.fitBounds([[Math.min(...all.map(p=>p.longitude)),Math.min(...all.map(p=>p.latitude))],[Math.max(...all.map(p=>p.longitude)),Math.max(...all.map(p=>p.latitude))]],{padding:50,maxZoom:16,duration:0});else if(all[0])map.jumpTo({center:[all[0].longitude,all[0].latitude]});},[map,point?.latitude,point?.longitude,destination?.latitude,destination?.longitude,dropOff?.latitude,dropOff?.longitude]);
 useEffect(()=>{if(!map)return; map.on('error',onFailure); return ()=>{map.off('error',onFailure);};},[map,onFailure]);
 return null;
}
function accuracyArea(p:MapPoint):GeoJSON.Feature<GeoJSON.Polygon> {
 const lat=p.latitude*Math.PI/180,lon=p.longitude*Math.PI/180,d=p.accuracyMeters/6371008.8;
 const ring=Array.from({length:65},(_,i)=>{const b=i/64*2*Math.PI;
 const y=Math.asin(Math.sin(lat)*Math.cos(d)+Math.cos(lat)*Math.sin(d)*Math.cos(b));
 const x=lon+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(lat),Math.cos(d)-Math.sin(lat)*Math.sin(y));
 return [x*180/Math.PI,y*180/Math.PI];});
 return {type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[ring]}};
}
function Renderer(){
 const [markers,setMarkers]=useState<MapMarkers>({position:null,destination:null}),[failed,setFailed]=useState(false);const point=markers.position,destination=markers.destination,dropOff=markers.dropOff??null,center=point??destination??dropOff;
 useEffect(()=>{const receive=(event:MessageEvent)=>{if(event.source!==window.parent||event.origin!==window.location.origin)return;setMarkers(parseMapMarkers(event.data)??{position:null,destination:null});setFailed(false);};
 const hide=()=>{if(document.hidden)setMarkers({position:null,destination:null});};
 window.addEventListener('message',receive);document.addEventListener('visibilitychange',hide);
 window.parent.postMessage('mapcn-ready',window.location.origin);
 return()=>{window.removeEventListener('message',receive);document.removeEventListener('visibilitychange',hide);};},[]);
 return <main>{center?<><Boundary><div className="mapcn-host"><Map theme="light" styles={{light:style,dark:style}} center={[center.longitude,center.latitude]} zoom={16} maxZoom={19}
 attributionControl={false} transformRequest={tileRequest} renderWorldCopies={false} cancelPendingTileRequestsWhileZooming={true} fadeDuration={0}>
 {point&&point.accuracyMeters>0&&point.accuracyMeters<20000000&&<MapGeoJSON data={accuracyArea(point)} fillPaint={{'fill-color':'#166534','fill-opacity':0.1}} linePaint={{'line-color':'#166534','line-width':1}}/>}<Updates point={point} destination={destination} dropOff={dropOff} onFailure={()=>setFailed(true)}/>{point&&<MapMarker longitude={point.longitude} latitude={point.latitude}><MarkerContent><span className="reported-point" aria-label="Last shared delivery position"/></MarkerContent></MapMarker>}{destination&&<MapMarker longitude={destination.longitude} latitude={destination.latitude}><MarkerContent><span className="destination-point" aria-label="Verified destination"/></MarkerContent></MapMarker>}
 {dropOff&&<MapMarker longitude={dropOff.longitude} latitude={dropOff.latitude}><MarkerContent><span className="drop-off-point" aria-label="Drop-off point—selected by Delivery Staff."/></MarkerContent></MapMarker>}
 </Map></div></Boundary>{point&&<p>Last shared delivery position · reported accuracy ±{Math.round(point.accuracyMeters)} m.</p>}{destination&&<p>Verified destination · Inspector-confirmed market/stall pin.</p>}{dropOff&&<p>Drop-off point—selected by Delivery Staff. Entrance/unloading point; final handover at assigned vendor stall.</p>}</>:<p role="status">No authorized shared position or verified destination available.</p>}
 <p className="attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> · Online map · <a href="/mapcn-licenses/MAPCN-LICENSE" target="_blank" rel="noopener noreferrer">Component license</a></p>
 {failed&&<p role="alert">Map network unavailable. Authorized coordinates remain available in the workspace.</p>}</main>;
}
createRoot(document.getElementById('root')!).render(<Renderer/>);
