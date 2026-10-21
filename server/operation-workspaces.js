import { estimateCarcassWeight, validCarcassEstimate, selectCarcassWeight } from '../shared/carcassEstimate.js';
const fail=message=>{throw Object.assign(new Error(message),{status:503});};
const positive=v=>Number.isSafeInteger(v)&&v>0;
const time=v=>typeof v==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const pick=(v,keys)=>Object.fromEntries(keys.filter(k=>v[k]!==undefined).map(k=>[k,v[k]]));
export const deliveryOnly = p => p.role==='staff'&&p.staffPermissions.includes('delivery')&&!p.staffPermissions.includes('billing');
export const deliveryReadable = (row,p) => row?.municipalScopeId===p.municipalScopeId && !!row.delivery && (p.role==='admin'||p.role==='staff'&&p.staffPermissions.includes('delivery')&&row.delivery.assigneeUid===p.uid);
export function deliveryAssignmentView(row,animal) {
 const d=row.delivery;
 if(row.payment_status!=='Paid'||!d||!text(d.assigneeUid,128)||!text(d.destination,200)||!['assigned','in_transit','delivered'].includes(d.status)||!time(d.assignedAt)||
 !text(row.vendor_name,200)||!text(row.animalIdentifier,80)||typeof row.syntheticOnly!=='boolean'||
 ['updatedAt','deliveredAt'].some(k=>d[k]!==undefined&&!time(d[k]))||d.notes!==undefined&&!text(d.notes,500))fail('Delivery assignment requires municipal review.');
 let meatDetails=null,meatDetailsMessage='Animal details are unavailable; no meat weight has been inferred.';
 if(animal){
  if(animal.municipalScopeId!==row.municipalScopeId||animal.vendorBusinessId!==row.vendor_id||animal.id!==row.animalId)fail('Delivery animal ownership requires municipal review.');
  if(animal.revision!==row.animalRevision)meatDetailsMessage='Animal revision differs from the invoiced revision; verify shipment details.';
  else {
   const c=animal.carcassWeight;
   const valid=['Cow','Pig'].includes(animal.species)&&positive(animal.weightGrams)&&positive(animal.revision)&&time(animal.weighedAt)&&validCarcassEstimate(animal.carcassEstimate,animal.weightGrams,animal.revision)&&
    (!c||positive(c.weightGrams)&&positive(c.revision)&&positive(c.animalRevision)&&c.animalRevision<=animal.revision&&time(c.weighedAt));
   if(valid){const estimate=animal.carcassEstimate??estimateCarcassWeight(animal.weightGrams,animal.revision);
    meatDetails={species:animal.species,weightGrams:animal.weightGrams,weighedAt:animal.weighedAt,revision:animal.revision,
     carcassWeight:c?pick(c,['weightGrams','weighedAt','revision','animalRevision']):null,carcassEstimate:estimate,carcassWeightSelection:selectCarcassWeight(animal,estimate)};meatDetailsMessage=null;
   }else meatDetailsMessage='Animal weight details require review; no measurement has been inferred.';
  }
 }
 return {projection:'delivery_assignment_v1',...pick(row,['id','municipalScopeId','animalId','animalIdentifier','animalRevision','revision','syntheticOnly']),vendorBusinessId:row.vendor_id,vendorName:row.vendor_name,
  delivery:pick(d,['assigneeUid','destination','status','assignedAt','updatedAt','deliveredAt','notes']),meatDetails,meatDetailsMessage};
}
