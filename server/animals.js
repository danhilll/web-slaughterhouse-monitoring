import { Router } from 'express';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { EMAIL_VERIFICATION_REQUIRED, verifyFirebaseIdToken } from './access.js';

export const STAFF_PERMISSIONS = ['inventory', 'billing', 'delivery'];
const validId = v => typeof v === 'string' && v.length > 0 && v.length <= 128 && v === v.trim() && !v.includes('/') && !['.', '..'].includes(v);
const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
const timestamp = v => typeof v === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
export const animalBillingEligible = a => a.inspection?.status === 'approved' && a.inspection.revision === a.revision;
const carcassKeys = ['weightGrams','weighedAt','revision','animalRevision','recordedAt','recordedBy'];
const validCarcass = c => c == null || (Number.isSafeInteger(c.weightGrams) && c.weightGrams > 0 && timestamp(c.weighedAt) && Number.isSafeInteger(c.revision) && c.revision > 0 && Number.isSafeInteger(c.animalRevision) && c.animalRevision > 0 && timestamp(c.recordedAt) && validId(c.recordedBy));
const view = a => ({...Object.fromEntries(['id','municipalScopeId','vendorBusinessId','identifier','identifierType','species','weightGrams','weighedAt','revision','createdAt','createdBy','updatedAt','updatedBy'].map(k => [k,a[k]])),inspection:Object.fromEntries(['status','revision','inspectorUid','decidedAt','notes'].filter(k=>a.inspection?.[k]!==undefined).map(k=>[k,a.inspection[k]])),carcassWeight:a.carcassWeight?Object.fromEntries(carcassKeys.map(k=>[k,a.carcassWeight[k]])):null,carcassWeightLocked:Boolean(a.billingInvoiceId||a.deliveryId)});
const validInspection = a => ['pending','approved','rejected'].includes(a.inspection?.status) && a.inspection.revision===a.revision &&
  (a.inspection.status==='pending' || (validId(a.inspection.inspectorUid) && timestamp(a.inspection.decidedAt) && text(a.inspection.notes,500)));
// These fields are required by the mobile record contract. Reject incomplete
// stored records before returning a successful response; never fabricate audit evidence.
const validRecord = a => validCarcass(a.carcassWeight) && (!a.carcassWeight || a.carcassWeight.animalRevision<=a.revision) && validId(a.id) && validId(a.municipalScopeId) && validId(a.vendorBusinessId) && ['Cow','Pig'].includes(a.species) && Number.isSafeInteger(a.weightGrams) && a.weightGrams>0 && timestamp(a.weighedAt) && text(a.identifier,80) && ['manual','rfid'].includes(a.identifierType) && Number.isSafeInteger(a.revision) && a.revision>0 && validInspection(a) && timestamp(a.createdAt) && validId(a.createdBy) && timestamp(a.updatedAt) && validId(a.updatedBy);
const inventory = p => p.role === 'admin' || (p.role === 'staff' && p.staffPermissions.includes('inventory'));
const readable = (a,p) => a?.municipalScopeId === p.municipalScopeId && (p.role !== 'vendor' || a.vendorBusinessId === p.vendorBusinessId);
function validateDetails(b) {
  if (!validId(b.vendorBusinessId) || !['Cow','Pig'].includes(b.species) || !Number.isSafeInteger(b.weightGrams) || b.weightGrams <= 0 || !timestamp(b.weighedAt) || Date.parse(b.weighedAt) > Date.now()+60000) throw fail(400,'Provide a vendor, species, positive weight in grams and a valid weighing time.');
  return { vendorBusinessId:b.vendorBusinessId,species:b.species,weightGrams:b.weightGrams,weighedAt:new Date(b.weighedAt).toISOString() };
}

export function createAnimalStore(getDb) {
  const db=()=>{const value=getDb();if(!value)throw fail(503,'Animal storage is unavailable.');return value;};
  const ref=id=>db().doc(`animal_records/${id}`);
  const approvedVendor=async(tx,vendorBusinessId,scope)=>{
    const v=await tx.get(db().doc(`vendors/${vendorBusinessId}`));
    if(!v.exists || v.data().status!=='Active' || v.data().municipalScopeId!==scope || (v.data().id!==undefined&&v.data().id!==v.id))throw fail(409,'Vendor ownership must reference an active business in this municipality.');
  };
  return {
    async membership(uid){const s=await db().doc(`mobile_memberships/${uid}`).get();return s.exists?s.data():null;},
    async vendor(id){const s=await db().doc(`vendors/${id}`).get();if(s.exists&&s.data().id!==undefined&&s.data().id!==s.id)throw fail(503,'Vendor identity requires review.');return s.exists?{...s.data(),id:s.id}:null;},
    async inspectorVendor(id,p){
      return db().runTransaction(async tx=>{
        const snapshot=await tx.get(ref(id));
        const a=snapshot.exists?{...snapshot.data(),id:snapshot.id}:null;
        if(!readable(a,p))throw fail(404,'Animal record not found.');
        if(!validRecord(a)||(snapshot.data().id!==undefined&&snapshot.data().id!==snapshot.id))throw fail(503,'Animal record requires administrator review.');
        const business=await tx.get(db().doc(`vendors/${a.vendorBusinessId}`));
        if(!business.exists)throw fail(503,'Vendor identity is unavailable. Municipal review is required.');
        const v=business.data();
        if(v.municipalScopeId!==p.municipalScopeId)throw fail(404,'Vendor identity is unavailable.');
        if(business.id!==a.vendorBusinessId||(v.id!==undefined&&v.id!==business.id)||v.status!=='Active'||!text(v.name,200))
          throw fail(503,'Vendor identity is unavailable. Municipal review is required.');
        const optional=(key,max)=>{
          const value=v[key];
          if(value==null||value==='')return null;
          if(typeof value!=='string'||value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw fail(503,'Vendor identity is unavailable. Municipal review is required.');
          return value.trim()||null;
        };
        if(/[\u0000-\u001f\u007f]/.test(v.name))throw fail(503,'Vendor identity is unavailable. Municipal review is required.');
        return {vendorBusinessId:business.id,businessName:v.name.trim(),marketName:optional('marketName',120),marketSection:optional('marketSection',80),stallNumber:optional('stallNumber',40)};
      });
    },
    async vendors(scope,after){let q=db().collection('vendors').where('municipalScopeId','==',scope).where('status','==','Active').orderBy(FieldPath.documentId());if(after)q=q.startAfter(after);const result=await q.limit(26).get();return result.docs.map(d=>({...d.data(),id:d.id}));},
    async get(id){const s=await ref(id).get();if(s.exists&&s.data().id!==undefined&&s.data().id!==s.id)throw fail(503,'Animal identity requires review.');return s.exists?{...s.data(),id:s.id}:null;},
    async list(p,after){let q=db().collection('animal_records').where('municipalScopeId','==',p.municipalScopeId);if(p.role==='vendor')q=q.where('vendorBusinessId','==',p.vendorBusinessId);q=q.orderBy(FieldPath.documentId());if(after)q=q.startAfter(after);const result=await q.limit(26).get();return result.docs.map(d=>({...d.data(),id:d.id}));},
    async create(a,p){
      const key=createHash('sha256').update(JSON.stringify([a.municipalScopeId,a.identifierType,a.identifier])).digest('hex');
      const identity=db().doc(`animal_identifiers/${key}`);
      await db().runTransaction(async tx=>{
        const existing=await tx.get(identity);if(existing.exists)throw fail(409,'This animal identifier is already registered.');
        await approvedVendor(tx,a.vendorBusinessId,p.municipalScopeId);
        tx.create(ref(a.id),a);tx.create(identity,{animalId:a.id,municipalScopeId:a.municipalScopeId});
        tx.create(db().collection('animal_audit').doc(),{animalId:a.id,municipalScopeId:a.municipalScopeId,actorUid:p.uid,action:'registered',at:a.createdAt,after:view(a)});
      });
    },
    async mutate(id,p,change){
      return db().runTransaction(async tx=>{
        const s=await tx.get(ref(id));const before=s.exists?{...s.data(),id:s.id}:null;
        if(!readable(before,p))throw fail(404,'Animal record not found.');
        if(!validRecord(before)||(s.data().id!==undefined&&s.data().id!==s.id))throw fail(503,'Animal record requires administrator review.');
        const result=change(before);
        await approvedVendor(tx,result.after.vendorBusinessId,p.municipalScopeId);
        tx.set(ref(id),result.after);
        tx.create(db().collection('animal_audit').doc(),{animalId:id,municipalScopeId:p.municipalScopeId,actorUid:p.uid,action:result.action,reason:result.reason,at:result.after.updatedAt,before:view(before),after:view(result.after)});
        return result.after;
      });
    },
    async history(id,scope){const result=await db().collection('animal_audit').where('animalId','==',id).where('municipalScopeId','==',scope).orderBy('at','desc').limit(20).get();return result.docs.map(d=>d.data());}
  };
}

export function createAnimalMobileAuth(getAuth,store) {
  return async(req,res,next)=>{
    res.set('Cache-Control','no-store');
    const token=/^Bearer (\S+)$/i.exec(String(req.headers.authorization||''));
    if(!token)return res.status(401).json({message:'Sign in is required.'});
    try {
      const auth=getAuth();if(!auth)throw fail(503,'Authentication is unavailable.');
      const decoded=await verifyFirebaseIdToken(auth,token[1]);
      const m=await store.membership(decoded.uid);
      if(!m || m.status!=='active' || !['vendor','staff','inspector'].includes(m.role) || !validId(m.municipalScopeId) || decoded.municipalRole!==m.role || decoded.municipalScopeId!==m.municipalScopeId)throw fail(403,'Approved animal workflow access is required.');
      const permissions=m.staffPermissions??[];
      if(!Array.isArray(permissions)||permissions.some(x=>!STAFF_PERMISSIONS.includes(x))||(m.role!=='staff'&&permissions.length))throw fail(403,'Staff permissions require administrator review.');
      if(m.role!=='vendor'&&m.vendorBusinessId!=null)throw fail(403,'Invalid role assignment.');
      if(m.role==='vendor'){
        if(!validId(m.vendorBusinessId))throw fail(403,'Vendor assignment is unavailable.');
        const v=await store.vendor(m.vendorBusinessId);if(!v||v.status!=='Active'||v.municipalScopeId!==m.municipalScopeId)throw fail(403,'Vendor assignment is unavailable.');
      }
      req.animalUser={uid:decoded.uid,role:m.role,municipalScopeId:m.municipalScopeId,staffPermissions:permissions,...(m.role==='vendor'?{vendorBusinessId:m.vendorBusinessId}:{})};next();
    }catch(e){if(e.code===EMAIL_VERIFICATION_REQUIRED)return res.status(403).json({code:e.code,message:e.message});res.status(e.status||503).json({message:e.status&&e.status!==401?e.message:'Animal access is unavailable.'});}
  };
}

export function createAnimalRouter({store,enabled=false,operationsEnabled=false,carcassWeightEnabled=false,getPrincipal,production=null,cursorSecret,now=()=>new Date().toISOString()}) {
  if (production && !cursorSecret) throw new Error('Stable production cursor signing key is required.');
  cursorSecret ??= randomBytes(32);
  const router=Router();
  router.param('id',(req,res,next,value)=>validId(value)?next():res.status(400).json({message:'Invalid animal ID.'}));
  router.use((req,res,next)=>{res.set('Cache-Control','no-store');const p=getPrincipal(req);if(!p||!validId(p.uid)||!validId(p.municipalScopeId)||(production&&p.municipalScopeId!==production.municipalScopeId))return res.status(403).json({message:'Authorized municipal access is required.'});req.animalPrincipal=p;next();});
  const readEnabled=production?true:enabled;
  const recordEnabled=production?production.features.animals:enabled;
  const inspectionEnabled=production?production.features.inspection:enabled;
  // Only the isolated rehearsal adapter opts in. No production environment flag enables this.
  router.get('/settings',(req,res)=>res.json({enabled:readEnabled,canRecord:recordEnabled&&inventory(req.animalPrincipal),canInspect:inspectionEnabled&&req.animalPrincipal.role==='inspector',billingAvailable:enabled&&(typeof operationsEnabled==='function'?operationsEnabled():operationsEnabled)&&(req.animalPrincipal.role==='admin'||req.animalPrincipal.role==='staff'&&req.animalPrincipal.staffPermissions.includes('billing')),deliveryAvailable:false,carcassWeightEnabled:!production&&enabled&&carcassWeightEnabled===true,canRecordCarcassWeight:!production&&enabled&&carcassWeightEnabled===true&&inventory(req.animalPrincipal),carcassDefinitionStatus:'awaiting_confirmation'}));
  router.use((req,res,next)=>readEnabled?next():res.status(503).json({message:'Animal workflow is awaiting pilot activation.'}));
  const writeGate=feature=>(req,res,next)=>production&&production.features[feature]!==true
    ?res.status(503).json({message:'This production recording capability is paused.'}):next();
  const run=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.status||503).json({message:e.status?e.message:'Animal operation failed. Refresh the record before retrying.'});}};
  const signed=value=>createHmac('sha256',cursorSecret).update(value).digest('base64url');
  const binding=(p,kind='animals')=>JSON.stringify([p.uid,p.role,p.municipalScopeId,p.vendorBusinessId||'',kind]);
  const encode=(p,after,kind)=>{const data=Buffer.from(JSON.stringify({binding:binding(p,kind),after,expires:Date.now()+3600000})).toString('base64url');return `${data}.${signed(data)}`;};
  const decode=(value,p,kind)=>{
    if(typeof value!=='string'||value.length>4096)throw fail(400,'Invalid page cursor.');
    const [data,signature,...extra]=value.split('.');const expected=Buffer.from(signed(data||'')),actual=Buffer.from(signature||'');
    if(extra.length||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw fail(400,'Invalid page cursor.');
    let parsed;try{parsed=JSON.parse(Buffer.from(data,'base64url').toString());}catch{throw fail(400,'Invalid page cursor.');}
    if(parsed.binding!==binding(p,kind)||!validId(parsed.after)||!Number.isFinite(parsed.expires)||parsed.expires<=Date.now())throw fail(400,'Invalid page cursor.');return parsed.after;
  };
  const allowedRead=p=>p.role==='admin'||p.role==='vendor'||p.role==='inspector'||inventory(p);
  const get=async(req)=>{const a=await store.get(req.params.id);if(!readable(a,req.animalPrincipal))throw fail(404,'Animal record not found.');if(!validRecord(a))throw fail(503,'Animal record requires administrator review.');return a;};
  router.get('/vendors',run(async(req,res)=>{
    const p=req.animalPrincipal;if(!inventory(p))throw fail(403,'Inventory permission is required to select vendor businesses.');
    if(Object.keys(req.query).some(k=>k!=='cursor'))throw fail(400,'Unsupported vendor filter.');
    const rows=await store.vendors(p.municipalScopeId,req.query.cursor!==undefined?decode(req.query.cursor,p,'vendors'):undefined);
    if(rows.some(v=>!validId(v.id)||v.status!=='Active'||v.municipalScopeId!==p.municipalScopeId||!text(v.name,200)))throw fail(503,'Vendor businesses require administrator review.');
    const items=rows.slice(0,25).map(v=>Object.fromEntries(['id','name','marketName','marketSection','stallNumber'].filter(k=>v[k]!==undefined).map(k=>[k,v[k]])));
    res.json({items,nextCursor:rows.length>25?encode(p,items.at(-1).id,'vendors'):null});
  }));
  router.get('/',run(async(req,res)=>{
    const p=req.animalPrincipal;if(!allowedRead(p))throw fail(403,'Your staff assignment does not include animal inventory.');
    if(Object.keys(req.query).some(k=>k!=='cursor'))throw fail(400,'Unsupported animal filter.');
    const after=req.query.cursor!==undefined?decode(req.query.cursor,p):undefined;const rows=await store.list(p,after);
    if(!Array.isArray(rows)||rows.length>26||rows.some(a=>!readable(a,p)||!validRecord(a)))throw fail(503,'Animal records require administrator review.');
    for(let i=0;i<rows.length;i++){const previous=i?rows[i-1].id:after;if(previous&&Buffer.compare(Buffer.from(previous),Buffer.from(rows[i].id))>=0)throw fail(503,'Animal page ordering requires review.');}
    const items=rows.slice(0,25);res.json({items:items.map(view),nextCursor:rows.length>25?encode(p,items.at(-1).id):null});
  }));
  router.get('/:id/vendor',run(async(req,res)=>{
    const p=req.animalPrincipal;
    if(p.role!=='inspector')throw fail(403,'Only an approved inspector can review animal vendor identity.');
    if(Object.keys(req.query).length)throw fail(400,'Vendor identity does not accept filters.');
    res.json(await store.inspectorVendor(req.params.id,p));
  }));
  router.get('/:id/history',run(async(req,res)=>{if(!['admin','inspector'].includes(req.animalPrincipal.role)&&!inventory(req.animalPrincipal))throw fail(403,'Animal audit history is restricted to authorized personnel.');const a=await get(req);res.json({items:await store.history(a.id,req.animalPrincipal.municipalScopeId)});}));
  router.get('/:id',run(async(req,res)=>{if(!allowedRead(req.animalPrincipal))throw fail(403,'Animal access is unavailable.');res.json(view(await get(req)));}));
  router.post('/',writeGate('animals'),run(async(req,res)=>{
    const p=req.animalPrincipal;if(!inventory(p))throw fail(403,'Inventory recording permission is required.');
    const b=req.body||{};if(Object.keys(b).some(k=>!['vendorBusinessId','species','weightGrams','weighedAt','identifier','identifierType'].includes(k))||!text(b.identifier,80)||!['manual','rfid'].includes(b.identifierType))throw fail(400,'Provide a manual or RFID animal identifier and supported fields.');
    const details=validateDetails(b),at=now(),identifier=b.identifier.normalize('NFKC').trim().toUpperCase();
    if(!text(identifier,80)||/[\u0000-\u001f\u007f]/.test(identifier))throw fail(400,'Use a printable animal identifier of at most 80 characters.');
    const a={id:`ANM-${randomUUID()}`,municipalScopeId:p.municipalScopeId,...details,identifier,identifierType:b.identifierType,revision:1,inspection:{status:'pending',revision:1},createdAt:at,createdBy:p.uid,updatedAt:at,updatedBy:p.uid};
    await store.create(a,p);res.status(201).json(view(a));
  }));
  router.post('/:id/correction',writeGate('animals'),run(async(req,res)=>{
    const p=req.animalPrincipal;if(!inventory(p))throw fail(403,'Inventory correction permission is required.');
    const b=req.body||{};if(Object.keys(b).some(k=>!['vendorBusinessId','species','weightGrams','weighedAt','expectedRevision','reason'].includes(k))||!Number.isSafeInteger(b.expectedRevision)||!text(b.reason,500))throw fail(400,'A correction reason and current record revision are required.');
    const details=validateDetails(b);
    const result=await store.mutate(req.params.id,p,a=>{
      if(!validId(req.params.id)||a.revision!==b.expectedRevision)throw fail(409,'This record changed. Refresh before correcting it.');
      if(a.billingInvoiceId||a.deliveryId)throw fail(409,'A billed or dispatched animal requires a controlled reversal before correction.');
      const revision=a.revision+1;return {after:{...a,...details,revision,inspection:{status:'pending',revision},updatedAt:now(),updatedBy:p.uid},action:'corrected',reason:b.reason.trim()};
    });res.json(view(result));
  }));
  router.post('/:id/inspection',writeGate('inspection'),run(async(req,res)=>{
    const p=req.animalPrincipal;if(p.role!=='inspector')throw fail(403,'Only an approved inspector can record inspection decisions.');
    const b=req.body||{};if(Object.keys(b).some(k=>!['decision','expectedRevision','notes'].includes(k))||!['approved','rejected'].includes(b.decision)||!Number.isSafeInteger(b.expectedRevision)||!text(b.notes,1000))throw fail(400,'A decision, current revision and verification notes are required.');
    const result=await store.mutate(req.params.id,p,a=>{
      if(a.revision!==b.expectedRevision||a.inspection.status!=='pending')throw fail(409,'This revision is no longer awaiting inspection. Refresh the record.');
      return {after:{...a,inspection:{status:b.decision,revision:a.revision,inspectorUid:p.uid,decidedAt:now(),notes:b.notes.trim()},updatedAt:now(),updatedBy:p.uid},action:`inspection_${b.decision}`,reason:b.notes.trim()};
    });res.json(view(result));
  }));
  router.post('/:id/carcass-weight',writeGate('carcass'),run(async(req,res)=>{
    const p=req.animalPrincipal;
    if(!inventory(p))throw fail(403,'Inventory recording permission is required.');
    if(carcassWeightEnabled!==true)throw fail(503,'Carcass recording is disabled pending slaughterhouse definition approval.');
    const b=req.body,at=now();
    if(Object.keys(req.query).length || !b || Array.isArray(b) || typeof b!=='object' ||
        Object.keys(b).some(k=>!['weightGrams','weighedAt','expectedRevision','expectedCarcassRevision','reason'].includes(k)) ||
        !Number.isSafeInteger(b.weightGrams)||b.weightGrams<=0||!timestamp(b.weighedAt)||Date.parse(b.weighedAt)>Date.parse(at)+60000||
        !Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<1||!Number.isSafeInteger(b.expectedCarcassRevision)||b.expectedCarcassRevision<0||
        (b.reason!==undefined&&(!text(b.reason,500)||/[\u0000-\u001f\u007f]/.test(b.reason))))throw fail(400,'Provide positive integer grams, a valid weighing time, current animal and carcass revisions, and supported fields.');
    const result=await store.mutate(req.params.id,p,a=>{
      if(!validCarcass(a.carcassWeight)||a.carcassWeight?.revision===Number.MAX_SAFE_INTEGER)throw fail(503,'Carcass measurement requires administrator review.');
      if(a.revision!==b.expectedRevision || (a.carcassWeight?.revision??0)!==b.expectedCarcassRevision)throw fail(409,'This record changed. Refresh animal and carcass revisions before retrying.');
      if(!animalBillingEligible(a))throw fail(409,'Inspector approval of the current animal revision is required.');
      if(a.billingInvoiceId||a.deliveryId)throw fail(409,'Carcass weight cannot change after invoicing or dispatch.');
      if(a.carcassWeight&&!text(b.reason,500))throw fail(400,'A reason is required to correct carcass weight.');
      const carcassWeight={weightGrams:b.weightGrams,weighedAt:new Date(b.weighedAt).toISOString(),revision:b.expectedCarcassRevision+1,animalRevision:a.revision,recordedAt:at,recordedBy:p.uid};
      return {after:{...a,carcassWeight,updatedAt:at,updatedBy:p.uid},action:a.carcassWeight?'carcass_weight_corrected':'carcass_weight_recorded',reason:b.reason?.trim()||''};
    });res.json(view(result));
  }));
  router.use((req,res)=>res.status(405).json({message:'Animal operation is unavailable. Records are not deleted.'}));
  return router;
}
