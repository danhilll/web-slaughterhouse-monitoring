import { CALCULATED_CARCASS_LABEL, MEASURED_CARCASS_LABEL } from '../shared/carcassEstimate.js';

// Invoice-time snapshot of how the carcass weight was determined. Calculated is never presented as scale-measured.
export type CarcassBasis = { method: 'calculated_80_percent' | 'measured'; liveWeightGrams: number; carcassWeightGrams: number;
  animalRevision: number; factor?: number; rule?: string; rounding?: string; weighedAt?: string; measurementRevision?: number };

const kg = (grams: number) => `${grams / 1000} kg`;

export function carcassBasisText(basis: CarcassBasis): string {
  return basis.method === 'measured'
    ? `${MEASURED_CARCASS_LABEL}: ${kg(basis.carcassWeightGrams)} · weighed ${basis.weighedAt ?? 'time not returned'} · measurement revision ${basis.measurementRevision ?? '?'} · live weight ${kg(basis.liveWeightGrams)} · animal revision ${basis.animalRevision}.`
    : `${CALCULATED_CARCASS_LABEL}: ${kg(basis.carcassWeightGrams)} · live weight ${kg(basis.liveWeightGrams)} × ${basis.factor ?? 0.8}, nearest gram · animal revision ${basis.animalRevision}. Not scale-measured.`;
}
