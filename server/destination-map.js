// Owner-local verified destination pins. These are not phone GPS samples.
const fail=(status,message)=>Object.assign(new Error(message),{status});
const id=v=>typeof v==='string'&&v.length>0&&v.length<=128&&v===v.trim()&&!v.includes('/');
const printable=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
export const validCoordinates=(latitude,longitude)=>typeof latitude==='number'&&Number.isFinite(latitude)&&Math.abs(latitude)<=90&&typeof longitude==='number'&&Number.isFinite(longitude)&&Math.abs(longitude)<=180;
export function validateDestinationPin(pin){
 if(!pin||!validCoordinates(pin.latitude,pin.longitude)||!Number.isSafeInteger(pin.revision)||pin.revision<1||!Number.isSafeInteger(pin.animalRevision)||pin.animalRevision<1||!id(pin.invoiceId)||!id(pin.vendorBusinessId)||!id(pin.municipalScopeId)||!id(pin.verifiedBy)||!printable(pin.verificationReference,200)||!['marketName','marketSection','stallNumber','destination','reservationKey'].every(k=>printable(pin[k],200))||typeof pin.verifiedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(pin.verifiedAt)||!Number.isFinite(Date.parse(pin.verifiedAt)))throw fail(503,'Verified destination pin requires municipal review.');
 return pin;
}
export function pinMatches(pin,row,binding){
 return pin.invoiceId===row.id&&pin.vendorBusinessId===row.vendor_id&&pin.municipalScopeId===row.municipalScopeId&&pin.animalRevision===row.animalRevision&&['marketName','marketSection','stallNumber','destination','reservationKey'].every(k=>pin[k]===binding[k]);
}
export function destinationProjection(row,pin,verified){
 return {projection:'verified_destination_v1',invoiceId:row.id,status:verified?'verified':'unavailable',revision:pin?.revision??0,destination:verified?{latitude:pin.latitude,longitude:pin.longitude,verifiedAt:pin.verifiedAt}:null};
}
export const destinationReadable=(row,p)=>row?.municipalScopeId===p.municipalScopeId&&(p.role==='admin'||p.role==='inspector'||p.role==='vendor'&&row.vendor_id===p.vendorBusinessId||p.role==='staff'&&p.staffPermissions?.includes('delivery')&&row.delivery?.assigneeUid===p.uid);

export function validReviewedDestination(v){return Boolean(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')==='marketName,marketSection,stallNumber,vendorBusinessId'&&id(v.vendorBusinessId)&&printable(v.marketName,120)&&printable(v.marketSection,80)&&printable(v.stallNumber,40));}
