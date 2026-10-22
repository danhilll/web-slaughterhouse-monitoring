import test from 'node:test';import assert from 'node:assert/strict';import {parseDropOffView,DROP_OFF_LABEL} from './dropOffPoint.ts';
test('drop-off DTO binds identity/revisions, finite coordinates and selection provenance without leaking actors',()=>{
 const v={projection:'delivery_drop_off_v1',invoiceId:'I',invoiceRevision:2,revision:1,canUpdate:false,point:{latitude:1.25,longitude:2.5,selectedAt:'2026-10-22T00:00:00Z',selectionMethod:'map_tap'}};
 assert.deepEqual(parseDropOffView(v,'I'),v);assert.equal(DROP_OFF_LABEL,'Drop-off point—selected by Delivery Staff.');
 for(const x of [{...v,invoiceId:'other'},{...v,invoiceRevision:0},{...v,canUpdate:'true'},{...v,actorUid:'private'},{...v,revision:0},{...v,point:{...v.point,latitude:Infinity}},{...v,point:{...v.point,selectionMethod:'tracking'}},{...v,point:{...v.point,selectedAt:'pending'}},{...v,point:{...v.point,token:'secret'}}])assert.throws(()=>parseDropOffView(x,'I'));
 assert.equal(parseDropOffView({...v,revision:0,point:null},'I').point,null);assert.throws(()=>parseDropOffView({...v,point:null},'I'));
});
