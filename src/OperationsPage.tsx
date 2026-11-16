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
import { billingSearchTerms, matchesBillingSearch } from './billingSearch';
import { matchesDeliverySearch } from './recordSearch';
import { Download, ExternalLink } from 'lucide-react';
import { completeCursorList } from './monitoringMetrics';
import { validateFeedbackRows, type FeedbackRow } from './deliveryFeedback';
import { DeliveryFeedbackView } from './FeedbackPanel';

type Mode='billing'|'delivery';
type Settings={enabled:boolean;workspaceContract?:string;canReadBilling:boolean;canReadDelivery:boolean;canReadEligible:boolean;canReadTracking:boolean;invoiceDueDate?:string;canBill:boolean;canDeliver:boolean;canRecordPayment:boolean;canPublishTracking:boolean;feeSchedule:null|{version:number;corralCents:number;deliveryCents:number;inspectionCents:number;facilityCents:number;syntheticOnly?:boolean};feeMessage?:string|null};
type Invoice={carcassBasis?:CarcassBasis;feeScheduleVersion?:number;feeScheduleSnapshot?:RecordedFeeSnapshot;payment?:{receiptReference:string;amountCents:number;method:string;recordedAt:string};id:string;vendor_id:string;vendor_name:string;animalIdentifier:string;animalRevision:number;revision:number;date_issued:string;due_date:string;totalCents:number;paidCents:number;balanceCents:number;payment_status:string;syntheticOnly:boolean;delivery?:{status:string};corral_fee?:number;delivery_fee?:number;anti_mortem_fee?:number;facility_fee?:number};
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
 const [query,setQuery]=useState(''),[loadingAll,setLoadingAll]=useState(false),[loadAllError,setLoadAllError]=useState('');
 const [pdf,setPdf]=useState<{id:string;busy:boolean;error:string}|null>(null);
 const epoch=useRef(0),controller=useRef<AbortController|null>(null);
 const json=async(url:string,signal?:AbortSignal)=>{const r=await apiFetch(url,{signal});const b=await r.json();if(!r.ok)throw Error(b.message||'Workspace unavailable.');return b;};
 // Search covers loaded pages only. This loads the rest so a search can cover every invoice or delivery.
 const loadAll=async()=>{
  if(!cursor||loadingAll)return;
  const billing=mode==='billing',noun=billing?'invoice':'delivery';
  controller.current?.abort();const abort=new AbortController();controller.current=abort;const current=++epoch.current;setLoadingAll(true);setLoadAllError('');
  try{let next:string|null=cursor;const added:(Invoice|Delivery)[]=[],seen=new Set<string>((billing?invoices:deliveries).map(i=>i.id)),cursors=new Set<string>();
   while(next){
    if(cursors.has(next))throw Error(`The ${noun} cursor did not advance. Refresh to retry.`);cursors.add(next);
    const list=await json((billing?'/api/operations/billing/invoices':'/api/operations/deliveries')+'?cursor='+encodeURIComponent(next),abort.signal);if(current!==epoch.current)return;
    if(billing)list.items.forEach(validateBillingAmounts);
    for(const item of list.items as (Invoice|Delivery)[]){if(seen.has(item.id))throw Error(`The ${noun} list changed while loading. Refresh to retry.`);seen.add(item.id);added.push(item);}
    next=list.nextCursor;
   }
   if(billing)setInvoices(old=>[...old,...added as Invoice[]]);
   else{const rows=added as Delivery[];setCompletedIds(previous=>{const next=new Set(previous);for(const item of rows)if(item.delivery.status==='delivered')next.add(item.id);return next;});setDeliveries(old=>[...old,...rows]);}
   setCursor(null);
  }catch(e){if(current===epoch.current&&!abort.signal.aborted)setLoadAllError((e as Error).message+(billing?' Invoices already shown are unchanged.':' Deliveries already shown are unchanged.'));}
  finally{if(current===epoch.current)setLoadingAll(false);}
 };
 const exportPdf=async(invoice:Invoice,open:boolean)=>{
  // Open the tab inside the click so pop-up blockers allow it; it receives only this locally built PDF.
  const tab=open?window.open('','_blank'):null;if(tab)tab.opener=null;
  setPdf({id:invoice.id,busy:true,error:''});
  try{
   const {createBillingRecordPdf,billingRecordFileName}=await import('./billingRecordPdf');
   const file=createBillingRecordPdf(invoice);
   if(open){const url=URL.createObjectURL(file.output('blob'));if(tab)tab.location.href=url;else window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}
   else file.save(billingRecordFileName(invoice));
   setPdf(null);
  }catch(e){tab?.close();setPdf({id:invoice.id,busy:false,error:(e as Error).message});}
 };
 const terms=billingSearchTerms(query),shown=invoices.filter(i=>matchesBillingSearch(i,terms));
 // Read-only Vendor ratings for completed deliveries. Loaded as one complete list; a failure shows "unavailable", never a guess.
 const [ratings,setRatings]=useState<Map<string,FeedbackRow>>(()=>new Map()),[ratingsStatus,setRatingsStatus]=useState<'loading'|'error'|'ready'>('loading');
 const ratingsRequest=useRef<AbortController|null>(null);
 const loadRatings=()=>{ratingsRequest.current?.abort();const abort=new AbortController();ratingsRequest.current=abort;setRatingsStatus('loading');
  completeCursorList('/api/operations/feedback',apiFetch,abort.signal).then(rows=>{if(abort.signal.aborted)return;setRatings(new Map(validateFeedbackRows(rows).map(r=>[r.invoiceId,r])));setRatingsStatus('ready');})
   .catch(()=>{if(!abort.signal.aborted){setRatings(new Map());setRatingsStatus('error');}});};
 useEffect(()=>{loadRatings();return()=>ratingsRequest.current?.abort();},[mode]);
 const load=async(after?:string)=>{
  controller.current?.abort();const abort=new AbortController();controller.current=abort;const current=++epoch.current;setBusy(true);setError('');setSettings(null);setTrackingId(null);setLoadingAll(false);setLoadAllError('');setPdf(null);
  try{const s:Settings=await json('/api/operations/settings',abort.signal);if(current!==epoch.current)return;validateWorkspaceSettings(s);setSettings(s);
   if(mode==='billing'){
    if(s.canReadBilling!==true)throw Error('Billing permission is required.');
    const list=await json('/api/operations/billing/invoices'+(after?'?cursor='+encodeURIComponent(after):''),abort.signal);
    if(current!==epoch.current)return;list.items.forEach(validateBillingAmounts);setInvoices(old=>after?[...old,...list.items]:list.items);setCursor(list.nextCursor);
   }else{if(s.canReadDelivery!==true)throw Error('Delivery permission is required.');const list=await json('/api/operations/deliveries'+(after?'?cursor='+encodeURIComponent(after):''),abort.signal);if(current!==epoch.current)return;setCompletedIds(previous=>{const next=new Set(previous);for(const item of list.items as Delivery[])if(item.delivery.status==='delivered')next.add(item.id);return next;});setDeliveries(old=>after?[...old,...list.items]:list.items);setCursor(list.nextCursor);}
  }catch(e){if(current===epoch.current&&!abort.signal.aborted){setError((e as Error).message);setInvoices([]);setDeliveries([]);setCursor(null);setTrackingId(null);}}
  finally{if(current===epoch.current)setBusy(false);}
 };
 useEffect(()=>{setTrackingId(null);setInvoices([]);setDeliveries([]);setCursor(null);setQuery('');void load();return()=>{epoch.current++;controller.current?.abort();};},[mode]);
 useEffect(()=>{if(workspace)setMode(workspace);},[workspace]);
 const deliveryStatus=(d:Delivery)=>completedIds.has(d.id)?'delivered':d.delivery.status;
 const shownDeliveries=deliveries.filter(d=>matchesDeliverySearch(d,deliveryStatus(d),terms));
 const statusBadge=(status:string)=>status==='delivered'?<Badge tone="good">Delivered</Badge>:status==='in_transit'?<Badge tone="info">In transit</Badge>:<Badge>{status.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase())}</Badge>;
 const kg=(grams:number)=>`${grams/1000} kg`;
 return <div className="space-y-5">
  {!workspace&&<nav aria-label="Operations workspaces" className="flex gap-3"><button className="btn-secondary" disabled={busy} onClick={()=>setMode('billing')}>Billing</button><button className="btn-secondary" disabled={busy} onClick={()=>setMode('delivery')}>Delivery</button></nav>}
  <Toolbar description={mode==='billing'?'Bills, balances and recorded payments. Refresh after mobile activity.':'Assignments, destinations and shared positions. Driver positions refresh separately.'}>
   <button className="btn-secondary" disabled={busy} onClick={()=>{void load();loadRatings();}}>Refresh {mode === 'billing' ? 'invoices' : 'deliveries'}</button>
   {mode==='billing'&&<Link className="btn-secondary" to="/invoice-history">All invoice records</Link>}
  </Toolbar>
  {busy&&<p role="status">Loading {mode} workspace…</p>}{error&&<Note tone="danger" role="alert">{error}</Note>}
  {!busy&&!error&&mode==='billing'&&<div className="page-toolbar"><label className="directory-search">Search invoices<input className="input mt-1 w-full" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Vendor, animal, AINV, receipt reference, date or status" /></label>
   {cursor&&<div className="page-toolbar-actions"><button className="btn-secondary" disabled={loadingAll} onClick={()=>void loadAll()}>{loadingAll?'Loading all invoices…':'Load all invoices to search'}</button></div>}</div>}
  {!busy&&!error&&mode==='billing'&&terms.length>0&&cursor&&<Note tone="warning" role="status">Searching the {invoices.length} invoices loaded so far. More pages exist; load all invoices to search everything.</Note>}
  {loadAllError&&<Note tone="danger" role="alert">{loadAllError}</Note>}
  {!busy&&!error&&mode==='billing'&&<section className="record-list" aria-label="Invoices on this page">
   <div className="record-list-head"><h3>{terms.length?'Matching invoices':'Invoices on this page'}</h3><p>{terms.length?`${shown.length} of ${invoices.length} loaded match`:`${invoices.length} shown`}</p></div>
   {!invoices.length&&<p>No animal invoices on this page. Animal records are not invoice history.</p>}
   {invoices.length>0&&!shown.length&&<p>No loaded invoices match this search.</p>}
   {shown.map(i=><RecordCard key={i.id} label={`Invoice ${i.vendor_name} ${i.animalIdentifier}`} title={`${i.vendor_name} · ${i.animalIdentifier}`} subtitle={`Issued ${dayText(i.date_issued)} · due ${dayText(i.due_date)}`}
     badges={<>{paymentBadge(paymentState(i))}{i.syntheticOnly&&<Badge tone="info">Synthetic rehearsal invoice</Badge>}</>}>
    <Fields rows={[['Total',currency(i.totalCents)],['Recorded paid',currency(i.paidCents)],['Balance',currency(i.balanceCents)],
     ['Weight basis at issue',i.carcassBasis?carcassBasisText(i.carcassBasis):'Not recorded on this earlier invoice.'],
     ['Payment',i.payment?`${i.payment.method==='cash'?'Cash':i.payment.method} · ${i.payment.method==='cash'?'paper official-receipt reference':'stored receipt reference'} ${i.payment.receiptReference} · ${currency(i.payment.amountCents)} · ${manilaTime(i.payment.recordedAt)}`:i.payment_status==='Paid'?<span role="alert">Payment reference details unavailable; refresh and review.</span>:'No cash payment recorded.']]}/>
    <Note>AINV is an internal bill reference, not an official receipt. The paper receipt is recorded separately; this page takes no payments.</Note>
    <div className="record-actions">
     <button className="btn-secondary" disabled={pdf?.id===i.id&&pdf.busy} onClick={()=>void exportPdf(i,false)}><Download size={15} aria-hidden="true"/>Download {i.payment_status==='Paid'?'payment record':'billing statement'} (PDF)</button>
     <button className="btn-secondary" disabled={pdf?.id===i.id&&pdf.busy} onClick={()=>void exportPdf(i,true)}><ExternalLink size={15} aria-hidden="true"/>Open PDF</button>
     <span className="record-sub">Built in this browser from the record above. Not an official receipt.</span>
    </div>
    {pdf?.id===i.id&&pdf.error&&<Note tone="danger" role="alert">{pdf.error} No PDF was created.</Note>}
    <DeliveryFeedbackView delivered={i.delivery?.status==='delivered'} feedback={ratings.get(i.id)} status={ratingsStatus}/>
    <MoreDetails label="Bill reference, revision and fee snapshot"><Fields className="is-single" rows={[['Internal bill reference (AINV)',i.id],['Owning business',`${i.vendor_name} · ${i.vendor_id}`],['Invoiced animal revision',String(i.animalRevision)],
     ['Recorded fee schedule',i.feeScheduleSnapshot?`Version ${i.feeScheduleSnapshot.version} · Corral ${currency(i.feeScheduleSnapshot.corralCents)} · Delivery ${currency(i.feeScheduleSnapshot.deliveryCents)} · Inspection ${currency(i.feeScheduleSnapshot.inspectionCents)} · Facility ${currency(i.feeScheduleSnapshot.facilityCents)}. Stored at issue; current rates never recalculate it.`:'Historical fee snapshot unavailable; stored invoice amounts are unchanged.']]}/></MoreDetails>
    <MunicipalInvoiceOversight invoiceId={i.id} onReconciled={invoice=>setInvoices(rows=>rows.map(row=>row.id===invoice.id?{...row,...invoice}:row))}/>
   </RecordCard>)}
  </section>}
  {!busy&&!error&&mode==='delivery'&&<div className="page-toolbar"><label className="directory-search">Search deliveries<input className="input mt-1 w-full" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Vendor, animal, destination, status, reference or date" /></label>
   {cursor&&<div className="page-toolbar-actions"><button className="btn-secondary" disabled={loadingAll} onClick={()=>void loadAll()}>{loadingAll?'Loading all deliveries…':'Load all deliveries to search'}</button></div>}</div>}
  {!busy&&!error&&mode==='delivery'&&terms.length>0&&cursor&&<Note tone="warning" role="status">Searching the {deliveries.length} deliveries loaded so far. More pages exist; load all deliveries to search everything.</Note>}
  {!busy&&!error&&mode==='delivery'&&<section className="record-list" aria-label="Authorized delivery assignments">
   <div className="record-list-head"><h3>{terms.length?'Matching deliveries':'Authorized delivery assignments'}</h3><p>{terms.length?`${shownDeliveries.length} of ${deliveries.length} loaded match`:`${deliveries.length} shown`}</p></div>
   {!deliveries.length&&<p>No authorized assignments on this page. Animal records do not create an assignment.</p>}
   {deliveries.length>0&&!shownDeliveries.length&&<p>No loaded deliveries match this search.</p>}
   {shownDeliveries.map(d=><RecordCard key={d.id} label={`Delivery ${d.vendorName} ${d.animalIdentifier}`} title={`${d.vendorName} · ${d.animalIdentifier}`}
     badges={<>{statusBadge(deliveryStatus(d))}{d.syntheticOnly&&<Badge tone="info">Synthetic rehearsal assignment</Badge>}</>}>
    <Fields rows={[['Destination',d.delivery.destination],['Status',`${deliveryStatus(d).replace(/_/g,' ')} · assigned ${manilaTime(d.delivery.assignedAt)}`],d.delivery.notes?['Delivery confirmation',d.delivery.notes]:null,
     ...(d.meatDetails?[['Live weight',<>{kg(d.meatDetails.weightGrams)} <span className="field-note">{d.meatDetails.species} · weighed {manilaTime(d.meatDetails.weighedAt)}</span></>],[CALCULATED_CARCASS_LABEL,<>{kg(d.meatDetails.carcassEstimate.weightGrams)} <span className="field-note">not scale-measured</span></>],
       [MEASURED_CARCASS_LABEL,d.meatDetails.carcassWeight?<>{kg(d.meatDetails.carcassWeight.weightGrams)} <span className="field-note">weighed {manilaTime(d.meatDetails.carcassWeight.weighedAt)}</span></>:'None recorded; the calculated weight applies.']] as Row[]:[['Meat details',d.meatDetailsMessage??'Unavailable']] as Row[])]}/>
    <DeliveryFeedbackView delivered={deliveryStatus(d)==='delivered'} feedback={ratings.get(d.id)} status={ratingsStatus}/>
    {d.meatDetails?.carcassWeightSelection.requiresReview&&<Note tone="warning" role="alert">Historical carcass measurement requires revision review before use.</Note>}
    <MoreDetails label="Owner and revision"><Fields className="is-single" rows={[['Owning business',`${d.vendorName} · ${d.vendorBusinessId}`],['Invoiced animal revision',String(d.animalRevision)],['Assignment reference',d.id]]}/></MoreDetails>
    {settings?.canReadTracking&&(trackingId===d.id?<DeliveryTrackingPanel invoiceId={d.id} deliveryCompleted={completedIds.has(d.id)} onCompleted={markCompleted} onClose={()=>setTrackingId(null)}/>:<div className="record-actions"><button className="btn-secondary" onClick={()=>setTrackingId(d.id)}>{completedIds.has(d.id)?'View destination/drop-off pins':'View authorized last reported location'}</button><span className="record-sub">Compares the verified stall pin with the last shared position. Missing pins stay as text.</span></div>)}
   </RecordCard>)}
  </section>}
  {!busy&&!error&&cursor&&<button className="btn-secondary" disabled={loadingAll} onClick={()=>void load(cursor)}>Load more {mode==='billing'?'invoices':'assignments'}</button>}
 </div>;
}
