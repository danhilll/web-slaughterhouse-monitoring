import {dropOffReadable,dropOffProjection,validateDropOffPoint} from './drop-off-point.js';
import {validCoordinates,validReviewedDestination,validateDestinationPin,pinMatches,destinationProjection,destinationReadable} from './destination-map.js';
import {billingWriter,inspectorAssigner,requireMeasured,measuredCurrent,validateOwnerFees,stallDestination,stallReservationKey} from './owner-workflow-policy.js';
import { Router } from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { createTrackingStore } from './tracking.js';
import { deliveryOnly, deliveryReadable, deliveryAssignmentView } from './operation-workspaces.js';
import { isValidHeadcount } from './headcounts.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const id = value => typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= 128 && !value.includes('/') && !['.', '..'].includes(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const money = value => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000_000;
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const municipalDate = at => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
};
const permission = (p, name) => p.role === 'admin' || p.role === 'staff' && p.staffPermissions.includes(name);
const scopeRead = (row, p) => row?.municipalScopeId === p.municipalScopeId && (p.role !== 'vendor' || row.vendor_id === p.vendorBusinessId);
const invoiceKeys = ['id','vendor_id','vendor_name','municipalScopeId','slaughter_record_id','date_issued','due_date','number_of_heads_cow','number_of_heads_pig','corral_fee','delivery_fee','anti_mortem_fee','facility_fee','total_amount','payment_status','animalId','animalRevision','animalIdentifier','revision','feeScheduleVersion','syntheticOnly','payment','delivery'];
// Audit snapshots retain the stored legacy coordinate; responses hide it once delivery is completed.
export const operationInvoiceView = (row, retainLocation = false) => {
  const pick=(source,keys)=>Object.fromEntries(keys.filter(key=>source[key]!==undefined).map(key=>[key,source[key]]));
  const result=pick(row,invoiceKeys);
  if(row.feeScheduleSnapshot)result.feeScheduleSnapshot=pick(row.feeScheduleSnapshot,['version','basis','currency','corralCents','deliveryCents','inspectionCents','facilityCents','syntheticOnly','approvalReference']);
  if(row.payment)result.payment=pick(row.payment,['receiptReference','amountCents','method','recordedAt']);
  if(row.delivery){result.delivery=pick(row.delivery,['assigneeUid','destination','status','notes','assignedAt','updatedAt','deliveredAt']);if(row.delivery.location&&(retainLocation||row.delivery.status!=='delivered'))result.delivery.location=pick(row.delivery.location,['latitude','longitude','accuracyMeters','capturedAt','receivedAt']);}
  return result;
};
export const operationBillingView = row => {
  const visible=operationInvoiceView(row);
  // Billing uses the recorded invoice, not the assigned delivery's location channel.
  if(visible.delivery)delete visible.delivery.location;
  return {...visible,totalCents:row.totalCents,paidCents:row.payment_status==='Paid'?row.payment.amountCents:0,balanceCents:row.payment_status==='Paid'?0:row.totalCents,
    ...(row.feeScheduleSnapshot?{feeScheduleSnapshot:Object.fromEntries(['version','basis','currency','corralCents','deliveryCents','inspectionCents','facilityCents','syntheticOnly','approvalReference'].filter(k=>row.feeScheduleSnapshot[k]!==undefined).map(k=>[k,row.feeScheduleSnapshot[k]]))}:{})};
};
const validInvoice = row => id(row?.id) && row.workflow==='animal' && id(row.vendor_id) && id(row.animalId) && id(row.municipalScopeId) && Number.isSafeInteger(row.animalRevision) && row.animalRevision>0 && Number.isSafeInteger(row.revision) && row.revision > 0 && money(row.totalCents) && row.totalCents > 0 && ['Unpaid','Paid'].includes(row.payment_status) && day(row.date_issued) && day(row.due_date) &&
  ['number_of_heads_cow','number_of_heads_pig'].every(key=>isValidHeadcount(row[key])) &&
  ['corral_fee','delivery_fee','anti_mortem_fee','facility_fee','total_amount'].every(key=>typeof row[key]==='number'&&Number.isFinite(row[key])&&row[key]>=0) && row.total_amount===row.totalCents/100 &&
  Math.round((row.corral_fee+row.delivery_fee+row.anti_mortem_fee+row.facility_fee)*100)===row.totalCents &&
  (row.payment_status==='Paid'?row.payment?.amountCents===row.totalCents&&text(row.payment.receiptReference,80)&&['cash','bank_transfer'].includes(row.payment.method):!row.payment);
const hash = value => createHash('sha256').update(value).digest('hex');
// This milestone is rehearsal-only, even if the feature flag is accidentally set in live configuration.
export function syntheticOperationsEnabled(env, projectId) {
  return env.ANIMAL_OPERATIONS_ENABLED==='true' && typeof projectId==='string' && projectId.startsWith('demo-') &&
    [env.GCLOUD_PROJECT,env.GOOGLE_CLOUD_PROJECT].every(value=>!value||value===projectId) &&
    [env.FIREBASE_AUTH_EMULATOR_HOST,env.FIRESTORE_EMULATOR_HOST].every(value=>typeof value==='string'&&/^127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(value));
}
function scheduleView(s, production = false) {
  if (!s || s.status !== 'approved' || !Number.isSafeInteger(s.version) || s.version < 1 || s.basis !== 'perAnimal' || s.currency !== 'PHP' || !['corralCents','deliveryCents','inspectionCents','facilityCents'].every(key => money(s[key])) || s.corralCents+s.deliveryCents+s.inspectionCents+s.facilityCents <= 0 || !money(s.corralCents+s.deliveryCents+s.inspectionCents+s.facilityCents)) throw fail(503, 'An approved fee schedule is required.');
  validateOwnerFees(s);
  if(production&&(s.syntheticOnly!==false||!text(s.approvalReference,200)))throw fail(503,'Approved production fee provenance is required; synthetic rates are not accepted.');
  return Object.fromEntries(['version','basis','currency','corralCents','deliveryCents','inspectionCents','facilityCents','syntheticOnly','approvalReference'].filter(key => s[key] !== undefined).map(key => [key,s[key]]));
}

/** One invoice per approved animal revision; amounts are server-calculated integer centavos. */
export function createOperationsStore(getDb, { production = false } = {}) {
  const tracking=createTrackingStore(getDb,validInvoice);
  const db = () => { const value = getDb(); if (!value) throw fail(503, 'Workflow storage is unavailable.'); return value; };
  const invoice = value => db().doc(`invoices/${value}`);
  const read = async (tx, ref) => { const snap = await tx.get(ref); if (!snap.exists) return null; const row = snap.data(); if (row.id !== undefined && row.id !== snap.id) throw fail(503,'Record identity requires review.'); return {...row,id:snap.id}; };
  const audited = (tx, p, row, action, at, before = null) => tx.create(db().collection('operation_audit').doc(), {invoiceId:row.id,animalId:row.animalId,municipalScopeId:p.municipalScopeId,actorUid:p.uid,action,at,...(before?{before:operationInvoiceView(before,true)}:{}),after:operationInvoiceView(row,true)});
  const invoiceIdFor = (scope,animalId) => `AINV-${hash(JSON.stringify([scope,animalId])).slice(0,40)}`;
  // The same read set validates a preview and is re-read atomically at issuance.
  const invoiceInputs = async (tx,animalId,p) => {
    const invoiceId=invoiceIdFor(p.municipalScopeId,animalId);
    const a=await read(tx,db().doc(`animal_records/${animalId}`));
    if(!a||a.municipalScopeId!==p.municipalScopeId)throw fail(404,'Animal record not found.');
    if(!Number.isSafeInteger(a.revision)||a.revision<1||!text(a.identifier,80)||a.inspection?.status!=='approved'||a.inspection.revision!==a.revision||!id(a.vendorBusinessId)||!['Cow','Pig'].includes(a.species)||!Number.isSafeInteger(a.weightGrams)||a.weightGrams<=0)throw fail(409,'Refresh and review the approved animal revision.');
    requireMeasured(a);
    const existing=await read(tx,invoice(invoiceId));
    if(existing||a.billingInvoiceId||a.deliveryId)throw fail(409,'This animal already has an invoice. Refresh invoice history.');
    const vendor=await read(tx,db().doc(`vendors/${a.vendorBusinessId}`));
    if(!vendor||vendor.status!=='Active'||vendor.municipalScopeId!==p.municipalScopeId||!text(vendor.name,200))throw fail(409,'Vendor ownership requires municipal review.');
    const feeSnap=await tx.get(db().doc(`operation_fee_schedules/${p.municipalScopeId}`));
    const fees=scheduleView(feeSnap.exists?feeSnap.data():null,production);
    const totalCents=fees.corralCents+fees.deliveryCents+fees.inspectionCents+fees.facilityCents;
    return {a,vendor,fees,totalCents,invoiceId};
  };
  const assignmentInputs = async (tx,row,p) => {
    const animal=await read(tx,db().doc(`animal_records/${row.animalId}`));
    if(!animal||animal.municipalScopeId!==p.municipalScopeId||animal.vendorBusinessId!==row.vendor_id||animal.revision!==row.animalRevision)throw fail(409,'Refresh the invoiced animal ownership/revision.');
    const organChoice=await read(tx,db().doc(`animal_organ_choices/${animal.id}`));
    if(!organChoice||!['collect','decline'].includes(organChoice.choice)||organChoice.municipalScopeId!==p.municipalScopeId||organChoice.vendorBusinessId!==animal.vendorBusinessId||organChoice.animalRevision!==animal.revision)throw fail(409,'The owning Vendor must explicitly choose collect or decline organs/offal for this animal revision before assignment.');
    requireMeasured(animal);
    const vendor=await read(tx,db().doc(`vendors/${row.vendor_id}`));
    if(!vendor||vendor.status!=='Active'||vendor.municipalScopeId!==p.municipalScopeId||!text(vendor.name,200))throw fail(409,'Active vendor ownership requires review.');
    const destination=stallDestination(vendor),reservation=await read(tx,db().doc(`market_stall_assignments/${stallReservationKey(vendor)}`));
    if(!reservation||reservation.vendorBusinessId!==vendor.id||reservation.municipalScopeId!==p.municipalScopeId||['marketName','marketSection','stallNumber'].some(k=>reservation[k]!==vendor[k]))throw fail(409,'Vendor stall reservation requires municipal review.');
    return {vendor,animal,destination};
  };
  return {
    trackingRead:(value,p,at)=>tracking.read(value,p,at),
    trackingPublish:(value,b,p,at)=>tracking.publish(value,b,p,at),
    async schedule(scope) { const s = await db().doc(`operation_fee_schedules/${scope}`).get(); return scheduleView(s.exists?s.data():null,production); },
    async list(p, after) {
      let q = db().collection('invoices').where('municipalScopeId','==',p.municipalScopeId).where('workflow','==','animal');
      if (p.role === 'vendor') q = q.where('vendor_id','==',p.vendorBusinessId);
      if (deliveryOnly(p)) q = q.where('delivery.assigneeUid','==',p.uid);
      q = q.orderBy(FieldPath.documentId()); if (after) q=q.startAfter(after);
      const rows=await q.limit(26).get(); return rows.docs.map(s=>{const row=s.data();if(row.id!==undefined&&row.id!==s.id)throw fail(503,'Invoice identity requires review.');return {...row,id:s.id};});
    },
    async deliveries(p,after) {
      let q=db().collection('invoices').where('municipalScopeId','==',p.municipalScopeId).where('workflow','==','animal');
      q=p.role==='admin'?q.where('delivery.status','in',['assigned','in_transit','delivered']):q.where('delivery.assigneeUid','==',p.uid);
      q=q.orderBy(FieldPath.documentId());if(after)q=q.startAfter(after);
      const rows=await q.limit(26).get();return rows.docs.map(s=>{const row=s.data();if(row.id!==undefined&&row.id!==s.id)throw fail(503,'Delivery identity requires review.');return {...row,id:s.id};});
    },
    async get(value) { const s=await invoice(value).get(); if(!s.exists)return null; if(s.data().id!==undefined&&s.data().id!==s.id)throw fail(503,'Invoice identity requires review.');return {...s.data(),id:s.id}; },
    async deliveryStaff(p,after){
      let q=db().collection('mobile_memberships').where('municipalScopeId','==',p.municipalScopeId).orderBy(FieldPath.documentId());if(after)q=q.startAfter(after);
      const result=await q.limit(26).get();const page=result.docs.slice(0,25),items=[];
      for(const doc of page){const m=doc.data();if(m.role!=='staff'||m.status!=='active'||m.vendorBusinessId!=null||!Array.isArray(m.staffPermissions)||!m.staffPermissions.includes('delivery')||m.staffPermissions.some(x=>!['inventory','billing','delivery'].includes(x)))continue;const managed=await db().doc('managed_accounts/'+doc.id).get(),account=managed.exists?managed.data():null;if(account&&(account.uid!==undefined&&account.uid!==doc.id||account.municipalScopeId!==p.municipalScopeId||account.role!=='staff'||account.status!=='active'))throw fail(503,'Delivery account identity requires review.');const fullName=account?.fullName;items.push({uid:doc.id,...(text(fullName,200)?{fullName}:{})});}
      return {items,after:result.docs.length>25?page.at(-1).id:null};
    },
    async assignmentOptions(value,p){
      if(!inspectorAssigner(p))throw fail(403,'Inspector assignment authority is required.');
      return db().runTransaction(async tx=>{const row=await read(tx,invoice(value));if(!scopeRead(row,p))throw fail(404,'Invoice not found.');if(!validInvoice(row)||row.delivery)throw fail(409,'Refresh an unassigned invoice.');const {vendor,destination}=await assignmentInputs(tx,row,p);return {invoiceId:row.id,revision:row.revision,animalId:row.animalId,vendorBusinessId:vendor.id,vendorName:vendor.name,destination,marketName:vendor.marketName,marketSection:vendor.marketSection,stallNumber:vendor.stallNumber};});
    },
    async dropOffRead(value,p){
      return db().runTransaction(async tx=>{const row=await read(tx,invoice(value));if(!dropOffReadable(row,p))throw fail(404,'Delivery drop-off point not found.');if(!validInvoice(row))throw fail(503,'Invoice requires review.');const point=await read(tx,db().doc(`delivery_drop_off_points/${row.id}`));if(point)validateDropOffPoint(point,row);return dropOffProjection(row,point,p);});
    },
    async dropOffWrite(value,b,p,at){
      if(p.role!=='staff'||!p.staffPermissions?.includes('delivery'))throw fail(403,'Only assigned Delivery Staff may select a drop-off point.');
      return db().runTransaction(async tx=>{
        const row=await read(tx,invoice(value));if(!dropOffReadable(row,p))throw fail(404,'Delivery drop-off point not found.');if(!validInvoice(row))throw fail(503,'Invoice requires review.');if(!['assigned','in_transit'].includes(row.delivery.status))throw fail(409,'Drop-off changes are unavailable after delivery completion.');if(row.revision!==b.expectedRevision)throw fail(409,'Delivery changed. Refresh before confirming the drop-off point.');
        const ref=db().doc(`delivery_drop_off_points/${row.id}`),before=await read(tx,ref);if(before)validateDropOffPoint(before,row);if((before?.revision??0)!==b.expectedDropOffRevision)throw fail(409,'Drop-off point changed. Refresh before confirming again.');const revision=(before?.revision??0)+1;if(!Number.isSafeInteger(revision))throw fail(409,'Drop-off revision requires review.');
        const after={invoiceId:row.id,municipalScopeId:row.municipalScopeId,vendorBusinessId:row.vendor_id,assigneeUid:row.delivery.assigneeUid,latitude:b.latitude,longitude:b.longitude,selectionMethod:b.selectionMethod,selectedAt:at,selectedBy:p.uid,revision};validateDropOffPoint(after,row);
        tx.set(ref,after);tx.create(db().collection('delivery_drop_off_audit').doc(),{invoiceId:row.id,municipalScopeId:row.municipalScopeId,actorUid:p.uid,at,action:before?'drop_off_updated':'drop_off_selected',before,after});return dropOffProjection(row,after,p);
      });
    },
    async destinationRead(value,p){
      return db().runTransaction(async tx=>{
        const row=await read(tx,invoice(value));if(!destinationReadable(row,p))throw fail(404,'Delivery destination not found.');if(!validInvoice(row))throw fail(503,'Invoice requires review.');
        if(row.delivery){
          const pin=row.delivery.destinationPin??null;if(!pin)return destinationProjection(row,null,false);validateDestinationPin(pin);
          const v=row.delivery.destinationVerification;
          const binding={marketName:v?.marketName,marketSection:v?.marketSection,stallNumber:v?.stallNumber,destination:row.delivery.destination,reservationKey:v&&['marketName','marketSection','stallNumber'].every(k=>text(v[k],200))?stallReservationKey({municipalScopeId:row.municipalScopeId,...v}):null};
          return destinationProjection(row,pin,pinMatches(pin,row,binding));
        }
        const pin=await read(tx,db().doc(`delivery_destination_pins/${row.id}`));if(!pin)return destinationProjection(row,null,false);validateDestinationPin(pin);
        const vendor=await read(tx,db().doc(`vendors/${row.vendor_id}`));if(!vendor||vendor.status!=='Active'||vendor.municipalScopeId!==p.municipalScopeId||!['marketName','marketSection','stallNumber'].every(k=>text(vendor[k],200)))return destinationProjection(row,pin,false);
        let destination;try{destination=stallDestination(vendor);}catch{return destinationProjection(row,pin,false);}const key=stallReservationKey(vendor),reservation=await read(tx,db().doc(`market_stall_assignments/${key}`));const reserved=reservation&&reservation.vendorBusinessId===vendor.id&&reservation.municipalScopeId===p.municipalScopeId&&['marketName','marketSection','stallNumber'].every(k=>reservation[k]===vendor[k]);return destinationProjection(row,pin,Boolean(reserved)&&pinMatches(pin,row,{...vendor,destination,reservationKey:key}));
      });
    },
    async destinationWrite(value,b,p,at){
      if(!inspectorAssigner(p))throw fail(403,'Only an Inspector may verify a destination pin.');
      return db().runTransaction(async tx=>{
        const row=await read(tx,invoice(value));if(!scopeRead(row,p))throw fail(404,'Invoice not found.');if(!validInvoice(row))throw fail(503,'Invoice requires review.');if(row.delivery)throw fail(409,'The assigned destination pin is locked.');if(row.revision!==b.expectedRevision)throw fail(409,'Invoice changed. Refresh destination details before retrying.');
        const {vendor,destination}=await assignmentInputs(tx,row,p);if(b.expectedDestination.vendorBusinessId!==vendor.id||['marketName','marketSection','stallNumber'].some(k=>b.expectedDestination[k]!==vendor[k]))throw fail(409,'The owning Vendor destination changed. Refresh and confirm the pin again.');const ref=db().doc(`delivery_destination_pins/${row.id}`),before=await read(tx,ref);if(before)validateDestinationPin(before);
        if((before?.revision??0)!==b.expectedDestinationRevision)throw fail(409,'Destination pin changed. Refresh before retrying.');if(before&&!text(b.reason,500))throw fail(400,'A reason is required to correct a destination pin.');
        const revision=(before?.revision??0)+1;if(!Number.isSafeInteger(revision))throw fail(409,'Destination revision requires review.');
        const after={invoiceId:row.id,municipalScopeId:p.municipalScopeId,vendorBusinessId:vendor.id,animalRevision:row.animalRevision,invoiceRevisionAtVerification:row.revision,marketName:vendor.marketName,marketSection:vendor.marketSection,stallNumber:vendor.stallNumber,destination,reservationKey:stallReservationKey(vendor),latitude:b.latitude,longitude:b.longitude,revision,verifiedAt:at,verifiedBy:p.uid,verificationReference:b.verificationReference.trim()};validateDestinationPin(after);
        tx.set(ref,after);tx.create(db().collection('destination_pin_audit').doc(),{invoiceId:row.id,municipalScopeId:p.municipalScopeId,actorUid:p.uid,at,action:before?'destination_pin_corrected':'destination_pin_verified',reason:b.reason?.trim()??'',before,after});return destinationProjection(row,after,true);
      });
    },
    async preview(animalId,p) {
      return db().runTransaction(async tx=>{
        const {a,vendor,fees,totalCents}=await invoiceInputs(tx,animalId,p);
        return {projection:'invoice_preview_v1',animal:{id:a.id,identifier:a.identifier,species:a.species,weightGrams:a.weightGrams,revision:a.revision,vendorBusinessId:a.vendorBusinessId,municipalScopeId:a.municipalScopeId},vendor:{id:vendor.id,name:vendor.name.trim()},feeSchedule:fees,totalCents,currency:'PHP'};
      });
    },
    async bill(animalId, b, p, at) {
      if(!billingWriter(p))throw fail(403,'Only Billing Staff may issue invoices.');
      if(b.dueDate!==municipalDate(at))throw fail(400,'Payment is due on the Manila issue date.');
      return db().runTransaction(async tx=>{
        const {a,vendor,fees,totalCents,invoiceId}=await invoiceInputs(tx,animalId,p);
        if(a.revision!==b.expectedRevision)throw fail(409,'Refresh and review the approved animal revision.');
        if(fees.version!==b.feeScheduleVersion)throw fail(409,'The fee schedule changed. Refresh before issuing an invoice.');
        const row={id:invoiceId,workflow:'animal',vendor_id:vendor.id,vendor_name:vendor.name.trim(),municipalScopeId:p.municipalScopeId,slaughter_record_id:null,date_issued:municipalDate(at),due_date:b.dueDate,number_of_heads_cow:a.species==='Cow'?1:0,number_of_heads_pig:a.species==='Pig'?1:0,corral_fee:fees.corralCents/100,delivery_fee:fees.deliveryCents/100,anti_mortem_fee:fees.inspectionCents/100,facility_fee:fees.facilityCents/100,total_amount:totalCents/100,totalCents,payment_status:'Unpaid',animalId,animalRevision:a.revision,animalIdentifier:a.identifier,revision:1,feeScheduleVersion:fees.version,feeScheduleSnapshot:fees,syntheticOnly:fees.syntheticOnly===true,createdAt:at,createdBy:p.uid};
        tx.create(invoice(invoiceId),row);
        tx.update(db().doc(`animal_records/${animalId}`),{billingInvoiceId:invoiceId,updatedAt:at,updatedBy:p.uid});
        audited(tx,p,row,'invoice_issued',at); return row;
      });
    },
    async mutate(value, b, p, action, at) {
      if(action==='payment_recorded'&&!billingWriter(p))throw fail(403,'Only Billing Staff may record cash payments.');
      if(action==='delivery_assigned'&&!inspectorAssigner(p))throw fail(403,'Only an Inspector may assign Delivery Staff.');
      if(action==='delivery_location'){
        const result=await tracking.publish(value,b,p,at,{legacy:true});
        return {...result.row,delivery:{...result.row.delivery,location:result.view.location}};
      }
      return db().runTransaction(async tx=>{
        const before=await read(tx,invoice(value));
        if(!scopeRead(before,p))throw fail(404,'Invoice not found.');
        if(!validInvoice(before)||before.workflow!=='animal')throw fail(503,'Invoice requires municipal review.');
        if(before.revision!==b.expectedRevision)throw fail(409,'Invoice changed. Refresh before submitting again.');
        let patch;
        if(action==='payment_recorded') {
          if(before.payment_status==='Paid'||before.payment)throw fail(409,'Payment is already recorded.');
          if(b.method!=='cash')throw fail(400,'Record cash against an existing paper official receipt.');
          if(b.amountCents!==before.totalCents)throw fail(400,'Record the full invoice amount in centavos.');
          const reference=b.receiptReference.normalize('NFKC').trim().toUpperCase();
          if(/^AINV-[0-9a-f]{40}$/i.test(reference))throw fail(400,'AINV is an internal bill reference. Enter the existing paper official-receipt number separately.');
          if(!text(reference,80))throw fail(400,'Use a printable receipt reference.');
          const reservation=db().doc(`operation_receipts/${hash(JSON.stringify([p.municipalScopeId,reference]))}`);
          if((await tx.get(reservation)).exists)throw fail(409,'This receipt reference has already been used.');
          patch={payment_status:'Paid',payment:{receiptReference:reference,amountCents:b.amountCents,method:b.method,recordedAt:at,recordedBy:p.uid}};
          tx.create(reservation,{municipalScopeId:p.municipalScopeId,invoiceId:value,receiptReference:reference});
        } else if(action==='delivery_assigned') {
          if(before.delivery)throw fail(409,'Delivery already has an assignment.');
          const {vendor,destination}=await assignmentInputs(tx,before,p);
          if(b.destinationConfirmed!==true||b.destination!==destination)throw fail(409,'Inspector must confirm the current verified owning-vendor stall destination.');
          const m=await tx.get(db().doc(`mobile_memberships/${b.assigneeUid}`));
          const member=m.exists?m.data():null;
          if(!member||member.role!=='staff'||member.status!=='active'||member.municipalScopeId!==p.municipalScopeId||member.vendorBusinessId!=null||!Array.isArray(member.staffPermissions)||!member.staffPermissions.includes('delivery')||member.staffPermissions.some(v=>!['inventory','billing','delivery'].includes(v)))throw fail(400,'Select an active municipal delivery staff account.');
          const pin=await read(tx,db().doc(`delivery_destination_pins/${before.id}`));if(pin)validateDestinationPin(pin);const reviewed=b.expectedDestination!==undefined||b.expectedDestinationRevision!==undefined;if(pin&&!reviewed)throw fail(409,'Review the verified destination pin in the compatible client before assignment.');if(reviewed&&(b.expectedDestinationRevision!==(pin?.revision??0)||b.expectedDestination.vendorBusinessId!==vendor.id||['marketName','marketSection','stallNumber'].some(k=>b.expectedDestination[k]!==vendor[k])))throw fail(409,'Destination or pin changed. Refresh and confirm before assignment.');const destinationPin=pin&&pinMatches(pin,before,{...vendor,destination,reservationKey:stallReservationKey(vendor)})?pin:null;
          patch={delivery:{assigneeUid:b.assigneeUid,destination,status:'assigned',destinationVerification:{marketName:vendor.marketName,marketSection:vendor.marketSection,stallNumber:vendor.stallNumber,verifiedBy:p.uid,verifiedAt:at},...(destinationPin?{destinationPin}:{}),assignedAt:at,assignedBy:p.uid}};
        } else {
          const d=before.delivery;
          if(!d||p.role!=='staff'||d.assigneeUid!==p.uid||!p.staffPermissions.includes('delivery'))throw fail(403,'Only the assigned delivery staff can update this delivery.');
          const animal=await read(tx,db().doc(`animal_records/${before.animalId}`));
          if(!animal||animal.municipalScopeId!==p.municipalScopeId||animal.vendorBusinessId!==before.vendor_id||animal.revision!==before.animalRevision)throw fail(409,'Shipment ownership/revision requires review.');
          requireMeasured(animal);
          {
            const next={assigned:'in_transit',in_transit:'delivered'}[d.status];
            if(!next||b.status!==next)throw fail(409,'Delivery status changed. Refresh before continuing.');
            patch={delivery:{...d,status:next,notes:b.notes.trim(),updatedAt:at,...(next==='delivered'?{deliveredAt:at}:{})}};
          }
        }
        const row={...before,...patch,revision:before.revision+1,updatedAt:at,updatedBy:p.uid};
        tx.set(invoice(value),row);audited(tx,p,row,action,at,before);return row;
      });
    }
  };
}

export function createOperationsRouter({store,animalStore,enabled=false,getPrincipal,production=null,cursorSecret,now=()=>new Date().toISOString()}) {
  if (production && !cursorSecret) throw new Error('Stable production cursor signing key is required.');
  cursorSecret ??= randomBytes(32);
  const router=Router();
  router.use((req,res,next)=>{res.set('Cache-Control','no-store');const p=getPrincipal(req);if(!p||!id(p.uid)||!id(p.municipalScopeId)||(production&&p.municipalScopeId!==production.municipalScopeId))return res.status(403).json({message:'Authorized municipal access is required.'});req.principal=p;next();});
  router.use((req,res,next)=>{req.operationsEnabled=production?true:typeof enabled==='function'?enabled():enabled;next();});
  router.use((req,res,next)=>req.method!=='GET'&&Object.keys(req.query).length?res.status(400).json({message:'Unsupported workflow filter.'}):next());
  const run=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){if(e.retryAfter)res.set('Retry-After',String(e.retryAfter));res.status(e.status||503).json({message:e.status?e.message:'Workflow unavailable. Refresh before retrying.'});}};
  router.get('/settings',run(async(req,res)=>{
    const enabled=req.operationsEnabled;
    const p=req.principal,canBill=permission(p,'billing'),canDeliver=permission(p,'delivery');
    if(!canBill&&!canDeliver&&p.role!=='vendor'&&p.role!=='inspector')throw fail(403,'Billing or delivery permission is required.');
    let feeSchedule=null,feeMessage=null;
    if(enabled&&canBill&&(!production||production.features.billing))try{feeSchedule=await store.schedule(p.municipalScopeId);}catch(e){if(e.status!==503)throw e;feeMessage='An approved fee schedule is required.';}
    res.json({enabled,invoiceDueDate:municipalDate(now()),serverTime:now(),workspaceContract:'billing_delivery_v1',canReadBilling:enabled&&canBill,canReadDelivery:enabled&&canDeliver,canReadEligible:enabled&&canBill,canReadTracking:enabled&&(p.role==='admin'||p.role==='vendor'||canDeliver),canReadAssignmentCandidates:enabled&&inspectorAssigner(p),canAssignDelivery:enabled&&inspectorAssigner(p)&&(!production||production.features.delivery),canBill:enabled&&billingWriter(p)&&(!production||production.features.billing),canDeliver:enabled&&p.role==='staff'&&canDeliver&&(!production||production.features.delivery),canRecordPayment:enabled&&billingWriter(p)&&(!production||production.features.payment),canPublishTracking:enabled&&canDeliver&&p.role==='staff'&&(!production||production.features.tracking),feeSchedule,feeMessage});
  }));
  router.use((req,res,next)=>req.operationsEnabled?next():res.status(503).json({message:'Billing, payment and delivery workflows are awaiting pilot activation.'}));
  const writeGate=feature=>(req,res,next)=>production&&production.features[feature]!==true
    ?res.status(503).json({message:'This production workflow is paused.'}):next();
  const sign=value=>createHmac('sha256',cursorSecret).update(value).digest('base64url');
  const binding=(p,kind)=>JSON.stringify([p.uid,p.role,p.municipalScopeId,p.vendorBusinessId||'',kind]);
  const encode=(p,after,kind)=>{const data=Buffer.from(JSON.stringify({binding:binding(p,kind),after,expires:Date.now()+3600000})).toString('base64url');return `${data}.${sign(data)}`;};
  const decode=(value,p,kind)=>{if(typeof value!=='string'||value.length>4096)throw fail(400,'Invalid page cursor.');const [data,sig,...extra]=value.split('.');const expected=Buffer.from(sign(data||'')),actual=Buffer.from(sig||'');if(extra.length||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw fail(400,'Invalid page cursor.');let v;try{v=JSON.parse(Buffer.from(data,'base64url').toString());}catch{throw fail(400,'Invalid page cursor.');}if(v.binding!==binding(p,kind)||!id(v.after)||!Number.isFinite(v.expires)||v.expires<=Date.now())throw fail(400,'Invalid page cursor.');return v.after;};
  const query=(req,kind)=>{if(Object.keys(req.query).some(k=>k!=='cursor'))throw fail(400,'Unsupported workflow filter.');return req.query.cursor===undefined?undefined:decode(req.query.cursor,req.principal,kind);};
  const canRead=p=>permission(p,'billing')||permission(p,'delivery')||p.role==='vendor';
  const body=(req,keys,optional=[])=>{const b=req.body;if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!keys.includes(k)&&!optional.includes(k))||keys.some(k=>b[k]===undefined))throw fail(400,'Provide only the required workflow fields.');if(!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<1)throw fail(400,'A current record revision is required.');return b;};
  router.param('id',(req,res,next,value)=>id(value)?next():res.status(400).json({message:'Invalid record ID.'}));
  const trackingRequests=new Map();
  const trackingLimit=(req,res,next)=>{
    const time=Date.now(),key=req.principal.uid;let entry=trackingRequests.get(key);
    if(!entry||time-entry.start>=60000){
      if(trackingRequests.size>=5000){for(const [uid,item] of trackingRequests)if(time-item.start>=60000)trackingRequests.delete(uid);}
      if(!trackingRequests.has(key)&&trackingRequests.size>=5000)return res.status(503).json({message:'Tracking is temporarily busy.'});
      entry={start:time,count:0};trackingRequests.set(key,entry);
    }
    if(++entry.count>30){res.set('Retry-After',String(Math.max(1,Math.ceil((60000-(time-entry.start))/1000))));return res.status(429).json({message:'Tracking request limit reached. Wait before retrying.'});}next();
  };
  router.get('/invoices/:id/tracking',trackingLimit,run(async(req,res)=>{
    if(Object.keys(req.query).length)throw fail(400,'Unsupported tracking filter.');
    const p=req.principal;if(!(p.role==='admin'||p.role==='vendor'||p.role==='staff'&&permission(p,'delivery')))throw fail(403,'Delivery tracking access is required.');
    res.json(await store.trackingRead(req.params.id,p,now()));
  }));
  router.post('/invoices/:id/tracking',writeGate('tracking'),trackingLimit,run(async(req,res)=>{
    const p=req.principal;if(p.role!=='staff'||!permission(p,'delivery'))throw fail(403,'Assigned delivery permission is required.');
    const b=req.body;if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['latitude','longitude','accuracyMeters','capturedAt'].includes(k)))throw fail(400,'Provide only location fields.');
    const result=await store.trackingPublish(req.params.id,b,p,now());res.json({...result.view,duplicate:result.duplicate});
  }));
  router.get('/eligible',run(async(req,res)=>{
    const p=req.principal;if(!permission(p,'billing'))throw fail(403,'Billing permission is required.');
    const rows=await animalStore.list(p,query(req,'eligible'));
    if(!Array.isArray(rows)||rows.length>26||rows.some(a=>a.municipalScopeId!==p.municipalScopeId||!id(a.id)||!id(a.vendorBusinessId)||!Number.isSafeInteger(a.revision)||a.revision<1))throw fail(503,'Animal records require review.');
    // Page the register first, then filter; an empty page may still have a continuation.
    const page=rows.slice(0,25);const items=page.filter(a=>a.inspection?.status==='approved'&&a.inspection.revision===a.revision&&measuredCurrent(a)&&!a.billingInvoiceId&&!a.deliveryId).map(a=>({id:a.id,vendorBusinessId:a.vendorBusinessId,municipalScopeId:a.municipalScopeId,identifier:a.identifier,species:a.species,weightGrams:a.weightGrams,revision:a.revision}));
    res.json({items,nextCursor:rows.length>25?encode(p,page.at(-1).id,'eligible'):null});
  }));
  router.get('/billing/invoices',run(async(req,res)=>{
    if(!permission(req.principal,'billing'))throw fail(403,'Billing permission is required.');
    const rows=await store.list(req.principal,query(req,'billing-invoices'));
    if(!Array.isArray(rows)||rows.length>26||rows.some(row=>!scopeRead(row,req.principal)||!validInvoice(row)))throw fail(503,'Invoices require municipal review.');
    const page=rows.slice(0,25);res.json({items:page.map(operationBillingView),nextCursor:rows.length>25?encode(req.principal,page.at(-1).id,'billing-invoices'):null});
  }));
  router.get('/billing/invoices/:id',run(async(req,res)=>{
    if(!permission(req.principal,'billing'))throw fail(403,'Billing permission is required.');if(Object.keys(req.query).length)throw fail(400,'Unsupported workflow filter.');
    const row=await store.get(req.params.id);if(!scopeRead(row,req.principal))throw fail(404,'Invoice not found.');if(!validInvoice(row))throw fail(503,'Invoice requires municipal review.');res.json(operationBillingView(row));
  }));
  const deliveryRow=async(req)=>{const row=await store.get(req.params.id);if(!deliveryReadable(row,req.principal))throw fail(404,'Delivery assignment not found.');if(!validInvoice(row))throw fail(503,'Delivery invoice requires municipal review.');return row;};
  const deliveryPermission=p=>permission(p,'delivery');
  const deliveryView=async row=>deliveryAssignmentView(row,await animalStore.get(row.animalId));
  router.get('/deliveries',run(async(req,res)=>{
    if(!deliveryPermission(req.principal))throw fail(403,'Delivery permission is required.');
    const after=query(req,'deliveries'),rows=await store.deliveries(req.principal,after);
    if(!Array.isArray(rows)||rows.length>26||rows.some(row=>!deliveryReadable(row,req.principal)||!validInvoice(row)))throw fail(503,'Delivery assignments require municipal review.');
    for(let i=0;i<rows.length;i++){const previous=i?rows[i-1].id:after;if(previous&&Buffer.compare(Buffer.from(previous),Buffer.from(rows[i].id))>=0)throw fail(503,'Delivery ordering requires review.');}
    const page=rows.slice(0,25);res.json({items:await Promise.all(page.map(deliveryView)),nextCursor:rows.length>25?encode(req.principal,page.at(-1).id,'deliveries'):null});
  }));
  router.get('/deliveries/:id',run(async(req,res)=>{if(!deliveryPermission(req.principal))throw fail(403,'Delivery permission is required.');if(Object.keys(req.query).length)throw fail(400,'Unsupported delivery filter.');res.json(await deliveryView(await deliveryRow(req)));}));
  router.post('/deliveries/:id/status',writeGate('delivery'),run(async(req,res)=>{
    if(!deliveryPermission(req.principal))throw fail(403,'Delivery permission is required.');
    const b=body(req,['expectedRevision','status','notes']);if(!['in_transit','delivered'].includes(b.status)||!text(b.notes,500))throw fail(400,'Enter delivery status and confirmation notes.');
    const before=await deliveryRow(req),animal=await animalStore.get(before.animalId);deliveryAssignmentView(before,animal);
    res.json(deliveryAssignmentView(await store.mutate(req.params.id,b,req.principal,'delivery_status',now()),animal));
  }));
  router.get('/invoices',run(async(req,res)=>{
    if(!canRead(req.principal))throw fail(403,'Billing or delivery permission is required.');
    const rows=await store.list(req.principal,query(req,'invoices'));
    if(!Array.isArray(rows)||rows.length>26||rows.some(row=>!scopeRead(row,req.principal)||(deliveryOnly(req.principal)&&row.delivery?.assigneeUid!==req.principal.uid)||!validInvoice(row)))throw fail(503,'Invoices require municipal review.');
    const page=rows.slice(0,25);res.json({items:page.map(operationInvoiceView),nextCursor:rows.length>25?encode(req.principal,page.at(-1).id,'invoices'):null});
  }));
  router.get('/invoices/:id',run(async(req,res)=>{
    if(Object.keys(req.query).length)throw fail(400,'Unsupported workflow filter.');if(!canRead(req.principal))throw fail(403,'Billing or delivery permission is required.');
    const row=await store.get(req.params.id);if(!scopeRead(row,req.principal)||(deliveryOnly(req.principal)&&row.delivery?.assigneeUid!==req.principal.uid))throw fail(404,'Invoice not found.');if(!validInvoice(row))throw fail(503,'Invoice requires municipal review.');res.json(operationInvoiceView(row));
  }));
  router.get('/animals/:id/invoice-preview',run(async(req,res)=>{
    if(!permission(req.principal,'billing'))throw fail(403,'Billing permission is required.');
    if(Object.keys(req.query).length)throw fail(400,'Unsupported invoice preview filter.');
    res.json(await store.preview(req.params.id,req.principal));
  }));
  router.post('/animals/:id/invoice',writeGate('billing'),run(async(req,res)=>{
    if(!billingWriter(req.principal))throw fail(403,'Only Billing Staff may write financial records.');
    const b=body(req,['expectedRevision','feeScheduleVersion','dueDate']);
    const at=now();
    if(!Number.isSafeInteger(b.feeScheduleVersion)||b.feeScheduleVersion<1||!day(b.dueDate)||b.dueDate!==municipalDate(at))throw fail(400,'Use the displayed fee schedule and the same-day Manila due date.');
    res.status(201).json(operationInvoiceView(await store.bill(req.params.id,b,req.principal,at)));
  }));
  router.post('/invoices/:id/payment',writeGate('payment'),run(async(req,res)=>{
    if(!billingWriter(req.principal))throw fail(403,'Only Billing Staff may write financial records.');
    const b=body(req,['expectedRevision','amountCents','receiptReference','method']);
    if(!money(b.amountCents)||b.amountCents<=0||!text(b.receiptReference,80)||b.method!=='cash')throw fail(400,'Enter the full payment, receipt reference and supported payment method.');
    res.json(operationInvoiceView(await store.mutate(req.params.id,b,req.principal,'payment_recorded',now())));
  }));
  router.get('/assignment-candidates',run(async(req,res)=>{
    if(!inspectorAssigner(req.principal))throw fail(403,'Inspector assignment authority is required.');
    const rows=await store.list(req.principal,query(req,'assignment-candidates'));if(!Array.isArray(rows)||rows.length>26||rows.some(r=>!scopeRead(r,req.principal)||!validInvoice(r)))throw fail(503,'Assignment candidates require review.');
    const page=rows.slice(0,25);res.json({items:page.filter(r=>!r.delivery).map(r=>({invoiceId:r.id,revision:r.revision,animalId:r.animalId,animalIdentifier:r.animalIdentifier,vendorBusinessId:r.vendor_id,vendorName:r.vendor_name})),nextCursor:rows.length>25?encode(req.principal,page.at(-1).id,'assignment-candidates'):null});
  }));
  router.get('/delivery-staff',run(async(req,res)=>{if(!inspectorAssigner(req.principal))throw fail(403,'Inspector assignment authority is required.');const page=await store.deliveryStaff(req.principal,query(req,'delivery-staff'));res.json({items:page.items,nextCursor:page.after?encode(req.principal,page.after,'delivery-staff'):null});}));
  router.get('/oversight/invoices/:id',run(async(req,res)=>{
    if(req.principal.role!=='admin')throw fail(403,'Municipal oversight access is required.');if(Object.keys(req.query).length)throw fail(400,'Unsupported oversight filter.');
    const row=await store.get(req.params.id);if(!scopeRead(row,req.principal))throw fail(404,'Invoice not found.');if(!validInvoice(row))throw fail(503,'Invoice requires review.');
    const animal=await animalStore.get(row.animalId);if(!animal||animal.id!==row.animalId||animal.municipalScopeId!==row.municipalScopeId||animal.vendorBusinessId!==row.vendor_id||!['Cow','Pig'].includes(animal.species)||!text(animal.identifier,80)||!Number.isSafeInteger(animal.weightGrams)||animal.weightGrams<=0||!Number.isSafeInteger(animal.revision)||animal.revision<1||!['pending','approved','rejected'].includes(animal.inspection?.status)||!Number.isSafeInteger(animal.inspection.revision)||typeof animal.weighedAt!=='string'||!Number.isFinite(Date.parse(animal.weighedAt)))throw fail(503,'Invoice/animal ownership and weight details require review.');
    const tracking=await store.trackingRead(row.id,req.principal,now()),after=await store.get(row.id);if(after?.revision!==row.revision)throw fail(409,'Invoice changed during refresh. Refresh the oversight view.');
    const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
    res.json({projection:'municipal_oversight_v1',invoice:operationBillingView(row),animal:{...pick(animal,['id','identifier','species','revision','weightGrams','weighedAt','carcassEstimate']),inspection:pick(animal.inspection,['status','revision','decidedAt']),carcassWeight:animal.carcassWeight?pick(animal.carcassWeight,['weightGrams','weighedAt','animalRevision','revision']):null},assignment:row.delivery?deliveryAssignmentView(row,animal):null,tracking,refreshedAt:now(),consistency:'Read-only reconciliation; latest location has its own capture/receive times, not an accounting snapshot.'});
  }));
  router.get('/invoices/:id/drop-off-point',run(async(req,res)=>{if(Object.keys(req.query).length)throw fail(400,'Unsupported drop-off filter.');const view=await store.dropOffRead(req.params.id,req.principal);view.canUpdate=Boolean(view.canUpdate&&req.operationsEnabled&&(!production||production.features.delivery===true));res.json(view);}));
  router.post('/invoices/:id/drop-off-point',writeGate('delivery'),run(async(req,res)=>{
    const b=body(req,['latitude','longitude','expectedRevision','expectedDropOffRevision','selectionMethod','confirmed']);if(Object.keys(req.query).length||!validCoordinates(b.latitude,b.longitude)||!Number.isSafeInteger(b.expectedDropOffRevision)||b.expectedDropOffRevision<0||!['map_tap','device_location'].includes(b.selectionMethod)||b.confirmed!==true)throw fail(400,'Confirm valid drop-off coordinates, selection method and current revisions.');res.json(await store.dropOffWrite(req.params.id,b,req.principal,now()));
  }));
  router.get('/invoices/:id/destination-map',run(async(req,res)=>{if(Object.keys(req.query).length)throw fail(400,'Unsupported destination filter.');res.json(await store.destinationRead(req.params.id,req.principal));}));
  router.post('/invoices/:id/destination-map',writeGate('delivery'),run(async(req,res)=>{
    const b=req.body;if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['latitude','longitude','expectedRevision','expectedDestinationRevision','verificationReference','reason','confirmed','expectedDestination'].includes(k))||!b.expectedDestination||typeof b.expectedDestination!=='object'||Array.isArray(b.expectedDestination)||Object.keys(b.expectedDestination).sort().join(',')!=='marketName,marketSection,stallNumber,vendorBusinessId'||!id(b.expectedDestination.vendorBusinessId)||!text(b.expectedDestination.marketName,120)||!text(b.expectedDestination.marketSection,80)||!text(b.expectedDestination.stallNumber,40)||b.confirmed!==true||!validCoordinates(b.latitude,b.longitude)||!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<1||!Number.isSafeInteger(b.expectedDestinationRevision)||b.expectedDestinationRevision<0||!text(b.verificationReference,200)||/[\u0000-\u001f\u007f]/.test(b.verificationReference)||(b.reason!==undefined&&(!text(b.reason,500)||/[\u0000-\u001f\u007f]/.test(b.reason))))throw fail(400,'Provide verified coordinates, provenance and current invoice/destination revisions.');
    res.json(await store.destinationWrite(req.params.id,b,req.principal,now()));
  }));
  router.get('/invoices/:id/assignment-options',run(async(req,res)=>{if(Object.keys(req.query).length)throw fail(400,'Unsupported assignment filter.');res.json(await store.assignmentOptions(req.params.id,req.principal));}));
  router.post('/invoices/:id/delivery',writeGate('delivery'),run(async(req,res)=>{
    if(!inspectorAssigner(req.principal))throw fail(403,'Only an Inspector may assign Delivery Staff.');
    const b=body(req,['expectedRevision','assigneeUid','destination','destinationConfirmed'],['expectedDestination','expectedDestinationRevision']);if((b.expectedDestination!==undefined||b.expectedDestinationRevision!==undefined)&&(!validReviewedDestination(b.expectedDestination)||!Number.isSafeInteger(b.expectedDestinationRevision)||b.expectedDestinationRevision<0))throw fail(400,'Provide the reviewed Vendor/stall tuple and destination pin revision.');if(!id(b.assigneeUid)||!text(b.destination,200))throw fail(400,'Enter delivery staff and destination.');
    const row=await store.mutate(req.params.id,b,req.principal,'delivery_assigned',now());res.json({projection:'delivery_assignment_confirmation_v1',invoiceId:row.id,revision:row.revision,assigneeUid:row.delivery.assigneeUid,destination:row.delivery.destination,status:row.delivery.status});
  }));
  router.post('/invoices/:id/delivery/status',writeGate('delivery'),run(async(req,res)=>{
    if(!permission(req.principal,'delivery'))throw fail(403,'Delivery permission is required.');
    const b=body(req,['expectedRevision','status','notes']);if(!['in_transit','delivered'].includes(b.status)||!text(b.notes,500))throw fail(400,'Enter delivery status and confirmation notes.');
    res.json(operationInvoiceView(await store.mutate(req.params.id,b,req.principal,'delivery_status',now())));
  }));
  router.post('/invoices/:id/delivery/location',writeGate('tracking'),trackingLimit,run(async(req,res)=>{
    if(!permission(req.principal,'delivery'))throw fail(403,'Delivery permission is required.');
    const b=body(req,['expectedRevision','latitude','longitude','accuracyMeters','capturedAt']);
    const captured=Date.parse(b.capturedAt),at=now(),time=Date.parse(at);
    if(typeof b.latitude!=='number'||!Number.isFinite(b.latitude)||Math.abs(b.latitude)>90||typeof b.longitude!=='number'||!Number.isFinite(b.longitude)||Math.abs(b.longitude)>180||typeof b.accuracyMeters!=='number'||!Number.isFinite(b.accuracyMeters)||b.accuracyMeters<0||b.accuracyMeters>1000||typeof b.capturedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(b.capturedAt)||!Number.isFinite(captured)||time-captured>300000||captured-time>60000)throw fail(400,'Use a recent location with valid coordinates and accuracy.');
    res.json(operationInvoiceView(await store.mutate(req.params.id,b,req.principal,'delivery_location',at)));
  }));
  router.use((req,res)=>res.status(405).json({message:'Workflow operation is unavailable.'}));
  return router;
}
