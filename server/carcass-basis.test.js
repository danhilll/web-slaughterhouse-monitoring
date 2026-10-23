import test from 'node:test';
import assert from 'node:assert/strict';
import {carcassBasis,requireCarcassBasis} from './owner-workflow-policy.js';
import {estimateCarcassWeight} from '../shared/carcassEstimate.js';
import {fixture} from './test-support/operations-fixture.js';

const animal=(extra={})=>({revision:2,species:'Pig',weightGrams:100000,inspection:{status:'approved',revision:2},...extra});
const measured=(extra={})=>({weightGrams:81000,weighedAt:'2026-10-20T01:00:00Z',revision:1,animalRevision:2,recordedAt:'2026-10-20T01:01:00Z',recordedBy:'inventory',...extra});

test('calculated carcass weight is live weight x 0.8, nearest gram half up, for Pig and Cow',()=>{
  for(const [live,expected] of [[100000,80000],[85001,68001],[1,1],[2,2],[3,2],[5,4],[120000,96000]])
    for(const species of ['Pig','Cow']){const b=carcassBasis(animal({species,weightGrams:live}));
      assert.deepEqual(b,{method:'calculated_80_percent',liveWeightGrams:live,factor:0.8,carcassWeightGrams:expected,rule:'manager_80_percent_v1',rounding:'nearest_gram_half_up',animalRevision:2});
      assert.equal(b.carcassWeightGrams,estimateCarcassWeight(live,2).weightGrams);}
});

test('basis requires Inspector approval of the current revision and a Pig or Cow with recorded live weight',()=>{
  assert.equal(carcassBasis(animal({inspection:{status:'pending',revision:2}})),null);
  assert.equal(carcassBasis(animal({inspection:{status:'rejected',revision:2}})),null);
  assert.equal(carcassBasis(animal({inspection:{status:'approved',revision:1}})),null,'approval of an earlier revision');
  assert.equal(carcassBasis(animal({species:'Goat'})),null,'no invented species');
  for(const weightGrams of [0,-1,1.5,undefined,Number.MAX_SAFE_INTEGER+2])assert.equal(carcassBasis(animal({weightGrams})),null);
  assert.equal(carcassBasis(null),null);assert.throws(()=>requireCarcassBasis(animal({inspection:{status:'pending',revision:2}})),{status:409});
});

test('a current scale measurement is kept and wins; both methods stay distinct',()=>{
  const b=carcassBasis(animal({carcassWeight:measured()}));
  assert.deepEqual(b,{method:'measured',liveWeightGrams:100000,carcassWeightGrams:81000,weighedAt:'2026-10-20T01:00:00Z',measurementRevision:1,animalRevision:2});
  assert.equal(carcassBasis(animal()).method,'calculated_80_percent');
});

test('an older well-formed measurement is ignored but kept; a malformed or impossible one fails closed',()=>{
  const old=animal({carcassWeight:measured({animalRevision:1})});
  assert.equal(carcassBasis(old).method,'calculated_80_percent');assert.equal(old.carcassWeight.weightGrams,81000);
  for(const bad of [measured({weightGrams:0}),measured({weightGrams:1.5}),measured({animalRevision:3}),measured({animalRevision:0}),measured({revision:0}),measured({animalRevision:undefined})])
    assert.equal(carcassBasis(animal({carcassWeight:bad})),null);
});

test('stored estimates must match the live weight and revision; absent legacy estimates are derived',()=>{
  assert.equal(carcassBasis(animal({carcassEstimate:estimateCarcassWeight(100000,2)})).carcassWeightGrams,80000);
  assert.equal(carcassBasis(animal({carcassEstimate:{...estimateCarcassWeight(100000,2),weightGrams:90000}})),null);
  assert.equal(carcassBasis(animal({carcassEstimate:estimateCarcassWeight(100000,1)})),null);
});

test('eligible list includes approved current animals without a scale reading and excludes the rest',async t=>{
  const f=await fixture(t);
  f.rows.get('animal_records/ANM-A').carcassWeight=undefined;
  f.rows.get('animal_records/ANM-B').inspection={...f.rows.get('animal_records/ANM-B').inspection,status:'pending'};
  const list=await f.call('/eligible','billing');assert.equal(list.status,200);assert.deepEqual(list.body.items.map(x=>x.id),['ANM-A']);
  f.rows.get('animal_records/ANM-A').billingInvoiceId='SOMETHING';assert.deepEqual((await f.call('/eligible','billing')).body.items,[]);
});

test('invoices issued before this rule have no basis snapshot and still read normally; fees are identical for both methods',async t=>{
  const f=await fixture(t);const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  f.rows.get('animal_records/ANM-B').carcassWeight=undefined;
  const body={expectedRevision:1,feeScheduleVersion:1,dueDate:today};
  const withScale=await f.call('/animals/ANM-A/invoice','billing',body),calculated=await f.call('/animals/ANM-B/invoice','billing',body);
  assert.equal(withScale.body.carcassBasis.method,'measured');assert.equal(calculated.body.carcassBasis.method,'calculated_80_percent');
  assert.equal(withScale.body.total_amount,95);assert.equal(calculated.body.total_amount,95);
  const legacy=structuredClone(f.rows.get('invoices/'+withScale.body.id));delete legacy.carcassBasis;f.rows.set('invoices/'+withScale.body.id,legacy);
  const read=await f.call('/invoices/'+withScale.body.id,'billing');assert.equal(read.status,200);assert.equal(read.body.carcassBasis,undefined);
});
