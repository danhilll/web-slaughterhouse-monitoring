import { Router } from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { createTrackingStore } from './tracking.js';
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
export const operationInvoiceView = row => {
  const pick=(source,keys)=>Object.fromEntries(keys.filter(key=>source[key]!==undefined).map(key=>[key,source[key]]));
  const result=pick(row,invoiceKeys);
  if(row.payment)result.payment=pick(row.payment,['receiptReference','amountCents','method','recordedAt']);
  if(row.delivery){result.delivery=pick(row.delivery,['assigneeUid','destination','status','notes','assignedAt','updatedAt','deliveredAt']);if(row.delivery.location)result.delivery.location=pick(row.delivery.location,['latitude','longitude','accuracyMeters','capturedAt','receivedAt']);}
  return result;
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
function scheduleView(s) {
  if (!s || s.status !== 'approved' || !Number.isSafeInteger(s.version) || s.version < 1 || s.basis !== 'perAnimal' || s.currency !== 'PHP' || !['corralCents','deliveryCents','inspectionCents','facilityCents'].every(key => money(s[key])) || s.corralCents+s.deliveryCents+s.inspectionCents+s.facilityCents <= 0 || !money(s.corralCents+s.deliveryCents+s.inspectionCents+s.facilityCents)) throw fail(503, 'An approved fee schedule is required.');
  return Object.fromEntries(['version','basis','currency','corralCents','deliveryCents','inspectionCents','facilityCents','syntheticOnly'].filter(key => s[key] !== undefined).map(key => [key,s[key]]));
}

/** One invoice per approved animal revision; amounts are server-calculated integer centavos. */
export function createOperationsStore(getDb) {
  const tracking=createTrackingStore(getDb,validInvoice);
  const db = () => { const value = getDb(); if (!value) throw fail(503, 'Workflow storage is unavailable.'); return value; };
  const invoice = value => db().doc(`invoices/${value}`);
  const read = async (tx, ref) => { const snap = await tx.get(ref); if (!snap.exists) return null; const row = snap.data(); if (row.id !== undefined && row.id !== snap.id) throw fail(503,'Record identity requires review.'); return {...row,id:snap.id}; };
  const audited = (tx, p, row, action, at) => tx.create(db().collection('operation_audit').doc(), {invoiceId:row.id,animalId:row.animalId,municipalScopeId:p.municipalScopeId,actorUid:p.uid,action,at,after:operationInvoiceView(row)});
  return {
    trackingRead:(value,p,at)=>tracking.read(value,p,at),
    trackingPublish:(value,b,p,at)=>tracking.publish(value,b,p,at),
    async schedule(scope) { const s = await db().doc(`operation_fee_schedules/${scope}`).get(); return scheduleView(s.exists?s.data():null); },
    async list(p, after) {
      let q = db().collection('invoices').where('municipalScopeId','==',p.municipalScopeId).where('workflow','==','animal');
      if (p.role === 'vendor') q = q.where('vendor_id','==',p.vendorBusinessId);
      q = q.orderBy(FieldPath.documentId()); if (after) q=q.startAfter(after);
      const rows=await q.limit(26).get(); return rows.docs.map(s=>{const row=s.data();if(row.id!==undefined&&row.id!==s.id)throw fail(503,'Invoice identity requires review.');return {...row,id:s.id};});
    },
    async get(value) { const s=await invoice(value).get(); if(!s.exists)return null; if(s.data().id!==undefined&&s.data().id!==s.id)throw fail(503,'Invoice identity requires review.');return {...s.data(),id:s.id}; },
    async bill(animalId, b, p, at) {
      const invoiceId=`AINV-${hash(JSON.stringify([p.municipalScopeId,animalId])).slice(0,40)}`;
      return db().runTransaction(async tx=>{
        const a=await read(tx,db().doc(`animal_records/${animalId}`));
        if(!a||a.municipalScopeId!==p.municipalScopeId)throw fail(404,'Animal record not found.');
        if(a.revision!==b.expectedRevision||a.inspection?.status!=='approved'||a.inspection.revision!==a.revision||!id(a.vendorBusinessId)||!['Cow','Pig'].includes(a.species)||!Number.isSafeInteger(a.weightGrams)||a.weightGrams<=0)throw fail(409,'Refresh and review the approved animal revision.');
        const existing=await read(tx,invoice(invoiceId));
        if(existing||a.billingInvoiceId||a.deliveryId)throw fail(409,'This animal already has an invoice. Refresh invoice history.');
        const vendor=await read(tx,db().doc(`vendors/${a.vendorBusinessId}`));
        if(!vendor||vendor.status!=='Active'||vendor.municipalScopeId!==p.municipalScopeId||!text(vendor.name,200))throw fail(409,'Vendor ownership requires municipal review.');
        const feeSnap=await tx.get(db().doc(`operation_fee_schedules/${p.municipalScopeId}`));
        const fees=scheduleView(feeSnap.exists?feeSnap.data():null);
        if(fees.version!==b.feeScheduleVersion)throw fail(409,'The fee schedule changed. Refresh before issuing an invoice.');
        const totalCents=fees.corralCents+fees.deliveryCents+fees.inspectionCents+fees.facilityCents;
        const row={id:invoiceId,workflow:'animal',vendor_id:vendor.id,vendor_name:vendor.name.trim(),municipalScopeId:p.municipalScopeId,slaughter_record_id:null,date_issued:municipalDate(at),due_date:b.dueDate,number_of_heads_cow:a.species==='Cow'?1:0,number_of_heads_pig:a.species==='Pig'?1:0,corral_fee:fees.corralCents/100,delivery_fee:fees.deliveryCents/100,anti_mortem_fee:fees.inspectionCents/100,facility_fee:fees.facilityCents/100,total_amount:totalCents/100,totalCents,payment_status:'Unpaid',animalId,animalRevision:a.revision,animalIdentifier:a.identifier,revision:1,feeScheduleVersion:fees.version,syntheticOnly:fees.syntheticOnly===true,createdAt:at,createdBy:p.uid};
        tx.create(invoice(invoiceId),row);
        tx.update(db().doc(`animal_records/${animalId}`),{billingInvoiceId:invoiceId,updatedAt:at,updatedBy:p.uid});
        audited(tx,p,row,'invoice_issued',at); return row;
      });
    },
    async mutate(value, b, p, action, at) {
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
          if(b.amountCents!==before.totalCents)throw fail(400,'Record the full invoice amount in centavos.');
          const reference=b.receiptReference.normalize('NFKC').trim().toUpperCase();
          if(!text(reference,80))throw fail(400,'Use a printable receipt reference.');
          const reservation=db().doc(`operation_receipts/${hash(JSON.stringify([p.municipalScopeId,reference]))}`);
          if((await tx.get(reservation)).exists)throw fail(409,'This receipt reference has already been used.');
          patch={payment_status:'Paid',payment:{receiptReference:reference,amountCents:b.amountCents,method:b.method,recordedAt:at,recordedBy:p.uid}};
          tx.create(reservation,{municipalScopeId:p.municipalScopeId,invoiceId:value,receiptReference:reference});
        } else if(action==='delivery_assigned') {
          if(before.payment_status!=='Paid'||before.delivery)throw fail(409,'Delivery requires a paid invoice with no existing assignment.');
          const m=await tx.get(db().doc(`mobile_memberships/${b.assigneeUid}`));
          const member=m.exists?m.data():null;
          if(!member||member.role!=='staff'||member.status!=='active'||member.municipalScopeId!==p.municipalScopeId||member.vendorBusinessId!=null||!Array.isArray(member.staffPermissions)||!member.staffPermissions.includes('delivery')||member.staffPermissions.some(v=>!['inventory','billing','delivery'].includes(v)))throw fail(400,'Select an active municipal delivery staff account.');
          patch={delivery:{assigneeUid:b.assigneeUid,destination:b.destination.trim(),status:'assigned',assignedAt:at,assignedBy:p.uid}};
        } else {
          const d=before.delivery;
          if(!d||p.role!=='staff'||d.assigneeUid!==p.uid||!p.staffPermissions.includes('delivery'))throw fail(403,'Only the assigned delivery staff can update this delivery.');
          if(before.payment_status!=='Paid')throw fail(409,'Delivery requires a paid invoice.');
          {
            const next={assigned:'in_transit',in_transit:'delivered'}[d.status];
            if(!next||b.status!==next)throw fail(409,'Delivery status changed. Refresh before continuing.');
            patch={delivery:{...d,status:next,notes:b.notes.trim(),updatedAt:at,...(next==='delivered'?{deliveredAt:at}:{})}};
          }
        }
        const row={...before,...patch,revision:before.revision+1,updatedAt:at,updatedBy:p.uid};
        tx.set(invoice(value),row);audited(tx,p,row,action,at);return row;
      });
    }
  };
}

export function createOperationsRouter({store,animalStore,enabled=false,getPrincipal,cursorSecret=randomBytes(32),now=()=>new Date().toISOString()}) {
  const router=Router();
  router.use((req,res,next)=>{res.set('Cache-Control','no-store');const p=getPrincipal(req);if(!p||!id(p.uid)||!id(p.municipalScopeId))return res.status(403).json({message:'Authorized municipal access is required.'});req.principal=p;next();});
  router.use((req,res,next)=>{req.operationsEnabled=typeof enabled==='function'?enabled():enabled;next();});
  router.use((req,res,next)=>req.method!=='GET'&&Object.keys(req.query).length?res.status(400).json({message:'Unsupported workflow filter.'}):next());
  const run=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){if(e.retryAfter)res.set('Retry-After',String(e.retryAfter));res.status(e.status||503).json({message:e.status?e.message:'Workflow unavailable. Refresh before retrying.'});}};
  router.get('/settings',run(async(req,res)=>{
    const enabled=req.operationsEnabled;
    const p=req.principal,canBill=permission(p,'billing'),canDeliver=permission(p,'delivery');
    if(!canBill&&!canDeliver&&p.role!=='vendor')throw fail(403,'Billing or delivery permission is required.');
    let feeSchedule=null,feeMessage=null;
    if(enabled&&canBill)try{feeSchedule=await store.schedule(p.municipalScopeId);}catch(e){if(e.status!==503)throw e;feeMessage='An approved fee schedule is required.';}
    res.json({enabled,canBill,canDeliver,feeSchedule,feeMessage});
  }));
  router.use((req,res,next)=>req.operationsEnabled?next():res.status(503).json({message:'Billing, payment and delivery workflows are awaiting pilot activation.'}));
  const sign=value=>createHmac('sha256',cursorSecret).update(value).digest('base64url');
  const binding=(p,kind)=>JSON.stringify([p.uid,p.role,p.municipalScopeId,p.vendorBusinessId||'',kind]);
  const encode=(p,after,kind)=>{const data=Buffer.from(JSON.stringify({binding:binding(p,kind),after,expires:Date.now()+3600000})).toString('base64url');return `${data}.${sign(data)}`;};
  const decode=(value,p,kind)=>{if(typeof value!=='string'||value.length>4096)throw fail(400,'Invalid page cursor.');const [data,sig,...extra]=value.split('.');const expected=Buffer.from(sign(data||'')),actual=Buffer.from(sig||'');if(extra.length||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw fail(400,'Invalid page cursor.');let v;try{v=JSON.parse(Buffer.from(data,'base64url').toString());}catch{throw fail(400,'Invalid page cursor.');}if(v.binding!==binding(p,kind)||!id(v.after)||!Number.isFinite(v.expires)||v.expires<=Date.now())throw fail(400,'Invalid page cursor.');return v.after;};
  const query=(req,kind)=>{if(Object.keys(req.query).some(k=>k!=='cursor'))throw fail(400,'Unsupported workflow filter.');return req.query.cursor===undefined?undefined:decode(req.query.cursor,req.principal,kind);};
  const canRead=p=>permission(p,'billing')||permission(p,'delivery')||p.role==='vendor';
  const body=(req,keys)=>{const b=req.body;if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!keys.includes(k))||keys.some(k=>b[k]===undefined))throw fail(400,'Provide only the required workflow fields.');if(!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<1)throw fail(400,'A current record revision is required.');return b;};
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
  router.post('/invoices/:id/tracking',trackingLimit,run(async(req,res)=>{
    const p=req.principal;if(p.role!=='staff'||!permission(p,'delivery'))throw fail(403,'Assigned delivery permission is required.');
    const b=req.body;if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['latitude','longitude','accuracyMeters','capturedAt'].includes(k)))throw fail(400,'Provide only location fields.');
    const result=await store.trackingPublish(req.params.id,b,p,now());res.json({...result.view,duplicate:result.duplicate});
  }));
  router.get('/eligible',run(async(req,res)=>{
    const p=req.principal;if(!permission(p,'billing'))throw fail(403,'Billing permission is required.');
    const rows=await animalStore.list(p,query(req,'eligible'));
    if(!Array.isArray(rows)||rows.length>26||rows.some(a=>a.municipalScopeId!==p.municipalScopeId||!id(a.id)||!id(a.vendorBusinessId)||!Number.isSafeInteger(a.revision)||a.revision<1))throw fail(503,'Animal records require review.');
    // Page the register first, then filter; an empty page may still have a continuation.
    const page=rows.slice(0,25);const items=page.filter(a=>a.inspection?.status==='approved'&&a.inspection.revision===a.revision&&!a.billingInvoiceId&&!a.deliveryId).map(a=>({id:a.id,vendorBusinessId:a.vendorBusinessId,municipalScopeId:a.municipalScopeId,identifier:a.identifier,species:a.species,weightGrams:a.weightGrams,revision:a.revision}));
    res.json({items,nextCursor:rows.length>25?encode(p,page.at(-1).id,'eligible'):null});
  }));
  router.get('/invoices',run(async(req,res)=>{
    if(!canRead(req.principal))throw fail(403,'Billing or delivery permission is required.');
    const rows=await store.list(req.principal,query(req,'invoices'));
    if(!Array.isArray(rows)||rows.length>26||rows.some(row=>!scopeRead(row,req.principal)||!validInvoice(row)))throw fail(503,'Invoices require municipal review.');
    const page=rows.slice(0,25);res.json({items:page.map(operationInvoiceView),nextCursor:rows.length>25?encode(req.principal,page.at(-1).id,'invoices'):null});
  }));
  router.get('/invoices/:id',run(async(req,res)=>{
    if(Object.keys(req.query).length)throw fail(400,'Unsupported workflow filter.');if(!canRead(req.principal))throw fail(403,'Billing or delivery permission is required.');
    const row=await store.get(req.params.id);if(!scopeRead(row,req.principal))throw fail(404,'Invoice not found.');if(!validInvoice(row))throw fail(503,'Invoice requires municipal review.');res.json(operationInvoiceView(row));
  }));
  router.post('/animals/:id/invoice',run(async(req,res)=>{
    if(!permission(req.principal,'billing'))throw fail(403,'Billing permission is required.');
    const b=body(req,['expectedRevision','feeScheduleVersion','dueDate']);
    const at=now();
    if(!Number.isSafeInteger(b.feeScheduleVersion)||b.feeScheduleVersion<1||!day(b.dueDate)||b.dueDate<municipalDate(at))throw fail(400,'Use the displayed fee schedule and a valid due date.');
    res.status(201).json(operationInvoiceView(await store.bill(req.params.id,b,req.principal,at)));
  }));
  router.post('/invoices/:id/payment',run(async(req,res)=>{
    if(!permission(req.principal,'billing'))throw fail(403,'Billing permission is required.');
    const b=body(req,['expectedRevision','amountCents','receiptReference','method']);
    if(!money(b.amountCents)||b.amountCents<=0||!text(b.receiptReference,80)||!['cash','bank_transfer'].includes(b.method))throw fail(400,'Enter the full payment, receipt reference and supported payment method.');
    res.json(operationInvoiceView(await store.mutate(req.params.id,b,req.principal,'payment_recorded',now())));
  }));
  router.post('/invoices/:id/delivery',run(async(req,res)=>{
    if(!permission(req.principal,'delivery'))throw fail(403,'Delivery permission is required.');
    const b=body(req,['expectedRevision','assigneeUid','destination']);if(!id(b.assigneeUid)||!text(b.destination,200))throw fail(400,'Enter delivery staff and destination.');
    res.json(operationInvoiceView(await store.mutate(req.params.id,b,req.principal,'delivery_assigned',now())));
  }));
  router.post('/invoices/:id/delivery/status',run(async(req,res)=>{
    if(!permission(req.principal,'delivery'))throw fail(403,'Delivery permission is required.');
    const b=body(req,['expectedRevision','status','notes']);if(!['in_transit','delivered'].includes(b.status)||!text(b.notes,500))throw fail(400,'Enter delivery status and confirmation notes.');
    res.json(operationInvoiceView(await store.mutate(req.params.id,b,req.principal,'delivery_status',now())));
  }));
  router.post('/invoices/:id/delivery/location',trackingLimit,run(async(req,res)=>{
    if(!permission(req.principal,'delivery'))throw fail(403,'Delivery permission is required.');
    const b=body(req,['expectedRevision','latitude','longitude','accuracyMeters','capturedAt']);
    const captured=Date.parse(b.capturedAt),at=now(),time=Date.parse(at);
    if(typeof b.latitude!=='number'||!Number.isFinite(b.latitude)||Math.abs(b.latitude)>90||typeof b.longitude!=='number'||!Number.isFinite(b.longitude)||Math.abs(b.longitude)>180||typeof b.accuracyMeters!=='number'||!Number.isFinite(b.accuracyMeters)||b.accuracyMeters<0||b.accuracyMeters>1000||typeof b.capturedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(b.capturedAt)||!Number.isFinite(captured)||time-captured>300000||captured-time>60000)throw fail(400,'Use a recent location with valid coordinates and accuracy.');
    res.json(operationInvoiceView(await store.mutate(req.params.id,b,req.principal,'delivery_location',at)));
  }));
  router.use((req,res)=>res.status(405).json({message:'Workflow operation is unavailable.'}));
  return router;
}
