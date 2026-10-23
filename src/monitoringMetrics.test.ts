import test from 'node:test';
import assert from 'node:assert/strict';
import {periodBounds,metric,completeCursorList,validDay} from './monitoringMetrics.ts';
test('Manila calendar periods include midnight and Monday boundaries',()=>{
 const now=new Date('2026-10-25T16:00:00Z');
 assert.deepEqual(periodBounds('day',now),['2026-10-26','2026-10-27']);
 assert.deepEqual(periodBounds('week',now),['2026-10-26','2026-11-02']);
 assert.deepEqual(periodBounds('month',now),['2026-10-01','2026-11-01']);
 assert.deepEqual(periodBounds('year',now),['2026-01-01','2027-01-01']);
 assert.equal(validDay('2026-02-31'),false);
});
test('each metric uses its own event and missing evidence never becomes zero',()=>{
 const rows=[{id:'a',createdAt:'2026-10-23T16:00:00Z',date_issued:'2026-10-23',total_amount:95,payment_status:'Paid',payment:{recordedAt:'2026-10-24T16:00:00Z',amountCents:9500},delivery:{status:'delivered',deliveredAt:'2026-10-25T16:00:00Z'}}];
 assert.equal(metric(rows,'animals',['2026-10-24','2026-10-25']),1);
 assert.equal(metric(rows,'invoices',['2026-10-23','2026-10-24']),1);
 assert.equal(metric(rows,'billed',['2026-10-23','2026-10-24']),95);
 assert.equal(metric(rows,'paid',['2026-10-25','2026-10-26']),95);
 assert.equal(metric(rows,'delivered',['2026-10-26','2026-10-27']),1);
 assert.equal(metric([{id:'x',payment_status:'Paid'}],'paid',['2026-01-01','2027-01-01']),null);
 assert.equal(metric([{id:'x',delivery:{status:'delivered'}}],'delivered',['2026-01-01','2027-01-01']),null);
 assert.equal(metric([{id:'x',date_issued:'2026-10-24'}],'billed',['2026-01-01','2027-01-01']),null);
});
test('cursor traversal includes every page and rejects repeated identities',async()=>{
 const signal=new AbortController().signal;const urls:string[]=[];
 const rows=await completeCursorList('/api/animals',async url=>{urls.push(url);return Response.json(url.includes('?')?{items:[{id:'b'}],nextCursor:null}:{items:[{id:'a'}],nextCursor:'next'});},signal);
 assert.equal(rows.length,2);assert.deepEqual(urls,['/api/animals','/api/animals?cursor=next']);
 await assert.rejects(completeCursorList('/api/animals',async()=>Response.json({items:[{id:'a'}],nextCursor:'next'}),signal),/changed/);
 await assert.rejects(completeCursorList('/api/animals',async()=>Response.json({items:[]}),signal),/Incomplete/);
});
