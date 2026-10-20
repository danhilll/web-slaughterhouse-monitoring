import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createAnimalRouter,createAnimalMobileAuth,createAnimalStore,animalBillingEligible } from './animals.js';
import { createWebAdminMiddleware,createWriteGuard } from './access.js';

const input={identifier:'TAG-001',identifierType:'manual',vendorBusinessId:'VEN-A',species:'Pig',weightGrams:85000,weighedAt:'2020-01-01T08:00:00.000Z'};
async function fixture(t,enabled=true,production=null){
  const state={animals:new Map(),events:[],memberships:{inventory:{role:'staff',staffPermissions:['inventory']},billing:{role:'staff',staffPermissions:['billing']},delivery:{role:'staff',staffPermissions:['delivery']},inspector:{role:'inspector'},alice:{role:'vendor',vendorBusinessId:'VEN-A'},bob:{role:'vendor',vendorBusinessId:'VEN-B'},other:{role:'inspector',municipalScopeId:'SCOPE-B'}}};
  for(const m of Object.values(state.memberships)){m.municipalScopeId??='SCOPE-A';m.status='active';}
  state.vendorRecords=new Map([['VEN-A',{id:'VEN-A',name:'Synthetic business A',municipalScopeId:'SCOPE-A',status:'Active',marketName:'Synthetic Market',marketSection:'Meat',stallNumber:'S-01',email:'private@example.test',contact_number:'private',address:'private',password:'private',authUid:'private'}],['VEN-B',{id:'VEN-B',name:'Synthetic business B',municipalScopeId:'SCOPE-A',status:'Active'}]]);
  const transactional=createAnimalStore(()=>({doc:path=>path,runTransaction:fn=>fn({get:async path=>{
    const [collection,id]=path.split('/');const value=(collection==='vendors'?state.vendorRecords:state.animals).get(id);
    return {id,exists:value!==undefined,data:()=>value};
  }})}));
  const store={
    inspectorVendor:transactional.inspectorVendor,
    membership:async uid=>state.memberships[uid],
    vendor:async id=>({id,municipalScopeId:'SCOPE-A',status:'Active'}),
    vendors:async()=>[{id:'VEN-A',name:'Synthetic vendor',municipalScopeId:'SCOPE-A',status:'Active',email:'private@example.test'}],
    get:async id=>state.animals.get(id),
    list:async(p,after)=>[...state.animals.values()].filter(a=>a.municipalScopeId===p.municipalScopeId&&(p.role!=='vendor'||a.vendorBusinessId===p.vendorBusinessId)&&(!after||a.id>after)).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,26),
    create:async(a,p)=>{if([...state.animals.values()].some(x=>x.identifier===a.identifier&&x.identifierType===a.identifierType))throw Object.assign(Error('Duplicate identifier'),{status:409});if(a.vendorBusinessId==='OTHER')throw Object.assign(Error('Wrong scope'),{status:409});state.animals.set(a.id,a);state.events.push({action:'registered',actor:p.uid});},
    mutate:async(id,p,fn)=>{const a=state.animals.get(id);if(!a||a.municipalScopeId!==p.municipalScopeId||(p.role==='vendor'&&a.vendorBusinessId!==p.vendorBusinessId))throw Object.assign(Error('Not found'),{status:404});const result=fn(a);if(result.after.vendorBusinessId==='OTHER')throw Object.assign(Error('Wrong scope'),{status:409});state.animals.set(id,result.after);state.events.push(result);return result.after;},
    history:async()=>state.events
  };
  state.claimOverrides={};
  const auth={verifyIdToken:async(token,revoked)=>{assert.equal(revoked,true);if(state.verificationFailure)throw state.verificationFailure;if(token==='expired')throw {code:'auth/id-token-expired'};return {uid:token,email_verified:true,municipalRole:state.memberships[token]?.role,municipalScopeId:state.memberships[token]?.municipalScopeId,...state.claimOverrides[token]};}};
  const app=express();
  app.use('/api/mobile/animals',express.json(),createAnimalMobileAuth(()=>auth,store),createAnimalRouter({store,enabled,production,getPrincipal:req=>req.animalUser,cursorSecret:Buffer.alloc(32,1)}));
  app.use('/api',createWebAdminMiddleware(()=>auth,new Set(['ADMIN'])));
  app.use('/api/animals',express.json(),createAnimalRouter({store,enabled,production,cursorSecret:Buffer.alloc(32,1),getPrincipal:req=>({uid:req.webUser.uid,role:'admin',municipalScopeId:'SCOPE-A',staffPermissions:[]})}));
  app.use('/api',createWriteGuard(false));app.post('/api/invoices',(req,res)=>res.json({}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const call=async(path='',token='inventory',method='GET',body,web=false)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${path==='/invoices'?'/api/invoices':`/api/${web?'animals':'mobile/animals'}${path}`}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
  return {state,call};
}
test('animal auth distinguishes rejected credentials from backend and unknown failures',async t=>{
  const {call,state}=await fixture(t);
  for(const code of ['auth/argument-error','auth/invalid-id-token','auth/id-token-expired',
    'auth/id-token-revoked','auth/user-disabled','auth/user-not-found',
    'auth/internal-error','auth/insufficient-permission','auth/invalid-credential','auth/future-error','ETIMEDOUT',undefined]){
    state.verificationFailure=Object.assign(new Error('Private SDK detail'),{code});
    const rejected=['auth/argument-error','auth/invalid-id-token','auth/id-token-expired',
      'auth/id-token-revoked','auth/user-disabled','auth/user-not-found'].includes(code);
    const result=await call('/settings');
    assert.equal(result.status,rejected?401:503,code);
    assert.deepEqual(result.body,{message:rejected?'Animal access is unavailable.':'Authentication is unavailable.'});
  }
  state.verificationFailure=null;
  assert.equal((await call('/settings')).status,200);
  assert.equal(state.animals.size,0);
});
test('workflow gate, authentication and staff function separation deny unauthorized records',async t=>{
  const {call,state}=await fixture(t,false);assert.equal((await call('','inventory','POST',input)).status,503);assert.equal(state.animals.size,0);
  assert.equal((await call('',null)).status,401);assert.equal((await call('','expired')).status,401);
});
test('only inventory staff or web administrator records an animal; billing and delivery read permissions grant no inventory writes',async t=>{
  const {call,state}=await fixture(t);
  for(const token of ['billing','delivery','alice','inspector'])assert.equal((await call('',token,'POST',input)).status,403);
  const r=await call('','inventory','POST',input);assert.equal(r.status,201);assert.equal(r.body.inspection.status,'pending');assert.equal(r.body.createdBy,'inventory');assert.equal(animalBillingEligible(r.body),false);
  assert.equal((await call('','ADMIN','POST',{...input,identifier:'TAG-002'},true)).status,201);assert.equal(state.animals.size,2);
});
test('weight, species, identifier, scope injection and wrong ownership are validated',async t=>{
  const {call,state}=await fixture(t);
  for(const b of [{...input,weightGrams:0},{...input,weightGrams:1.2},{...input,species:'Both'},{...input,weighedAt:'2099-01-01T00:00:00Z'},{...input,municipalScopeId:'SCOPE-B'},{...input,inspection:{status:'approved'}}])assert.equal((await call('','inventory','POST',b)).status,400);
  assert.equal((await call('','inventory','POST',{...input,vendorBusinessId:'OTHER'})).status,409);assert.equal(state.animals.size,0);
});
test('normalized identifiers cannot be registered twice',async t=>{
  const {call}=await fixture(t);assert.equal((await call('','inventory','POST',input)).status,201);assert.equal((await call('','inventory','POST',{...input,identifier:' tag-001 '})).status,409);
});
test('production animal reads reject missing mobile audit fields without changing stored records',async t=>{
  const production={municipalScopeId:'SCOPE-A',features:{animals:true,inspection:true,carcass:false}};
  const {call,state}=await fixture(t,true,production);
  const created=(await call('','inventory','POST',input)).body;
  const original=structuredClone(state.animals.get(created.id));
  for(const field of ['createdAt','createdBy','updatedAt','updatedBy']){
    const broken=structuredClone(original);delete broken[field];state.animals.set(created.id,broken);
    const before=structuredClone(broken),events=state.events.length;
    const list=await call('','inspector');
    assert.equal(list.status,503,`list must reject missing ${field}`);
    assert.deepEqual(list.body,{message:'Animal records require administrator review.'});
    const detail=await call(`/${created.id}`,'inspector');
    assert.equal(detail.status,503,`detail must reject missing ${field}`);
    assert.deepEqual(detail.body,{message:'Animal record requires administrator review.'});
    assert.deepEqual(state.animals.get(created.id),before);assert.equal(state.events.length,events);
  }
  state.animals.set(created.id,original);
  assert.equal((await call('','inspector')).status,200);
  const approved=await call(`/${created.id}/inspection`,'inspector','POST',{decision:'approved',expectedRevision:1,notes:'Identity and current animal reviewed'});
  assert.equal(approved.status,200);assert.equal(approved.body.createdBy,'inventory');assert.equal(approved.body.updatedBy,'inspector');
  const complete=structuredClone(state.animals.get(created.id));
  for(const field of ['inspectorUid','decidedAt','notes']){
    const broken=structuredClone(complete);delete broken.inspection[field];state.animals.set(created.id,broken);
    assert.equal((await call('','inspector')).status,503,`list must reject missing inspection.${field}`);
    assert.equal((await call(`/${created.id}`,'inspector')).status,503,`detail must reject missing inspection.${field}`);
    assert.deepEqual(state.animals.get(created.id),broken);
  }
  state.animals.set(created.id,complete);
  assert.equal((await call('','inspector')).status,200);
});
test('inventory vendor selection is scoped, bounded and excludes contact details',async t=>{
  const {call}=await fixture(t);const result=await call('/vendors');assert.equal(result.status,200);assert.deepEqual(result.body.items,[{id:'VEN-A',name:'Synthetic vendor'}]);
  for(const token of ['billing','delivery','alice','inspector'])assert.equal((await call('/vendors',token)).status,403);
  assert.equal((await call('/vendors?municipalScopeId=OTHER')).status,400);
});
test('vendors see only their own animals; cross-scope inspection and vendor audit reads are denied',async t=>{
  const {call}=await fixture(t);const a=(await call('','inventory','POST',input)).body;
  assert.equal((await call(`/${a.id}`,'alice')).status,200);assert.equal((await call(`/${a.id}`,'bob')).status,404);assert.deepEqual((await call('','bob')).body.items,[]);
  assert.equal((await call(`/${a.id}/history`,'alice')).status,403);
  assert.equal((await call(`/${a.id}/inspection`,'other','POST',{decision:'approved',expectedRevision:1,notes:'Verified'})).status,404);
});
test('single inspector decision requires verification notes; administrator and inventory cannot approve',async t=>{
  const {call}=await fixture(t);const a=(await call('','inventory','POST',input)).body;const decision={decision:'approved',expectedRevision:1,notes:'Ownership, weight and animal details checked'};
  assert.equal((await call(`/${a.id}/inspection`,'inventory','POST',decision)).status,403);assert.equal((await call(`/${a.id}/inspection`,'ADMIN','POST',decision,true)).status,403);
  assert.equal((await call(`/${a.id}/inspection`,'inspector','POST',{...decision,notes:''})).status,400);
  const r=await call(`/${a.id}/inspection`,'inspector','POST',decision);assert.equal(r.status,200);assert.equal(r.body.inspection.inspectorUid,'inspector');assert.equal(animalBillingEligible(r.body),true);
  assert.equal((await call(`/${a.id}/inspection`,'inspector','POST',decision)).status,409);
});
for (const decision of ['approved', 'rejected']) {
  for (const length of [500, 501, 1000]) {
    test(`inspection ${decision} notes of ${length} characters survive write and protected reads`, async t => {
      const { call, state } = await fixture(t);
      const created = await call('', 'inventory', 'POST', input);
      assert.equal(created.status, 201);
      const animal = created.body;
      const notes = 'N'.repeat(length);
      const written = await call(`/${animal.id}/inspection`, 'inspector', 'POST', {
        decision, expectedRevision: animal.revision, notes
      });
      assert.equal(written.status, 200);
      assert.equal(written.body.revision, animal.revision);
      assert.deepEqual(written.body.inspection, {
        status: decision, revision: animal.revision, inspectorUid: 'inspector',
        decidedAt: written.body.inspection.decidedAt, notes
      });
      assert.ok(Number.isFinite(Date.parse(written.body.inspection.decidedAt)));
      assert.equal(state.events.length, 2);
      assert.equal(state.events.at(-1).action, `inspection_${decision}`);
      assert.equal(state.events.at(-1).reason, notes);
      assert.deepEqual(state.events.at(-1).after.inspection, written.body.inspection);
      for (const [path, token, web] of [
        [`/${animal.id}`, 'inspector', false], [`/${animal.id}`, 'alice', false],
        [`/${animal.id}`, 'ADMIN', true]
      ]) {
        const read = await call(path, token, 'GET', undefined, web);
        assert.equal(read.status, 200);
        assert.deepEqual(read.body.inspection, written.body.inspection);
      }
      const listed = await call('', 'inventory');
      assert.equal(listed.status, 200);
      assert.deepEqual(listed.body.items[0].inspection, written.body.inspection);
      assert.equal((await call(`/${animal.id}/vendor`, 'inspector')).status, 200);
      const history = await call(`/${animal.id}/history`, 'inspector');
      assert.equal(history.status, 200);
      assert.equal(history.body.items.at(-1).reason, notes);
      assert.equal((await call(`/${animal.id}/inspection`, 'inspector', 'POST', {
        decision, expectedRevision: animal.revision, notes
      })).status, 409);
      assert.equal(state.events.length, 2);
    });
  }
}
for (const decision of ['approved', 'rejected']) {
  test(`inspection ${decision} rejects 1001-character notes without changing revision or audit`, async t => {
    const { call, state } = await fixture(t);
    const animal = (await call('', 'inventory', 'POST', input)).body;
    const before = structuredClone(state.animals.get(animal.id));
    const result = await call(`/${animal.id}/inspection`, 'inspector', 'POST', {
      decision, expectedRevision: animal.revision, notes: 'N'.repeat(1001)
    });
    assert.equal(result.status, 400);
    assert.deepEqual(state.animals.get(animal.id), before);
    assert.equal(state.events.length, 1);
    assert.equal((await call(`/${animal.id}`, 'inspector')).status, 200);
    // A preexisting over-limit record still fails closed; no stored data is repaired.
    state.animals.set(animal.id, { ...before, inspection: {
      status: decision, revision: before.revision, inspectorUid: 'inspector',
      decidedAt: input.weighedAt, notes: 'N'.repeat(1001)
    } });
    assert.equal((await call(`/${animal.id}`, 'inspector')).status, 503);
    assert.equal((await call('', 'inventory')).status, 503);
  });
}
test('inspection note expansion does not expand the 500-character animal correction reason', async t => {
  const { call, state } = await fixture(t);
  const animal = (await call('', 'inventory', 'POST', input)).body;
  const details = { vendorBusinessId: input.vendorBusinessId, species: input.species,
    weightGrams: input.weightGrams, weighedAt: input.weighedAt, expectedRevision: animal.revision };
  assert.equal((await call(`/${animal.id}/correction`, 'inventory', 'POST', {
    ...details, reason: 'R'.repeat(501)
  })).status, 400);
  assert.equal(state.events.length, 1);
  const corrected = await call(`/${animal.id}/correction`, 'inventory', 'POST', {
    ...details, reason: 'R'.repeat(500)
  });
  assert.equal(corrected.status, 200);
  assert.equal(corrected.body.revision, animal.revision + 1);
  assert.equal(corrected.body.inspection.status, 'pending');
  assert.equal(state.events.at(-1).reason.length, 500);
});
test('correction invalidates approval, records reason, and prevents stale reapproval',async t=>{
  const {call,state}=await fixture(t);const a=(await call('','inventory','POST',input)).body;
  await call(`/${a.id}/inspection`,'inspector','POST',{decision:'approved',expectedRevision:1,notes:'Verified'});
  const correction={vendorBusinessId:'VEN-B',species:'Pig',weightGrams:90000,weighedAt:input.weighedAt,expectedRevision:1,reason:'Corrected vendor allocation after document review'};
  const r=await call(`/${a.id}/correction`,'inventory','POST',correction);assert.equal(r.status,200);assert.equal(r.body.revision,2);assert.equal(r.body.inspection.status,'pending');assert.equal(animalBillingEligible(r.body),false);
  assert.equal((await call(`/${a.id}`,'alice')).status,404);assert.equal((await call(`/${a.id}`,'bob')).status,200);
  assert.equal((await call(`/${a.id}/inspection`,'inspector','POST',{decision:'approved',expectedRevision:1,notes:'Old view'})).status,409);
  assert.equal(state.events.at(-1).reason,correction.reason);
});
test('billed records cannot be corrected; membership removal immediately denies future inventory requests',async t=>{
  const {call,state}=await fixture(t);const a=(await call('','inventory','POST',input)).body;state.animals.get(a.id).billingInvoiceId='INV-1';
  assert.equal((await call(`/${a.id}/correction`,'inventory','POST',{vendorBusinessId:'VEN-A',species:'Pig',weightGrams:90000,weighedAt:input.weighedAt,expectedRevision:1,reason:'Changed'})).status,409);
  state.memberships.inventory.status='inactive';assert.equal((await call('','inventory')).status,403);
  assert.equal((await call('/invoices','ADMIN','POST',{})).status,503);
});
test('animal cursor is bound to account and rejects tampering and forged filters',async t=>{
  const {call}=await fixture(t);for(let i=0;i<26;i++)await call('','inventory','POST',{...input,identifier:`PAGE-${i}`});
  const page=(await call('','alice')).body;assert.equal(page.items.length,25);assert.ok(page.nextCursor);
  assert.equal((await call(`?cursor=${encodeURIComponent(page.nextCursor)}`,'alice')).body.items.length,1);
  assert.equal((await call(`?cursor=${encodeURIComponent(page.nextCursor)}`,'bob')).status,400);
  assert.equal((await call(`?cursor=${encodeURIComponent(page.nextCursor+'x')}`,'alice')).status,400);
  assert.equal((await call('?vendorBusinessId=VEN-B','alice')).status,400);
});

test('inspector vendor identity is animal-bound, minimal and unavailable to all other roles',async t=>{
  const {call,state}=await fixture(t);const a=(await call('','inventory','POST',input)).body;
  const r=await call(`/${a.id}/vendor`,'inspector');assert.equal(r.status,200);
  assert.deepEqual(r.body,{vendorBusinessId:'VEN-A',businessName:'Synthetic business A',marketName:'Synthetic Market',marketSection:'Meat',stallNumber:'S-01'});
  for(const who of ['alice','bob','inventory','billing','delivery'])assert.equal((await call(`/${a.id}/vendor`,who)).status,403);
  assert.equal((await call(`/${a.id}/vendor`,'ADMIN','GET',undefined,true)).status,403);
  assert.equal((await call(`/${a.id}/vendor`,'other')).status,404);
  assert.equal((await call('/MISSING/vendor','inspector')).status,404);
  assert.equal((await call(`/${a.id}/vendor?vendorBusinessId=VEN-B`,'inspector')).status,400);
  state.memberships.inspector.status='pending';assert.equal((await call(`/${a.id}/vendor`,'inspector')).status,403);
});
test('vendor identity rejects inactive, missing, malformed and inconsistent businesses without leaking fields',async t=>{
  const {call,state}=await fixture(t);const a=(await call('','inventory','POST',input)).body;const original=state.vendorRecords.get('VEN-A');
  for(const change of [{status:'Inactive'},{id:'VEN-B'},{name:''},{stallNumber:123},{marketName:'x'.repeat(121)}]){
    state.vendorRecords.set('VEN-A',{...original,...change});const r=await call(`/${a.id}/vendor`,'inspector');assert.equal(r.status,503);assert.deepEqual(Object.keys(r.body),['message']);
  }
  state.vendorRecords.set('VEN-A',{...original,municipalScopeId:'OTHER',name:'PRIVATE OTHER NAME'});
  const cross=await call(`/${a.id}/vendor`,'inspector');assert.equal(cross.status,404);assert.ok(!JSON.stringify(cross.body).includes('PRIVATE'));
  state.vendorRecords.delete('VEN-A');assert.equal((await call(`/${a.id}/vendor`,'inspector')).status,503);
  state.vendorRecords.set('VEN-A',original);state.animals.get(a.id).id='INCONSISTENT';assert.equal((await call(`/${a.id}/vendor`,'inspector')).status,503);
});
test('identity follows corrected ownership and returns null for genuinely absent stall details',async t=>{
  const {call}=await fixture(t);const a=(await call('','inventory','POST',input)).body;
  await call(`/${a.id}/correction`,'inventory','POST',{vendorBusinessId:'VEN-B',species:'Pig',weightGrams:90000,weighedAt:input.weighedAt,expectedRevision:1,reason:'Correct ownership'});
  const identity=await call(`/${a.id}/vendor`,'inspector');assert.equal(identity.status,200);
  assert.deepEqual(identity.body,{vendorBusinessId:'VEN-B',businessName:'Synthetic business B',marketName:null,marketSection:null,stallNumber:null});
});
test('vendor identity remains gated when animal workflow is disabled',async t=>{
  const {call}=await fixture(t,false);assert.equal((await call('/ANY/vendor','inspector')).status,503);
});

test('identity requires live active inspector membership and matching role/scope claims',async t=>{
  const {call,state}=await fixture(t);const a=(await call('','inventory','POST',input)).body;
  const path=`/${a.id}/vendor`;
  assert.equal((await call(path,null)).status,401);assert.equal((await call(path,'expired')).status,401);
  for(const claims of [{municipalRole:'vendor'},{municipalScopeId:'OTHER'},{municipalRole:undefined}]){
    state.claimOverrides.inspector=claims;assert.equal((await call(path,'inspector')).status,403);
  }
  state.claimOverrides.inspector={};state.memberships.inspector.status='inactive';assert.equal((await call(path,'inspector')).status,403);
  delete state.memberships.inspector;assert.equal((await call(path,'inspector')).status,403);
});

test('production rollback keeps animal reads scoped and closes every recording path',async t=>{
  const source=await fixture(t);const created=await source.call('','inventory','POST',input);
  const production={municipalScopeId:'SCOPE-A',features:{animals:false,inspection:false,carcass:false}};
  const {call,state}=await fixture(t,true,production);state.animals.set(created.body.id,source.state.animals.get(created.body.id));
  const settings=(await call('/settings')).body;
  assert.equal(settings.enabled,true);assert.equal(settings.canRecord,false);assert.equal(settings.canInspect,false);assert.equal(settings.canRecordCarcassWeight,false);
  assert.equal((await call(`/${created.body.id}`,'alice')).status,200);
  assert.equal((await call(`/${created.body.id}`,'bob')).status,404);
  assert.equal((await call('','other')).status,403);
  assert.equal((await call('','billing')).status,200);
  for(const path of ['',`/${created.body.id}/correction`,`/${created.body.id}/inspection`,`/${created.body.id}/carcass-weight`])assert.equal((await call(path,'inventory','POST',{})).status,503);
  state.memberships.inventory.status='inactive';assert.equal((await call()).status,403);
});
test('production animal and inspection capabilities remain independent and role checked',async t=>{
  const production={municipalScopeId:'SCOPE-A',features:{animals:true,inspection:false,carcass:false}};
  const {call}=await fixture(t,false,production);
  assert.equal((await call('','billing','POST',input)).status,403);
  const created=await call('','inventory','POST',input);assert.equal(created.status,201);
  assert.equal((await call(`/${created.body.id}/inspection`,'inspector','POST',{})).status,503);
  assert.equal((await call('/settings','inspector')).body.canInspect,false);
  assert.equal((await call(`/${created.body.id}/INSPECTION/`,'inspector','POST',{})).status,503);
});
test('stable production animal cursors survive another router instance and retain user binding',async t=>{
  const source=await fixture(t);const created=await source.call('','inventory','POST',input);const original=source.state.animals.get(created.body.id);
  const production={municipalScopeId:'SCOPE-A',features:{animals:false,inspection:false,carcass:false}};
  const a=await fixture(t,false,production),b=await fixture(t,false,production);
  for(let i=0;i<26;i++){const id=`ANM-${String(i).padStart(3,'0')}`;for(const f of [a,b])f.state.animals.set(id,{...original,id});}
  const first=await a.call();assert.equal(first.body.items.length,25);assert.ok(first.body.nextCursor);
  assert.equal((await b.call(`?cursor=${encodeURIComponent(first.body.nextCursor)}`)).body.items.length,1);
  assert.equal((await b.call(`?cursor=${encodeURIComponent(first.body.nextCursor)}`,'alice')).status,400);
});

for (const who of ['billing','delivery']) {
  test(`${who} reads municipal animals before invoices/assignments without mutation or private lookup access`,async t=>{
    const production={municipalScopeId:'SCOPE-A',features:{animals:true,inspection:true,carcass:true}};
    const {call,state}=await fixture(t,true,production);
    const a=(await call('','inventory','POST',input)).body;
    const b=(await call('','inventory','POST',{...input,identifier:'TAG-B',vendorBusinessId:'VEN-B'})).body;
    const c=(await call('','inventory','POST',{...input,identifier:'TAG-C'})).body;
    state.animals.get(b.id).inspection={status:'approved',revision:1,inspectorUid:'inspector',decidedAt:'2020-01-01T09:00:00.000Z',notes:'Synthetic findings'};
    state.animals.get(c.id).inspection={status:'rejected',revision:1,inspectorUid:'inspector',decidedAt:'2020-01-01T09:00:00.000Z',notes:'Synthetic findings'};
    const foreign={...structuredClone(state.animals.get(a.id)),id:'FOREIGN',municipalScopeId:'SCOPE-B'};state.animals.set(foreign.id,foreign);
    const before=structuredClone([...state.animals]),events=state.events.length;
    const settings=(await call('/settings',who)).body;
    assert.equal(settings.canRead,true);assert.equal(settings.canReadHistory,false);
    for(const flag of ['canRecord','canInspect','canRecordCarcassWeight'])assert.equal(settings[flag],false);
    const page=await call('',who);assert.equal(page.status,200);assert.equal(page.body.items.length,3);
    assert.deepEqual(new Set(page.body.items.map(a=>a.inspection.status)),new Set(['pending','approved','rejected']));
    assert.ok(page.body.items.every(a=>a.municipalScopeId==='SCOPE-A'));
    assert.equal((await call(`/${a.id}`,who)).status,200);
    assert.equal((await call('/FOREIGN',who)).status,404);
    for(const suffix of ['/vendors',`/${a.id}/vendor`,`/${a.id}/history`])assert.equal((await call(suffix,who)).status,403);
    for(const suffix of ['',`/${a.id}/correction`,`/${a.id}/inspection`,`/${a.id}/carcass-weight`])assert.equal((await call(suffix,who,'POST',{})).status,403);
    for(const filter of ['municipalScopeId=SCOPE-B','vendorBusinessId=VEN-A','status=approved'])assert.equal((await call('?'+filter,who)).status,400);
    assert.deepEqual([...state.animals],before);assert.equal(state.events.length,events);
    assert.equal((await call('', 'alice')).body.items.length,2);
    assert.equal((await call(`/${b.id}`,'alice')).status,404);
  });
  test(`${who} read access survives paused writes and rejects unverified, revoked and unassigned membership`,async t=>{
    const production={municipalScopeId:'SCOPE-A',features:{animals:false,inspection:false,carcass:false}};
    const {call,state}=await fixture(t,true,production);
    assert.equal((await call('/settings',who)).body.canRead,true);
    assert.equal((await call('/settings','inventory')).body.canReadHistory,true);
    assert.equal((await call('/settings','inspector')).body.canReadHistory,true);
    assert.equal((await call('',who)).status,200);
    state.claimOverrides[who]={email_verified:false};assert.equal((await call('',who)).status,403);
    state.claimOverrides[who]={};state.memberships[who].status='inactive';assert.equal((await call('',who)).status,403);
    state.memberships[who].status='active';state.memberships[who].staffPermissions=[];
    assert.equal((await call('/settings',who)).body.canRead,false);assert.equal((await call('',who)).status,403);
  });
}
test('read-only staff cursors remain bounded, per-account and tamper-proof',async t=>{
  const {call}=await fixture(t);
  for(let i=0;i<26;i++)assert.equal((await call('','inventory','POST',{...input,identifier:`READ-${i}`})).status,201);
  const first=await call('','billing');assert.equal(first.body.items.length,25);assert.ok(first.body.nextCursor);
  const cursor=encodeURIComponent(first.body.nextCursor);
  assert.equal((await call('?cursor='+cursor,'billing')).body.items.length,1);
  assert.equal((await call('?cursor='+cursor,'delivery')).status,400);
  assert.equal((await call('?cursor='+encodeURIComponent(first.body.nextCursor+'x'),'billing')).status,400);
});

for(const who of ['billing','delivery'])test(`${who} API projection removes notes and all actors from lists and measured details`,async t=>{
  const {call,state}=await fixture(t);
  const created=(await call('','inventory','POST',input)).body;
  const stored=state.animals.get(created.id);
  stored.inspection={status:'approved',revision:1,inspectorUid:'PRIVATE-INSPECTOR',decidedAt:'2020-01-01T09:00:00.000Z',notes:'PRIVATE-NOTES'};
  stored.carcassWeight={weightGrams:65000,weighedAt:'2020-01-01T10:00:00.000Z',revision:1,animalRevision:1,recordedAt:'2020-01-01T10:01:00.000Z',recordedBy:'PRIVATE-ACTOR'};
  const before=structuredClone(stored),events=state.events.length;
  const settings=(await call('/settings',who)).body;assert.equal(settings.animalReadOnly,true);assert.equal(settings.canReadHistory,false);
  for(const result of [(await call('',who)).body.items[0],(await call(`/${created.id}`,who)).body]){
    assert.equal(result.projection,'staff_read_only_v1');
    assert.deepEqual(Object.keys(result).sort(),['id','municipalScopeId','vendorBusinessId','identifier','identifierType','species','weightGrams','weighedAt','revision','createdAt','updatedAt','carcassWeightLocked','carcassEstimate','carcassWeightSelection','projection','inspection','carcassWeight'].sort());
    assert.deepEqual(Object.keys(result.inspection).sort(),['status','revision','decidedAt'].sort());
    assert.deepEqual(Object.keys(result.carcassWeight).sort(),['weightGrams','weighedAt','revision','animalRevision','recordedAt'].sort());
    assert.equal(result.carcassWeightSelection.source,'measured');assert.equal(result.carcassWeight.weightGrams,65000);
    assert.equal(result.carcassEstimate.weightGrams,68000);assert.equal(result.weighedAt,stored.weighedAt);
    for(const secret of ['PRIVATE-NOTES','PRIVATE-INSPECTOR','PRIVATE-ACTOR',stored.createdBy])assert.equal(JSON.stringify(result).includes(secret),false);
  }
  for(const fullRole of ['inventory','inspector','alice']){
    const full=(await call(`/${created.id}`,fullRole)).body;
    assert.equal(full.projection,undefined);assert.equal(full.createdBy,stored.createdBy);assert.equal(full.inspection.notes,'PRIVATE-NOTES');assert.equal(full.carcassWeight.recordedBy,'PRIVATE-ACTOR');
    assert.equal((await call('/settings',fullRole)).body.animalReadOnly,false);
  }
  assert.equal((await call(`/${created.id}/history`,who)).status,403);
  assert.deepEqual(stored,before);assert.equal(state.events.length,events);
});
