// Display an API instant as Asia/Manila local time for reading. Unreadable values are shown unchanged, never guessed.
export function manilaTime(instant: string | undefined | null): string {
  if (typeof instant !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(instant)) return instant ?? 'time not returned';
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) return instant;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(date).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} (Manila)`;
}
