import { useEffect, useState } from 'react';
import { apiFetch } from './api';

type Animal = { id:string;vendorBusinessId:string;identifier:string;identifierType:string;species:string;weightGrams:number;weighedAt:string;revision:number;inspection:{status:string;notes?:string;inspectorUid?:string;decidedAt?:string} };
type Business = { id:string;name:string;stallNumber?:string;marketSection?:string };
type Settings = { enabled:boolean;canRecord:boolean };
type Audit = {action:string;reason?:string;actorUid:string;at:string};
const localTime=(value=new Date().toISOString())=>{const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const blank=()=>({vendorBusinessId:'',identifier:'',identifierType:'manual',species:'Pig',weightKg:'',weighedAt:localTime(),reason:''});
async function request<T>(path:string,init?:RequestInit):Promise<T>{const r=await apiFetch(path,init);const b=await r.json();if(!r.ok)throw new Error(b.message||'Animal request failed.');return b;}
export function AnimalsPage(){
  const [settings,setSettings]=useState<Settings|null>(null),[animals,setAnimals]=useState<Animal[]>([]),[cursor,setCursor]=useState<string|null>(null);
  const [vendors,setVendors]=useState<Business[]>([]),[vendorCursor,setVendorCursor]=useState<string|null>(null);
  const [form,setForm]=useState(blank),[editing,setEditing]=useState<Animal|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [history,setHistory]=useState<Audit[]|null>(null),[historyTitle,setHistoryTitle]=useState('');
  const load=async(after?:string)=>{const b=await request<{items:Animal[];nextCursor:string|null}>(`/api/animals${after?`?cursor=${encodeURIComponent(after)}`:''}`);setAnimals(old=>after?[...old,...b.items.filter(a=>!old.some(x=>x.id===a.id))]:b.items);setCursor(b.nextCursor);};
  const loadVendors=async(after?:string)=>{const b=await request<{items:Business[];nextCursor:string|null}>(`/api/accounts/vendors${after?`?after=${encodeURIComponent(after)}`:''}`);setVendors(old=>after?[...old,...b.items.filter(v=>!old.some(x=>x.id===v.id))]:b.items);setVendorCursor(b.nextCursor);};
  useEffect(()=>{let cancelled=false;void(async()=>{try{const s=await request<Settings>('/api/animals/settings');if(cancelled)return;setSettings(s);if(s.enabled){await load();await loadVendors();}}catch(e){if(!cancelled)setError((e as Error).message);}finally{if(!cancelled)setLoading(false);}})();return()=>{cancelled=true;};},[]);
  const act=async(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const startCorrection=(a:Animal)=>{setEditing(a);setForm({vendorBusinessId:a.vendorBusinessId,identifier:a.identifier,identifierType:a.identifierType,species:a.species,weightKg:String(a.weightGrams/1000),weighedAt:localTime(a.weighedAt),reason:''});window.scrollTo({top:0,behavior:'auto'});};
  return <div className="space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"><h2 className="text-xl font-bold">Animal register</h2><p className="mt-2 text-sm text-slate-500">Individual animal identity, vendor ownership, weighing details and inspection status.</p><p className="mt-3 text-sm">Inspector approval applies to the recorded revision. Correcting ownership, species or weight requires inspection again.</p>
      {loading&&<p role="status" className="mt-3">Loading animal settings…</p>}{!loading&&!settings?.enabled&&<p className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-900">Animal recording is awaiting pilot activation. No live records can be changed here yet.</p>}
      {error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}{notice&&<p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 text-emerald-800">{notice}</p>}
    </section>
    {settings?.enabled&&<>
      {settings.canRecord&&<form className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900" onSubmit={e=>{e.preventDefault();void act(async()=>{
        const grams=Number(form.weightKg)*1000;
        if(!Number.isFinite(grams)||grams<=0||Math.abs(grams-Math.round(grams))>0.00001)throw new Error('Enter a positive weight with at most three decimal places in kilograms.');
        const details={vendorBusinessId:form.vendorBusinessId,species:form.species,weightGrams:Math.round(grams),weighedAt:new Date(form.weighedAt).toISOString()};
        const body=editing?{...details,expectedRevision:editing.revision,reason:form.reason}:{...details,identifier:form.identifier,identifierType:form.identifierType};
        await request(`/api/animals${editing?`/${encodeURIComponent(editing.id)}/correction`:''}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        setNotice(editing?'Correction recorded. Previous inspection approval has been cleared.':'Animal recorded and awaiting inspection.');setForm(blank());setEditing(null);await load();
      });}}>
        <h3 className="mb-4 font-bold">{editing?`Correct ${editing.identifier} — revision ${editing.revision}`:'Record an animal'}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">Vendor business<select className="input mt-1 w-full" required value={form.vendorBusinessId} onChange={e=>setForm({...form,vendorBusinessId:e.target.value})}><option value="">Choose approved business</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.name}{v.stallNumber?` — ${v.marketSection}, Stall ${v.stallNumber}`:''} ({v.id})</option>)}{editing&&!vendors.some(v=>v.id===editing.vendorBusinessId)&&<option value={editing.vendorBusinessId}>{editing.vendorBusinessId}</option>}</select></label>
          <label className="text-sm font-medium">Species<select className="input mt-1 w-full" value={form.species} onChange={e=>setForm({...form,species:e.target.value})}><option>Pig</option><option>Cow</option></select></label>
          <label className="text-sm font-medium">Animal identifier<input className="input mt-1 w-full" required disabled={Boolean(editing)} maxLength={80} value={form.identifier} onChange={e=>setForm({...form,identifier:e.target.value})}/></label>
          <label className="text-sm font-medium">Identifier type<select className="input mt-1 w-full" disabled={Boolean(editing)} value={form.identifierType} onChange={e=>setForm({...form,identifierType:e.target.value})}><option value="manual">Manual tag / reference</option><option value="rfid">RFID tag reference</option></select><span className="mt-1 block text-xs text-slate-500">RFID reference entry is available; reader hardware integration is still pending.</span></label>
          <label className="text-sm font-medium">Recorded weight (kg)<input className="input mt-1 w-full" required type="number" min="0.001" step="0.001" value={form.weightKg} onChange={e=>setForm({...form,weightKg:e.target.value})}/></label>
          <label className="text-sm font-medium">Weighed at<input className="input mt-1 w-full" required type="datetime-local" value={form.weighedAt} onChange={e=>setForm({...form,weighedAt:e.target.value})}/></label>
          {editing&&<label className="text-sm font-medium md:col-span-2">Correction reason<textarea className="input mt-1 w-full" required maxLength={500} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></label>}
        </div>
        {vendorCursor&&<button type="button" className="btn-secondary mt-3" disabled={busy} onClick={()=>void act(()=>loadVendors(vendorCursor))}>Load more vendor businesses</button>}
        <div className="mt-5 flex flex-wrap gap-3"><button className="btn-primary" disabled={busy} type="submit">{busy?'Saving…':editing?'Save correction and request reinspection':'Record animal'}</button>{editing&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>{setEditing(null);setForm(blank());}}>Cancel correction</button>}</div>
      </form>}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"><div className="mb-4 flex justify-between"><h3 className="font-bold">{animals.length} loaded animals</h3><button className="btn-secondary" disabled={busy} onClick={()=>void act(()=>load())}>Refresh</button></div>
        <p className="mb-4 text-sm text-slate-500">Inspection decisions are recorded by approved inspectors through their portal. Billing and delivery workflows are not enabled by this register.</p>
        <div className="space-y-3">{animals.map(a=><article key={a.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-wrap justify-between gap-3"><div><h4 className="font-semibold">{a.identifier} · {a.species}</h4><p className="mt-1 text-sm">Vendor: {vendors.find(v=>v.id===a.vendorBusinessId)?.name||a.vendorBusinessId}</p><p className="mt-1 text-sm">{a.weightGrams/1000} kg · Weighed {new Date(a.weighedAt).toLocaleString()}</p><p className="mt-2 text-xs text-slate-500">Revision {a.revision} · {a.id}</p></div><span className={`status-pill ${a.inspection.status==='approved'?'status-pill-success':a.inspection.status==='rejected'?'status-pill-danger':'status-pill-warning'}`}>{a.inspection.status}</span></div>{a.inspection.notes&&<p className="mt-3 text-sm">Inspection notes: {a.inspection.notes}</p>}<div className="mt-4 flex flex-wrap gap-2">{settings.canRecord&&<button className="btn-secondary" disabled={busy} onClick={()=>startCorrection(a)}>Review / correct</button>}<button className="btn-secondary" disabled={busy} onClick={()=>void act(async()=>{const h=await request<{items:Audit[]}>(`/api/animals/${encodeURIComponent(a.id)}/history`);setHistory(h.items);setHistoryTitle(a.identifier);})}>History</button></div></article>)}</div>
        {!animals.length&&<p className="py-5 text-sm text-slate-500">No animals recorded yet.</p>}{cursor&&<button className="btn-secondary mt-4" disabled={busy} onClick={()=>void act(()=>load(cursor))}>Load more animals</button>}
      </section>
      {history&&<section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"><div className="flex justify-between"><h3 className="font-bold">Latest 20 events — {historyTitle}</h3><button className="btn-secondary" onClick={()=>setHistory(null)}>Close</button></div>{history.map((e,i)=><div key={i} className="mt-3 border-t border-slate-100 pt-3 text-sm dark:border-slate-700"><p>{new Date(e.at).toLocaleString()} · {e.action} · {e.actorUid}</p>{e.reason&&<p className="mt-1 text-slate-500">{e.reason}</p>}</div>)}</section>}
    </>}
  </div>;
}
