import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createAnimalStore,createAnimalRouter,createAnimalMobileAuth} from './animals.js';
const now='2026-10-20T01:00:00.000Z';
const input={vendorBusinessId:'OWNER-B',identifier:' ear-a ',identifierType:'manual',species:'Pig',weightGrams:85001,weighedAt:'2026-10-19T23:20:00+08:00'};
async function fixture(t){
  const rows=new Map();let sequence=0;
  rows.set('mobile_memberships/inventory',{role:'staff',staffPermissions:['inventory'],status:'active',municipalScopeId:'SCOPE'});
  for(const id of ['OWNER-A','OWNER-B'])rows.set('vendors/'+id,{id,status:'Active',municipalScopeId:'SCOPE',name:'Synthetic owning business'});
  const doc=path=>({path,get:async()=>snapshot(path)});
  const snapshot=path=>({id:path.split('/').at(-1),exists:rows.has(path),data:()=>structuredClone(rows.get(path))});
  const db={doc,collection:path=>({doc:()=>doc(path+'/AUDIT-'+ ++sequence)}),runTransaction:async fn=>{
    const writes=[];const tx={get:async ref=>{assert.equal(writes.length,0);return snapshot(ref.path);},
      create:(ref,data)=>{assert.equal(rows.has(ref.path),false);writes.push([ref.path,data]);}};
    const result=await fn(tx);for(const [path,data] of writes)rows.set(path,structuredClone(data));return result;
  }};
  const store=createAnimalStore(()=>db);const app=express();
  const auth={verifyIdToken:async(token,revoked)=>{assert.equal(token,'inventory');assert.equal(revoked,true);return {uid:token,email_verified:true,municipalRole:'staff',municipalScopeId:'SCOPE'};}};
  app.use(express.json(),createAnimalMobileAuth(()=>auth,store),createAnimalRouter({store,production:{municipalScopeId:'SCOPE',features:{animals:true,inspection:false,carcass:false}},cursorSecret:Buffer.alloc(32,1),getPrincipal:req=>req.animalUser,now:()=>now}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const post=async body=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/`,{method:'POST',headers:{Authorization:'Bearer inventory','Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  return {rows,post,animals:()=>[...rows].filter(([p])=>p.startsWith('animal_records/')),audits:()=>[...rows].filter(([p])=>p.startsWith('animal_audit/'))};
}
test('staff registers the active owning business with measured time distinct from server audit time',async t=>{
  const f=await fixture(t);
  for(const species of ['Cow','Pig']){
    const r=await f.post({...input,identifier:'EAR-'+species,species});assert.equal(r.status,201);
    assert.equal(r.body.vendorBusinessId,'OWNER-B');assert.equal(r.body.createdBy,'inventory');
    assert.equal(r.body.species,species);assert.equal(r.body.weightGrams,85001);
    assert.equal(r.body.weighedAt,'2026-10-19T15:20:00.000Z');
    assert.equal(r.body.createdAt,now);assert.equal(r.body.updatedAt,now);assert.notEqual(r.body.weighedAt,r.body.createdAt);
    const audit=f.audits().at(-1)[1];assert.equal(audit.actorUid,'inventory');assert.equal(audit.at,now);assert.equal(audit.after.weighedAt,r.body.weighedAt);
  }
});
test('normalized ear codes remain unique across owning vendors without silently changing the key',async t=>{
  const f=await fixture(t);const first=await f.post(input);assert.equal(first.status,201);assert.equal(first.body.identifier,'EAR-A');
  const collision=await f.post({...input,vendorBusinessId:'OWNER-A',identifier:'EAR-A'});
  assert.equal(collision.status,409);assert.match(collision.body.message,/already registered/);
  assert.equal(f.animals().length,1);assert.equal(f.audits().length,1);assert.equal(f.animals()[0][1].vendorBusinessId,'OWNER-B');
});
test('registration still rejects ineligible ownership, client audit fields and absent or future measured time',async t=>{
  const f=await fixture(t);
  for(const patch of [{status:'Inactive'},{municipalScopeId:'OTHER'},{id:'INCONSISTENT'}]){
    f.rows.set('vendors/OWNER-B',{id:'OWNER-B',name:'Synthetic owner',status:'Active',municipalScopeId:'SCOPE',...patch});
    assert.equal((await f.post(input)).status,409);
  }
  f.rows.set('vendors/OWNER-B',{id:'OWNER-B',name:'Synthetic owner',status:'Active',municipalScopeId:'SCOPE'});
  for(const patch of [{createdAt:now},{updatedAt:now},{createdBy:'someone'},{municipalScopeId:'OTHER'},{weighedAt:''},{weighedAt:'2026-10-20T09:00:00'},{weighedAt:new Date(Date.now()+120000).toISOString()}]){
    assert.equal((await f.post({...input,...patch})).status,400);
  }
  assert.equal(f.animals().length,0);assert.equal(f.audits().length,0);
});
