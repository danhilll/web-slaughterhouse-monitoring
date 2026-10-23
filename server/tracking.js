import {requireCarcassBasis} from './owner-workflow-policy.js';
const fail = (status,message,extra={}) => Object.assign(new Error(message),{status,...extra});
const intervalMs=10000;
const same = (a,b) => ['latitude','longitude','accuracyMeters','capturedAt'].every(k=>a[k]===b[k]);
export function validatePosition(b,at,maxAgeMs=60000) {
  const captured=Date.parse(b.capturedAt),now=Date.parse(at);
  if(typeof b.latitude!=='number'||!Number.isFinite(b.latitude)||Math.abs(b.latitude)>90||typeof b.longitude!=='number'||!Number.isFinite(b.longitude)||Math.abs(b.longitude)>180||typeof b.accuracyMeters!=='number'||!Number.isFinite(b.accuracyMeters)||b.accuracyMeters<0||b.accuracyMeters>1000||typeof b.capturedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(b.capturedAt)||!Number.isFinite(captured)||!Number.isFinite(now)||now-captured>maxAgeMs||captured-now>10000)throw fail(400,'Use a recent location with valid coordinates and accuracy.');
  return {latitude:b.latitude,longitude:b.longitude,accuracyMeters:b.accuracyMeters,capturedAt:new Date(captured).toISOString()};
}
const publicLocation=p=>p?Object.fromEntries(['latitude','longitude','accuracyMeters','capturedAt','receivedAt'].map(k=>[k,p[k]])):null;
export function trackingView(row,point,at) {
  const matching=point&&point.invoiceId===row.id&&point.municipalScopeId===row.municipalScopeId&&point.vendor_id===row.vendor_id&&point.assigneeUid===row.delivery?.assigneeUid&&point.assignedAt===row.delivery?.assignedAt;
  const status=row.delivery?.status||'unassigned';
  // Retain the stored audit position without showing a driver marker after completion.
  const position=matching&&status!=='delivered'?publicLocation(point):null;
  const age=position?Math.max(0,Date.parse(at)-Date.parse(position.capturedAt)):null;
  return {invoiceId:row.id,deliveryStatus:status,trackingState:status==='delivered'?'completed':status!=='in_transit'?'not_started':!position?'waiting':age>45000?'stale':'recent',location:position,serverTime:at,updateIntervalSeconds:10};
}

/** Latest position only. No invoice revision changes, financial audit writes, scans or indexes. */
export function createTrackingStore(getDb,validInvoice) {
  const db=()=>{const value=getDb();if(!value)throw fail(503,'Tracking storage is unavailable.');return value;};
  const member=async(tx,p,write)=>{
    if(p.role==='admin'&&!write)return;
    const s=await tx.get(db().doc(`mobile_memberships/${p.uid}`)),m=s.exists?s.data():null;
    if(!m||m.status!=='active'||m.role!==p.role||m.municipalScopeId!==p.municipalScopeId||(p.role==='vendor'&&m.vendorBusinessId!==p.vendorBusinessId)||(p.role==='staff'&&(m.vendorBusinessId!=null||!Array.isArray(m.staffPermissions)||!m.staffPermissions.includes('delivery')||m.staffPermissions.some(v=>!['inventory','billing','delivery'].includes(v)))))throw fail(403,'Approved delivery tracking access is required.');
  };
  const invoice=async(tx,id,p,write=false)=>{
    const s=await tx.get(db().doc(`invoices/${id}`));const row=s.exists?{...s.data(),id:s.id}:null;
    if(!row||row.municipalScopeId!==p.municipalScopeId||(p.role==='vendor'&&row.vendor_id!==p.vendorBusinessId))throw fail(404,'Delivery not found.');
    if(!validInvoice(row)||(s.data().id!==undefined&&s.data().id!==s.id))throw fail(503,'Invoice requires municipal review.');
    if(p.role==='staff'&&row.delivery?.assigneeUid!==p.uid)throw fail(write?403:404,'Delivery not found.');
    return row;
  };
  const previous=async(tx,id,row)=>{
    const s=await tx.get(db().doc(`delivery_positions/${id}`)),point=s.exists?s.data():null;
    if(point){
      // Validate stored data before exposing coordinates or using its timestamps for ordering.
      if(point.invoiceId!==id||point.municipalScopeId!==row.municipalScopeId||point.vendor_id!==row.vendor_id||typeof point.assigneeUid!=='string'||typeof point.assignedAt!=='string'||!Number.isFinite(Date.parse(point.receivedAt)))throw fail(503,'Tracking position requires review.');
      try{validatePosition(point,point.receivedAt,300000);}catch{throw fail(503,'Tracking position requires review.');}
    }
    return point;
  };
  return {
    async read(id,p,at){return db().runTransaction(async tx=>{await member(tx,p,false);const row=await invoice(tx,id,p);const point=await previous(tx,id,row);return trackingView(row,point,at);});},
    async publish(id,b,p,at,{legacy=false}={}) {
      const position=validatePosition(b,at,legacy?300000:60000);
      return db().runTransaction(async tx=>{
        await member(tx,p,true);const row=await invoice(tx,id,p,true),d=row.delivery;
        if(p.role!=='staff'||!d||d.assigneeUid!==p.uid)throw fail(403,'Only the assigned delivery staff can update this delivery.');
        if(!(legacy?['assigned','in_transit']:['in_transit']).includes(d.status))throw fail(409,'Tracking requires an active delivery in transit.');
        if(typeof d.assignedAt!=='string'||!Number.isFinite(Date.parse(d.assignedAt)))throw fail(503,'Delivery assignment requires review.');
        if(legacy&&row.revision!==b.expectedRevision)throw fail(409,'Invoice changed. Refresh before submitting again.');
        const animalSnap=await tx.get(db().doc('animal_records/'+row.animalId)),animal=animalSnap.exists?animalSnap.data():null;
        if(!animal||animal.municipalScopeId!==row.municipalScopeId||animal.vendorBusinessId!==row.vendor_id||animal.revision!==row.animalRevision)throw fail(409,'Current measured shipment ownership requires review.');
        requireCarcassBasis(animal);
        const stored=await previous(tx,id,row);
        const old=stored&&stored.assigneeUid===d.assigneeUid&&stored.assignedAt===d.assignedAt?stored:null;
        if(old){
          if(same(old,position))return {row,view:trackingView(row,old,at),duplicate:true};
          if(Date.parse(position.capturedAt)<=Date.parse(old.capturedAt))throw fail(409,'Location is older than the latest accepted position.');
          const elapsed=Date.parse(at)-Date.parse(old.receivedAt);
          if(elapsed<intervalMs)throw fail(429,'Wait before sending another location.',{retryAfter:Math.ceil((intervalMs-elapsed)/1000)});
        }
        const point={...position,invoiceId:id,municipalScopeId:row.municipalScopeId,vendor_id:row.vendor_id,assigneeUid:p.uid,assignedAt:d.assignedAt,receivedAt:at};
        tx.set(db().doc(`delivery_positions/${id}`),point);
        // Compatibility for the existing manual-share client only. Never advance invoice revision.
        if(legacy)tx.update(db().doc(`invoices/${id}`),{delivery:{...d,location:publicLocation(point)}});
        return {row,view:trackingView(row,point,at),duplicate:false};
      });
    }
  };
}
