import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateCarcassWeight,validCarcassEstimate,selectCarcassWeight} from './carcassEstimate.js';

test('80 percent uses exact integer grams and nearest-gram half-up rounding throughout safe range',()=>{
  for(const [live,expected] of [[1,1],[2,2],[3,2],[4,3],[5,4],[6,5],[7,6],[8,6],[9,7],[10,8],[85000,68000],[85001,68001]]){
    assert.equal(estimateCarcassWeight(live,1).weightGrams,expected);
  }
  const max=Number.MAX_SAFE_INTEGER;
  assert.equal(estimateCarcassWeight(max,1).weightGrams,Number((BigInt(max)*4n+2n)/5n));
  for(const value of [0,-1,1.5,'85000',NaN,Infinity,max+1])assert.throws(()=>estimateCarcassWeight(value,1));
  for(const value of [0,-1,1.5,max+1])assert.throws(()=>estimateCarcassWeight(85000,value));
});
test('estimate metadata validates original live revision and never admits measurement timestamps',()=>{
  const e=estimateCarcassWeight(85001,3);assert.equal(validCarcassEstimate(e,85001,3),true);
  for(const patch of [{animalRevision:2},{liveWeightGrams:85000},{rounding:'floor'},{rule:'unknown'},{weighedAt:'2026-10-20T00:00:00Z'},{recordedAt:'2026-10-20T00:00:00Z'}]){
    assert.equal(validCarcassEstimate({...e,...patch},85001,3),false);
  }
  assert.equal(validCarcassEstimate(undefined,85001,3),true);
});
test('actual measurement retains precedence including explicit historical-revision review',()=>{
  const estimate=estimateCarcassWeight(85001,2);
  assert.deepEqual(selectCarcassWeight({revision:2},estimate),{source:'estimated',weightGrams:68001,animalRevision:2,requiresReview:false});
  assert.deepEqual(selectCarcassWeight({revision:2,carcassWeight:{weightGrams:64000,animalRevision:1}},estimate),{source:'measured',weightGrams:64000,animalRevision:1,requiresReview:true});
  assert.equal(selectCarcassWeight({revision:2,carcassWeight:{weightGrams:65000,animalRevision:2}},estimate).requiresReview,false);
});
