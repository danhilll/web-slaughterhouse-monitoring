import test from 'node:test';
import assert from 'node:assert/strict';
import { createScopedReads } from './scoped-reads.js';

function fixture(rows) {
  const queries=[];
  const doc=(row,id)=>({id,exists:Boolean(row),data:()=>row});
  const db={collection:name=>{
    const query=(filters=[],ordering=[],limit=null,after=null)=>({
      where:(...args)=>query([...filters,args],ordering,limit,after),orderBy:(...args)=>query(filters,[...ordering,args],limit,after),limit:n=>query(filters,ordering,n,after),select:()=>query(filters,ordering,limit,after),startAfter:id=>query(filters,ordering,limit,id),
      data:()=>Object.entries(rows[name]||{}).sort(([a],[b])=>Buffer.compare(Buffer.from(a),Buffer.from(b))).filter(([id,row])=>(!after||id>after)&&filters.every(([f,op,v])=>op==='=='?row[f]===v:op==='>='?row[f]>=v:op==='<'?row[f]<v:op==='in'?v.includes(row[f]):false)),
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
test('dashboard preserves known totals while marking incomplete historical species splits unavailable',async()=>{
  const rows={slaughter_records:{A:{municipalScopeId:'SCOPE',date:'2026-10-15',animal_type:'Both',number_of_heads:3}}};
  const incomplete=await fixture(rows).store.dashboard(dashboardArgs);
  assert.equal(incomplete.headcountCoverage.totalHeads,3);assert.equal(incomplete.monthlySlaughterVolume[0].Cow,null);assert.equal(incomplete.monthlySlaughterVolume[0].coverage.invalidSplits,1);
  Object.assign(rows.slaughter_records.A,{number_of_heads_cow:1,number_of_heads_pig:2});
  const complete=(await fixture(rows).store.dashboard(dashboardArgs)).monthlySlaughterVolume[0];
  assert.equal(complete.Cow,1);assert.equal(complete.Pig,2);assert.equal(complete.coverage.speciesComplete,true);
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

test('dashboard marks missing species and missing totals incomplete while preserving a recorded zero',async()=>{
  const {store}=fixture({slaughter_records:{
    A:{municipalScopeId:'SCOPE',date:'2026-10-15',number_of_heads:3},
    B:{municipalScopeId:'SCOPE',date:'2026-10-15',animal_type:'Cow',number_of_heads:0},
    C:{municipalScopeId:'SCOPE',date:'2026-10-15',animal_type:'Pig'}
  }});
  const result=await store.dashboard(dashboardArgs),coverage=result.monthlySlaughterVolume[0].coverage;
  assert.equal(result.summary.totalRecordsToday,3);assert.equal(coverage.records,3);assert.equal(coverage.speciesCovered,1);assert.equal(coverage.totalCovered,2);
  assert.equal(coverage.knownHeads,3);assert.equal(coverage.totalHeads,null);assert.equal(coverage.unknownSpecies,1);assert.equal(coverage.invalidTotals,1);
  assert.equal(result.monthlySlaughterVolume[0].Cow,null);assert.equal(result.monthlySlaughterVolume[0].Pig,null);
});
test('completeness traverses bounded batches beyond 500 and accounts for undated records and invalid amounts',async()=>{
  const records=Object.fromEntries(Array.from({length:601},(_,i)=>[`R-${String(i).padStart(4,'0')}`,{municipalScopeId:'SCOPE',date:'2026-10-15',animal_type:'Cow',number_of_heads:1}]));
  records.Z={municipalScopeId:'SCOPE',date:'2026-10-99',number_of_heads:3};
  records.FOREIGN={municipalScopeId:'OTHER',number_of_heads:-1};
  const {store,queries}=fixture({slaughter_records:records,invoices:{
    A:{municipalScopeId:'SCOPE',date_issued:'2026-10-15',total_amount:95},B:{municipalScopeId:'SCOPE',date_issued:'2026-10-15',total_amount:0},C:{municipalScopeId:'SCOPE',date_issued:'2026-10-15'}
  }});
  const result=await store.dashboard(dashboardArgs);
  assert.equal(result.headcountCoverage.records,602);assert.equal(result.headcountCoverage.totalHeads,604);
  assert.equal(result.monthlySlaughterVolume[0].coverage.speciesCovered,601);assert.equal(result.monthlySlaughterVolume[0].coverage.undatedRecords,1);assert.equal(result.monthlySlaughterVolume[0].Cow,null);
  assert.equal(result.summary.totalRecordsToday,null);assert.equal(result.recordDateCoverage.knownRecordsToday,601);assert.equal(result.recordDateCoverage.knownRecordsThisMonth,601);
  assert.equal(result.summary.totalRevenueThisMonth,null);assert.equal(result.revenueCoverage.knownValue,95);assert.equal(result.revenueCoverage.covered,2);
  assert.ok(queries.filter(q=>q.kind==='list').every(q=>q.limit<=500));
});
