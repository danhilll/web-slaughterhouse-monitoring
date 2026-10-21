const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const printable=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value)&&!['unknown','pending','tbd','awaiting_confirmation'].includes(value.trim().toLowerCase());
// These values acknowledge the owner-confirmed implemented contract, not new permissions or rates.
export const OWNER_OPERATIONS_POLICY=Object.freeze({status:'approved',version:1,contract:'owner_policy_20261021_v1',billReference:'AINV_internal',officialReceipt:'paper_number_separate',financialCorrections:false});
export const operationsPolicyApproved=value=>Boolean(object(value)&&Object.entries(OWNER_OPERATIONS_POLICY).every(([key,expected])=>value[key]===expected));
export function carcassPolicyApproved(value){
 return Boolean(object(value)&&value.status==='approved'&&Number.isSafeInteger(value.version)&&value.version>0&&value.organsIncluded===false&&value.offalQuantitiesSeparate===true&&
  value.policyId==='owner_local_pig_cow_20261022_v1'&&Array.isArray(value.species)&&value.species.length===2&&value.species.includes('Pig')&&value.species.includes('Cow')&&['headTreatment','hideTreatment','feetTreatment'].every(key=>value[key]==='included')&&value.organCollection==='vendor_explicit_collect_or_decline'&&value.feeImpact==='none'&&
  printable(value.description,2000));
}
