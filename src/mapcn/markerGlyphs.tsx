// Shared map glyphs, identical to the Android map renderer (MARKER_DESIGN_WEB_HANDOFF_20261024).
// Pins use viewBox 0 0 24 23 with the tip at (12,23), so markers anchor at the bottom.
export const MARKER_COLORS={destination:'#dc2626',dropOff:'#2563eb',proposed:'#b45309',delivery:'#17432c'} as const;
export const MARKER_LABELS={delivery:'Delivery Staff (last shared GPS)',destination:'Market destination',dropOff:'Drop-off point'} as const;
const PIN='M12 23C12 23 4 14.6 4 9.5a8 8 0 0 1 16 0C20 14.6 12 23 12 23Z';
const CAR='M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z';
export function PinGlyph({fill,size=32}:{fill:string;size?:number}){
 return <svg width={size} height={size*23/24} viewBox="0 0 24 23" aria-hidden="true" focusable="false" style={{display:'block',overflow:'visible'}}><path d={PIN} fill={fill} stroke="#fff" strokeWidth={1.2}/><circle cx={12} cy={9.5} r={3.2} fill="#fff"/></svg>;
}
export function CarGlyph({size=30}:{size?:number}){
 return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{display:'block'}}><circle cx={12} cy={12} r={11} fill={MARKER_COLORS.delivery} stroke="#fff" strokeWidth={1.2}/><path d={CAR} fill="#fff" transform="translate(4.8 4.8) scale(0.6)"/></svg>;
}
