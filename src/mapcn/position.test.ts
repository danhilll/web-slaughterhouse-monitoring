import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMapPoint,tileRequest} from './position.ts';
test('numeric position only; no identity fields cross renderer boundary',()=>{
 const p={latitude:14.123,longitude:121.123,accuracyMeters:25};
 assert.deepEqual(parseMapPoint(p),p);
 for(const field of ['token','invoiceId','accountId','url','html']) assert.equal(parseMapPoint({...p,[field]:'private'}),null);
 assert.equal(parseMapPoint(null),null);
});
test('invalid coordinates and accuracies rejected without coercion',()=>{
 const p={latitude:0,longitude:0,accuracyMeters:0};
 for(const [field,values] of Object.entries({latitude:[91,-91,NaN,Infinity,'14'],longitude:[181,-181,NaN,Infinity,'121'],accuracyMeters:[-1,1001,Infinity,NaN,'25']}))
 for(const value of values)assert.equal(parseMapPoint({...p,[field]:value}),null);
 assert.deepEqual(parseMapPoint({latitude:-90,longitude:180,accuracyMeters:0}),{latitude:-90,longitude:180,accuracyMeters:0});
});
test('tile-only transform rejects query credentials, alternate hosts and application APIs',()=>{
 assert.deepEqual(tileRequest('https://tile.openstreetmap.org/16/500/500.png'),{url:'https://tile.openstreetmap.org/16/500/500.png',credentials:'same-origin',referrerPolicy:'origin'});
 for(const url of ['/api/me','https://tile.openstreetmap.org/20/1/1.png','https://tile.openstreetmap.org/1/2/1.png','https://tile.openstreetmap.org/1/1/1.png?token=x','https://evil.example/1/1/1.png','https://user:pass@tile.openstreetmap.org/1/1/1.png','http://tile.openstreetmap.org/1/1/1.png','https://tile.openstreetmap.org.evil/1/1/1.png'])assert.throws(()=>tileRequest(url),/blocked/);
});
