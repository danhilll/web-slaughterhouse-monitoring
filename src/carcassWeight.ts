/** Parse decimal kilograms without rounding fractional grams or accepting exponent notation. */
export function carcassKilogramsToGrams(value: string): number {
  if (!/^\d+(?:\.\d{1,3})?$/.test(value)) throw new Error('Enter positive kilograms with at most three decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const grams = Number(whole + fraction.padEnd(3, '0'));
  if (!Number.isSafeInteger(grams) || grams <= 0) throw new Error('Weight must be positive and within the supported integer gram range.');
  return grams;
}

export function carcassGramsToKilograms(grams: number): string {
  if (!Number.isSafeInteger(grams) || grams <= 0) throw new Error('Invalid carcass grams.');
  const digits = String(grams).padStart(4, '0');
  return `${digits.slice(0, -3)}.${digits.slice(-3)}`;
}
