import { normalize, searchTerms } from './searchText.ts';
import { dayText, manilaTime } from './displayTime.ts';

export { searchTerms };

// Client-side search over deliveries and animals already returned to this authorized screen, with the
// same rules as invoice search: case-insensitive, every term must match, and no server query.

export type SearchableDelivery = {
  id: string; vendorBusinessId: string; vendorName: string; animalIdentifier: string;
  delivery: { destination: string; assignedAt: string; notes?: string };
  meatDetails: null | { species: string };
};
export type SearchableAnimal = {
  id: string; vendorBusinessId: string; identifier: string; species: string; weighedAt: string;
  inspection: { status: string };
};

// "2026-11-16 16:14 (Manila)" plus "Nov 16, 2026", so either date form finds the record.
const instantText = (instant: string) => { const shown = manilaTime(instant); return [shown, dayText(shown.slice(0, 10))]; };
const matches = (values: (string | undefined | null)[], terms: string[]) => {
  if (!terms.length) return true;
  const text = normalize(values.filter((value): value is string => typeof value === 'string').join(' '));
  return terms.every(term => text.includes(term));
};

export const deliveryStatusText = (status: string) => status === 'delivered' ? 'Delivered' : status === 'in_transit' ? 'In transit'
  : status.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
export const inspectionStatusText = (status: string) => status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected'
  : status === 'pending' ? 'Awaiting inspection' : status;

/** Vendor, vendor ID, animal, species, destination, status as displayed, confirmation note, assignment reference or date. */
export function matchesDeliverySearch(d: SearchableDelivery, status: string, terms: string[]): boolean {
  return matches([d.vendorName, d.vendorBusinessId, d.animalIdentifier, d.meatDetails?.species, d.delivery.destination,
    deliveryStatusText(status), d.delivery.notes, d.id, ...instantText(d.delivery.assignedAt)], terms);
}

/** Ear code, species, inspection status as displayed, owning business (ID, and name when loaded), animal ID or weighing date. */
export function matchesAnimalSearch(a: SearchableAnimal, vendorName: string | undefined, terms: string[]): boolean {
  return matches([a.identifier, a.species, inspectionStatusText(a.inspection.status), a.vendorBusinessId, vendorName, a.id,
    ...instantText(a.weighedAt)], terms);
}
