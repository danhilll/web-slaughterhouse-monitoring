import test from 'node:test';
import assert from 'node:assert/strict';
import {readHeadcount,recordedHeads,summarizeHeadcounts,headcountText,headcountCoverageText,invoiceHeadcounts,invoiceHeadcountLines,summarizeAmounts,amountCoverageText} from '../shared/reporting.js';

test('three recorded heads with missing species remain three; no species split is fabricated',()=>{
  const row={number_of_heads:3};assert.deepEqual(recordedHeads(row),{total:3,Cow:null,Pig:null,complete:false});
  const summary=summarizeHeadcounts([row]);assert.equal(summary.totalHeads,3);assert.equal(summary.Cow,null);assert.equal(summary.Pig,null);assert.match(headcountCoverageText(summary),/0\/1 records classified/);
});
test('missing and invalid headcounts differ from explicit numeric zero everywhere',()=>{
  for(const value of [undefined,null,'',false,'0','3',NaN,Infinity,-1,1.5]){assert.equal(readHeadcount(value),null);assert.match(headcountText(value),/Unavailable/);}
  assert.equal(readHeadcount(0),0);assert.equal(headcountText(0),'0');
  const zero=summarizeHeadcounts([{animal_type:'Cow',number_of_heads:0}]);assert.equal(zero.totalHeads,0);assert.equal(zero.Cow,0);assert.equal(zero.speciesComplete,true);
  const missing=summarizeHeadcounts([{animal_type:'Cow'}]);assert.equal(missing.totalHeads,null);assert.equal(missing.Cow,null);assert.equal(missing.totalCovered,0);assert.equal(missing.knownHeads,null);assert.match(headcountCoverageText(missing),/subtotal Unavailable/);
});
test('mixed complete and incomplete records keep known totals and clearly covered subtotals',()=>{
  const rows=[{animal_type:'Cow',number_of_heads:5},{number_of_heads:3},{animal_type:'Both',number_of_heads:2,number_of_heads_cow:0,number_of_heads_pig:2},{animal_type:'Pig'}];
  const summary=summarizeHeadcounts(rows);assert.equal(summary.records,4);assert.equal(summary.knownHeads,10);assert.equal(summary.totalHeads,null);assert.equal(summary.totalCovered,3);assert.equal(summary.speciesCovered,2);assert.equal(summary.knownCow,5);assert.equal(summary.knownPig,2);assert.equal(summary.Cow,null);
  assert.match(headcountCoverageText(summary),/subtotal 10 heads \(incomplete\)/);assert.deepEqual(rows[1],{number_of_heads:3});
});
test('Both counts must be recorded nonnegative integers consistent with a recorded total',()=>{
  for(const row of [{number_of_heads:3},{number_of_heads:3,number_of_heads_cow:0},{number_of_heads:3,number_of_heads_cow:1,number_of_heads_pig:1},{number_of_heads_cow:1,number_of_heads_pig:2}])assert.equal(recordedHeads({...row,animal_type:'Both'}).complete,false);
  assert.equal(recordedHeads({animal_type:'Both',number_of_heads:0,number_of_heads_cow:0,number_of_heads_pig:0}).complete,true);
});
test('invoice table, print and PDF share recorded-zero and missing-count labels',()=>{
  const row={number_of_heads_cow:0};assert.equal(invoiceHeadcounts(row).total,null);
  const lines=invoiceHeadcountLines(row).join('\n');assert.match(lines,/Cow: 0/);assert.match(lines,/Pig: Unavailable/);assert.match(lines,/1\/2/);assert.match(lines,/total unavailable\/incomplete/);
  assert.equal(invoiceHeadcounts({number_of_heads_cow:0,number_of_heads_pig:0}).total,0);
  assert.match(invoiceHeadcountLines({number_of_heads_cow:0,number_of_heads_pig:0}).join(' '),/Total heads: 0.*2\/2/);
});
test('amount reports retain recorded zero and mark partial aggregates unavailable',()=>{
  const report=summarizeAmounts([{total_amount:95},{total_amount:0},{},{total_amount:'20'}],'total_amount');
  assert.equal(report.value,null);assert.equal(report.knownValue,95);assert.equal(report.covered,2);assert.equal(report.records,4);assert.match(amountCoverageText(report),/unavailable\/incomplete/);
  assert.equal(summarizeAmounts([{total_amount:0}],'total_amount').value,0);assert.equal(summarizeAmounts([{}],'total_amount').knownValue,null);
});

test('unknown species never acquires a split from unrelated stored fields and input rows remain unchanged',()=>{
  const row=Object.freeze({animal_type:'Unknown',number_of_heads:3,number_of_heads_cow:1,number_of_heads_pig:2});
  const report=summarizeHeadcounts([row]);assert.equal(report.totalHeads,3);assert.equal(report.Cow,null);assert.equal(report.Pig,null);assert.equal(report.unknownSpecies,1);
  assert.equal(row.number_of_heads_cow,1);assert.equal(row.number_of_heads_pig,2);
});
