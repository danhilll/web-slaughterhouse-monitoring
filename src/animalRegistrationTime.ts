/** Live weighing is entered in Manila wall time, independent of the browser timezone. */
export const WEIGHING_TIME_ZONE = 'Asia/Manila';
const manilaParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: WEIGHING_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});
export function manilaWeighingInput(value: Date | string = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) throw new Error('Enter a valid actual weighing time.');
  const parts = Object.fromEntries(manilaParts.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${String(date.getUTCMilliseconds()).padStart(3, '0')}`;
}
export function manilaWeighingTimeToUtc(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) throw new Error('Enter the actual weighing date and time in Asia/Manila.');
  const wallTime = `${match[1]}T${match[2]}:${match[3] ?? '00'}.${(match[4] ?? '').padEnd(3, '0')}`;
  const date = new Date(`${wallTime}+08:00`);
  // Date parsing may normalize an impossible day. Reject that instead of changing the entry.
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 23) !== wallTime) {
    throw new Error('Enter a valid actual weighing date and time in Asia/Manila.');
  }
  return date.toISOString();
}
export function displayManilaWeighingTime(value: string): string {
  return `${manilaWeighingInput(value).replace('T', ' ')} (Asia/Manila, UTC+08:00)`;
}
