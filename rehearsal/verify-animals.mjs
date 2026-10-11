import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRehearsalContext } from './context.mjs';
const context=await createRehearsalContext();
const [{default:express},{createAnimalRouter,createAnimalStore,createAnimalMobileAuth,animalBillingEligible},{createWebAdminMiddleware,createWriteGuard},{deleteApp}]=await Promise.all([import('express'),import('../server/animals.js'),import('../server/access.js'),import('firebase-admin/app')]);
const suffix=randomUUID(),scope=`ANIMAL-${suffix}`,password='Synthetic-animal-check-42!';
const businessA=`VEN-A-${suffix}`,businessB=`VEN-B-${suffix}`;
const roles={admin:{},inventory:{role:'staff',staffPermissions:['inventory']},billing:{role:'staff',staffPermissions:['billing']},delivery:{role:'staff',staffPermissions:['delivery']},inspector:{role:'inspector'},alice:{role:'vendor',vendorBusinessId:businessA},bob:{role:'vendor',vendorBusinessId:businessB},other:{role:'inspector',scope:`OTHER-${suffix}`}};
const tokens={},uids={},animals=[];let server,checks=0;
const pass=label=>{checks++;console.log(`PASS ${label}`);};
try{
  for(const [name,role] of Object.entries(roles)){
    const uid=`ANIMAL-${name}-${suffix}`;uids[name]=uid;
    const email=`${name}-${suffix}@rehearsal.example.test`;
    await context.auth.createUser({uid,email,password});
    if(role.role){await context.auth.setCustomUserClaims(uid,{municipalRole:role.role,municipalScopeId:role.scope||scope});await context.db.doc(`mobile_memberships/${uid}`).set({role:role.role,status:'active',municipalScopeId:role.scope||scope,...(role.staffPermissions?{staffPermissions:role.staffPermissions}:{}),...(role.vendorBusinessId?{vendorBusinessId:role.vendorBusinessId}:{})});}
    const login=await fetch(`http://${context.hosts.auth.address}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});assert.equal(login.status,200);tokens[name]=(await login.json()).idToken;
  }
  for(const id of [businessA,businessB])await context.db.doc(`vendors/${id}`).set({id,name:'Synthetic animal test vendor',status:'Active',municipalScopeId:scope});
  const store=createAnimalStore(()=>context.db),app=express();
  app.use('/api/mobile/animals',express.json({limit:'16kb'}),createAnimalMobileAuth(()=>context.auth,store),createAnimalRouter({store,enabled:true,getPrincipal:req=>req.animalUser}));
  app.use('/api',createWebAdminMiddleware(()=>context.auth,new Set([uids.admin])));
  app.use('/api/animals',express.json(),createAnimalRouter({store,enabled:true,getPrincipal:req=>({uid:req.webUser.uid,role:'admin',municipalScopeId:scope,staffPermissions:[]})}));
  app.use('/api',createWriteGuard(false));app.post('/api/invoices',(req,res)=>res.json({unsafe:true}));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const call=async(path='',who='inventory',method='GET',data,web=false)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${path==='/invoices'?'/api/invoices':`/api/${web?'animals':'mobile/animals'}${path}`}`,{method,headers:{...(who?{Authorization:`Bearer ${tokens[who]}`} : {}),'Content-Type':'application/json'},...(data!==undefined?{body:JSON.stringify(data)}:{})});return {status:r.status,body:await r.json()};};
  const form={identifier:`TEST-${suffix}`,identifierType:'manual',vendorBusinessId:businessA,species:'Pig',weightGrams:85000,weighedAt:'2020-01-01T08:00:00Z'};
  assert.equal((await call('',null,'POST',form)).status,401);pass('anonymous recording denied');
  const vendorOptions=await call('/vendors');assert.equal(vendorOptions.status,200);assert.equal(vendorOptions.body.items.length,2);assert.ok(vendorOptions.body.items.every(v=>[businessA,businessB].includes(v.id)&&!('email' in v)));assert.equal((await call('/vendors','alice')).status,403);pass('inventory vendor selector returns only scoped business identities');
  for(const who of ['billing','delivery','alice','inspector'])assert.equal((await call('',who,'POST',form)).status,403);pass('staff function and role separation enforced');
  const created=await call('','inventory','POST',form);assert.equal(created.status,201);const id=created.body.id;animals.push(id);assert.equal(created.body.inspection.status,'pending');assert.equal(animalBillingEligible(created.body),false);pass('inventory staff records pending animal with ownership and exact grams');
  assert.equal((await call('','inventory','POST',{...form,identifier:form.identifier.toLowerCase()})).status,409);pass('duplicate normalized tag rejected transactionally');
  assert.equal((await call(`/${id}`,'alice')).status,200);assert.equal((await call(`/${id}`,'bob')).status,404);assert.deepEqual((await call('','bob')).body.items,[]);pass('vendor isolation works on list and detail');
  const identity=await call(`/${id}/vendor`,'inspector');assert.equal(identity.status,200);
  assert.deepEqual(identity.body,{vendorBusinessId:businessA,businessName:'Synthetic animal test vendor',marketName:null,marketSection:null,stallNumber:null});
  for(const who of ['alice','inventory','billing','delivery'])assert.equal((await call(`/${id}/vendor`,who)).status,403);
  assert.equal((await call(`/${id}/vendor`,'other')).status,404);pass('inspector identity uses actual scoped transaction and minimal fields; other roles denied');
  await context.db.doc(`vendors/${businessA}`).update({marketName:'Synthetic Market',marketSection:'Meat',stallNumber:'TEST-01',email:'PRIVATE',contact_number:'PRIVATE',address:'PRIVATE',password:'PRIVATE',authUid:'PRIVATE'});
  const complete=await call(`/${id}/vendor`,'inspector');assert.equal(complete.status,200);
  assert.deepEqual(complete.body,{vendorBusinessId:businessA,businessName:'Synthetic animal test vendor',marketName:'Synthetic Market',marketSection:'Meat',stallNumber:'TEST-01'});pass('real business fields returned with no private contacts or auth identities');
  for(const bad of [{status:'Inactive'},{id:'MISMATCH'},{municipalScopeId:'OTHER'}]){
    await context.db.doc(`vendors/${businessA}`).update(bad);const denied=await call(`/${id}/vendor`,'inspector');assert.ok([404,503].includes(denied.status));assert.deepEqual(Object.keys(denied.body),['message']);
    await context.db.doc(`vendors/${businessA}`).update({status:'Active',id:businessA,municipalScopeId:scope});
  }
  const backup=(await context.db.doc(`vendors/${businessA}`).get()).data();await context.db.doc(`vendors/${businessA}`).delete();assert.equal((await call(`/${id}/vendor`,'inspector')).status,503);await context.db.doc(`vendors/${businessA}`).set(backup);pass('real missing inactive mismatched and cross-scope businesses fail closed');
  for(const membership of [{status:'inactive'},{municipalScopeId:'OTHER'}]){
    await context.db.doc(`mobile_memberships/${uids.inspector}`).update(membership);assert.equal((await call(`/${id}/vendor`,'inspector')).status,403);
    await context.db.doc(`mobile_memberships/${uids.inspector}`).update({status:'active',municipalScopeId:scope});
  }
  pass('real inspector membership removal and scope/claim disagreement block identity reads');
  const decision={decision:'approved',expectedRevision:1,notes:'Synthetic ownership and weighing verification'};
  assert.equal((await call(`/${id}/inspection`,'inventory','POST',decision)).status,403);assert.equal((await call(`/${id}/inspection`,'admin','POST',decision,true)).status,403);assert.equal((await call(`/${id}/inspection`,'other','POST',decision)).status,404);pass('inspection requires proper inspector and municipality');
  const concurrent=await Promise.all([call(`/${id}/inspection`,'inspector','POST',decision),call(`/${id}/inspection`,'inspector','POST',decision)]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);assert.equal(animalBillingEligible(await store.get(id)),true);pass('concurrent inspection decisions have exactly one winner');
  const correction={vendorBusinessId:businessB,species:'Pig',weightGrams:90000,weighedAt:form.weighedAt,expectedRevision:1,reason:'Synthetic corrected ownership and weight'};
  const fixed=await call(`/${id}/correction`,'inventory','POST',correction);assert.equal(fixed.status,200);assert.equal(fixed.body.revision,2);assert.equal(fixed.body.inspection.status,'pending');assert.equal(animalBillingEligible(fixed.body),false);pass('correction clears approval and increments revision');
  assert.equal((await call(`/${id}`,'alice')).status,404);assert.equal((await call(`/${id}`,'bob')).status,200);pass('corrected ownership applies to future reads');
  assert.equal((await call(`/${id}/vendor`,'inspector')).body.vendorBusinessId,businessB);pass('transactional identity follows corrected animal ownership');
  assert.equal((await call(`/${id}/inspection`,'inspector','POST',decision)).status,409);assert.equal((await call(`/${id}/inspection`,'inspector','POST',{...decision,expectedRevision:2})).status,200);pass('stale approval rejected and current revision reinspected');
  const history=await call(`/${id}/history`,'admin','GET',undefined,true);assert.ok(history.body.items.some(e=>e.action==='corrected'&&e.before.weightGrams===85000&&e.after.weightGrams===90000));pass('transactional audit retains original and corrected details');
  await context.db.doc(`animal_records/${id}`).update({billingInvoiceId:'SYNTHETIC-BILLED-MARKER'});
  assert.equal((await call(`/${id}/correction`,'inventory','POST',{...correction,expectedRevision:2})).status,409);pass('billed animal cannot be edited directly');
  await context.db.doc(`mobile_memberships/${uids.inventory}`).update({staffPermissions:[]});assert.equal((await call('','inventory')).status,403);pass('permission removal takes effect without token replacement');
  const direct=await fetch(`http://${context.hosts.firestore.address}/v1/projects/${context.hosts.projectId}/databases/(default)/documents/animal_records/${id}`,{method:'PATCH',headers:{Authorization:`Bearer ${tokens.bob}`,'Content-Type':'application/json'},body:JSON.stringify({fields:{weightGrams:{integerValue:'1'}}})});assert.equal(direct.status,403);pass('direct client record mutation remains denied');
  assert.equal((await call('/invoices','admin','POST',{})).status,503);pass('official billing writes remain paused');
  console.log(`ANIMAL REHEARSAL PASSED: ${checks} checks using actual local Auth/Firestore.`);
}finally{
  if(server)await new Promise(r=>server.close(r));
  for(const id of animals){const events=await context.db.collection('animal_audit').where('animalId','==',id).get();const identities=await context.db.collection('animal_identifiers').where('animalId','==',id).get();const batch=context.db.batch();for(const d of [...events.docs,...identities.docs])batch.delete(d.ref);batch.delete(context.db.doc(`animal_records/${id}`));await batch.commit();}
  for(const uid of Object.values(uids)){await context.auth.deleteUser(uid).catch(()=>{});await context.db.doc(`mobile_memberships/${uid}`).delete();}
  for(const id of [businessA,businessB])await context.db.doc(`vendors/${id}`).delete();
  await context.db.terminate();await deleteApp(context.app);
}
