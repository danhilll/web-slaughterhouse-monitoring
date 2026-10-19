import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createScopedReads } from './scoped-reads.js';
import { createScopedListRouter } from './scoped-lists.js';
import { createWebAdminMiddleware } from './access.js';

async function fixture(t,{size=101,scope='SCOPE',key=Buffer.alloc(32,1),now=()=>1000,vendorScope=scope}={}) {
  const rows=Object.fromEntries(Array.from({length:size},(_,i)=>[`ROW-${String(i).padStart(5,'0')}`,{municipalScopeId:'SCOPE',vendor_id:'VENDOR',status:i%2?'Active':'Inactive'}]));
  rows.FOREIGN={municipalScopeId:'OTHER'};rows.UNSCOPED={};
  const calls=[];
  const db={collection:name=>{
    const query=(filters=[],after=null,limit=null)=>({
      where:(...args)=>query([...filters,args],after,limit),orderBy:()=>query(filters,after,limit),startAfter:after=>query(filters,after,limit),limit:limit=>query(filters,after,limit),
      get:async()=>{calls.push({name,filters,after,limit});assert.ok(limit<=501);return {docs:Object.entries(rows).filter(([id,row])=>filters.every(([f,,v])=>row[f]===v)&&(!after||id>after)).sort(([a],[b])=>Buffer.compare(Buffer.from(a),Buffer.from(b))).slice(0,limit).map(([id,row])=>({id,data:()=>row}))};},
      doc:id=>({get:async()=>({id,exists:true,data:()=>({municipalScopeId:vendorScope,name:'Scoped vendor'})})})
    });return query();
  }};
  const store=createScopedReads(()=>db,scope),app=express();
  app.use('/api',createWebAdminMiddleware(()=>({verifyIdToken:async uid=>({uid,email_verified:true})}),new Set(['ADMIN','ADMIN-2'])));
  app.use('/api',createScopedListRouter({store,scope,cursorSecret:key,now}));
  app.use((error,req,res,next)=>res.status(503).json({message:'Read unavailable.'}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const call=async(path='/vendors',uid='ADMIN')=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{headers:uid?{Authorization:`Bearer ${uid}`}:{}});return {status:res.status,body:await res.json()};};
  return {call,calls,rows};
}
for (const size of [0,99,100,101,500,501,1200]) test(`bounded scoped list traverses ${size} rows without truncation or duplicates`,async t=>{
  const {call,calls}=await fixture(t,{size});const ids=[];let cursor=null;
  do {
    const res=await call(`/vendors?pageSize=100${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);
    assert.equal(res.status,200);assert.ok(res.body.items.length<=100);
    ids.push(...res.body.items.map(row=>row.id));cursor=res.body.nextCursor;
  }while(cursor);
  assert.equal(ids.length,size);assert.equal(new Set(ids).size,size);
  assert.ok(calls.every(c=>c.limit===101&&JSON.stringify(c.filters)===JSON.stringify([['municipalScopeId','==','SCOPE']])));
});
test('cursor rejects tampering, different administrator, scope, endpoint, page size, key and expiry',async t=>{
  let time=1000;const a=await fixture(t,{now:()=>time});
  const cursor=(await a.call('/vendors?pageSize=1')).body.nextCursor;
  const path=`/vendors?pageSize=1&cursor=${encodeURIComponent(cursor)}`;
  assert.equal((await a.call(path)).status,200);
  const b=await fixture(t);assert.equal((await b.call(path)).status,200); // restart/instance continuity
  for (const [url,uid] of [[path+'x','ADMIN'],[path,'ADMIN-2'],[path.replace('/vendors','/invoices'),'ADMIN'],[path.replace('pageSize=1','pageSize=2'),'ADMIN']])assert.equal((await a.call(url,uid)).status,400);
  for (const f of [await fixture(t,{scope:'OTHER'}),await fixture(t,{key:Buffer.alloc(32,2)})])assert.equal((await f.call(path)).status,400);
  time+=3600001;assert.equal((await a.call(path)).body.code,'invalid_cursor');
  assert.equal((await a.call('/vendors',null)).status,401);assert.equal((await a.call('/vendors','VENDOR')).status,403);
});
test('all four endpoints support pages, scoped point joins, empty tails and validated query options',async t=>{
  const {call,rows,calls}=await fixture(t,{size:501});
  for (const endpoint of ['vendors','slaughter-records','invoices','notifications']) {
    const page=await call(`/${endpoint}?pageSize=500`);assert.equal(page.status,200);assert.equal(page.body.items.length,500);assert.ok(page.body.nextCursor);
    if(['invoices','slaughter-records'].includes(endpoint))assert.equal(page.body.items[0].vendor_name,'Scoped vendor');
  }
  assert.ok(calls.every(c=>c.limit===501));
  for (const query of ['pageSize=0','pageSize=501','pageSize=2.5','pageSize=1&pageSize=2','pageSize=1&limit=1','municipalScopeId=OTHER','status=Active'])assert.equal((await call(`/vendors?${query}`)).status,400);
  const first=await call('/vendors?limit=500');assert.equal(first.body.items.length,500);
  const cursor=first.body.nextCursor;delete rows['ROW-00500'];
  const tail=await call(`/vendors?limit=500&cursor=${encodeURIComponent(cursor)}`);assert.deepEqual(tail.body,{items:[],nextCursor:null});
});

test('cross-scope vendor links do not expose another municipality business name',async t=>{
  const {call}=await fixture(t,{size:1,vendorScope:'OTHER'});
  for(const endpoint of ['invoices','slaughter-records']){
    const page=await call(`/${endpoint}`);assert.equal(page.status,200);assert.equal(page.body.items[0].vendor_name,'Unknown Vendor');
  }
});
