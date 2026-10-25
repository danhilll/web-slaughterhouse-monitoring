import {useEffect,useRef,useState} from 'react';
import { manilaTime } from './displayTime';
import {apiFetch} from './api';
import {validateBillingAmounts,type RecordedFeeSnapshot} from './operationsWorkspace';
import {trackingLabel,type Tracking} from './trackingPolling';
import {DeliveryTrackingPanel} from './DeliveryTrackingPanel';
import {CALCULATED_CARCASS_LABEL,MEASURED_CARCASS_LABEL,estimateCarcassWeight} from '../shared/carcassEstimate.js';
import {carcassBasisText,type CarcassBasis} from './carcassBasis';
import {Fields,MoreDetails,Note} from './ui/RecordParts';
type Oversight={projection:string;invoice:{carcassBasis?:CarcassBasis;feeScheduleVersion?:number;feeScheduleSnapshot?:RecordedFeeSnapshot;id:string;animalRevision:number;vendor_id:string;vendor_name:string;totalCents:number;paidCents:number;balanceCents:number;payment_status:string;corral_fee:number;delivery_fee:number;anti_mortem_fee:number;facility_fee:number;due_date:string;payment?:{receiptReference:string;amountCents:number;method:string;recordedAt:string}};animal:{id:string;revision:number;species:string;weightGrams:number;weighedAt:string;inspection:{status:string;revision:number;decidedAt?:string};carcassWeight?:{weightGrams:number;weighedAt:string;animalRevision:number;revision:number}|null};assignment:null|{delivery:{assigneeUid:string;destination:string;status:string;assignedAt:string}};tracking:Tracking;refreshedAt:string;consistency:string};
const php=(c:number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(c/100);
export function MunicipalInvoiceOversight({invoiceId,onReconciled}:{invoiceId:string;onReconciled?:(invoice:Record<string,unknown>)=>void}){
 const[data,setData]=useState<Oversight|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[map,setMap]=useState(false),[clock,setClock]=useState(Date.now()),[receivedAt,setReceivedAt]=useState(Date.now()),[completed,setCompleted]=useState(false);
 useEffect(()=>{if(completed)return;const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[completed]);
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[invoiceId]);
 const load=async()=>{request.current?.abort();const abort=new AbortController();request.current=abort;setBusy(true);setError('');setData(null);setMap(false);try{const r=await apiFetch('/api/operations/oversight/invoices/'+encodeURIComponent(invoiceId),{signal:abort.signal});const b=await r.json();if(!r.ok)throw Error(b.message||'Oversight refresh failed.');validateBillingAmounts(b.invoice);if(b.projection!=='municipal_oversight_v1'||b.invoice.id!==invoiceId||b.tracking.invoiceId!==invoiceId)throw Error('Reconciliation identity requires review.');if(!abort.signal.aborted){if(b.tracking.deliveryStatus==='delivered')setCompleted(true);setData(b);onReconciled?.(b.invoice);setReceivedAt(Date.now());setClock(Date.now());}}catch(e){if(!abort.signal.aborted)setError('Failed sync: '+(e as Error).message);}finally{if(!abort.signal.aborted)setBusy(false);}};
 const c=data?.animal.carcassWeight,d=data?.assignment?.delivery,terminal=completed||data?.tracking.deliveryStatus==='delivered';
 const kg=(grams:number)=>`${grams/1000} kg`;
 const age=data?.tracking.location?Math.max(0,(Date.parse(data.tracking.serverTime)-Date.parse(data.tracking.location.capturedAt)+clock-receivedAt)/1000):null;
 return <section aria-label="Municipal invoice oversight" className="subsection">
  <div className="record-head"><h4>Mobile/Web reconciliation (read-only)</h4><button className="btn-secondary" disabled={busy} onClick={()=>void load()}>{busy?'Loading authoritative records…':'Refresh mobile/web reconciliation'}</button></div>
  {error&&<Note tone="danger" role="alert">{error}</Note>}
  {data&&<>
   <Fields rows={[['Amounts',`Total ${php(data.invoice.totalCents)} · paid ${php(data.invoice.paidCents)} · balance ${php(data.invoice.balanceCents)}`],['Payment status',`${data.invoice.payment_status} · due ${data.invoice.due_date}`],
    ['Fees on this invoice',`Corral ${php(Math.round(data.invoice.corral_fee*100))} · Delivery ${php(Math.round(data.invoice.delivery_fee*100))} · Inspection ${php(Math.round(data.invoice.anti_mortem_fee*100))} · Facility ${php(Math.round(data.invoice.facility_fee*100))}`],
    ['Payment',data.invoice.payment?`${data.invoice.payment.method==='cash'?'Cash':data.invoice.payment.method} · ${data.invoice.payment.method==='cash'?'paper receipt reference':'stored receipt reference'} ${data.invoice.payment.receiptReference} · ${php(data.invoice.payment.amountCents)} · ${manilaTime(data.invoice.payment.recordedAt)}`:'No payment recorded. Dispatch does not prove payment.'],
    ['Inspection',`${data.animal.inspection.status.replace(/^./,c=>c.toUpperCase())} · inspected revision ${data.animal.inspection.revision}`],
    ['Live weight',`${data.animal.species} · ${kg(data.animal.weightGrams)} · ${manilaTime(data.animal.weighedAt)}`],
    [CALCULATED_CARCASS_LABEL,`${kg(estimateCarcassWeight(data.animal.weightGrams,data.animal.revision).weightGrams)} · not scale-measured`],
    [MEASURED_CARCASS_LABEL,c?`${kg(c.weightGrams)} · ${manilaTime(c.weighedAt)}`:<span role="status">None recorded; the calculated weight applies.</span>],
    ['Invoiced on',data.invoice.carcassBasis?carcassBasisText(data.invoice.carcassBasis):'Not recorded on this earlier invoice.'],
    ['Assignment',d?`${d.status.replace(/_/g,' ')} · ${d.destination} · assigned ${manilaTime(d.assignedAt)}`:'No assignment recorded.'],
    ['Latest authorized location',terminal?'Delivery completed':trackingLabel(data.tracking,'',age)]]}/>
   {c&&c.animalRevision!==data.animal.revision&&<Note tone="warning" role="alert">This scale measurement is from an earlier animal revision. The calculated weight applies to the current revision.</Note>}
   {!terminal&&data.tracking.location&&<Note tone="neutral">Last shared position, not proof of arrival. Captured {manilaTime(data.tracking.location.capturedAt)}.</Note>}
   {terminal&&<Note tone="neutral">Historical captures remain recorded; no current driver position or running duration is shown.</Note>}
   {d&&<div className="record-actions"><button className="btn-secondary" onClick={()=>setMap(!map)}>{map?'Hide map':terminal?'View destination/drop-off pins':'View authorized location updates'}</button></div>}{map&&<DeliveryTrackingPanel invoiceId={invoiceId} deliveryCompleted={terminal} onCompleted={()=>setCompleted(true)} onClose={()=>setMap(false)}/>}
   <MoreDetails label="References, revisions and sync details"><Fields className="is-single" rows={[['Invoice',data.invoice.id],['Animal',data.animal.id],['Vendor',`${data.invoice.vendor_name} · ${data.invoice.vendor_id}`],
    ['Revisions',`animal ${data.animal.revision} · invoiced ${data.invoice.animalRevision}${c?` · measurement ${c.revision} (animal revision ${c.animalRevision})`:''}`],
    ['Recorded fee schedule',data.invoice.feeScheduleSnapshot?`Version ${data.invoice.feeScheduleSnapshot.version}; immutable invoice snapshot, current rates are not substituted.`:'Historical fee snapshot unavailable; stored charges remain authoritative.'],
    ['Exact times',`weighed ${data.animal.weighedAt}${c?` · measured ${c.weighedAt}`:''}${data.tracking.location?` · captured ${data.tracking.location.capturedAt} · received ${data.tracking.location.receivedAt}`:''}`],
    d&&['Assignee',d.assigneeUid],
    ['View refreshed',`${manilaTime(data.refreshedAt)} · not continuously synchronized; refresh after mobile writes. ${data.consistency}`]]}/></MoreDetails>
  </>}
 </section>;
}
