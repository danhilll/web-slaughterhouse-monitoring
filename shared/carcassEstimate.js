// Manager-confirmed rule for Cow and Pig. Never represents a scale measurement.
export const CARCASS_ESTIMATE_RULE = 'manager_80_percent_v1';
export const CARCASS_ESTIMATE_ROUNDING = 'nearest_gram_half_up';
export function estimateCarcassWeight(liveWeightGrams, animalRevision) {
  if (!Number.isSafeInteger(liveWeightGrams) || liveWeightGrams <= 0 ||
      !Number.isSafeInteger(animalRevision) || animalRevision <= 0) {
    throw new Error('Estimate requires positive safe integer live grams and animal revision.');
  }
  // BigInt prevents precision loss even at the maximum supported live weight.
  const weightGrams = Number((BigInt(liveWeightGrams) * 80n + 50n) / 100n);
  return { weightGrams, liveWeightGrams, animalRevision,
    rule: CARCASS_ESTIMATE_RULE, rounding: CARCASS_ESTIMATE_ROUNDING };
}
export function validCarcassEstimate(estimate, liveWeightGrams, animalRevision) {
  if (estimate == null) return true; // Existing records are derived on read, never migrated.
  try {
    const expected = estimateCarcassWeight(liveWeightGrams, animalRevision);
    return Object.keys(estimate).length === Object.keys(expected).length &&
      Object.entries(expected).every(([key, value]) => estimate[key] === value);
  } catch { return false; }
}
export function selectCarcassWeight(animal, estimate) {
  const measured = animal.carcassWeight;
  return measured ? { source: 'measured', weightGrams: measured.weightGrams,
    animalRevision: measured.animalRevision, requiresReview: measured.animalRevision !== animal.revision }
    : { source: 'estimated', weightGrams: estimate.weightGrams,
      animalRevision: estimate.animalRevision, requiresReview: false };
}
