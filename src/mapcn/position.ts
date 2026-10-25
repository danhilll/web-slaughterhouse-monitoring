// Only numeric display data crosses the renderer boundary. No arbitrary keys/URLs.
export type MapPoint = { latitude: number; longitude: number; accuracyMeters: number };
export function parseMapPoint(value: unknown): MapPoint | null {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
 const v = value as Record<string, unknown>;
 if (Object.keys(v).sort().join(',') !== 'accuracyMeters,latitude,longitude') return null;
 const {latitude, longitude, accuracyMeters} = v;
 if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude)>90 ||
 typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude)>180 ||
 typeof accuracyMeters !== 'number' || !Number.isFinite(accuracyMeters) || accuracyMeters<0 || accuracyMeters>1000) return null;
 return {latitude,longitude,accuracyMeters};
}
export function tileRequest(url: string) {
 const match=/^https:\/\/tile\.openstreetmap\.org\/(\d{1,2})\/(\d+)\/(\d+)\.png$/.exec(url);
 if (!match) throw new Error('Map resource blocked');
 const [z,x,y]=match.slice(1).map(Number);
 if(z>19 || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x>=2**z || y>=2**z) throw new Error('Map resource blocked');
 return {url, credentials:'same-origin' as const, referrerPolicy:'origin' as const};
}

export type DestinationPoint={latitude:number;longitude:number};
export type MapMarkers={position:MapPoint|null;destination:DestinationPoint|null;dropOff?:DestinationPoint|null};
export function parseDestinationPoint(value:unknown):DestinationPoint|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;if(Object.keys(v).sort().join(',')!=='latitude,longitude'||typeof v.latitude!=='number'||!Number.isFinite(v.latitude)||Math.abs(v.latitude)>90||typeof v.longitude!=='number'||!Number.isFinite(v.longitude)||Math.abs(v.longitude)>180)return null;
 return {latitude:v.latitude,longitude:v.longitude};
}
export function parseMapMarkers(value:unknown):MapMarkers|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 const keys=Object.keys(v).sort().join(',');if(!['destination,position','destination,dropOff,position'].includes(keys)){const legacy=parseMapPoint(value);return legacy?{position:legacy,destination:null}:null;}
 const position=v.position===null?null:parseMapPoint(v.position),destination=v.destination===null?null:parseDestinationPoint(v.destination);
 if(v.position!==null&&!position||v.destination!==null&&!destination)return null;const dropOff=v.dropOff===undefined||v.dropOff===null?null:parseDestinationPoint(v.dropOff);if(v.dropOff!==undefined&&v.dropOff!==null&&!dropOff)return null;return keys==='destination,position'?{position,destination}:{position,destination,dropOff};
}

/** Great-circle distance in metres (display only; not a road route). */
export function straightLineMeters(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}){
 const r=Math.PI/180,dLat=(b.latitude-a.latitude)*r,dLon=(b.longitude-a.longitude)*r;
 const h=Math.sin(dLat/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(dLon/2)**2;
 return 2*6371008.8*Math.asin(Math.min(1,Math.sqrt(h)));
}
export const distanceText=(m:number)=>m<1000?`${Math.round(m/10)*10} m`:`${(m/1000).toFixed(m<10000?1:0)} km`;

export type MapTheme='light'|'dark';
/** Renderer message: the marker payload, optionally with a display theme. Any other key or value is rejected. */
export function parseRendererMessage(value:unknown):{markers:MapMarkers;theme:MapTheme}|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const {theme,...rest}=value as Record<string,unknown>;
 if(theme!==undefined&&theme!=='light'&&theme!=='dark')return null;
 const markers=parseMapMarkers(rest);
 return markers?{markers,theme:theme==='dark'?'dark':'light'}:null;
}
/** Bounds with padding for fitting every marker; null when there is nothing to fit. */
export function markerBounds(points:{latitude:number;longitude:number}[]):[[number,number],[number,number]]|null{
 if(!points.length)return null;
 return [[Math.min(...points.map(p=>p.longitude)),Math.min(...points.map(p=>p.latitude))],[Math.max(...points.map(p=>p.longitude)),Math.max(...points.map(p=>p.latitude))]];
}
