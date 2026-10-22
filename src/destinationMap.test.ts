import test from 'node:test';import assert from 'node:assert/strict';import {parseDestinationView} from './destinationMap.ts';
test('verified destination DTO binds identity/revision/provenance and never invents missing coordinates',()=>{
 const value={projection:'verified_destination_v1',invoiceId:'I',status:'verified',revision:1,destination:{latitude:1.25,longitude:2.5,verifiedAt:'2026-10-22T00:00:00Z'}};assert.deepEqual(parseDestinationView(value,'I'),value);
 for(const v of [{...value,invoiceId:'OTHER'},{...value,revision:0},{...value,token:'private'},{...value,destination:{...value.destination,latitude:Infinity}},{...value,destination:{...value.destination,verifiedAt:'pending'}},{...value,status:'unavailable'}])assert.throws(()=>parseDestinationView(v,'I'));
 assert.equal(parseDestinationView({...value,status:'unavailable',revision:0,destination:null},'I').destination,null);
});
