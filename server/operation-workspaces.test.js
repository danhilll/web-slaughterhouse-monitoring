import test from 'node:test';import assert from 'node:assert/strict';import {deliveryAssignmentView} from './operation-workspaces.js';
const row={payment_status:'Paid',id:'I',municipalScopeId:'S',vendor_id:'V',vendor_name:'Recorded vendor',animalId:'A',animalIdentifier:'EAR',animalRevision:2,revision:4,syntheticOnly:true,delivery:{assigneeUid:'D',destination:'Recorded destination',status:'assigned',assignedAt:'2026-10-20T01:00:00Z'}};
const animal={id:'A',municipalScopeId:'S',vendorBusinessId:'V',revision:2,species:'Cow',weightGrams:100003,weighedAt:'2026-10-20T01:00:00Z'};
test('assignment meat keeps exact estimate and actual historical measurement precedence without actors',()=>{
 const estimated=deliveryAssignmentView(row,animal);assert.equal(estimated.meatDetails.carcassEstimate.weightGrams,80002);assert.equal(estimated.meatDetails.carcassWeightSelection.source,'estimated');
 const actual=deliveryAssignmentView(row,{...animal,carcassWeight:{weightGrams:79000,weighedAt:'2026-10-20T01:00:00Z',revision:1,animalRevision:1,recordedBy:'PRIVATE'}});
 assert.equal(actual.meatDetails.carcassWeightSelection.source,'measured');assert.equal(actual.meatDetails.carcassWeightSelection.requiresReview,true);assert.equal(actual.meatDetails.carcassWeight.weightGrams,79000);assert.ok(!JSON.stringify(actual).includes('PRIVATE'));assert.ok(!('weighedAt' in actual.meatDetails.carcassEstimate));
});
test('missing/revised/incomplete weights remain explicitly unavailable; ownership mismatch fails closed',()=>{
 for(const a of [null,{...animal,revision:3},{...animal,weighedAt:undefined}]){const v=deliveryAssignmentView(row,a);assert.equal(v.meatDetails,null);assert.ok(v.meatDetailsMessage);}
 assert.throws(()=>deliveryAssignmentView(row,{...animal,vendorBusinessId:'OTHER'}),/ownership/);
 assert.throws(()=>deliveryAssignmentView({...row,delivery:{...row.delivery,destination:''}},animal),/review/);
});
