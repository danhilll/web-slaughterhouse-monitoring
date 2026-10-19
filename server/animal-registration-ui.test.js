import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';

function fixture(){
  let currentNow='2026-10-19T17:30:45.123Z';
  class FixedDate extends Date {constructor(...args){super(...(args.length?args:[currentNow]));}}
  const load=(file,modules={})=>{
    const exports={};const {outputText}=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}});
    runInNewContext(outputText,{exports,Date:FixedDate,Intl,require:name=>{if(name==='../shared/carcassEstimate.js')return load('../shared/carcassEstimate.js');assert.ok(name in modules,name);return modules[name];}});return exports;
  };
  const hooks=[],requests=[];let cursor=0;
  const react={useEffect:()=>{},useState(initial){const i=cursor++;if(!(i in hooks)){
    hooks[i]=typeof initial==='function'?initial():initial;
    if(i===0)hooks[i]={enabled:true,canRecord:true,canRecordCarcassWeight:false,carcassWeightEnabled:false};
    if(i===3)hooks[i]=[{id:'OWNER',name:'Synthetic owning business'}];
    if(i===10)hooks[i]=false;
  }return [hooks[i],value=>{hooks[i]=typeof value==='function'?value(hooks[i]):value;}];}};
  const api={apiFetch:async(url,init={})=>{requests.push({url,...init});return Response.json(init.method==='POST'?{}:{items:[],nextCursor:null});}};
  const {AnimalsPage}=load('../src/AnimalsPage.tsx',{react,'react/jsx-runtime':jsxRuntime,'./api':api,'./carcassWeight':load('../src/carcassWeight.ts'),'./animalRegistrationTime':load('../src/animalRegistrationTime.ts')});
  const render=()=>{cursor=0;return AnimalsPage();};
  function nodes(tree){if(!tree||typeof tree!=='object')return [];return [tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];}
  const find=fn=>nodes(render()).find(fn);
  return {requests,render,find,advance:()=>{currentNow='2026-10-20T01:00:00Z';}};
}
for(const zone of ['UTC','Asia/Manila','America/Los_Angeles'])test(`actual web registration uses Manila time and owning-business wording in ${zone}`,async()=>{
  const previous=process.env.TZ;process.env.TZ=zone;
  try{
    const f=fixture();const html=renderToStaticMarkup(f.render());
    assert.match(html,/animal&#x27;s owner/);assert.match(html,/different from the person transporting/);assert.match(html,/Ear code/);assert.match(html,/Measured live weight/);
    assert.match(html,/Asia\/Manila, UTC\+08:00/);assert.match(html,/audit times are supplied separately by the server/);
    const time=f.find(n=>n.type==='input'&&n.props.type==='datetime-local');assert.equal(time.props.value,'2026-10-20T01:30:45.123');
    const change=(find,value)=>f.find(find).props.onChange({target:{value}});
    change(n=>n.type==='select'&&n.props.value==='', 'OWNER');
    change(n=>n.type==='input'&&n.props.maxLength===80,'EAR-TEST');
    change(n=>n.type==='input'&&n.props.type==='number','85.001');
    change(n=>n.type==='input'&&n.props.type==='datetime-local','2026-10-19T23:20');
    f.advance();assert.equal(f.find(n=>n.type==='input'&&n.props.type==='datetime-local').props.value,'2026-10-19T23:20');
    f.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
    await new Promise(resolve=>setImmediate(resolve));
    const writes=f.requests.filter(r=>r.method==='POST');assert.equal(writes.length,1);
    assert.deepEqual(JSON.parse(writes[0].body),{vendorBusinessId:'OWNER',species:'Pig',weightGrams:85001,weighedAt:'2026-10-19T15:20:00.000Z',identifier:'EAR-TEST',identifierType:'manual'});
    assert.equal(f.find(n=>n.type==='input'&&n.props.type==='datetime-local').props.value,'2026-10-20T09:00:00.000');
  }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
