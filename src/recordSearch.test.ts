/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesAnimalSearch, matchesDeliverySearch, searchTerms, type SearchableAnimal, type SearchableDelivery } from './recordSearch.ts';

// Synthetic records only.
const delivery: SearchableDelivery = { id: 'AINV-syn-001', vendorBusinessId: 'VEN-SYN-1', vendorName: 'Synthetic Meat Stall', animalIdentifier: 'PIG-0042',
  delivery: { destination: 'Public Market Stall 12', assignedAt: '2026-11-16T08:14:00Z', notes: 'Received by stall helper' }, meatDetails: { species: 'Pig' } };
const other: SearchableDelivery = { ...delivery, id: 'AINV-syn-002', vendorBusinessId: 'VEN-SYN-2', vendorName: 'Other Stall', animalIdentifier: 'COW-0007',
  delivery: { destination: 'Annex B', assignedAt: '2026-11-15T01:00:00Z' }, meatDetails: null };
const findDeliveries = (query: string, status: Record<string, string>) =>
  [delivery, other].filter(d => matchesDeliverySearch(d, status[d.id], searchTerms(query))).map(d => d.id);
const statuses = { [delivery.id]: 'delivered', [other.id]: 'in_transit' };

test('delivery search: empty query matches everything', () => {
  assert.deepEqual(findDeliveries('  ', statuses), [delivery.id, other.id]);
});

test('delivery search: vendor, vendor ID, animal, destination, note, reference and species', () => {
  assert.deepEqual(findDeliveries('synthetic meat', statuses), [delivery.id]);
  assert.deepEqual(findDeliveries('ven-syn-2', statuses), [other.id]);
  assert.deepEqual(findDeliveries('pig-0042', statuses), [delivery.id]);
  assert.deepEqual(findDeliveries('annex', statuses), [other.id]);
  assert.deepEqual(findDeliveries('helper', statuses), [delivery.id]);
  assert.deepEqual(findDeliveries('ainv-syn-002', statuses), [other.id]);
  assert.deepEqual(findDeliveries('PIG', statuses), [delivery.id]);
});

test('delivery search: displayed status, including a completion seen on this screen', () => {
  assert.deepEqual(findDeliveries('delivered', statuses), [delivery.id]);
  assert.deepEqual(findDeliveries('in transit', statuses), [other.id]);
  assert.deepEqual(findDeliveries('delivered', { ...statuses, [other.id]: 'delivered' }), [delivery.id, other.id]);
});

test('delivery search: Manila assignment date in either display form', () => {
  assert.deepEqual(findDeliveries('2026-11-16', statuses), [delivery.id]);
  assert.deepEqual(findDeliveries('nov 15, 2026', statuses), [other.id]);
  // 2026-11-15T01:00Z is 09:00 on Nov 15 in Manila, not Nov 14.
  assert.deepEqual(findDeliveries('2026-11-14', statuses), []);
});

test('delivery search: every term must match', () => {
  assert.deepEqual(findDeliveries('synthetic annex', statuses), []);
  assert.deepEqual(findDeliveries('stall delivered', statuses), [delivery.id]);
});

const pig: SearchableAnimal = { id: 'ANM-syn-1', vendorBusinessId: 'VEN-SYN-1', identifier: 'D9', species: 'Pig', weighedAt: '2026-11-16T06:00:00Z', inspection: { status: 'approved' } };
const cow: SearchableAnimal = { id: 'ANM-syn-2', vendorBusinessId: 'VEN-SYN-2', identifier: 'C1', species: 'Cow', weighedAt: '2026-11-10T06:00:00Z', inspection: { status: 'pending' } };
const findAnimals = (query: string, names: Record<string, string | undefined> = {}) =>
  [pig, cow].filter(a => matchesAnimalSearch(a, names[a.vendorBusinessId], searchTerms(query))).map(a => a.id);

test('animal search: ear code, species, owner ID, animal ID and inspection status as displayed', () => {
  assert.deepEqual(findAnimals('d9'), [pig.id]);
  assert.deepEqual(findAnimals('cow'), [cow.id]);
  assert.deepEqual(findAnimals('ven-syn-2'), [cow.id]);
  assert.deepEqual(findAnimals('anm-syn-1'), [pig.id]);
  assert.deepEqual(findAnimals('approved'), [pig.id]);
  assert.deepEqual(findAnimals('awaiting'), [cow.id]);
});

test('animal search: vendor name only when it was loaded, and weighing date', () => {
  assert.deepEqual(findAnimals('synthetic'), []);
  assert.deepEqual(findAnimals('synthetic', { 'VEN-SYN-1': 'Synthetic Meat Stall' }), [pig.id]);
  assert.deepEqual(findAnimals('2026-11-10'), [cow.id]);
  assert.deepEqual(findAnimals('nov 16, 2026'), [pig.id]);
  assert.deepEqual(findAnimals('pig awaiting'), []);
});
