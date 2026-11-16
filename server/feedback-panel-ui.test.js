import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import * as lucide from 'lucide-react';

// Renders the real Web rating panel with synthetic data; no API, browser or Firebase.
const load=(file,modules={})=>{
  const exports={};
  const {outputText}=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}});
  runInNewContext(outputText,{exports,require:name=>{assert.ok(name in modules,`Unexpected import ${name}`);return modules[name];}});
  return exports;
};
const metrics=load('../src/monitoringMetrics.ts'),displayTime=load('../src/displayTime.ts');
const base={react:React,'react/jsx-runtime':jsxRuntime,'lucide-react':lucide};
const {DeliveryFeedbackView,Stars}=load('../src/FeedbackPanel.tsx',{...base,'./displayTime':displayTime,
  './deliveryFeedback':load('../src/deliveryFeedback.ts',{'./monitoringMetrics.ts':metrics}),
  './ui/RecordParts':load('../src/ui/RecordParts.tsx',{...base,'../displayTime':displayTime})});
const render=props=>renderToStaticMarkup(React.createElement(DeliveryFeedbackView,props));
const text=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const row={id:'AINV-SYN',invoiceId:'AINV-SYN',vendorBusinessId:'VEN-SYN',rating:4,comment:'Synthetic: on time',submittedAt:'2026-10-25T07:42:00Z'};

test('shows stars, "4 of 5 stars", Manila time and the feedback',()=>{
  const html=render({delivered:true,feedback:row,status:'ready'});
  assert.match(text(html),/Vendor rating 4 of 5 stars Rated 2026-10-25 15:42 \(Manila\) Vendor feedback Synthetic: on time/);
  assert.equal((html.match(/is-filled/g)||[]).length,4);assert.match(html,/aria-label="4 of 5 stars"/);
});

test('missing feedback text says "None given"; unrated says "Not rated yet"',()=>{
  assert.match(text(render({delivered:true,feedback:{...row,comment:null},status:'ready'})),/Vendor feedback None given/);
  assert.match(text(render({delivered:true,status:'ready'})),/Vendor rating Not rated yet/);
});

test('nothing is shown before completion; load failures say unavailable, never a guessed rating',()=>{
  assert.equal(render({delivered:false,feedback:row,status:'ready'}),'');
  assert.match(text(render({delivered:true,status:'error'})),/Vendor rating unavailable/);
  assert.match(text(render({delivered:true,status:'loading'})),/Loading Vendor rating/);
});

test('Vendor feedback is rendered as plain text, never HTML',()=>{
  const html=render({delivered:true,feedback:{...row,comment:'<img src=x onerror=alert(1)>\n<script>x()</script>'},status:'ready'});
  assert.doesNotMatch(html,/<img|<script/);assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('star count follows the rating',()=>{
  for(const n of [1,5])assert.equal((renderToStaticMarkup(React.createElement(Stars,{rating:n})).match(/is-filled/g)||[]).length,n);
});
