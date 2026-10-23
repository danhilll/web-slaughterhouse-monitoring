import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from './api';
import { validateBillingAmounts, validateWorkspaceSettings, type RecordedFeeSnapshot } from './operationsWorkspace';
import {MunicipalInvoiceOversight} from './MunicipalInvoiceOversight';
import {CALCULATED_CARCASS_LABEL,MEASURED_CARCASS_LABEL,estimateCarcassWeight} from '../shared/carcassEstimate.js';
import {carcassBasisText,type CarcassBasis} from './carcassBasis';
import { DeliveryTrackingPanel } from './DeliveryTrackingPanel';

type Mode='billing'|'delivery';
type Settings={enabled:boolean;workspaceContract?:string;canReadBilling:boolean;canReadDelivery:boolean;canReadEligible:boolean;canReadTracking:boolean;invoiceDueDate?:string;canBill:boolean;canDeliver:boolean;canRecordPayment:boolean;canPublishTracking:boolean;feeSchedule:null|{version:number;corralCents:number;deliveryCents:number;inspectionCents:number;facilityCents:number;syntheticOnly?:boolean};feeMessage?:string|null};
type Invoice={carcassBasis?:CarcassBasis;feeScheduleVersion?:number;feeScheduleSnapshot?:RecordedFeeSnapshot;payment?:{receiptReference:string;amountCents:number;method:string;recordedAt:string};id:string;vendor_id:string;vendor_name:string;animalIdentifier:string;animalRevision:number;revision:number;date_issued:string;due_date:string;totalCents:number;paidCents:number;balanceCents:number;payment_status:string;syntheticOnly:boolean};
type Eligible={municipalScopeId:string;id:string;vendorBusinessId:string;identifier:string;species:string;weightGrams:number;revision:number};
type Delivery={id:string;projection:'delivery_assignment_v1';vendorBusinessId:string;vendorName:string;animalIdentifier:string;animalRevision:number;revision:number;syntheticOnly:boolean;delivery:{destination:string;status:string;assignedAt:string;notes?:string};meatDetails:null|{species:string;weightGrams:number;weighedAt:string;carcassWeight:null|{weightGrams:number;weighedAt:string};carcassEstimate:{weightGrams:number};carcassWeightSelection:{source:string;weightGrams:number;requiresReview:boolean}};meatDetailsMessage:string|null};
const currency=(c:number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(c/100);
export function OperationsPage({workspace}:{workspace?:Mode}) {
 const [mode,setMode]=useState<Mode>(workspace??'billing'),[settings,setSettings]=useState<Settings|null>(null);
 const [invoices,setInvoices]=useState<Invoice[]>([]),[deliveries,setDeliveries]=useState<Delivery[]>([]);
 const [cursor,setCursor]=useState<string|null>(null),[trackingId,setTrackingId]=useState<string|null>(null);
 const [completedIds,setCompletedIds]=useState<Set<string>>(()=>new Set());
 const markCompleted=(id:string)=>setCompletedIds(previous=>previous.has(id)?previous:new Set(previous).add(id));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const epoch=useRef(0),controller=useRef<AbortController|null>(null);
 const json=async(url:string,signal?:AbortSignal)=>{const r=await apiFetch(url,{signal});const b=await r.json();if(!r.ok)throw Error(b.message||'Workspace unavailable.');return b;};
 const load=async(after?:string)=>{
  controller.current?.abort();const abort=new AbortController();controller.current=abort;const current=++epoch.current;setBusy(true);setError('');setSettings(null);setTrackingId(null);
  try{const s:Settings=await json('/api/operations/settings',abort.signal);if(current!==epoch.current)return;validateWorkspaceSettings(s);setSettings(s);
   if(mode==='billing'){
    if(s.canReadBilling!==true)throw Error('Billing permission is required.');
    const list=await json('/api/operations/billing/invoices'+(after?'?cursor='+encodeURIComponent(after):''),abort.signal);
    if(current!==epoch.current)return;list.items.forEach(validateBillingAmounts);setInvoices(old=>after?[...old,...list.items]:list.items);setCursor(list.nextCursor);
   }else{if(s.canReadDelivery!==true)throw Error('Delivery permission is required.');const list=await json('/api/operations/deliveries'+(after?'?cursor='+encodeURIComponent(after):''),abort.signal);if(current!==epoch.current)return;setCompletedIds(previous=>{const next=new Set(previous);for(const item of list.items as Delivery[])if(item.delivery.status==='delivered')next.add(item.id);return next;});setDeliveries(old=>after?[...old,...list.items]:list.items);setCursor(list.nextCursor);}
  }catch(e){if(current===epoch.current&&!abort.signal.aborted){setError((e as Error).message);setInvoices([]);setDeliveries([]);setCursor(null);setTrackingId(null);}}
  finally{if(current===epoch.current)setBusy(false);}
 };
 useEffect(()=>{setTrackingId(null);setInvoices([]);setDeliveries([]);setCursor(null);void load();return()=>{epoch.current++;controller.current?.abort();};},[mode]);
 useEffect(()=>{if(workspace)setMode(workspace);},[workspace]);
 return <div className="space-y-5">
  <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
   <h2 className="text-xl font-bold">{mode==='billing'?'Invoices & payments':'Deliveries'}</h2>
   {!workspace&&<nav aria-label="Operations workspaces" className="my-3 flex gap-3"><button className="btn-secondary" disabled={busy} onClick={()=>setMode('billing')}>Billing</button><button className="btn-secondary" disabled={busy} onClick={()=>setMode('delivery')}>Delivery</button></nav>}
   <p className="mt-2 text-sm">{mode==='billing'?'Review bills, balances and recorded cash payments.':'Review deliveries, destinations and shared positions.'}</p>
   <p className="mt-2"><Link className="underline" to="/animal-records">View animals</Link> · Register and inspect animals in the mobile app.</p>
   <button className="btn-secondary mt-4" disabled={busy} onClick={()=>void load()}>Refresh {mode === 'billing' ? 'invoices' : 'deliveries'}</button>
   {busy&&<p role="status" className="mt-3">Loading {mode} workspace…</p>}{error&&<p role="alert" className="mt-3 text-red-700">{error}</p>}
   <p className="mt-3">Monitoring only. Record daily work in the mobile app.</p>
   {mode==='billing'&&<Link className="btn-secondary mt-3" to="/invoice-history">All invoice records, including earlier bills</Link>}
  </section>
  {!busy&&!error&&mode==='billing'&&<>
   <h3 className="font-bold">Invoices & payments</h3><p className="text-sm">Refresh after mobile activity to see recorded payments.</p>{!invoices.length&&<p>No animal invoices on this page. Animal records are not invoice history.</p>}
   {invoices.map(i=><article className="rounded-xl border p-5" key={i.id}><h4 className="font-bold">Internal bill reference: {i.id}</h4>{i.syntheticOnly&&<p>Synthetic rehearsal invoice</p>}<p>{i.vendor_name} · owning business {i.vendor_id}</p><p>Animal {i.animalIdentifier} · invoiced revision {i.animalRevision}</p><p>Total {currency(i.totalCents)} · recorded paid {currency(i.paidCents)} · balance {currency(i.balanceCents)}</p><p>{i.payment_status} · issued {i.date_issued} · due {i.due_date}</p>{i.feeScheduleSnapshot?<p>Recorded fee schedule version {i.feeScheduleSnapshot.version} · Corral {currency(i.feeScheduleSnapshot.corralCents)} · Delivery {currency(i.feeScheduleSnapshot.deliveryCents)} · Ante/post-mortem {currency(i.feeScheduleSnapshot.inspectionCents)} · Facility {currency(i.feeScheduleSnapshot.facilityCents)}. Stored invoice snapshot; current rates do not recalculate it.</p>:<p>Historical fee snapshot unavailable; stored invoice amounts are unchanged.</p>}{i.carcassBasis?<p>Carcass basis at issue: {carcassBasisText(i.carcassBasis)}</p>:<p>Carcass basis was not recorded on this earlier invoice.</p>}{i.payment?<p>Recorded payment: {i.payment.method} · {i.payment.method==='cash'?'paper official-receipt reference':'stored receipt reference'} {i.payment.receiptReference} · {currency(i.payment.amountCents)} · recorded {i.payment.recordedAt}</p>:i.payment_status==='Paid'?<p role="alert">Payment reference details unavailable; refresh and review.</p>:<p>No cash payment recorded.</p>}<p className="text-sm">AINV is an internal bill reference, not an official receipt.<br />The paper receipt number is recorded separately.<br />This page does not process payments.</p><MunicipalInvoiceOversight invoiceId={i.id} onReconciled={invoice=>setInvoices(rows=>rows.map(row=>row.id===invoice.id?{...row,...invoice}:row))}/></article>)}
  </>}
  {!busy&&!error&&mode==='delivery'&&<><h3 className="font-bold">Authorized delivery assignments</h3><p className="text-sm">Refresh after mobile activity. Driver positions refresh separately.</p>{!deliveries.length&&<p>No authorized assignments on this page. Animal records do not create an assignment.</p>}
   {deliveries.map(d=><article className="rounded-xl border p-5" key={d.id}><h4 className="font-bold">{d.vendorName} · {d.animalIdentifier}</h4>{d.syntheticOnly&&<p>Synthetic rehearsal assignment</p>}<p>Owning business {d.vendorBusinessId} · invoiced animal revision {d.animalRevision}</p><p>Destination: {d.delivery.destination}</p><p className="text-sm">Open location updates to compare the verified stall pin and last shared position.<br />Missing pins stay as text only.</p><p>Status: {(completedIds.has(d.id)?'delivered':d.delivery.status).replace(/_/g,' ')} · assigned {d.delivery.assignedAt}</p>{d.delivery.notes&&<p>Delivery confirmation: {d.delivery.notes}</p>}
    {d.meatDetails?<div className="my-3"><p>{d.meatDetails.species} · measured live weight {d.meatDetails.weightGrams/1000} kg · weighed {d.meatDetails.weighedAt}</p><p>{CALCULATED_CARCASS_LABEL}: {d.meatDetails.carcassEstimate.weightGrams/1000} kg · not scale-measured</p>{d.meatDetails.carcassWeight?<p>{MEASURED_CARCASS_LABEL}: {d.meatDetails.carcassWeight.weightGrams/1000} kg · weighed {d.meatDetails.carcassWeight.weighedAt}</p>:<p>No scale measurement recorded; the calculated weight applies.</p>}{d.meatDetails.carcassWeightSelection.requiresReview&&<p role="alert">Historical carcass measurement requires revision review before use.</p>}</div>:<p className="my-3">{d.meatDetailsMessage}</p>}
    {settings?.canReadTracking&&(trackingId===d.id?<DeliveryTrackingPanel invoiceId={d.id} deliveryCompleted={completedIds.has(d.id)} onCompleted={markCompleted} onClose={()=>setTrackingId(null)}/>:<button className="btn-secondary" onClick={()=>setTrackingId(d.id)}>{completedIds.has(d.id)?'View destination/drop-off pins':'View authorized last reported location'}</button>)}
   </article>)}
  </>}
  {!busy&&!error&&cursor&&<button className="btn-secondary" onClick={()=>void load(cursor)}>Load more {mode==='billing'?'invoices':'assignments'}</button>}
 </div>;
}
