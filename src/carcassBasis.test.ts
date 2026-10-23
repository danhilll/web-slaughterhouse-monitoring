import test from 'node:test';
import assert from 'node:assert/strict';
import { carcassBasisText } from './carcassBasis.ts';

test('calculated basis is labelled with its factor and never as scale-measured', () => {
  const text = carcassBasisText({ method: 'calculated_80_percent', liveWeightGrams: 100000, carcassWeightGrams: 80000, animalRevision: 1, factor: 0.8 });
  assert.match(text, /^Calculated carcass weight \(80% of live weight\): 80 kg/);
  assert.match(text, /live weight 100 kg × 0.8/);
  assert.match(text, /Not scale-measured\.$/);
  assert.doesNotMatch(text, /Scale-measured carcass weight/);
});

test('measured basis keeps its scale label, time and revisions', () => {
  const text = carcassBasisText({ method: 'measured', liveWeightGrams: 100000, carcassWeightGrams: 81000, animalRevision: 1, weighedAt: '2026-10-20T01:00:00Z', measurementRevision: 2 });
  assert.match(text, /^Scale-measured carcass weight: 81 kg · weighed 2026-10-20 09:00 \(Manila\) · measurement revision 2/);
  assert.doesNotMatch(text, /Calculated carcass weight/);
});
