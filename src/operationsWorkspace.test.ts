import {test} from 'node:test';import assert from 'node:assert/strict';import {validateBillingAmounts} from './operationsWorkspace.ts';
test('recorded Paid/Unpaid balances use exact full-payment integer amounts',()=>{validateBillingAmounts({totalCents:9500,paidCents:0,balanceCents:9500,payment_status:'Unpaid'});validateBillingAmounts({totalCents:9500,paidCents:9500,balanceCents:0,payment_status:'Paid'});});
test('missing, fractional, contradictory and unsupported partial balances fail visibly',()=>{for(const v of [{},{totalCents:9500,paidCents:9500,balanceCents:0,payment_status:'Unpaid'},{totalCents:9500,paidCents:0,balanceCents:9500,payment_status:'Paid'},{totalCents:9500,paidCents:500,balanceCents:9000,payment_status:'Unpaid'},{totalCents:0.5,paidCents:0,balanceCents:0.5,payment_status:'Unpaid'}])assert.throws(()=>validateBillingAmounts(v),/requires review/);});
import {validateWorkspaceSettings} from './operationsWorkspace.ts';
test('workspace identity requires explicit boolean read flags and supported approved fee shape',()=>{
 const v={workspaceContract:'billing_delivery_v1',enabled:true,canReadBilling:true,canReadDelivery:false,canReadEligible:true,canReadTracking:false,canBill:false,canDeliver:false,canRecordPayment:false,canPublishTracking:false,feeSchedule:null};validateWorkspaceSettings(v);
 assert.throws(()=>validateWorkspaceSettings({...v,workspaceContract:undefined}),/server update/);assert.throws(()=>validateWorkspaceSettings({...v,canBill:'true'}),/permissions/);assert.throws(()=>validateWorkspaceSettings({...v,feeSchedule:{version:1}}),/fee details/);
});
import {validateInvoicePreview} from './operationsWorkspace.ts';
const selected={id:'ANIMAL',vendorBusinessId:'VENDOR',municipalScopeId:'SCOPE',revision:1,identifier:'EAR',species:'Pig',weightGrams:100000};
const preview={projection:'invoice_preview_v1',animal:selected,vendor:{id:'VENDOR',name:'Synthetic owner'},feeSchedule:{version:1,basis:'perAnimal',currency:'PHP',corralCents:1500,deliveryCents:2500,inspectionCents:1000,facilityCents:4500,syntheticOnly:true},totalCents:9500,currency:'PHP'};
test('invoice preview requires selected ownership/scope/revision and exact itemized total',()=>{
 validateInvoicePreview(preview,selected);
 for(const p of [{...preview,vendor:{id:'OTHER',name:'Other'}},{...preview,animal:{...selected,municipalScopeId:'OTHER'}},{...preview,animal:{...selected,revision:2}},{...preview,totalCents:9400},{...preview,feeSchedule:{...preview.feeSchedule,facilityCents:0.5}},{...preview,currency:'USD'},{...preview,projection:'legacy'}])assert.throws(()=>validateInvoicePreview(p,selected),/requires review/);
});
