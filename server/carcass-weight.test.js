import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createAnimalStore,createAnimalRouter,createAnimalMobileAuth} from './animals.js';
import {createWebAdminMiddleware} from './access.js';
import {createOperationsStore} from './operations.js';
import {loadProductionConfig} from './production-config.js';
import {estimateCarcassWeight} from '../shared/carcassEstimate.js';

const at='2026-10-15T06:00:00.000Z';
const input={weightGrams:65001,weighedAt:at,expectedRevision:1,expectedCarcassRevision:0};
async function fixture(t,{gate=true,enabled=true,production=null}={}) {
  const rows=new Map();let sequence=0,queue=Promise.resolve();
  const state={failAudit:false};
  const snap=ref=>({exists:rows.has(ref.path),id:ref.path.split('/').at(-1),data:()=>structuredClone(rows.get(ref.path))});
  const doc=path=>({path,get:async()=>snap({path})});
  const db={doc,collection:path=>({doc:()=>doc(`${path}/EVENT-${++sequence}`),where(field,op,value){
    const filters=[[field,value]];
    const q={where:(f,o,v)=>{filters.push([f,v]);return q;},orderBy:()=>q,limit:n=>{q.count=n;return q;},get:async()=>({docs:[...rows].filter(([key,row])=>key.startsWith(path+'/')&&filters.every(([f,v])=>row[f]===v)).slice(0,q.count).map(([path])=>snap({path}))})};return q;
  }}),runTransaction(fn){
    const result=queue.then(async()=>{
      const writes=[];
      const tx={get:async ref=>{assert.equal(writes.length,0,'Firestore reads precede writes');return snap(ref);},
        create:(ref,row)=>{if(state.failAudit&&(ref.path.startsWith('animal_audit/')||ref.path.startsWith('organ_collection_audit/')))throw Error('private audit failure');assert.equal(rows.has(ref.path),false);writes.push([ref.path,row]);},
        set:(ref,row)=>writes.push([ref.path,row]),update:(ref,patch)=>writes.push([ref.path,{...rows.get(ref.path),...patch}])};
      const value=await fn(tx);for(const [path,row] of writes)rows.set(path,structuredClone(row));return value;
    });queue=result.catch(()=>{});return result;
  }};
  const members={inventory:{role:'staff',staffPermissions:['inventory']},billing:{role:'staff',staffPermissions:['billing']},delivery:{role:'staff',staffPermissions:['delivery']},inspector:{role:'inspector'},vendor:{role:'vendor',vendorBusinessId:'VEN-A'},other:{role:'staff',staffPermissions:['inventory'],municipalScopeId:'OTHER'}};
  for(const [uid,m] of Object.entries(members))rows.set(`mobile_memberships/${uid}`,{...m,status:'active',municipalScopeId:m.municipalScopeId||'SCOPE'});
  rows.set('vendors/VEN-A',{id:'VEN-A',name:'Synthetic business',municipalScopeId:'SCOPE',status:'Active'});
  rows.set('animal_records/ANM-A',{id:'ANM-A',municipalScopeId:'SCOPE',vendorBusinessId:'VEN-A',identifier:'TEST-A',identifierType:'manual',species:'Pig',weightGrams:85001,weighedAt:'2026-10-15T05:00:00.000Z',revision:1,inspection:{status:'approved',revision:1,inspectorUid:'inspector',decidedAt:'2026-10-15T05:30:00.000Z',notes:'Verified'},createdAt:at,createdBy:'inventory',updatedAt:at,updatedBy:'inspector'});
  rows.set('operation_fee_schedules/SCOPE',{status:'approved',version:1,basis:'perAnimal',currency:'PHP',corralCents:1500,deliveryCents:2500,inspectionCents:1000,facilityCents:4500,syntheticOnly:true});
  const auth={verifyIdToken:async(token,revoked)=>{assert.equal(revoked,true);if(token==='expired')throw {code:'auth/id-token-expired'};const m=rows.get(`mobile_memberships/${token}`);return {uid:token,email_verified:true,municipalRole:m?.role,municipalScopeId:m?.municipalScopeId};}};
  const store=createAnimalStore(()=>db),app=express();app.use(express.json());
  const options={store,enabled,...(production?{production,cursorSecret:production.cursorSecret('animals')}:{ }),now:()=>at,...(gate===undefined?{}:{carcassWeightEnabled:gate})};
  app.use('/api/mobile/animals',createAnimalMobileAuth(()=>auth,store),createAnimalRouter({...options,getPrincipal:req=>req.animalUser}));
  app.use('/api',createWebAdminMiddleware(()=>auth,new Set(['ADMIN'])));
  app.use('/api/animals',createAnimalRouter({...options,getPrincipal:req=>({uid:req.webUser.uid,role:'admin',municipalScopeId:'SCOPE',staffPermissions:[]})}));
  app.use((error,req,res,next)=>res.status(error.status===400?400:500).json({message:'Invalid request body.'}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const call=async({body=input,who='inventory',suffix='/ANM-A/carcass-weight',method='POST',web=false}={})=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/${web?'animals':'mobile/animals'}${suffix}`,{method,headers:{...(who?{Authorization:`Bearer ${who}`} : {}),'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json()};
  };
  return {rows,state,call,store,billing:createOperationsStore(()=>db),animal:()=>rows.get('animal_records/ANM-A'),events:()=>[...rows].filter(([key])=>key.startsWith('animal_audit/')).map(([,row])=>row)};
}

test('carcass first entry and correction preserve live weight, animal revision and inspector evidence with atomic snapshots',async t=>{
  const f=await fixture(t),original=structuredClone(f.animal());
  const first=await f.call();assert.equal(first.status,200);
  assert.deepEqual(first.body.carcassWeight,{weightGrams:65001,weighedAt:at,revision:1,animalRevision:1,recordedAt:at,recordedBy:'inventory'});
  assert.deepEqual(f.animal(),{...original,carcassEstimate:first.body.carcassEstimate,carcassWeight:first.body.carcassWeight,updatedAt:at,updatedBy:'inventory'});
  assert.equal(f.events()[0].before.carcassWeight,null);assert.deepEqual(f.events()[0].after.carcassWeight,first.body.carcassWeight);
  const result=await f.call({who:'ADMIN',web:true,body:{...input,weightGrams:66002,expectedCarcassRevision:1,reason:' Corrected scale entry '}});
  assert.equal(result.status,200);assert.equal(result.body.carcassWeight.revision,2);assert.equal(result.body.carcassWeight.recordedBy,'ADMIN');
  assert.equal(f.events()[1].action,'carcass_weight_corrected');assert.equal(f.events()[1].reason,'Corrected scale entry');
  assert.deepEqual(f.events()[1].before.carcassWeight,first.body.carcassWeight);assert.deepEqual(f.events()[1].after.carcassWeight,result.body.carcassWeight);
  assert.deepEqual(result.body.inspection,original.inspection);assert.equal(result.body.revision,original.revision);assert.equal(result.body.weightGrams,original.weightGrams);assert.equal(result.body.weighedAt,original.weighedAt);
});

test('carcass recording gate defaults closed independently of animal activation',async t=>{
  const f=await fixture(t,{gate:false});assert.equal((await f.call()).status,503);assert.equal(f.events().length,0);
  const settings=(await f.call({suffix:'/settings',method:'GET'})).body;
  assert.equal(settings.carcassWeightEnabled,false);assert.equal(settings.canRecordCarcassWeight,false);assert.equal(settings.carcassDefinitionStatus,'awaiting_confirmation');
  const off=await fixture(t,{enabled:false});assert.equal((await off.call()).status,503);
  // Omit the option entirely to exercise the default (rather than only explicit false).
  const app=express();app.use(createAnimalRouter({store:{},enabled:true,getPrincipal:()=>({uid:'ADMIN',role:'admin',municipalScopeId:'SCOPE'})}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/ANM-A/carcass-weight`,{method:'POST'});assert.equal(response.status,503);
});

test('carcass authorization denies other roles, scopes, disabled memberships and invalid sessions',async t=>{
  const f=await fixture(t);
  for(const who of ['billing','delivery','inspector','vendor'])assert.equal((await f.call({who})).status,403);
  assert.equal((await f.call({who:'other'})).status,404);
  for(const who of [null,'expired'])assert.equal((await f.call({who})).status,401);
  f.rows.get('mobile_memberships/inventory').staffPermissions=[];assert.equal((await f.call()).status,403);
  f.rows.get('mobile_memberships/inventory').status='inactive';assert.equal((await f.call()).status,403);
  assert.equal(f.events().length,0);assert.equal(f.animal().carcassWeight,undefined);
});

test('carcass validation rejects fractional grams, unsafe values, extra fields, invalid times and revisions',async t=>{
  const f=await fixture(t);
  for(const patch of [{weightGrams:0},{weightGrams:-1},{weightGrams:1.1},{weightGrams:'65000'},{weightGrams:Number.MAX_SAFE_INTEGER+1},{weighedAt:'invalid'},{weighedAt:'2026-10-15T06:00:00'},{weighedAt:'2026-10-15T06:01:00.001Z'},{expectedRevision:0},{expectedRevision:1.5},{expectedCarcassRevision:-1},{expectedCarcassRevision:'0'},{municipalScopeId:'OTHER'},{weightKg:65},{reason:''},{reason:'x'.repeat(501)},{reason:'bad\nreason'}])
    assert.equal((await f.call({body:{...input,...patch}})).status,400,JSON.stringify(patch));
  for(const key of Object.keys(input)){const body={...input};delete body[key];assert.equal((await f.call({body})).status,400,key);}
  for(const body of [[],null])assert.equal((await f.call({body})).status,400);
  assert.equal((await f.call({suffix:'/ANM-A/carcass-weight?scope=OTHER'})).status,400);
  assert.equal(f.events().length,0);
  // No invented yield/ratio threshold: this value can exceed live weight.
  assert.equal((await f.call({body:{...input,weightGrams:90000}})).status,200);
});

test('carcass writes require current approval and reject invoiced/dispatched or stale records',async t=>{
  const f=await fixture(t);
  const approved={...f.animal().inspection};
  // Keep completed-decision evidence valid while testing the eligibility gate.
  for(const inspection of [{status:'pending',revision:1},{...approved,status:'rejected'}]){f.animal().inspection=inspection;assert.equal((await f.call()).status,409);}
  f.animal().inspection=approved;
  assert.equal((await f.call({body:{...input,expectedRevision:2}})).status,409);
  for(const key of ['billingInvoiceId','deliveryId']){f.animal()[key]='LINK';assert.equal((await f.call()).status,409);delete f.animal()[key];}
  assert.equal((await f.call()).status,200);
  assert.equal((await f.call()).status,409);
  assert.equal((await f.call({body:{...input,expectedCarcassRevision:1}})).status,400);
  f.animal().billingInvoiceId='INV';
  assert.equal((await f.call({body:{...input,expectedCarcassRevision:1,reason:'Correction'}})).status,409);
  assert.equal(f.events().length,1);
});

test('concurrent carcass entries/corrections have one winner per measurement revision',async t=>{
  const f=await fixture(t);
  assert.deepEqual((await Promise.all([f.call(),f.call()])).map(r=>r.status).sort(),[200,409]);
  const body={...input,expectedCarcassRevision:1,reason:'Correction'};
  assert.deepEqual((await Promise.all([f.call({body}),f.call({body})])).map(r=>r.status).sort(),[200,409]);
  assert.equal(f.events().length,2);assert.equal(f.animal().carcassWeight.revision,2);
});

test('failed carcass audit leaves measurement unchanged and errors hide internal details',async t=>{
  const f=await fixture(t);await f.call();const original=structuredClone(f.animal());f.state.failAudit=true;
  const result=await f.call({body:{...input,expectedCarcassRevision:1,reason:'Correction'}});
  assert.equal(result.status,503);assert.deepEqual(result.body,{message:'Animal operation failed. Refresh the record before retrying.'});
  assert.deepEqual(f.animal(),original);assert.equal(f.events().length,1);
});

test('live corrections retain historical carcass linkage and require reinspection before carcass correction',async t=>{
  const f=await fixture(t);await f.call();const carcass=structuredClone(f.animal().carcassWeight);
  const correction=await f.call({suffix:'/ANM-A/correction',body:{vendorBusinessId:'VEN-A',species:'Pig',weightGrams:86000,weighedAt:at,expectedRevision:1,reason:'Live weight correction'}});
  assert.equal(correction.status,200);assert.equal(correction.body.revision,2);assert.deepEqual(correction.body.carcassWeight,carcass);
  const body={...input,expectedRevision:2,expectedCarcassRevision:1,reason:'Rechecked carcass'};
  assert.equal((await f.call({body})).status,409);
  assert.equal((await f.call({who:'inspector',suffix:'/ANM-A/inspection',body:{decision:'approved',expectedRevision:2,notes:'Reverified'}})).status,200);
  const result=await f.call({body});assert.equal(result.status,200);assert.equal(result.body.carcassWeight.animalRevision,2);assert.equal(result.body.carcassWeight.revision,2);
});

test('billing prices are unchanged and its animal lock blocks later carcass saves',async t=>{
  const f=await fixture(t);await f.call();const approved=structuredClone(f.animal().inspection);
  const invoice=await f.billing.bill('ANM-A',{expectedRevision:1,feeScheduleVersion:1,dueDate:'2026-10-15'},{uid:'billing',role:'staff',municipalScopeId:'SCOPE',staffPermissions:['billing']},at);
  assert.equal(invoice.totalCents,9500);assert.equal(invoice.total_amount,95);assert.equal(invoice.animalRevision,1);assert.deepEqual(f.animal().inspection,approved);
  assert.equal((await f.call({body:{...input,expectedCarcassRevision:1,reason:'Late correction'}})).status,409);
  assert.equal((await f.call({method:'GET',suffix:'/ANM-A'})).body.carcassWeightLocked,true);
});

test('invalid stored carcass data fails closed rather than being silently repaired',async t=>{
  const f=await fixture(t);await f.call();f.animal().carcassWeight.weightGrams=1.5;
  assert.equal((await f.call({method:'GET',suffix:'/ANM-A'})).status,503);
  assert.equal((await f.call({body:{...input,expectedCarcassRevision:1,reason:'Correction'}})).status,503);assert.equal(f.events().length,1);
});

test('legacy estimate reads are timestamp-free and do not migrate or fabricate measurements',async t=>{
  const f=await fixture(t,{gate:false});const original=structuredClone([...f.rows]);
  const response=await f.call({method:'GET',suffix:'/ANM-A'});
  assert.equal(response.status,200);
  assert.deepEqual(response.body.carcassEstimate,{weightGrams:68001,liveWeightGrams:85001,animalRevision:1,rule:'manager_80_percent_v1',rounding:'nearest_gram_half_up'});
  assert.deepEqual(response.body.carcassWeightSelection,{source:'estimated',weightGrams:68001,animalRevision:1,requiresReview:false});
  assert.equal(response.body.carcassWeight,null);
  assert.deepEqual([...f.rows],original);
  assert.equal((await f.call()).status,503);assert.equal(f.events().length,0);
});

test('Cow and Pig registrations preserve estimated grams and revision in atomic audit snapshots',async t=>{
  for(const species of ['Cow','Pig']){
    const f=await fixture(t);
    const result=await f.call({suffix:'/',body:{identifier:'NEW-'+species,identifierType:'manual',vendorBusinessId:'VEN-A',species,weightGrams:85001,weighedAt:at}});
    assert.equal(result.status,201);
    const stored=f.rows.get('animal_records/'+result.body.id);
    assert.deepEqual(stored.carcassEstimate,estimateCarcassWeight(85001,1));
    assert.equal(stored.carcassWeight,undefined);
    const audit=f.events()[0];assert.equal(audit.action,'registered');assert.deepEqual(audit.after.carcassEstimate,stored.carcassEstimate);
    assert.equal(audit.after.carcassWeight,null);assert.equal(result.body.carcassWeightSelection.source,'estimated');
    assert.equal((await f.call({method:'GET',suffix:'/'+result.body.id})).body.carcassEstimate.weightGrams,68001);
  }
});

test('measured carcass takes precedence while estimate survives first entry and reasoned correction',async t=>{
  const f=await fixture(t);const expected=estimateCarcassWeight(85001,1);
  const first=await f.call();assert.equal(first.status,200);assert.deepEqual(first.body.carcassEstimate,expected);
  assert.deepEqual(first.body.carcassWeightSelection,{source:'measured',weightGrams:65001,animalRevision:1,requiresReview:false});
  assert.deepEqual(f.animal().carcassEstimate,expected);
  const corrected=await f.call({body:{...input,weightGrams:66002,expectedCarcassRevision:1,reason:'Scale correction'}});
  assert.equal(corrected.status,200);assert.deepEqual(corrected.body.carcassEstimate,expected);assert.equal(corrected.body.carcassWeightSelection.weightGrams,66002);
  assert.deepEqual(f.events()[1].before.carcassEstimate,expected);assert.deepEqual(f.events()[1].after.carcassEstimate,expected);
  assert.equal(f.events()[1].reason,'Scale correction');assert.equal(corrected.body.carcassWeight.revision,2);
});

test('live corrections advance estimate revision and retain historical actual and estimate in audit',async t=>{
  const f=await fixture(t);const measured=(await f.call()).body.carcassWeight;
  const oldEstimate=structuredClone(f.animal().carcassEstimate);
  const corrected=await f.call({suffix:'/ANM-A/correction',body:{vendorBusinessId:'VEN-A',species:'Cow',weightGrams:86000,weighedAt:at,expectedRevision:1,reason:'Live weighing corrected'}});
  assert.equal(corrected.status,200);assert.deepEqual(corrected.body.carcassEstimate,estimateCarcassWeight(86000,2));
  assert.deepEqual(corrected.body.carcassWeight,measured);
  assert.deepEqual(corrected.body.carcassWeightSelection,{source:'measured',weightGrams:measured.weightGrams,animalRevision:1,requiresReview:true});
  const audit=f.events().at(-1);assert.deepEqual(audit.before.carcassEstimate,oldEstimate);assert.deepEqual(audit.after.carcassEstimate,corrected.body.carcassEstimate);
  assert.equal(corrected.body.inspection.status,'pending');assert.equal(corrected.body.inspection.revision,2);
  assert.equal((await f.call({body:{...input,expectedRevision:2,expectedCarcassRevision:1,reason:'Needs reinspection'}})).status,409);
});

test('estimates cannot be submitted as measurement metadata and inconsistent stored estimates fail closed',async t=>{
  const f=await fixture(t);
  for(const patch of [{source:'estimated'},{carcassEstimate:estimateCarcassWeight(85001,1)},{estimated:true}]){
    assert.equal((await f.call({body:{...input,...patch}})).status,400);
  }
  f.animal().carcassEstimate={...estimateCarcassWeight(85001,1),weightGrams:1};
  const snapshot=structuredClone(f.animal());
  assert.equal((await f.call({method:'GET',suffix:'/ANM-A'})).status,503);
  assert.equal((await f.call()).status,503);assert.deepEqual(f.animal(),snapshot);assert.equal(f.events().length,0);
});

const productionCarcass = carcass => loadProductionConfig({NODE_ENV:'production',PRODUCTION_RELEASE_MANIFEST:'/synthetic/manifest',FIREBASE_PROJECT_ID:'municipal-fixture',VITE_FIREBASE_PROJECT_ID:'municipal-fixture',MUNICIPAL_SCOPE_ID:'SCOPE',CURSOR_SIGNING_SECRET:'test-only-stable-cursor-key-not-a-real-secret'},()=>({version:1,mode:'production',projectId:'municipal-fixture',municipalScopeId:'SCOPE',apiOrigin:'https://api.example.test',features:{animals:true,inspection:true,carcass},policies:{carcassDefinition:{...JSON.parse(readFileSync(new URL('../deployment/owner-policy-activation.proposed.json',import.meta.url))).policies.carcassDefinition}}}));
test('production inventory Staff records measured weight with existing authorization, audits and estimate separation',async t=>{
  const f=await fixture(t,{production:productionCarcass(true)});
  const settings=await f.call({method:'GET',suffix:'/settings'});
  assert.equal(settings.body.canRecordCarcassWeight,true);assert.equal(settings.body.carcassDefinitionStatus,'approved');
  for(const who of ['billing','delivery','inspector','vendor','other'])assert.equal((await f.call({who})).status,403);
  const result=await f.call();assert.equal(result.status,200);assert.equal(result.body.carcassWeightSelection.source,'measured');
  assert.equal(result.body.carcassEstimate.weightGrams,68001);assert.equal(result.body.carcassWeight.weightGrams,65001);assert.equal(f.events().length,1);
  assert.equal((await f.call()).status,409);
  f.animal().billingInvoiceId='LOCK';assert.equal((await f.call({body:{...input,expectedCarcassRevision:1,reason:'Synthetic correction'}})).status,409);
});
test('production carcass-off and absent explicit router opt-in remain fail closed without mutation',async t=>{
  for(const options of [{production:productionCarcass(false),gate:true},{production:productionCarcass(true),gate:false}]){
    const f=await fixture(t,options),before=structuredClone(f.animal());
    assert.equal((await f.call({method:'GET',suffix:'/settings'})).body.canRecordCarcassWeight,false);
    assert.equal((await f.call()).status,503);assert.deepEqual(f.animal(),before);assert.equal(f.events().length,0);
  }
});
test('organs/offal quantities cannot enter the carcass API or be summed into its measurement',async t=>{
 const f=await fixture(t,{production:productionCarcass(true)}),before=structuredClone(f.animal());
 for(const field of ['organWeightGrams','organsWeightGrams','offalWeightGrams','offalQuantity','includeOrgans']){const result=await f.call({body:{...input,[field]:10000}});assert.equal(result.status,400);assert.deepEqual(f.animal(),before);assert.equal(f.events().length,0);}
 const accepted=await f.call();assert.equal(accepted.status,200);assert.equal(accepted.body.carcassWeight.weightGrams,input.weightGrams);assert.equal(accepted.body.carcassEstimate.weightGrams,68001);assert.deepEqual(Object.keys(accepted.body.carcassWeight).sort(),['animalRevision','recordedAt','recordedBy','revision','weighedAt','weightGrams']);
});

test('Vendor explicit collection choices preserve unset, isolation, revisions, audits, weights and fees',async t=>{
 const f=await fixture(t),suffix='/ANM-A/organ-collection',original=structuredClone(f.animal());
 const read=()=>f.call({who:'vendor',suffix,method:'GET'});
 assert.deepEqual((await read()).body,{animalId:'ANM-A',animalRevision:1,choice:null,choiceRevision:0,requiresReview:false,canChoose:true});
 const write=(choice,revision=0,who='vendor')=>f.call({who,suffix,body:{choice,expectedRevision:1,expectedChoiceRevision:revision}});
 for(const choice of [null,'',false,'unset','dispose'])assert.equal((await write(choice)).status,400);
 for(const who of ['inventory','billing','delivery','inspector'])assert.equal((await write('collect',0,who)).status,403);
 f.rows.set('mobile_memberships/foreign',{role:'vendor',status:'active',municipalScopeId:'SCOPE',vendorBusinessId:'VEN-B'});f.rows.set('vendors/VEN-B',{status:'Active',municipalScopeId:'SCOPE'});
 assert.equal((await write('collect',0,'foreign')).status,404);assert.equal((await f.call({who:'foreign',suffix,method:'GET'})).status,404);
 assert.equal((await f.call({who:'other',suffix,method:'GET'})).status,404);
 assert.equal((await write('collect')).status,200);assert.equal((await read()).body.choice,'collect');assert.equal((await write('decline')).status,409);
 assert.equal((await write('decline',1)).status,200);assert.equal((await read()).body.choice,'decline');assert.deepEqual(f.animal(),original);
 const audits=[...f.rows].filter(([p])=>p.startsWith('organ_collection_audit/')).map(([,a])=>a);assert.equal(audits.length,2);assert.equal(audits[0].before,null);assert.equal(audits[1].before.choice,'collect');assert.equal(audits[1].after.choice,'decline');assert.equal(audits[1].actorUid,'vendor');
 assert.equal('recordedBy' in (await read()).body,false);
 f.animal().revision=2;f.animal().inspection={status:'pending',revision:2};const stale=(await read()).body;assert.equal(stale.choice,null);assert.equal(stale.requiresReview,true);assert.equal(stale.choiceRevision,2);
});
test('collection choice gate, audit failure, concurrency and assignment locks fail closed',async t=>{
 const f=await fixture(t),suffix='/ANM-A/organ-collection',body={choice:'collect',expectedRevision:1,expectedChoiceRevision:0};
 f.state.failAudit=true;assert.equal((await f.call({who:'vendor',suffix,body})).status,503);assert.equal(f.rows.has('animal_organ_choices/ANM-A'),false);f.state.failAudit=false;
 const results=await Promise.all([f.call({who:'vendor',suffix,body}),f.call({who:'vendor',suffix,body:{...body,choice:'decline'}})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 f.animal().billingInvoiceId='INV';f.rows.set('invoices/INV',{delivery:{status:'assigned'}});assert.equal((await f.call({who:'vendor',suffix,body:{...body,expectedChoiceRevision:1}})).status,409);assert.equal((await f.call({who:'vendor',suffix,method:'GET'})).body.canChoose,false);
 const off=await fixture(t,{gate:false});assert.equal((await off.call({who:'vendor',suffix,body})).status,503);assert.equal((await off.call({who:'vendor',suffix,method:'GET'})).body.choice,null);
});
