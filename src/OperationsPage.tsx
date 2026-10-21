import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from './api';
import { validateBillingAmounts, validateWorkspaceSettings } from './operationsWorkspace';
import { DeliveryTrackingPanel } from './DeliveryTrackingPanel';

type Mode='billing'|'delivery';
type Settings={enabled:boolean;workspaceContract?:string;canReadBilling:boolean;canReadDelivery:boolean;canReadEligible:boolean;canReadTracking:boolean;canBill:boolean;canDeliver:boolean;canRecordPayment:boolean;canPublishTracking:boolean;feeSchedule:null|{version:number;corralCents:number;deliveryCents:number;inspectionCents:number;facilityCents:number;syntheticOnly?:boolean};feeMessage?:string|null};
type Invoice={id:string;vendor_id:string;vendor_name:string;animalIdentifier:string;animalRevision:number;revision:number;date_issued:string;due_date:string;totalCents:number;paidCents:number;balanceCents:number;payment_status:string;syntheticOnly:boolean};
type Eligible={id:string;vendorBusinessId:string;identifier:string;species:string;weightGrams:number;revision:number};
type Delivery={id:string;projection:'delivery_assignment_v1';vendorBusinessId:string;vendorName:string;animalIdentifier:string;animalRevision:number;revision:number;syntheticOnly:boolean;delivery:{destination:string;status:string;assignedAt:string;notes?:string};meatDetails:null|{species:string;weightGrams:number;weighedAt:string;carcassWeight:null|{weightGrams:number;weighedAt:string};carcassEstimate:{weightGrams:number};carcassWeightSelection:{source:string;weightGrams:number;requiresReview:boolean}};meatDetailsMessage:string|null};
const currency=(c:number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(c/100);
export function OperationsPage({workspace}:{workspace?:Mode}) {
 const [mode,setMode]=useState<Mode>(workspace??'billing'),[settings,setSettings]=useState<Settings|null>(null);
 const [invoices,setInvoices]=useState<Invoice[]>([]),[deliveries,setDeliveries]=useState<Delivery[]>([]),[eligible,setEligible]=useState<Eligible[]>([]);
 const [cursor,setCursor]=useState<string|null>(null),[eligibleCursor,setEligibleCursor]=useState<string|null>(null),[trackingId,setTrackingId]=useState<string|null>(null);
 const [mutationReviewRequired,setMutationReviewRequired]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[dueDate,setDueDate]=useState(''),[creating,setCreating]=useState(false);
 const epoch=useRef(0),controller=useRef<AbortController|null>(null),mounted=useRef(true);
 const json=async(url:string,signal?:AbortSignal)=>{const r=await apiFetch(url,{signal});const b=await r.json();if(!r.ok)throw Error(b.message||'Workspace unavailable.');return b;};
 const load=async(after?:string,eligibleAfter?:string)=>{
  controller.current?.abort();const abort=new AbortController();controller.current=abort;const current=++epoch.current;setBusy(true);setError('');setSettings(null);
  try{const s:Settings=await json('/api/operations/settings',abort.signal);if(current!==epoch.current)return;validateWorkspaceSettings(s);setSettings(s);
   if(mode==='billing'){
    if(s.canReadBilling!==true)throw Error('Billing permission is required.');
    const [list,animals]=await Promise.all([eligibleAfter?Promise.resolve(null):json('/api/operations/billing/invoices'+(after?'?cursor='+encodeURIComponent(after):''),abort.signal),after?Promise.resolve(null):json('/api/operations/eligible'+(eligibleAfter?'?cursor='+encodeURIComponent(eligibleAfter):''),abort.signal)]);
    if(current!==epoch.current)return;if(list){list.items.forEach(validateBillingAmounts);setInvoices(old=>after?[...old,...list.items]:list.items);setCursor(list.nextCursor);}if(animals){setEligible(old=>eligibleAfter?[...old,...animals.items]:animals.items);setEligibleCursor(animals.nextCursor);}setMutationReviewRequired(false);
   }else{if(s.canReadDelivery!==true)throw Error('Delivery permission is required.');const list=await json('/api/operations/deliveries'+(after?'?cursor='+encodeURIComponent(after):''),abort.signal);if(current!==epoch.current)return;setDeliveries(old=>after?[...old,...list.items]:list.items);setCursor(list.nextCursor);}
  }catch(e){if(current===epoch.current&&!abort.signal.aborted){setError((e as Error).message);setInvoices([]);setDeliveries([]);setEligible([]);setCursor(null);setEligibleCursor(null);setTrackingId(null);}}
  finally{if(current===epoch.current)setBusy(false);}
 };
 useEffect(()=>{setTrackingId(null);setInvoices([]);setDeliveries([]);setEligible([]);setCursor(null);setEligibleCursor(null);setDueDate('');void load();return()=>{epoch.current++;controller.current?.abort();};},[mode]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(workspace)setMode(workspace);},[workspace]);
 const createInvoice=async(animal:Eligible)=>{
  if(creating||mutationReviewRequired||!settings?.canBill||!settings.feeSchedule||!dueDate)return;
  const current=epoch.current;setCreating(true);setError('');
  try{const r=await apiFetch('/api/operations/animals/'+encodeURIComponent(animal.id)+'/invoice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:animal.revision,feeScheduleVersion:settings.feeSchedule.version,dueDate})});const b=await r.json();if(!r.ok)throw Error(b.message||'Invoice result requires review; refresh before any new submission.');if(mounted.current&&current===epoch.current)await load();}
  catch(e){if(mounted.current&&current===epoch.current){setMutationReviewRequired(true);setError((e as Error).message+' No automatic retry was made. Refresh and review before submitting again.');}}
  finally{if(mounted.current)setCreating(false);}
 };
 return <div className="space-y-5">
  <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
   <h2 className="text-xl font-bold">{mode==='billing'?'Billing workspace':'Delivery workspace'}</h2>
   {!workspace&&<nav aria-label="Operations workspaces" className="my-3 flex gap-3"><button className="btn-secondary" disabled={busy||creating} onClick={()=>setMode('billing')}>Billing</button><button className="btn-secondary" disabled={busy||creating} onClick={()=>setMode('delivery')}>Delivery</button></nav>}
   <p className="mt-2 text-sm">{mode==='billing'?'Review eligible animals, owning businesses, invoices, balances and recorded payment status.':'Review authorized assignments, destinations, meat details and last reported positions.'}</p>
   <p className="mt-2"><Link className="underline" to="/animal-records">View animal records (read-only)</Link> · Registration and inspection remain separate authorized workflows.</p>
   <button className="btn-secondary mt-4" disabled={busy||creating} onClick={()=>void load()}>Refresh {mode} workspace</button>
   {busy&&<p role="status" className="mt-3">Loading {mode} workspace…</p>}{error&&<p role="alert" className="mt-3 text-red-700">{error}</p>}
   {settings&&mode==='billing'&&<><p className="mt-3">{settings.canBill?'Invoice creation is available only against the displayed approved fees and current animal revision.':'Invoice creation is paused. Eligible records and invoice history remain available.'}</p><p>{settings.canRecordPayment?'Payment recording is independently enabled for authorized staff.':'Payment recording is paused separately; balances show recorded full-payment status only.'}</p></>}
   {settings&&mode==='delivery'&&<><p className="mt-3">{settings.canDeliver?'Only the assigned delivery staff may advance delivery status.':'Delivery status changes and assignment creation are paused; existing assignments remain readable.'}</p><p>{settings.canPublishTracking?'Authorized foreground location publishing is independently enabled.':'Location publishing is paused. A retained authorized position may still be viewed; no location is inferred from a destination.'}</p></>}
  </section>
  {!busy&&!error&&mode==='billing'&&<>
   <section className="rounded-xl border p-5"><h3 className="font-bold">Eligible animals</h3><p>Current inspection approval and no invoice or dispatch link are required. The server rechecks ownership and fees when issuing.</p>
    {settings?.feeSchedule?<p className="mt-2">{settings.feeSchedule.syntheticOnly?'Synthetic rehearsal fees':'Approved fee schedule'} · Version {settings.feeSchedule.version} · {currency(settings.feeSchedule.corralCents+settings.feeSchedule.deliveryCents+settings.feeSchedule.inspectionCents+settings.feeSchedule.facilityCents)}</p>:<p className="mt-2">{settings?.feeMessage||'No approved fees are available for issuance; no amount has been substituted.'}</p>}
    {settings?.canBill&&settings.feeSchedule&&<label className="my-3 block">Invoice due date (required; no credit term assumed)<input aria-label="Invoice due date" type="date" value={dueDate} disabled={creating} onChange={e=>setDueDate(e.target.value)}/></label>}
    {!eligible.length&&<p className="mt-2">No eligible animals on this page.</p>}
    {eligible.map(a=><article className="my-3 border-t pt-3" key={a.id}><h4 className="font-semibold">{a.identifier} · {a.species}</h4><p>Owning business {a.vendorBusinessId} · measured live weight {a.weightGrams/1000} kg · revision {a.revision}</p>{settings?.canBill&&settings.feeSchedule&&<button className="btn-secondary mt-2" disabled={creating||mutationReviewRequired||!dueDate} onClick={()=>void createInvoice(a)}>Issue invoice for {a.identifier}</button>}</article>)}
    {eligibleCursor&&<button className="btn-secondary" onClick={()=>void load(undefined,eligibleCursor)}>Load more eligible animals</button>}
   </section>
   <h3 className="font-bold">Vendor-linked invoices</h3>{!invoices.length&&<p>No animal invoices on this page. Animal records are not invoice history.</p>}
   {invoices.map(i=><article className="rounded-xl border p-5" key={i.id}><h4 className="font-bold">{i.id}</h4>{i.syntheticOnly&&<p>Synthetic rehearsal invoice</p>}<p>{i.vendor_name} · owning business {i.vendor_id}</p><p>Animal {i.animalIdentifier} · invoiced revision {i.animalRevision}</p><p>Total {currency(i.totalCents)} · recorded paid {currency(i.paidCents)} · balance {currency(i.balanceCents)}</p><p>{i.payment_status} · issued {i.date_issued} · due {i.due_date}</p><p className="text-sm">Recorded staff payment confirmation, not online payment processing or an official receipt.</p></article>)}
  </>}
  {!busy&&!error&&mode==='delivery'&&<><h3 className="font-bold">Authorized delivery assignments</h3>{!deliveries.length&&<p>No authorized assignments on this page. Animal records do not create an assignment.</p>}
   {deliveries.map(d=><article className="rounded-xl border p-5" key={d.id}><h4 className="font-bold">{d.vendorName} · {d.animalIdentifier}</h4>{d.syntheticOnly&&<p>Synthetic rehearsal assignment</p>}<p>Owning business {d.vendorBusinessId} · invoiced animal revision {d.animalRevision}</p><p>Destination: {d.delivery.destination}</p><p>Status: {d.delivery.status.replace(/_/g,' ')} · assigned {d.delivery.assignedAt}</p>{d.delivery.notes&&<p>Delivery confirmation: {d.delivery.notes}</p>}
    {d.meatDetails?<div className="my-3"><p>{d.meatDetails.species} · measured live weight {d.meatDetails.weightGrams/1000} kg · weighed {d.meatDetails.weighedAt}</p><p>Estimated carcass weight {d.meatDetails.carcassEstimate.weightGrams/1000} kg (80% rule, not measured)</p>{d.meatDetails.carcassWeight?<p>Actual measured carcass {d.meatDetails.carcassWeight.weightGrams/1000} kg · weighed {d.meatDetails.carcassWeight.weighedAt}</p>:<p>No actual carcass measurement recorded.</p>}{d.meatDetails.carcassWeightSelection.requiresReview&&<p role="alert">Historical carcass measurement requires revision review before use.</p>}</div>:<p className="my-3">{d.meatDetailsMessage}</p>}
    {settings?.canReadTracking&&(trackingId===d.id?<DeliveryTrackingPanel invoiceId={d.id} onClose={()=>setTrackingId(null)}/>:<button className="btn-secondary" onClick={()=>setTrackingId(d.id)}>View authorized last reported location</button>)}
   </article>)}
  </>}
  {!busy&&!error&&cursor&&<button className="btn-secondary" onClick={()=>void load(cursor)}>Load more {mode==='billing'?'invoices':'assignments'}</button>}
 </div>;
}
