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
