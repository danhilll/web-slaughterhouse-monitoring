import { useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';
import {DeliveryTrackingPanel} from './DeliveryTrackingPanel';

type Invoice = { id:string;vendor_id:string;vendor_name:string;animalIdentifier:string;animalRevision:number;date_issued:string;due_date:string;total_amount:number;payment_status:string;syntheticOnly:boolean;payment?:{receiptReference:string;amountCents:number;method:string;recordedAt:string};delivery?:{assigneeUid:string;destination:string;status:string;notes?:string;location?:{latitude:number;longitude:number;accuracyMeters:number;capturedAt:string}} };
const currency=(v:number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(v);
export function OperationsPage() {
  const [trackingId,setTrackingId]=useState<string|null>(null);
  const [rows,setRows]=useState<Invoice[]>([]),[cursor,setCursor]=useState<string|null>(null),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const requestId=useRef(0),controller=useRef<AbortController|null>(null);
  const load=async(after?:string)=>{
    controller.current?.abort();const abort=new AbortController();controller.current=abort;const epoch=++requestId.current;
    setBusy(true);setError('');
    try {
      const settings=await apiFetch('/api/operations/settings',{signal:abort.signal});const config=await settings.json();if(!settings.ok)throw new Error(config.message||'Workflow settings unavailable.');
      if(epoch!==requestId.current)return;setEnabled(config.enabled);
      if(!config.enabled){setRows([]);setCursor(null);setTrackingId(null);return;}
      const response=await apiFetch(`/api/operations/invoices${after?`?cursor=${encodeURIComponent(after)}`:''}`,{signal:abort.signal});const data=await response.json();if(!response.ok)throw new Error(data.message||'Invoice history unavailable.');
      if(epoch!==requestId.current)return;setRows(old=>after?[...old,...data.items]:data.items);setCursor(data.nextCursor);
    } catch(e) { if(epoch===requestId.current&&!abort.signal.aborted){setRows([]);setCursor(null);setError((e as Error).message);} }
    finally {if(epoch===requestId.current)setBusy(false);}
  };
  useEffect(()=>{void load();return()=>{requestId.current++;controller.current?.abort();};},[]);
  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-xl font-bold">Animal billing and deliveries</h2><p className="mt-2 text-sm text-slate-500">Invoices issued from approved animal revisions, recorded payments, receipt references and delivery progress.</p>
      <button className="btn-secondary mt-4" disabled={busy} onClick={()=>void load()}>Refresh workflow history</button>
      {busy&&<p role="status" className="mt-4">Loading workflow history…</p>}{error&&<p role="alert" className="mt-4 text-red-700">{error}</p>}
      {!busy&&!error&&!enabled&&<p className="mt-4">Billing, payment and delivery workflows are awaiting pilot activation.</p>}
      {enabled&&!busy&&!error&&!rows.length&&<p className="mt-4">No animal invoices on this page.</p>}
    </section>
    {rows.map(row=><article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="font-bold break-all">{row.id}</h3>{row.syntheticOnly&&<p className="mt-2 font-medium text-amber-700">Synthetic rehearsal invoice</p>}
      <p className="mt-2">{row.vendor_name} · {row.vendor_id}</p><p>Animal {row.animalIdentifier} · approved revision {row.animalRevision}</p>
      <p className="mt-2 font-semibold">{currency(row.total_amount)} · {row.payment_status}</p><p>Issued {row.date_issued} · Due {row.due_date}</p>
      {row.payment&&<div className="mt-4"><h4 className="font-semibold">Recorded payment</h4><p>Receipt {row.payment.receiptReference} · {currency(row.payment.amountCents/100)} · {row.payment.method}</p><p>{row.payment.recordedAt}</p><p className="text-sm text-slate-500">Payment entry records staff confirmation; it does not process a bank transfer.</p></div>}
      {row.delivery&&<div className="mt-4"><h4 className="font-semibold">Delivery: {row.delivery.status.replace(/_/g,' ')}</h4><p>{row.delivery.destination} · Staff {row.delivery.assigneeUid}</p>{row.delivery.notes&&<p>{row.delivery.notes}</p>}{row.delivery.location&&<p>Last reported location: {row.delivery.location.latitude}, {row.delivery.location.longitude} (±{row.delivery.location.accuracyMeters} m), captured {row.delivery.location.capturedAt}. Location is an explicit update, not continuous tracking.</p>}</div>}
    </article>)}
    {rows.filter(row=>row.delivery).map(row=><div key={`track-${row.id}`}>{trackingId===row.id?<DeliveryTrackingPanel invoiceId={row.id} onClose={()=>setTrackingId(null)}/>:<button className="btn-secondary" onClick={()=>setTrackingId(row.id)}>Track delivery — {row.vendor_name} · {row.animalIdentifier}</button>}</div>)}
    {enabled&&cursor&&<button className="btn-secondary" disabled={busy} onClick={()=>void load(cursor)}>Load more workflow invoices</button>}
  </div>;
}
