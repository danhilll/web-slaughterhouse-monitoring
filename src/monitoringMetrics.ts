export type Period = 'day' | 'week' | 'month' | 'year';
export function manilaDay(instant: string | Date): string | null {
  if (typeof instant === 'string' && !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(instant)) return null;
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
export function validDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
}
export function periodBounds(period: Period, now = new Date()): [string,string] {
  const day = manilaDay(now)!;
  const start = new Date(day+'T00:00:00Z');
  if (period === 'week') start.setUTCDate(start.getUTCDate() - (start.getUTCDay()+6)%7);
  if (period === 'month' || period === 'year') start.setUTCDate(1);
  if (period === 'year') start.setUTCMonth(0);
  const end = new Date(start);
  if (period === 'year') end.setUTCFullYear(end.getUTCFullYear()+1);
  else if (period === 'month') end.setUTCMonth(end.getUTCMonth()+1);
  else end.setUTCDate(end.getUTCDate()+(period==='week'?7:1));
  return [start.toISOString().slice(0,10),end.toISOString().slice(0,10)];
}
export type MetricRow = {id:string;createdAt?:string;date_issued?:string;total_amount?:number;payment_status?:string;payment?:{recordedAt?:string;amountCents?:number};delivery?:{status?:string;deliveredAt?:string}};
export function metric(rows: MetricRow[], kind:'animals'|'invoices'|'billed'|'paid'|'delivered', bounds:[string,string]): number | null {
  let total=0;
  for (const row of rows) {
    if (kind==='paid' && !row.payment && row.payment_status==='Unpaid') continue;
    if (kind==='delivered' && !row.delivery) continue;
    if (kind==='delivered' && row.delivery?.status !== 'delivered') {
      if (!['assigned','in_transit'].includes(row.delivery?.status || '')) return null;
      continue;
    }
    const date=kind==='animals'?manilaDay(row.createdAt || ''):kind==='paid'?manilaDay(row.payment?.recordedAt || ''):kind==='delivered'?manilaDay(row.delivery?.deliveredAt || ''):validDay(row.date_issued)?row.date_issued:null;
    if (!date) return null;
    if (date<bounds[0] || date>=bounds[1]) continue;
    const amount=kind==='billed'?row.total_amount:kind==='paid'?row.payment?.amountCents:1;
    if (typeof amount!=='number' || !Number.isFinite(amount) || amount<0 || kind==='paid'&&!Number.isSafeInteger(amount)) return null;
    total+=kind==='billed'?Math.round(amount*100):amount;
    if (!Number.isSafeInteger(total)) return null;
  }
  return kind==='billed'||kind==='paid'?total/100:total;
}
// Animal/workflow endpoints accept cursor only, with a fixed 25-record page.
export async function completeCursorList(url:string, request:(url:string, init?:RequestInit)=>Promise<Response>, signal:AbortSignal):Promise<MetricRow[]> {
  const rows:MetricRow[]=[], ids=new Set<string>(), cursors=new Set<string>(); let cursor:string|null=null;
  do {
    const response:Response=await request(url+(cursor?'?cursor='+encodeURIComponent(cursor):''),{signal});
    const body:any=await response.json(); signal.throwIfAborted();
    if (!response.ok) throw Error(body.message || 'Records unavailable. Refresh to retry.');
    if (!Array.isArray(body.items) || body.items.length>25 || !(body.nextCursor===null || typeof body.nextCursor==='string'&&body.nextCursor.length>0)) throw Error('Incomplete record list. Refresh to retry.');
    for (const row of body.items) { if (!row || typeof row.id!=='string' || !row.id || ids.has(row.id)) throw Error('Records changed while loading. Refresh to retry.'); ids.add(row.id); rows.push(row); }
    cursor=body.nextCursor;
    if (cursor) {if(cursors.has(cursor)) throw Error('Record paging stopped. Refresh to retry.'); cursors.add(cursor);}
  } while(cursor);
  return rows;
}
