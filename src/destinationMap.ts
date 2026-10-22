import type {DestinationPoint} from './mapcn/position';
export type DestinationView={projection:'verified_destination_v1';invoiceId:string;status:'verified'|'unavailable';revision:number;destination:(DestinationPoint&{verifiedAt:string})|null};
export function parseDestinationView(value:unknown,invoiceId:string):DestinationView{
 const v=value as DestinationView;
 if(!v||Object.keys(v).sort().join(',')!=='destination,invoiceId,projection,revision,status'||v.projection!=='verified_destination_v1'||v.invoiceId!==invoiceId||!Number.isSafeInteger(v.revision)||v.revision<0||!['verified','unavailable'].includes(v.status))throw Error('Destination response requires review.');
 if(v.status==='unavailable'){if(v.destination!==null)throw Error('Unavailable destination must not expose a point.');return v;}
 const d=v.destination;if(!d||v.revision<1||Object.keys(d).sort().join(',')!=='latitude,longitude,verifiedAt'||typeof d.latitude!=='number'||!Number.isFinite(d.latitude)||Math.abs(d.latitude)>90||typeof d.longitude!=='number'||!Number.isFinite(d.longitude)||Math.abs(d.longitude)>180||typeof d.verifiedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(d.verifiedAt)||!Number.isFinite(Date.parse(d.verifiedAt)))throw Error('Verified destination requires coordinates and provenance time.');return v;
}
