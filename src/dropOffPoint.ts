import type {DestinationPoint} from './mapcn/position';
export const DROP_OFF_LABEL='Drop-off point—selected by Delivery Staff.';
export const DROP_OFF_EXPLANATION='May represent a market entrance/unloading area. Final handover remains at the assigned vendor stall. This is not an Inspector-verified stall or a live/last-shared position.';
export type DropOffView={projection:'delivery_drop_off_v1';invoiceId:string;invoiceRevision:number;revision:number;canUpdate:boolean;point:(DestinationPoint&{selectedAt:string;selectionMethod:'map_tap'|'device_location'})|null};
export function parseDropOffView(value:unknown,invoiceId:string):DropOffView{
 const v=value as DropOffView;if(!v||Object.keys(v).sort().join(',')!=='canUpdate,invoiceId,invoiceRevision,point,projection,revision'||v.projection!=='delivery_drop_off_v1'||v.invoiceId!==invoiceId||!Number.isSafeInteger(v.invoiceRevision)||v.invoiceRevision<1||!Number.isSafeInteger(v.revision)||v.revision<0||typeof v.canUpdate!=='boolean')throw Error('Drop-off response requires review.');
 if(v.point===null){if(v.revision!==0)throw Error('Missing drop-off point has an invalid revision.');return v;}
 const d=v.point;if(!d||v.revision<1||Object.keys(d).sort().join(',')!=='latitude,longitude,selectedAt,selectionMethod'||typeof d.latitude!=='number'||!Number.isFinite(d.latitude)||Math.abs(d.latitude)>90||typeof d.longitude!=='number'||!Number.isFinite(d.longitude)||Math.abs(d.longitude)>180||typeof d.selectedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(d.selectedAt)||!Number.isFinite(Date.parse(d.selectedAt))||!['map_tap','device_location'].includes(d.selectionMethod))throw Error('Saved drop-off point is invalid.');return v;
}
