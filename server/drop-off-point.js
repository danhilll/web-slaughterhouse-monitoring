// Optional unloading point; never Inspector verification, tracking, or proof of handover.
import {validCoordinates} from './destination-map.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const dropOffReadable=(row,p)=>Boolean(row?.delivery&&row.municipalScopeId===p.municipalScopeId&&(p.role==='admin'||p.role==='vendor'&&row.vendor_id===p.vendorBusinessId||p.role==='staff'&&p.staffPermissions?.includes('delivery')&&row.delivery.assigneeUid===p.uid));
export function validateDropOffPoint(point,row){
 if(!point||point.invoiceId!==row.id||point.municipalScopeId!==row.municipalScopeId||point.vendorBusinessId!==row.vendor_id||point.assigneeUid!==row.delivery?.assigneeUid||point.selectedBy!==point.assigneeUid||!validCoordinates(point.latitude,point.longitude)||!Number.isSafeInteger(point.revision)||point.revision<1||!['map_tap','device_location'].includes(point.selectionMethod)||typeof point.selectedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(point.selectedAt)||!Number.isFinite(Date.parse(point.selectedAt)))throw fail(503,'Delivery drop-off point requires municipal review.');return point;
}
export const dropOffProjection=(row,point,p)=>({projection:'delivery_drop_off_v1',invoiceId:row.id,invoiceRevision:row.revision,revision:point?.revision??0,canUpdate:p.role==='staff'&&p.staffPermissions?.includes('delivery')&&row.delivery?.assigneeUid===p.uid&&['assigned','in_transit'].includes(row.delivery.status),point:point?{latitude:point.latitude,longitude:point.longitude,selectedAt:point.selectedAt,selectionMethod:point.selectionMethod}:null});
