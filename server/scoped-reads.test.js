import test from 'node:test';
import assert from 'node:assert/strict';
import { createScopedReads } from './scoped-reads.js';

function fixture(rows) {
  const queries=[];
  const doc=(row,id)=>({id,exists:Boolean(row),data:()=>row});
  const db={collection:name=>{
    const query=(filters=[],ordering=[],limit=null)=>({
      where:(...args)=>query([...filters,args],ordering,limit),orderBy:(...args)=>query(filters,[...ordering,args],limit),limit:n=>query(filters,ordering,n),
      data:()=>Object.entries(rows[name]||{}).filter(([,row])=>filters.every(([f,op,v])=>op==='=='?row[f]===v:op==='>='?row[f]>=v:op==='<'?row[f]<v:op==='in'?v.includes(row[f]):false)),
      async get(){queries.push({name,filters,ordering,limit,kind:'list'});assert.ok(limit,'document lists must have a database limit');return {docs:this.data().slice(0,limit).map(([id,row])=>doc(row,id))};},
      aggregate(fields){const items=this.data().filter(([,row])=>Object.values(fields).every(f=>!f._field||row[f._field]!==undefined));return {get:async()=>{queries.push({name,filters,limit,kind:'aggregate'});return {data:()=>Object.fromEntries(Object.entries(fields).map(([key,f])=>[key,f.aggregateType==='count'?items.length:items.reduce((sum,[,row])=>sum+(typeof row[f._field]==='number'?row[f._field]:0),0)]))};}};}
    });
    return {...query(),doc:id=>({get:async()=>doc(rows[name]?.[id],id)})};
  }};
  return {store:createScopedReads(()=>db,'SCOPE'),queries};
}
const dashboardArgs={today:'2026-10-15',month:'2026-10',months:[{key:'2026-10',next:'2026-11',label:'Oct'}],municipality:'Synthetic'};
test('legacy reads exclude foreign and unscoped documents, enforce database bounds and do not truncate totals',async()=>{
  const {store,queries}=fixture({vendors:{A:{municipalScopeId:'SCOPE'},B:{municipalScopeId:'OTHER'},C:{}}});
  assert.deepEqual((await store.list('vendors')).map(v=>v.id),['A']);
  assert.equal(queries[0].limit,501);assert.deepEqual(queries[0].filters,[['municipalScopeId','==','SCOPE']]);
  assert.equal(await store.get('vendors','B'),null);assert.equal(await store.get('vendors','C'),null);assert.equal((await store.get('vendors','A')).id,'A');
  const many=fixture({vendors:Object.fromEntries(Array.from({length:501},(_,i)=>[i,{municipalScopeId:'SCOPE'}]))});
  await assert.rejects(many.store.list('vendors'),/exceeds 500 scoped records/);
});
test('dashboard aggregates all scoped invoices once without list truncation, fee defaults or foreign data',async()=>{
  const invoices=Object.fromEntries(Array.from({length:600},(_,i)=>[`INV-${i}`,{municipalScopeId:'SCOPE',date_issued:'2026-10-15',payment_status:'Unpaid',total_amount:95,corral_fee:15,delivery_fee:25,anti_mortem_fee:10,facility_fee:45,...(i%2?{workflow:'animal'}:{})}]));
  invoices.OTHER={municipalScopeId:'OTHER',total_amount:999999,date_issued:'2026-10-15'};
  const {store,queries}=fixture({invoices,vendors:{A:{municipalScopeId:'SCOPE',status:'Active'},B:{municipalScopeId:'OTHER',status:'Active'}}});
  const result=await store.dashboard(dashboardArgs);
  assert.equal(result.summary.totalRevenueThisMonth,57000);assert.equal(result.summary.unpaidInvoicesCount,600);assert.equal(result.summary.totalVendors,1);assert.equal(result.recentInvoices.length,10);
  assert.equal(result.feeBreakdown[0].value,9000);
  assert.ok(queries.every(q=>q.filters.some(([f,op,v])=>f==='municipalScopeId'&&op==='=='&&v==='SCOPE')));
  assert.ok(queries.filter(q=>q.kind==='aggregate').every(q=>q.limit===null));
});
test('dashboard rejects incomplete historical species splits instead of inventing a ratio',async()=>{
  const rows={slaughter_records:{A:{municipalScopeId:'SCOPE',date:'2026-10-15',animal_type:'Both',number_of_heads:3}}};
  await assert.rejects(fixture(rows).store.dashboard(dashboardArgs),/require reconciliation/);
  Object.assign(rows.slaughter_records.A,{number_of_heads_cow:1,number_of_heads_pig:2});
  assert.deepEqual((await fixture(rows).store.dashboard(dashboardArgs)).monthlySlaughterVolume,[{month:'Oct',Cow:1,Pig:2}]);
});

test('local index definitions include each scoped invoice pagination query',async()=>{
  const {readFileSync}=await import('node:fs');
  const definitions=JSON.parse(readFileSync(new URL('../firestore.indexes.json',import.meta.url),'utf8'));
  for(const fields of [
    ['municipalScopeId','vendor_id','__name__'],
    ['municipalScopeId','workflow','__name__'],
    ['municipalScopeId','workflow','vendor_id','__name__']
  ])assert.ok(definitions.indexes.some(index=>index.collectionGroup==='invoices'&&index.queryScope==='COLLECTION'&&JSON.stringify(index.fields)===JSON.stringify(fields.map(fieldPath=>({fieldPath,order:'ASCENDING'})))));
});
