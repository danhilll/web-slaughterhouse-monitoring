import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createAnimalRouter,createAnimalMobileAuth,createAnimalStore,animalBillingEligible } from './animals.js';
import { createWebAdminMiddleware,createWriteGuard } from './access.js';

const input={identifier:'TAG-001',identifierType:'manual',vendorBusinessId:'VEN-A',species:'Pig',weightGrams:85000,weighedAt:'2020-01-01T08:00:00.000Z'};
async function fixture(t,enabled=true){
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
  const auth={verifyIdToken:async(token,revoked)=>{assert.equal(revoked,true);if(token==='expired')throw {code:'auth/id-token-expired'};return {uid:token,municipalRole:state.memberships[token]?.role,municipalScopeId:state.memberships[token]?.municipalScopeId,...state.claimOverrides[token]};}};
  const app=express();
  app.use('/api/mobile/animals',express.json(),createAnimalMobileAuth(()=>auth,store),createAnimalRouter({store,enabled,getPrincipal:req=>req.animalUser,cursorSecret:Buffer.alloc(32,1)}));
  app.use('/api',createWebAdminMiddleware(()=>auth,new Set(['ADMIN'])));
  app.use('/api/animals',express.json(),createAnimalRouter({store,enabled,getPrincipal:req=>({uid:req.webUser.uid,role:'admin',municipalScopeId:'SCOPE-A',staffPermissions:[]})}));
  app.use('/api',createWriteGuard(false));app.post('/api/invoices',(req,res)=>res.json({}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const call=async(path='',token='inventory',method='GET',body,web=false)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${path==='/invoices'?'/api/invoices':`/api/${web?'animals':'mobile/animals'}${path}`}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
  return {state,call};
}
test('workflow gate, authentication and staff function separation deny unauthorized records',async t=>{
  const {call,state}=await fixture(t,false);assert.equal((await call('','inventory','POST',input)).status,503);assert.equal(state.animals.size,0);
  assert.equal((await call('',null)).status,401);assert.equal((await call('','expired')).status,401);
});
test('only inventory staff or web administrator records an animal; billing and delivery permissions grant no inventory access',async t=>{
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
