import { useState } from 'react';
import { apiFetch } from './api';

export type RegisteredBusiness = { id: string; name: string; marketName: string; marketSection: string; stallNumber: string };
const initial = { name: '', address: '', contact_number: '', email: '', animal_type: 'Pig', marketName: '', marketSection: '', stallNumber: '' };

export function VendorRegistrationForm({ onRegistered }: { onRegistered: (vendor: RegisteredBusiness) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">1. Confirm the vendor business</h3><p className="mt-1 text-sm text-slate-500">Use an existing approved business, or register it after checking its market stall assignment.</p></div><button className="btn-secondary" type="button" disabled={busy} onClick={() => setOpen(!open)}>{open ? 'Close registration' : 'Register vendor business'}</button></div>
    {notice && <p role="status" className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {open && <form className="mt-5" onSubmit={e => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice(''); void (async () => {
      try {
        const response = await apiFetch('/api/accounts/vendors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Business registration failed.');
        onRegistered(result.vendor); setNotice(`Business registered: ${result.vendor.name}. Vendor ID: ${result.vendor.id}. You can now create its vendor account below.`); setForm(initial); setOpen(false);
      } catch (e) { setError((e as Error).message); }
      finally { setBusy(false); }
    })(); }}>
      <div className="grid gap-4 md:grid-cols-2">
        {([
          ['name', 'Business name', 120], ['address', 'Business address', 300],
          ['contact_number', 'Contact mobile / telephone number', 32], ['email', 'Business contact email', 254],
          ['marketName', 'Public market name', 120], ['marketSection', 'Market section / zone', 80], ['stallNumber', 'Stall number', 40]
        ] as const).map(([key, label, max]) => <label key={key} className="text-sm font-medium">{label}<input className="input mt-1 w-full" required maxLength={max} type={key === 'email' ? 'email' : key === 'contact_number' ? 'tel' : 'text'} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}
        <label className="text-sm font-medium">Animal type<select className="input mt-1 w-full" value={form.animal_type} onChange={e => setForm({ ...form, animal_type: e.target.value })}><option>Pig</option><option>Cow</option><option>Both</option></select></label>
      </div>
      <p className="mt-4 text-xs text-slate-500">The phone number is contact information. Mobile login uses the person's email and password. Registering a business creates no invoices or payments.</p>
      <button type="submit" className="btn-primary mt-4" disabled={busy}>{busy ? 'Registering…' : 'Confirm stall and register business'}</button>
    </form>}
  </section>;
}
