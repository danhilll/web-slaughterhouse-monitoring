import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRehearsalContext} from './context.mjs';
const context=await createRehearsalContext();
const [{default:express},{createOperationsStore,createOperationsRouter},{createAnimalStore,createAnimalMobileAuth},{createWebAdminMiddleware},{deleteApp}]=await Promise.all([import('express'),import('../server/operations.js'),import('../server/animals.js'),import('../server/access.js'),import('firebase-admin/app')]);
const suffix=randomUUID(),scope=`TRACK-${suffix}`,invoiceId=`INV-${suffix}`,business=`VEN-${suffix}`,roles={driver:{role:'staff',staffPermissions:['delivery']},otherDriver:{role:'staff',staffPermissions:['delivery']},vendor:{role:'vendor',vendorBusinessId:business},otherVendor:{role:'vendor',vendorBusinessId:`OTHER-${suffix}`},otherScope:{role:'staff',staffPermissions:['delivery'],municipalScopeId:`OTHER-${suffix}`},admin:{}};
const uids={},tokens={},created=[];let server,checks=0,time=Date.now();
const at=()=>new Date(time).toISOString(),pass=label=>{checks++;console.log(`PASS ${label}`);};
try{
  for(const [name,role] of Object.entries(roles)){
    const uid=`TRACK-${name}-${suffix}`;uids[name]=uid;
    await context.auth.createUser({uid,email:`${name}-${suffix}@rehearsal.example.test`,password:'Synthetic-tracking-42!'});created.push(uid);
    if(role.role){const municipalScopeId=role.municipalScopeId||scope;await context.auth.setCustomUserClaims(uid,{municipalRole:role.role,municipalScopeId});await context.db.doc(`mobile_memberships/${uid}`).set({...role,status:'active',municipalScopeId});}
    const login=await fetch(`http://${context.hosts.auth.address}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${name}-${suffix}@rehearsal.example.test`,password:'Synthetic-tracking-42!',returnSecureToken:true})});assert.equal(login.status,200);tokens[name]=(await login.json()).idToken;
  }
  for(const id of [business,roles.otherVendor.vendorBusinessId])await context.db.doc(`vendors/${id}`).set({id,status:'Active',municipalScopeId:scope});
  const invoice={id:invoiceId,workflow:'animal',municipalScopeId:scope,vendor_id:business,animalId:`ANM-${suffix}`,animalRevision:1,revision:4,totalCents:9500,total_amount:95,corral_fee:15,delivery_fee:25,anti_mortem_fee:10,facility_fee:45,date_issued:'2026-10-13',due_date:'2026-10-13',payment_status:'Paid',payment:{amountCents:9500,receiptReference:`DEMO-${suffix}`,method:'cash'},delivery:{assigneeUid:uids.driver,status:'in_transit',assignedAt:at()},syntheticOnly:true};
  await context.db.doc(`invoices/${invoiceId}`).set(invoice);
  const store=createOperationsStore(()=>context.db),animalStore=createAnimalStore(()=>context.db),app=express();
  app.use(express.json({limit:'16kb'}));
  app.use('/api/mobile/operations',createAnimalMobileAuth(()=>context.auth,animalStore),createOperationsRouter({store,animalStore,enabled:true,getPrincipal:req=>req.animalUser,now:at}));
  app.use('/api/operations',createWebAdminMiddleware(()=>context.auth,new Set([uids.admin])),createOperationsRouter({store,animalStore,enabled:true,getPrincipal:req=>({uid:req.webUser.uid,role:'admin',municipalScopeId:scope}),now:at}));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const call=async(who='driver',body,web=false,suffix='/tracking')=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/${web?'operations':'mobile/operations'}/invoices/${invoiceId}${suffix}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${tokens[who]}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json(),retry:r.headers.get('Retry-After')};};
  const b={latitude:13.96,longitude:122.29,accuracyMeters:12,capturedAt:at()};
  assert.equal((await call('vendor',b)).status,403);assert.equal((await call('otherDriver',b)).status,403);assert.equal((await call('otherVendor')).status,404);assert.equal((await call('otherScope',b)).status,404);pass('roles, assignees, vendors and municipalities cannot bypass tracking access');
  const race=await Promise.all([call('driver',b),call('driver',{...b,latitude:14})]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);pass('actual Firestore transaction race accepts exactly one position');
  assert.deepEqual((await context.db.doc(`invoices/${invoiceId}`).get()).data(),invoice);assert.equal((await context.db.collection('operation_audit').where('invoiceId','==',invoiceId).get()).size,0);pass('GPS makes one position write and no invoice or financial audit change');
  const winner=race.find(r=>r.status===200).body.location;
  assert.equal((await call('driver',{latitude:winner.latitude,longitude:winner.longitude,accuracyMeters:winner.accuracyMeters,capturedAt:winner.capturedAt})).body.duplicate,true);pass('identical retry is idempotent');
  time+=1000;const limited=await call('driver',{...b,latitude:15,capturedAt:at()});assert.equal(limited.status,429);assert.ok(Number(limited.retry)>0);pass('persisted minimum upload interval returns Retry-After');
  time+=9000;assert.equal((await call('driver',{...b,latitude:15,capturedAt:at()})).status,200);assert.equal((await call('driver',b)).status,409);pass('newer position accepted after interval; delayed old position rejected');
  assert.equal((await call('vendor')).body.location.latitude,15);assert.equal((await call('admin',undefined,true)).body.location.latitude,15);pass('vendor and allowlisted web administrator read the same position');
  time+=50000;assert.equal((await call('vendor')).body.trackingState,'stale');pass('stale status derived without status writes');
  await context.db.doc(`mobile_memberships/${uids.driver}`).update({staffPermissions:[]});assert.equal((await call('driver',{...b,capturedAt:at()})).status,403);await context.db.doc(`mobile_memberships/${uids.driver}`).update({staffPermissions:['delivery']});pass('permission removal blocks existing token');
  assert.equal((await call('driver',{expectedRevision:4,status:'delivered',notes:'Synthetic completion'},false,'/delivery/status')).status,200);assert.equal((await call('driver',{...b,capturedAt:at()})).status,409);assert.equal((await call('vendor')).body.trackingState,'completed');pass('GPS did not invalidate delivery revision; completion stops tracking');
  const direct=await fetch(`http://${context.hosts.firestore.address}/v1/projects/${context.hosts.projectId}/databases/(default)/documents/delivery_positions/${invoiceId}`,{method:'PATCH',headers:{Authorization:`Bearer ${tokens.driver}`,'Content-Type':'application/json'},body:JSON.stringify({fields:{latitude:{doubleValue:0}}})});assert.equal(direct.status,403);pass('direct client position write denied');
  console.log(`TRACKING REHEARSAL PASSED: ${checks} checks.`);
}finally{
  if(server)await new Promise(r=>server.close(r));
  const audit=await context.db.collection('operation_audit').where('invoiceId','==',invoiceId).get();const batch=context.db.batch();for(const d of audit.docs)batch.delete(d.ref);for(const path of [`invoices/${invoiceId}`,`delivery_positions/${invoiceId}`,`vendors/${business}`,`vendors/${roles.otherVendor.vendorBusinessId}`,...created.map(uid=>`mobile_memberships/${uid}`)])batch.delete(context.db.doc(path));await batch.commit();
  for(const uid of created)await context.auth.deleteUser(uid);await context.db.terminate();await deleteApp(context.app);
}
