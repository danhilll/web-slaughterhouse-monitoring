/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCompleteList, listViewState } from './listPages.ts';
const response=(body: unknown,status=200)=>new Response(JSON.stringify(body),{status});
const signal=()=>new AbortController().signal;
test('affected client consumes every page over 500, preserving ordering and filter/report inputs',async()=>{
  const rows=Array.from({length:605},(_,i)=>({id:`ROW-${i}`,status:i%2?'Active':'Inactive',total:95}));let calls=0;
  const items=await fetchCompleteList<typeof rows[number]>('/api/vendors',async url=>{
    const params=new URL(url,'https://example.test').searchParams;assert.equal(params.get('pageSize'),'100');
    const offset=Number(params.get('cursor')||0);calls++;
    return response({items:rows.slice(offset,offset+100),nextCursor:offset+100<rows.length?String(offset+100):null});
  },signal());
  assert.deepEqual(items,rows);assert.equal(calls,7);assert.equal(items.filter(v=>v.status==='Active').length,302);assert.equal(items.reduce((sum,v)=>sum+v.total,0),57475);
});
test('later page errors reject the whole refresh; retries restart from page one',async()=>{
  let fail=true;const urls:string[]=[];
  const request=async(url:string)=>{urls.push(url);return url.includes('cursor=next')?(fail?response({message:'Connection unavailable'},503):response({items:[{id:'B'}],nextCursor:null})):response({items:[{id:'A'}],nextCursor:'next'});};
  await assert.rejects(fetchCompleteList('/api/invoices',request,signal()),/Connection unavailable/);
  fail=false;assert.deepEqual(await fetchCompleteList('/api/invoices',request,signal()),[{id:'A'},{id:'B'}]);assert.ok(!urls[2].includes('cursor='));
});
test('expired cursor restarts once without retaining partial rows',async()=>{
  let call=0;
  const request=async()=>{call++;return [response({items:[{id:'OLD'}],nextCursor:'old'}),response({code:'invalid_cursor'},400),response({items:[{id:'NEW'}],nextCursor:null})][call-1];};
  assert.deepEqual(await fetchCompleteList('/api/notifications',request,signal()),[{id:'NEW'}]);
});
test('duplicate rows, nonadvancing cursors, malformed responses and missing continuation fail visibly',async()=>{
  for(const bad of [{items:[{id:'A'}]}, {items:[],nextCursor:'next'}, {items:[{id:'A'}],nextCursor:'next'}, {items:[{id:'B'}],nextCursor:'next'}]) {
    let call=0;
    await assert.rejects(fetchCompleteList('/api/vendors',async()=>response(++call===1?{items:[{id:'A'}],nextCursor:'next'}:bad),signal()),/list|cursor/);
  }
});
test('refresh or unmount abort discards a late page even if the transport ignored cancellation',async()=>{
  const controller=new AbortController();let resolve!:(value:Response)=>void;
  const pending=fetchCompleteList('/api/vendors',()=>new Promise<Response>(r=>resolve=r),controller.signal);
  controller.abort();resolve(response({items:[{id:'OLD'}],nextCursor:null}));
  await assert.rejects(pending,{name:'AbortError'});
  assert.deepEqual(await fetchCompleteList('/api/vendors',async()=>response({items:[{id:'NEW'}],nextCursor:null}),signal()),[{id:'NEW'}]);
});
test('rehearsal complete arrays and empty production lists remain compatible',async()=>{
  assert.deepEqual(await fetchCompleteList('/api/vendors',async()=>response([{id:'A'}]),signal()),[{id:'A'}]);
  assert.deepEqual(await fetchCompleteList('/api/vendors',async()=>response({items:[],nextCursor:null}),signal()),[]);
});
test('affected screens and statistics hide incomplete/stale results until their dependencies succeed',()=>{
  for(const path of ['/vendors','/records','/invoices','/notifications','/statistics']){
    assert.equal(listViewState(path,true).blocked,true);assert.equal(listViewState(path,false).blocked,false);
  }
  assert.equal(listViewState('/INVOICES/',true).blocked,true);
  assert.equal(listViewState('/statistics',false,{invoices:'Later page failed'}).blocked,true);
  assert.equal(listViewState('/invoices',false,{vendors:'Vendor page failed'}).blocked,true);
  assert.equal(listViewState('/vendors',false,{invoices:'Unrelated failure'}).blocked,false);
  assert.equal(listViewState('/animals',true,{records:'Legacy failure'}).blocked,false);
  assert.equal(listViewState('/',false,{invoices:'List failed'}).blocked,false);
});
test('repeated cursor expiry is surfaced instead of retrying forever or publishing partial rows',async()=>{
  let call=0;
  await assert.rejects(fetchCompleteList('/api/vendors',async()=>++call%2?response({items:[{id:'A'}],nextCursor:'next'}):response({code:'invalid_cursor',message:'Cursor expired'},400),signal()),/Cursor expired/);
  assert.equal(call,4);
});
