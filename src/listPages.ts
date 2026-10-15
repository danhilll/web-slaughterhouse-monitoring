// Existing screens filter/sort and paginate complete registers locally. Traverse
// bounded server pages first; never publish a partly fetched register as complete.
export async function fetchCompleteList<T extends {id: string}>(url: string, request: (url: string, init?: RequestInit) => Promise<Response>, signal: AbortSignal): Promise<T[]> {
  let items: T[] = [], cursor: string | null = null, restarted = false;
  const ids = new Set<string>(), cursors = new Set<string>();
  for (;;) {
    signal.throwIfAborted();
    const query = new URLSearchParams({pageSize:'100'});
    if (cursor) query.set('cursor', cursor);
    const response = await request(`${url}?${query}`, {signal});
    signal.throwIfAborted();
    let body;
    try { body = await response.json(); } catch { throw new Error('The list response could not be read. Refresh to retry.'); }
    signal.throwIfAborted();
    if (!response.ok) {
      if (response.status===400 && body?.code==='invalid_cursor' && cursor && !restarted) {
        items=[]; cursor=null; restarted=true; ids.clear(); cursors.clear(); continue;
      }
      throw new Error(typeof body?.message==='string'?body.message:`List request failed (HTTP ${response.status}).`);
    }
    // Existing isolated rehearsal adapters return complete arrays, not pages.
    const legacy = Array.isArray(body);
    if (legacy && cursor) throw new Error('The list protocol changed. Refresh to retry.');
    const page: unknown[] = legacy ? body : body?.items;
    const next: unknown = legacy ? null : body?.nextCursor;
    if (!Array.isArray(page) || !legacy && page.length>100 || !(next===null || typeof next==='string' && next.length>0) || next!==null && page.length===0) throw new Error('Invalid list page. Refresh to retry.');
    for (const row of page) {
      if (!row || typeof row!=='object' || !('id' in row) || typeof row.id!=='string' || !row.id || ids.has(row.id)) throw new Error('The list changed during paging. Refresh to retry.');
      ids.add(row.id); items.push(row as T);
    }
    if (next===null) return items;
    if (cursors.has(next as string)) throw new Error('The list cursor did not advance. Refresh to retry.');
    cursor=next as string; cursors.add(cursor);
  }
}

const dependencies: Record<string, string[]> = {
  '/vendors':['vendors','records'], '/records':['vendors','records'],
  '/invoices':['vendors','records','invoices','fees'], '/notifications':['notifications'],
  '/statistics':['dashboard','records','invoices']
};
export function listViewState(path: string, loading: boolean, errors: Record<string,string> = {}) {
  const keys=dependencies[path.replace(/\/+$/, '').toLowerCase() || '/'];
  const error=keys?.map(key=>errors[key]).filter(Boolean).join(' ');
  return {affected:Boolean(keys), blocked:Boolean(keys && (loading || error)), error, loading:Boolean(keys && loading)};
}
