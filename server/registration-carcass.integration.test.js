import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import express from 'express';
import {createAnimalStore,createAnimalRouter,createAnimalMobileAuth} from './animals.js';

// Execute the exact web time converter, not a reimplementation of its offset arithmetic.
const converter={};
runInNewContext(ts.transpileModule(readFileSync(new URL('../src/animalRegistrationTime.ts',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText,{exports:converter});
const at='2026-10-20T01:00:00.000Z';
async function fixture(t){
  const rows=new Map();let sequence=0;
  rows.set('vendors/OWNER',{id:'OWNER',name:'Synthetic owning business',status:'Active',municipalScopeId:'SCOPE'});
  for(const [uid,role] of [['inventory','staff'],['inspector','inspector']])rows.set('mobile_memberships/'+uid,{
    role,status:'active',municipalScopeId:'SCOPE',...(role==='staff'?{staffPermissions:['inventory']}:{})});
  const snapshot=path=>({id:path.split('/').at(-1),exists:rows.has(path),data:()=>structuredClone(rows.get(path))});
  const doc=path=>({path,get:async()=>snapshot(path)});
  const db={doc,collection:path=>({doc:()=>doc(path+'/EVENT-'+ ++sequence)}),runTransaction:async fn=>{
    const writes=[];const tx={get:async ref=>{assert.equal(writes.length,0);return snapshot(ref.path);},
      create:(ref,data)=>{assert.equal(rows.has(ref.path),false);writes.push([ref.path,data]);},set:(ref,data)=>writes.push([ref.path,data])};
    const result=await fn(tx);for(const [path,data] of writes)rows.set(path,structuredClone(data));return result;
  }};
  const auth={verifyIdToken:async(uid,revoked)=>{assert.equal(revoked,true);const member=rows.get('mobile_memberships/'+uid);assert.ok(member);return {uid,email_verified:true,municipalRole:member.role,municipalScopeId:member.municipalScopeId};}};
  const store=createAnimalStore(()=>db),app=express();
  // Synthetic router options exercise the gated measured workflow without editing any manifest.
  app.use(express.json(),createAnimalMobileAuth(()=>auth,store),createAnimalRouter({store,enabled:true,carcassWeightEnabled:true,now:()=>at,getPrincipal:req=>req.animalUser}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const call=async(path,body,who='inventory')=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{
    method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+who,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};};
  return {call,rows,audits:()=>[...rows].filter(([path])=>path.startsWith('animal_audit/')).map(([,row])=>row)};
}
for(const species of ['Cow','Pig'])test(`combined ${species}: Manila registration, preserved estimate, measured precedence and locked revision history`,async t=>{
  const f=await fixture(t);const weighedAt=converter.manilaWeighingTimeToUtc('2026-10-19T23:20');
  const input={vendorBusinessId:'OWNER',identifier:'EAR-'+species,identifierType:'manual',species,weightGrams:85001,weighedAt};
  const created=await f.call('/',input);assert.equal(created.status,201);const id=created.body.id;
  assert.equal(created.body.weighedAt,'2026-10-19T15:20:00.000Z');assert.equal(created.body.createdAt,at);
  assert.equal(created.body.vendorBusinessId,'OWNER');assert.equal(created.body.weightGrams,85001);
  assert.equal(created.body.carcassEstimate.weightGrams,68001);assert.equal(created.body.carcassEstimate.animalRevision,1);
  assert.equal(created.body.carcassWeight,null);assert.equal(created.body.carcassWeightSelection.source,'estimated');
  assert.equal('weighedAt' in created.body.carcassEstimate,false);
  assert.equal((await f.call('/'+id+'/inspection',{decision:'approved',expectedRevision:1,notes:'Synthetic ownership and weighing review'},'inventory')).status,403);
  assert.equal((await f.call('/'+id+'/inspection',{decision:'approved',expectedRevision:1,notes:'Synthetic review'},'inspector')).status,200);
  const measured=await f.call('/'+id+'/carcass-weight',{weightGrams:65001,weighedAt:at,expectedRevision:1,expectedCarcassRevision:0});
  assert.equal(measured.status,200);assert.deepEqual(measured.body.carcassEstimate,created.body.carcassEstimate);
  assert.equal(measured.body.carcassWeightSelection.source,'measured');assert.equal(measured.body.carcassWeightSelection.weightGrams,65001);
  const corrected=await f.call('/'+id+'/correction',{vendorBusinessId:'OWNER',species,weightGrams:100002,weighedAt,expectedRevision:1,reason:'Synthetic live-weight correction'});
  assert.equal(corrected.status,200);assert.equal(corrected.body.revision,2);assert.equal(corrected.body.inspection.status,'pending');
  assert.equal(corrected.body.carcassEstimate.weightGrams,80002);assert.equal(corrected.body.carcassEstimate.animalRevision,2);
  assert.deepEqual(corrected.body.carcassWeight,measured.body.carcassWeight);assert.equal(corrected.body.carcassWeightSelection.requiresReview,true);
  const audit=f.audits().at(-1);assert.deepEqual(audit.before.carcassEstimate,created.body.carcassEstimate);assert.deepEqual(audit.after.carcassEstimate,corrected.body.carcassEstimate);assert.equal(audit.reason,'Synthetic live-weight correction');
  const remeasure={weightGrams:70000,weighedAt:at,expectedRevision:2,expectedCarcassRevision:1,reason:'Synthetic remeasurement'};
  assert.equal((await f.call('/'+id+'/carcass-weight',remeasure)).status,409);
  assert.equal((await f.call('/'+id+'/inspection',{decision:'approved',expectedRevision:2,notes:'Synthetic reinspection'},'inspector')).status,200);
  const actual=await f.call('/'+id+'/carcass-weight',remeasure);assert.equal(actual.status,200);
  assert.equal(actual.body.carcassWeight.revision,2);assert.equal(actual.body.carcassWeight.animalRevision,2);assert.equal(actual.body.carcassWeightSelection.requiresReview,false);
  assert.equal(actual.body.carcassWeightSelection.weightGrams,70000);assert.deepEqual(actual.body.carcassEstimate,corrected.body.carcassEstimate);
  f.rows.get('animal_records/'+id).billingInvoiceId='SYNTHETIC-LOCK';const count=f.audits().length;
  assert.equal((await f.call('/'+id+'/carcass-weight',{...remeasure,expectedCarcassRevision:2})).status,409);assert.equal(f.audits().length,count);
  const read=await f.call('/'+id);assert.equal(read.status,200);assert.equal(read.body.carcassWeightLocked,true);assert.equal(read.body.carcassWeight.weightGrams,70000);
});
