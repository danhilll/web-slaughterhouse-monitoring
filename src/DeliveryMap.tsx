import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Position } from './trackingPolling';
export function DeliveryMap({ position }: { position: Position }) {
  const container = useRef<HTMLDivElement>(null);
  const layers = useRef<{ map: L.Map; marker: L.CircleMarker; accuracy: L.Circle }>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, { scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, keepBuffer: 0, updateWhenIdle: true, updateWhenZooming: false,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).on('tileerror', () => setFailed(true)).addTo(map);
    const marker = L.circleMarker([0, 0], { radius: 8, color: '#166534', fillColor: '#84cc16', fillOpacity: 1 }).addTo(map);
    marker.bindTooltip('Last reported delivery position');
    const accuracy = L.circle([0, 0], { radius: 0, color: '#166534', weight: 1, fillOpacity: 0.1 }).addTo(map);
    layers.current = { map, marker, accuracy };
    return () => { layers.current = undefined; map.remove(); };
  }, []);
  useEffect(() => {
    const layer = layers.current;
    if (!layer) return;
    const point: L.LatLngTuple = [position.latitude, position.longitude];
    layer.marker.setLatLng(point); layer.accuracy.setLatLng(point).setRadius(position.accuracyMeters);
    layer.map.setView(point, layer.map.getZoom() ?? 16, { animate: false });
  }, [position.latitude, position.longitude, position.accuracyMeters]);
  return <div className="mt-3">
    <div ref={container} role="img" aria-label="Map of the latest reported delivery position and accuracy radius" className="relative z-0 h-72 rounded-lg" />
    <p className="mt-1 text-xs">© <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · Online map; no offline support.</p>
    {failed && <p role="alert" className="text-sm">Some map tiles could not load. Use the coordinates below; GPS updates can still arrive.</p>}
  </div>;
}
