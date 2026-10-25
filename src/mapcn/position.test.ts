import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMapPoint,tileRequest,straightLineMeters,distanceText,parseRendererMessage,markerBounds} from './position.ts';
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
import {parseDestinationPoint,parseMapMarkers} from './position.ts';
test('destination and shared GPS markers stay distinct, including destination-only and honest empty states',()=>{
 const destination={latitude:1.25,longitude:2.5},position={latitude:3.25,longitude:4.5,accuracyMeters:25};
 for(const value of [{position,destination},{position:null,destination},{position,destination:null},{position:null,destination:null}])assert.deepEqual(parseMapMarkers(value),value);
 assert.deepEqual(parseMapMarkers(position),{position,destination:null});
 assert.equal(parseMapMarkers({position:null,destination:{...destination,accuracyMeters:1}}),null);assert.equal(parseMapMarkers({position,destination,token:'private'}),null);assert.equal(parseDestinationPoint({latitude:91,longitude:2}),null);assert.equal(parseDestinationPoint({latitude:'1',longitude:2}),null);
});
test('drop-off is an independent optional numeric marker; legacy frames and identity restrictions remain',()=>{
 const dropOff={latitude:5.25,longitude:6.5},destination={latitude:1.25,longitude:2.5},position={latitude:3.25,longitude:4.5,accuracyMeters:12};
 for(const v of [{position,destination,dropOff},{position:null,destination:null,dropOff},{position:null,destination,dropOff:null}])assert.deepEqual(parseMapMarkers(v),v);
 for(const dropOff of [{latitude:91,longitude:2},{latitude:'1',longitude:2},{latitude:1,longitude:2,source:'device'},{latitude:1,longitude:2,token:'x'}])assert.equal(parseMapMarkers({position:null,destination:null,dropOff}),null);
});

test('straight-line distance and its text', () => {
 assert.equal(Math.round(straightLineMeters({latitude:0,longitude:0},{latitude:0,longitude:1})/1000), 111);
 assert.equal(straightLineMeters({latitude:14.6,longitude:121},{latitude:14.6,longitude:121}), 0);
 assert.equal(distanceText(437), '440 m'); assert.equal(distanceText(1234), '1.2 km'); assert.equal(distanceText(23456), '23 km');
});

test('renderer message accepts only a light or dark theme beside valid markers', () => {
 const markers={position:null,destination:{latitude:1,longitude:2}};
 assert.deepEqual(parseRendererMessage({...markers,theme:'dark'}),{markers,theme:'dark'});
 assert.deepEqual(parseRendererMessage(markers),{markers,theme:'light'});
 assert.equal(parseRendererMessage({...markers,theme:'sepia'}),null);
 assert.equal(parseRendererMessage({...markers,theme:'dark',extra:1}),null);
 assert.deepEqual(markerBounds([{latitude:1,longitude:5},{latitude:3,longitude:2}]),[[2,1],[5,3]]);
 assert.equal(markerBounds([]),null);
});
