import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import * as estimates from '../shared/carcassEstimate.js';

function component() {
  const load = (file, modules={}) => {
    const exports={};
    const {outputText}=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{
      compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}});
    runInNewContext(outputText,{exports,require:name=>{
      assert.ok(name in modules,`Unexpected import ${name}`);return modules[name];
    }});
    return exports;
  };
  return load('../src/AnimalsPage.tsx',{
    react:React,'react/jsx-runtime':jsxRuntime,'./api':{apiFetch:()=>{throw Error('No API requests in render tests');}},
    './carcassWeight':load('../src/carcassWeight.ts'),'./animalRegistrationTime':load('../src/animalRegistrationTime.ts'),'../shared/carcassEstimate.js':estimates
  }).CarcassWeightSummary;
}
const animal={weightGrams:85001,revision:2,carcassWeight:null};
test('web labels legacy-derived estimate and live revision without any measured timestamp',()=>{
  const html=renderToStaticMarkup(React.createElement(component(),{animal}));
  assert.match(html,/Estimated carcass: 68\.001 kg/);
  assert.match(html,/80% of live weight/);
  assert.match(html,/animal revision 2/);
  assert.match(html,/Not measured/);
  assert.match(html,/Selected carcass weight: 68\.001 kg \(estimated\)/);
  assert.doesNotMatch(html,/Measured carcass:|Measured \d|Measurement revision/);
});
test('web preserves both values and selects historical measured grams with explicit review warning',()=>{
  const record={...animal,carcassEstimate:estimates.estimateCarcassWeight(85001,2),
    carcassWeight:{weightGrams:65001,weighedAt:'2026-10-20T00:00:00Z',revision:3,animalRevision:1}};
  const html=renderToStaticMarkup(React.createElement(component(),{animal:record}));
  assert.match(html,/Estimated carcass: 68\.001 kg/);
  assert.match(html,/Measured carcass: 65\.001 kg/);
  assert.match(html,/Selected carcass weight: 65\.001 kg \(measured\)/);
  assert.match(html,/Earlier animal revision; review and reinspection required/);
  assert.match(html,/Measurement revision 3/);
});
