import { useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';
import { Mail, ShieldCheck, UserPlus, Search } from 'lucide-react';
import { VendorRegistrationForm, type RegisteredBusiness } from './VendorRegistrationForm';

type Account = { uid: string; fullName: string; email: string; role: string; status: string; invitationStatus: string; vendorBusinessId?: string; staffPermissions?: string[] };
type Settings = { enabled: boolean; canManageAccounts: boolean; canDeactivate: boolean; municipalScopeId: string | null; municipalityName: string; staffInspectorAvailable: boolean; canActivateAccounts: boolean };
type Audit = { action: string; actorUid: string; at: string };
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`/api/accounts${path}`, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'Account request failed.');
  return body;
}
const post = { method: 'POST', headers: { 'Content-Type': 'application/json' } };

function StaffPermissionEditor({ account, onSaved }: { account: Account; onSaved: () => Promise<void> }) {
  const [permissions, setPermissions] = useState(account.staffPermissions || []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  useEffect(() => { setPermissions(account.staffPermissions || []); }, [account.staffPermissions]);
  return <form className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800" onSubmit={e => {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(''); setError('');
    void (async () => {
      try {
        await request(`/${encodeURIComponent(account.uid)}/permissions`, { ...post, body: JSON.stringify({ staffPermissions: permissions }) });
        await onSaved(); setMessage('Staff functions saved. Account activation status is unchanged.');
      } catch (err) { setError((err as Error).message); }
      finally { lock.current = false; setBusy(false); }
    })();
  }}>
    <fieldset disabled={busy || !['pending', 'active'].includes(account.status)}>
      <legend className="text-sm font-semibold">Assigned staff functions</legend>
      <div className="my-3 flex flex-wrap gap-4">{['inventory', 'billing', 'delivery'].map(permission => <label key={permission} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={permissions.includes(permission)} onChange={e => setPermissions(old => e.target.checked ? [...old, permission] : old.filter(p => p !== permission))} />{permission[0].toUpperCase() + permission.slice(1)}</label>)}</div>
      <button className="btn-secondary" type="submit">{busy ? 'Saving...' : 'Save staff functions'}</button>
    </fieldset>
    <p className="mt-2 text-xs text-slate-500">Saving functions does not activate access. Pending staff need at least one saved function before administrator activation. Workflow availability is controlled separately.</p>
    {message && <p role="status" className="mt-2 text-sm text-green-700">{message}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </form>;
}

export function UsersPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [items, setItems] = useState<Account[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ fullName: '', email: '', contactNumber: '', role: 'vendor', vendorBusinessId: '', staffPermissions: [] as string[] });
  const [selected, setSelected] = useState<Account | null>(null);
  const [history, setHistory] = useState<Audit[]>([]);
  const [businesses, setBusinesses] = useState<RegisteredBusiness[]>([]);
  const [vendorCursor, setVendorCursor] = useState<string | null>(null);
  const alive = useRef(true);
  const locked = useRef(false);
  const load = async (after?: string) => {
    const result = await request<{ items: Account[]; nextCursor: string | null }>(after ? `?after=${encodeURIComponent(after)}` : '');
    if (!alive.current) return;
    setItems(old => after ? [...old, ...result.items.filter(a => !old.some(b => b.uid === a.uid))] : result.items);
    setCursor(result.nextCursor);
  };
  const loadVendors = async (after?: string) => {
    const result = await request<{ items: RegisteredBusiness[]; nextCursor: string | null }>(`/vendors${after ? `?after=${encodeURIComponent(after)}` : ''}`);
    if (!alive.current) return;
    setBusinesses(old => after ? [...old, ...result.items.filter(a => !old.some(b => b.id === a.id))] : result.items);
    setVendorCursor(result.nextCursor);
  };
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const s = await request<Settings>('/settings');
        if (cancelled) return;
        setSettings(s);
        if (s.enabled) await Promise.all([load(), loadVendors()]);
      } catch (e) { if (!cancelled) setError((e as Error).message); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; alive.current = false; };
  }, []);
  const action = async (fn: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { if (alive.current) setError((e as Error).message); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  };
  const visible = items.filter(a => `${a.fullName} ${a.email} ${a.role}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-3"><ShieldCheck className="text-emerald-600" /><div><h2 className="text-xl font-bold">Mobile users</h2><p className="text-sm text-slate-500">Create and manage access for vendors, staff and inspectors.</p></div></div>
      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Users choose their own password through a Firebase setup email. All mobile accounts remain pending until a web administrator approves their access. Users must also verify their email through Firebase before accessing any protected service. Password setup and membership approval do not substitute for email verification.{!settings?.canActivateAccounts && ' Activation is not enabled in this environment.'}</p>
      {loading && <p role="status" className="mt-4">Loading account settings...</p>}
      {!loading && !settings?.enabled && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-900">Account management is awaiting approved municipal setup. Live account creation is currently unavailable.</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl bg-green-50 p-4 text-green-800">{notice}</p>}
    </section>
    {settings?.enabled && <>
      {settings.canManageAccounts && <>
      <VendorRegistrationForm onRegistered={vendor => { setBusinesses(old => [...old.filter(b => b.id !== vendor.id), vendor]); setForm(old => ({ ...old, role: 'vendor', vendorBusinessId: vendor.id })); }} />
      <form className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900" onSubmit={e => { e.preventDefault(); void action(async () => {
        const payload = { fullName: form.fullName, email: form.email, contactNumber: form.contactNumber, role: form.role, ...(form.role === 'vendor' ? { vendorBusinessId: form.vendorBusinessId } : {}), ...(form.role === 'staff' ? { staffPermissions: form.staffPermissions } : {}) };
        const result = await request<{ message: string }>('', { ...post, body: JSON.stringify(payload) });
        if (!alive.current) return;
        setNotice(result.message); setForm({ fullName: '', email: '', contactNumber: '', role: 'vendor', vendorBusinessId: '', staffPermissions: [] }); await load();
      }); }}>
        <h3 className="mb-4 flex items-center gap-2 font-bold"><UserPlus size={18} />2. Create the person's account</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">Full name<input className="input mt-1 w-full" required maxLength={120} value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} /></label>
          <label className="text-sm font-medium">Email address<input className="input mt-1 w-full" type="email" required maxLength={254} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
          <label className="text-sm font-medium">Contact number (optional)<input className="input mt-1 w-full" type="tel" maxLength={32} value={form.contactNumber} onChange={e => setForm({ ...form, contactNumber: e.target.value })} /><span className="mt-1 block text-xs text-slate-500">For contact only. Sign-in uses email and password; no SMS is sent.</span></label>
          {form.role === 'staff' && <fieldset className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><legend className="px-1 text-sm font-medium">Assigned staff functions</legend>{['inventory', 'billing', 'delivery'].map(permission => <label key={permission} className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.staffPermissions.includes(permission)} onChange={e => setForm({ ...form, staffPermissions: e.target.checked ? [...form.staffPermissions, permission] : form.staffPermissions.filter(p => p !== permission) })} />{permission[0].toUpperCase() + permission.slice(1)}</label>)}<p className="text-xs text-slate-500">Only assigned functions are permitted. Access stays pending until administrator activation is available and completed.</p></fieldset>}
          <label className="text-sm font-medium">Portal role<select className="input mt-1 w-full" value={form.role} onChange={e => setForm({ ...form, role: e.target.value, vendorBusinessId: '', staffPermissions: [] })}><option value="vendor">Vendor - access pending</option><option value="staff">Staff - access pending</option><option value="inspector">Inspector - access pending</option></select></label>
          {form.role === 'vendor' && <label className="text-sm font-medium">Vendor business<select className="input mt-1 w-full" required value={form.vendorBusinessId} onChange={e => setForm({ ...form, vendorBusinessId: e.target.value })}><option value="">Select an approved business</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}{b.stallNumber ? ` — ${b.marketSection}, Stall ${b.stallNumber}` : ""} ({b.id})</option>)}</select><span className="mt-1 block text-xs text-slate-500">Only approved businesses in {settings.municipalityName || "this municipality"} are eligible.{!businesses.length && ' No eligible businesses are available yet.'}</span>{vendorCursor && <button type="button" className="btn-secondary mt-2" disabled={busy} onClick={() => void action(() => loadVendors(vendorCursor))}>Load more businesses</button>}</label>}
        </div>
        <button className="btn-primary mt-5" disabled={busy} type="submit">{busy ? 'Working...' : 'Create account and send invitation'}</button>
      </form>
      </>}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <label className="mb-4 flex items-center gap-2"><Search size={18} /><span className="sr-only">Search loaded users</span><input className="input w-full" placeholder="Search loaded users by name, email or role" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <p className="mb-4 text-xs text-slate-500">{items.length} users loaded{cursor ? '. More users are available below.' : '.'} Search applies to loaded users.</p>
        <div className="space-y-3">{visible.map(a => <article key={a.uid} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{a.fullName}</h3><p className="break-all text-sm text-slate-500">{a.email}</p><p className="mt-2 text-sm">{a.role} · {a.status} · Invitation: {a.invitationStatus}</p>{a.vendorBusinessId && <p className="text-xs text-slate-500">Business: {a.vendorBusinessId}</p>}</div>
            <div className="flex flex-wrap gap-2">
              {settings.canActivateAccounts && a.status === 'pending' && ['vendor', 'staff', 'inspector'].includes(a.role) && <button className="btn-primary" disabled={busy || (a.role === 'staff' && !a.staffPermissions?.length)} onClick={() => {
                if (window.confirm(`Approve ${a.role} membership for ${a.fullName} in ${settings.municipalityName || settings.municipalScopeId}?${a.role === 'staff' ? ` Saved functions: ${a.staffPermissions?.join(', ')}.` : ''} Email verification remains required.`)) void action(async () => {
                  try { const result = await request<{ message: string }>(`/${encodeURIComponent(a.uid)}/activate`, { ...post, body: '{}' }); if (alive.current) setNotice(result.message); }
                  finally { await load(); }
                });
              }}>Activate mobile access</button>}
              <button className="btn-secondary" disabled={busy || !settings.canManageAccounts || !['active', 'pending'].includes(a.status)} onClick={() => void action(async () => { const r = await request<{ invitationStatus: string }>(`/${encodeURIComponent(a.uid)}/invitation`, { ...post, body: '{}' }); if (alive.current) setNotice(r.invitationStatus === 'sent' ? 'Firebase accepted the setup email request. Ask the user to check their inbox and spam.' : 'Invitation failed. Retry after one minute.'); await load(); })}><Mail size={14} />Resend invitation</button>
              <button className="btn-secondary" disabled={busy} onClick={() => void action(async () => { const r = await request<{ items: Audit[] }>(`/${encodeURIComponent(a.uid)}/audit`); if (alive.current) { setSelected(a); setHistory(r.items); } })}>History</button>
              <button className="btn-danger" disabled={busy || !settings.canDeactivate} onClick={() => { if (window.confirm(`Deactivate mobile access for ${a.fullName}?`)) void action(async () => { try { await request(`/${encodeURIComponent(a.uid)}/deactivate`, { ...post, body: '{}' }); if (alive.current) setNotice('Mobile access deactivated.'); } finally { await load(); } }); }}>{a.status === 'inactive' ? 'Retry session cleanup' : 'Deactivate'}</button>
            </div></div>
          {settings.canManageAccounts && a.role === 'staff' && <StaffPermissionEditor account={a} onSaved={() => load()} />}
        </article>)}</div>
        {!visible.length && <p className="py-6 text-sm text-slate-500">{items.length ? 'No loaded users match your search.' : 'No managed mobile accounts yet. Historical Firebase accounts require a separate ownership review.'}</p>}
        {cursor && <button className="btn-secondary mt-4" disabled={busy} onClick={() => void action(() => load(cursor))}>Load more users</button>}
      </section>
      {selected && <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"><div className="flex justify-between"><h3 className="font-bold">Latest 20 events - {selected.fullName}</h3><button className="btn-secondary" onClick={() => setSelected(null)}>Close</button></div>{history.map((a, i) => <p key={i} className="mt-3 text-sm">{new Date(a.at).toLocaleString()} · {a.action} · Administrator {a.actorUid}</p>)}{!history.length && <p className="mt-3">No audit events available.</p>}</section>}
    </>}
  </div>;
}
