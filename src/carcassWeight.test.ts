import test from 'node:test';
import assert from 'node:assert/strict';
import { carcassKilogramsToGrams, carcassGramsToKilograms } from './carcassWeight.ts';

test('carcass decimal kilograms preserve exact grams without rounding',()=>{
  for(const [kg,grams] of [['0.001',1],['85.001',85001],['85',85000],['12.34',12340],['000.010',10],['9007199254740.991',Number.MAX_SAFE_INTEGER]] as const)
    assert.equal(carcassKilogramsToGrams(kg),grams);
});
test('carcass input rejects fractional grams, overflow and non-decimal input',()=>{
  for(const value of ['','0','0.000','-1','1.0001','1e3','Infinity','NaN','1,234',' 1','1 ','1.','0.0009','9007199254740.992'])
    assert.throws(()=>carcassKilogramsToGrams(value),Error,value);
});
test('carcass display and edit values round-trip all supported integer grams exactly',()=>{
  for(const grams of [1,10,999,1000,65001,Number.MAX_SAFE_INTEGER]){
    assert.equal(carcassKilogramsToGrams(carcassGramsToKilograms(grams)),grams);
  }
  assert.equal(carcassGramsToKilograms(65001),'65.001');
});
