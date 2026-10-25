import { useEffect, useRef, useState } from 'react';
import { manilaTime } from './displayTime';
import {paymentState} from './overdue';
import {Badge,Fields,MoreDetails,Note,RecordCard,Toolbar,dayText,paymentBadge,type Row} from './ui/RecordParts';
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
 const deliveryStatus=(d:Delivery)=>completedIds.has(d.id)?'delivered':d.delivery.status;
 const statusBadge=(status:string)=>status==='delivered'?<Badge tone="good">Delivered</Badge>:status==='in_transit'?<Badge tone="info">In transit</Badge>:<Badge>{status.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase())}</Badge>;
 const kg=(grams:number)=>`${grams/1000} kg`;
 return <div className="space-y-5">
  {!workspace&&<nav aria-label="Operations workspaces" className="flex gap-3"><button className="btn-secondary" disabled={busy} onClick={()=>setMode('billing')}>Billing</button><button className="btn-secondary" disabled={busy} onClick={()=>setMode('delivery')}>Delivery</button></nav>}
  <Toolbar description={mode==='billing'?'Bills, balances and recorded payments. Refresh after mobile activity.':'Assignments, destinations and shared positions. Driver positions refresh separately.'}>
   <button className="btn-secondary" disabled={busy} onClick={()=>void load()}>Refresh {mode === 'billing' ? 'invoices' : 'deliveries'}</button>
   {mode==='billing'&&<Link className="btn-secondary" to="/invoice-history">All invoice records</Link>}
  </Toolbar>
  {busy&&<p role="status">Loading {mode} workspace…</p>}{error&&<Note tone="danger" role="alert">{error}</Note>}
  {!busy&&!error&&mode==='billing'&&<section className="record-list" aria-label="Invoices on this page">
   <div className="record-list-head"><h3>Invoices on this page</h3><p>{invoices.length} shown</p></div>
   {!invoices.length&&<p>No animal invoices on this page. Animal records are not invoice history.</p>}
   {invoices.map(i=><RecordCard key={i.id} label={`Invoice ${i.vendor_name} ${i.animalIdentifier}`} title={`${i.vendor_name} · ${i.animalIdentifier}`} subtitle={`Issued ${dayText(i.date_issued)} · due ${dayText(i.due_date)}`}
     badges={<>{paymentBadge(paymentState(i))}{i.syntheticOnly&&<Badge tone="info">Synthetic rehearsal invoice</Badge>}</>}>
    <Fields rows={[['Total',currency(i.totalCents)],['Recorded paid',currency(i.paidCents)],['Balance',currency(i.balanceCents)],
     ['Weight basis at issue',i.carcassBasis?carcassBasisText(i.carcassBasis):'Not recorded on this earlier invoice.'],
     ['Payment',i.payment?`${i.payment.method==='cash'?'Cash':i.payment.method} · ${i.payment.method==='cash'?'paper official-receipt reference':'stored receipt reference'} ${i.payment.receiptReference} · ${currency(i.payment.amountCents)} · ${manilaTime(i.payment.recordedAt)}`:i.payment_status==='Paid'?<span role="alert">Payment reference details unavailable; refresh and review.</span>:'No cash payment recorded.']]}/>
    <Note>AINV is an internal bill reference, not an official receipt. The paper receipt is recorded separately; this page takes no payments.</Note>
    <MoreDetails label="Bill reference, revision and fee snapshot"><Fields className="is-single" rows={[['Internal bill reference (AINV)',i.id],['Owning business',`${i.vendor_name} · ${i.vendor_id}`],['Invoiced animal revision',String(i.animalRevision)],
     ['Recorded fee schedule',i.feeScheduleSnapshot?`Version ${i.feeScheduleSnapshot.version} · Corral ${currency(i.feeScheduleSnapshot.corralCents)} · Delivery ${currency(i.feeScheduleSnapshot.deliveryCents)} · Inspection ${currency(i.feeScheduleSnapshot.inspectionCents)} · Facility ${currency(i.feeScheduleSnapshot.facilityCents)}. Stored at issue; current rates never recalculate it.`:'Historical fee snapshot unavailable; stored invoice amounts are unchanged.']]}/></MoreDetails>
    <MunicipalInvoiceOversight invoiceId={i.id} onReconciled={invoice=>setInvoices(rows=>rows.map(row=>row.id===invoice.id?{...row,...invoice}:row))}/>
   </RecordCard>)}
  </section>}
  {!busy&&!error&&mode==='delivery'&&<section className="record-list" aria-label="Authorized delivery assignments">
   <div className="record-list-head"><h3>Authorized delivery assignments</h3><p>{deliveries.length} shown</p></div>
   {!deliveries.length&&<p>No authorized assignments on this page. Animal records do not create an assignment.</p>}
   {deliveries.map(d=><RecordCard key={d.id} label={`Delivery ${d.vendorName} ${d.animalIdentifier}`} title={`${d.vendorName} · ${d.animalIdentifier}`}
     badges={<>{statusBadge(deliveryStatus(d))}{d.syntheticOnly&&<Badge tone="info">Synthetic rehearsal assignment</Badge>}</>}>
    <Fields rows={[['Destination',d.delivery.destination],['Status',`${deliveryStatus(d).replace(/_/g,' ')} · assigned ${manilaTime(d.delivery.assignedAt)}`],d.delivery.notes?['Delivery confirmation',d.delivery.notes]:null,
     ...(d.meatDetails?[['Live weight',<>{kg(d.meatDetails.weightGrams)} <span className="field-note">{d.meatDetails.species} · weighed {manilaTime(d.meatDetails.weighedAt)}</span></>],[CALCULATED_CARCASS_LABEL,<>{kg(d.meatDetails.carcassEstimate.weightGrams)} <span className="field-note">not scale-measured</span></>],
       [MEASURED_CARCASS_LABEL,d.meatDetails.carcassWeight?<>{kg(d.meatDetails.carcassWeight.weightGrams)} <span className="field-note">weighed {manilaTime(d.meatDetails.carcassWeight.weighedAt)}</span></>:'None recorded; the calculated weight applies.']] as Row[]:[['Meat details',d.meatDetailsMessage??'Unavailable']] as Row[])]}/>
    {d.meatDetails?.carcassWeightSelection.requiresReview&&<Note tone="warning" role="alert">Historical carcass measurement requires revision review before use.</Note>}
    <MoreDetails label="Owner and revision"><Fields className="is-single" rows={[['Owning business',`${d.vendorName} · ${d.vendorBusinessId}`],['Invoiced animal revision',String(d.animalRevision)],['Assignment reference',d.id]]}/></MoreDetails>
    {settings?.canReadTracking&&(trackingId===d.id?<DeliveryTrackingPanel invoiceId={d.id} deliveryCompleted={completedIds.has(d.id)} onCompleted={markCompleted} onClose={()=>setTrackingId(null)}/>:<div className="record-actions"><button className="btn-secondary" onClick={()=>setTrackingId(d.id)}>{completedIds.has(d.id)?'View destination/drop-off pins':'View authorized last reported location'}</button><span className="record-sub">Compares the verified stall pin with the last shared position. Missing pins stay as text.</span></div>)}
   </RecordCard>)}
  </section>}
  {!busy&&!error&&cursor&&<button className="btn-secondary" onClick={()=>void load(cursor)}>Load more {mode==='billing'?'invoices':'assignments'}</button>}
 </div>;
}
