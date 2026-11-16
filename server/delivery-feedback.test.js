import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,bill} from './test-support/operations-fixture.js';
// Synthetic in-memory fixture only. alice owns VEN-A (the invoiced animals); bob is another Vendor.
const rate={rating:4,comment:'Synthetic: on time, well packed.',confirmed:true};
async function delivered(t,production=null,complete=true){
 const f=await fixture(t,true,()=>new Date().toISOString(),production);
 const inv=await f.call('/animals/ANM-A/invoice','billing',bill);assert.equal(inv.status,201);const id=inv.body.id;
 assert.equal((await f.call(`/invoices/${id}/delivery`,'inspector',{expectedRevision:1,assigneeUid:'delivery',destination:'Synthetic Market / Meat / Stall A',destinationConfirmed:true})).status,200);
 assert.equal((await f.call(`/invoices/${id}/delivery/status`,'delivery',{expectedRevision:2,status:'in_transit',notes:'Synthetic departure'})).status,200);
 if(complete)assert.equal((await f.call(`/invoices/${id}/delivery/status`,'delivery',{expectedRevision:3,status:'delivered',notes:'Synthetic completion'})).status,200);
 return {...f,id,path:`/invoices/${id}/feedback`};
}
const feedbackRows=f=>[...f.rows].filter(([p])=>p.startsWith('delivery_feedback/'));

test('owning Vendor rates a completed delivery once; projection matches the Android contract exactly',async t=>{
 const f=await delivered(t);
 const empty=await f.call(f.path,'alice');assert.equal(empty.status,200);
 assert.deepEqual(empty.body,{projection:'delivery_feedback_v1',invoiceId:f.id,canSubmit:true,feedback:null});
 const saved=await f.call(f.path,'alice',rate);assert.equal(saved.status,200);
 assert.deepEqual(Object.keys(saved.body).sort(),['canSubmit','feedback','invoiceId','projection']);
 assert.deepEqual(Object.keys(saved.body.feedback).sort(),['comment','rating','submittedAt']);
 assert.equal(saved.body.canSubmit,false);assert.equal(saved.body.feedback.rating,4);assert.equal(saved.body.feedback.comment,rate.comment);
 assert.ok(Number.isFinite(Date.parse(saved.body.feedback.submittedAt)));
 assert.deepEqual((await f.call(f.path,'alice')).body,saved.body,'Android re-reads and requires equality');
 const web=await f.webCall(f.path);assert.equal(web.status,200);assert.deepEqual(web.body.feedback,saved.body.feedback);assert.equal(web.body.canSubmit,false);
 const stored=f.rows.get('delivery_feedback/'+f.id);assert.equal(stored.submittedBy,'alice');assert.equal(stored.vendorBusinessId,'VEN-A');
 const audit=[...f.rows].filter(([p])=>p.startsWith('delivery_feedback_audit/')).map(([,r])=>r);
 assert.equal(audit.length,1);assert.equal(audit[0].action,'feedback_submitted');assert.equal(audit[0].actorUid,'alice');assert.equal(audit[0].at,stored.submittedAt);
});

test('final once submitted: a second submission is 409 and nothing is overwritten',async t=>{
 const f=await delivered(t);assert.equal((await f.call(f.path,'alice',rate)).status,200);const before=structuredClone([...f.rows]);
 for(const body of [rate,{...rate,rating:1,comment:null}])assert.equal((await f.call(f.path,'alice',body)).status,409);
 assert.deepEqual([...f.rows],before);
});

test('only completed deliveries can be rated',async t=>{
 const f=await delivered(t,null,false);
 assert.equal((await f.call(f.path,'alice')).body.canSubmit,false);
 assert.equal((await f.call(f.path,'alice',rate)).status,409);assert.equal(feedbackRows(f).length,0);
});

test('other Vendors, any Staff, Inspectors and other municipalities get 404; Web has no write path',async t=>{
 const f=await delivered(t);
 for(const who of ['bob','delivery','delivery2','billing','multi','inventory','inspector','other','otherDelivery']){
  assert.equal((await f.call(f.path,who)).status,404,`GET ${who}`);assert.equal((await f.call(f.path,who,rate)).status,404,`POST ${who}`);
 }
 assert.equal((await f.webCall(f.path,rate)).status,403);assert.equal(feedbackRows(f).length,0);
 assert.equal((await f.call(f.path,'')).status,401);
});

test('invalid ratings, comments, confirmations and extra fields fail closed without writes',async t=>{
 const f=await delivered(t),before=structuredClone([...f.rows]);
 const bad=[{rating:'4'},{rating:4.5},{rating:0},{rating:6},{rating:null},{rating:undefined},{comment:''},{comment:' padded'},{comment:'padded '},{comment:'x'.repeat(501)},{comment:'tab\there'},{comment:'cr\rhere'},{comment:123},{comment:undefined},{confirmed:false},{confirmed:'true'},{confirmed:undefined},{submittedAt:new Date().toISOString()},{submittedBy:'alice'}];
 for(const patch of bad){const body={...rate,...patch};for(const k of Object.keys(patch))if(patch[k]===undefined)delete body[k];assert.equal((await f.call(f.path,'alice',body)).status,400,JSON.stringify(patch));}
 assert.equal((await f.call(f.path+'?x=1','alice',rate)).status,400);assert.equal((await f.call(f.path+'?x=1','alice')).status,400);
 assert.deepEqual([...f.rows],before);
});

test('accepts null feedback, newlines and exactly 500 characters',async t=>{
 for(const comment of [null,'Line one\nLine two','y'.repeat(500)]){
  const f=await delivered(t);const r=await f.call(f.path,'alice',{rating:5,comment,confirmed:true});assert.equal(r.status,200);assert.equal(r.body.feedback.comment,comment);
 }
});

test('a rating never changes the invoice, animal, payment, delivery or tracking records',async t=>{
 const f=await delivered(t);const untouched=()=>[...f.rows].filter(([p])=>!p.startsWith('delivery_feedback'));const before=structuredClone(untouched());
 assert.equal((await f.call(f.path,'alice',{rating:1,comment:'Synthetic complaint',confirmed:true})).status,200);
 assert.deepEqual(untouched(),before);
});

test('audit failure is atomic and concurrent submissions have exactly one winner',async t=>{
 const f=await delivered(t);f.state.failFeedbackAudit=true;assert.equal((await f.call(f.path,'alice',rate)).status,503);assert.equal(feedbackRows(f).length,0);f.state.failFeedbackAudit=false;
 const results=await Promise.all([f.call(f.path,'alice',rate),f.call(f.path,'alice',{...rate,rating:2})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(feedbackRows(f).length,1);
 assert.equal([...f.rows].filter(([p])=>p.startsWith('delivery_feedback_audit/')).length,1);
});

test('a deactivated Vendor cannot submit',async t=>{
 const f=await delivered(t);f.rows.get('mobile_memberships/alice').status='inactive';f.memberships.alice.status='inactive';
 assert.equal((await f.call(f.path,'alice',rate)).status,403);assert.equal(feedbackRows(f).length,0);
});

test('production feedback gate defaults off: reads work, canSubmit is false and writes are paused',async t=>{
 const source=await delivered(t);
 for(const [features,status,canSubmit] of [[{},503,false],[{feedback:false},503,false],[{feedback:true},200,true]]){
  const f=await fixture(t,true,()=>new Date().toISOString(),{municipalScopeId:'SCOPE',features});f.rows.set('invoices/'+source.id,source.rows.get('invoices/'+source.id));
  assert.equal((await f.call(source.path,'alice')).body.canSubmit,canSubmit);assert.equal((await f.call(source.path,'alice',rate)).status,status);
 }
});

test('administrator list is scoped, paged, hides the submitting account and fails closed on bad rows',async t=>{
 const f=await delivered(t);assert.equal((await f.call(f.path,'alice',rate)).status,200);
 const list=await f.webCall('/feedback');assert.equal(list.status,200);assert.equal(list.body.nextCursor,null);
 assert.deepEqual(list.body.items,[{id:f.id,invoiceId:f.id,vendorBusinessId:'VEN-A',rating:4,comment:rate.comment,submittedAt:f.rows.get('delivery_feedback/'+f.id).submittedAt}]);
 for(const who of ['alice','billing','inspector'])assert.equal((await f.call('/feedback',who)).status,403);
 f.rows.set('delivery_feedback/AINV-FOREIGN',{invoiceId:'AINV-FOREIGN',municipalScopeId:'OTHER',vendorBusinessId:'VEN-X',rating:5,comment:null,submittedAt:'2026-10-25T00:00:00Z',submittedBy:'x'});
 assert.equal((await f.webCall('/feedback')).body.items.length,1,'other municipality excluded');
 f.rows.get('delivery_feedback/'+f.id).rating=9;assert.equal((await f.webCall('/feedback')).status,503);assert.equal((await f.call(f.path,'alice')).status,503);
});
