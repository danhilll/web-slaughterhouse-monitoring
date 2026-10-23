import {createHash} from 'node:crypto';
import {estimateCarcassWeight,validCarcassEstimate} from '../shared/carcassEstimate.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const billingWriter=p=>p?.role==='staff'&&Array.isArray(p.staffPermissions)&&p.staffPermissions.includes('billing');
export const inspectorAssigner=p=>p?.role==='inspector';
export const measuredCurrent=a=>!!a&&Number.isSafeInteger(a.revision)&&a.revision>0&&a.inspection?.status==='approved'&&a.inspection.revision===a.revision&&Number.isSafeInteger(a.carcassWeight?.weightGrams)&&a.carcassWeight.weightGrams>0&&a.carcassWeight.animalRevision===a.revision&&Number.isSafeInteger(a.carcassWeight.revision)&&a.carcassWeight.revision>0&&typeof a.carcassWeight.weighedAt==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(a.carcassWeight.weighedAt)&&Number.isFinite(Date.parse(a.carcassWeight.weighedAt))&&typeof a.carcassWeight.recordedAt==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(a.carcassWeight.recordedAt)&&Number.isFinite(Date.parse(a.carcassWeight.recordedAt))&&typeof a.carcassWeight.recordedBy==='string'&&a.carcassWeight.recordedBy.length>0&&a.carcassWeight.recordedBy.length<=128&&!a.carcassWeight.recordedBy.includes('/');
// Owner procedure for Pig and Cow: calculated carcass weight = live weight x 0.8. A current scale measurement, when one exists, is
// kept and takes precedence; otherwise the calculation is used. The basis is never represented as scale-measured unless it is.
export function carcassBasis(a){
  if(!a||!Number.isSafeInteger(a.revision)||a.revision<1||a.inspection?.status!=='approved'||a.inspection.revision!==a.revision)return null;
  if(!['Cow','Pig'].includes(a.species)||!Number.isSafeInteger(a.weightGrams)||a.weightGrams<=0)return null;
  const m=a.carcassWeight;
  // A malformed stored measurement fails closed; only a well-formed measurement of an older revision is ignored (kept, never deleted).
  if(m!=null&&!measuredCurrent(a)&&!(Number.isSafeInteger(m.weightGrams)&&m.weightGrams>0&&Number.isSafeInteger(m.revision)&&m.revision>0&&Number.isSafeInteger(m.animalRevision)&&m.animalRevision>0&&m.animalRevision<a.revision))return null;
  if(measuredCurrent(a))return {method:'measured',liveWeightGrams:a.weightGrams,carcassWeightGrams:a.carcassWeight.weightGrams,weighedAt:a.carcassWeight.weighedAt,measurementRevision:a.carcassWeight.revision,animalRevision:a.revision};
  if(!validCarcassEstimate(a.carcassEstimate,a.weightGrams,a.revision))return null;
  const e=a.carcassEstimate??estimateCarcassWeight(a.weightGrams,a.revision);
  return {method:'calculated_80_percent',liveWeightGrams:e.liveWeightGrams,factor:0.8,carcassWeightGrams:e.weightGrams,rule:e.rule,rounding:e.rounding,animalRevision:e.animalRevision};
}
export function requireCarcassBasis(a){const b=carcassBasis(a);if(!b)throw fail(409,'A current Inspector approval and a recorded live weight are required; carcass weight is calculated as 80% of live weight unless a scale measurement exists.');return b;}
export function validateOwnerFees(s){
 if(s.corralCents!==1500||s.deliveryCents!==2500||s.inspectionCents!==1000||s.facilityCents!==4500||['tableCents','tableFeeCents','table_fee'].some(k=>s[k]!==undefined))throw fail(503,'The owner-approved Cow/Pig schedule is PHP95 per animal with no additional table fee.');
}
const label=(v,max)=>typeof v==='string'&&v===v.trim()&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
export function stallDestination(v){if(!label(v.marketName,120)||!label(v.marketSection,80)||!label(v.stallNumber,40))throw fail(409,'The owning vendor market, section and stall require verification before assignment.');const destination=`${v.marketName} / ${v.marketSection} / Stall ${v.stallNumber}`;if(destination.length>200)throw fail(409,'Verified stall destination exceeds the supported 200-character delivery contract.');return destination;}
export function stallReservationKey(v){const n=x=>x.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();return createHash('sha256').update(JSON.stringify([v.municipalScopeId,n(v.marketName),n(v.marketSection),n(v.stallNumber)])).digest('hex');}
