import {useEffect,useState} from 'react';
import {manilaTime} from './displayTime';
import {Link} from 'react-router-dom';
import {apiFetch} from './api';
import {carcassBasisText} from './carcassBasis';
import {fetchCompleteList} from './listPages';
import {paymentState,paymentText} from './overdue';
import {Badge,Fields,MoreDetails,Note,RecordCard,dayText,paymentBadge} from './ui/RecordParts';
const money=(n:number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(n);
export const faq = [
 ['What can each role do?', 'Vendors view their records and choose organ collection. Inventory Staff register animals and record scale weights. Inspectors review animals and assign deliveries. Billing Staff issue invoices and record cash. Delivery Staff update assigned deliveries. Web administrators monitor records and create mobile users.'],
 ['How is cash recorded?', 'Billing Staff alone records the full amount against an existing paper receipt. Financial corrections remain disabled.'],
 ['What do Paid, Unpaid and Overdue mean?', 'Paid means full payment was recorded. Unpaid means payment remains outstanding. Overdue means still unpaid after the due date. Overdue is a flag only: Billing Staff can still record payment, and dispatch does not require payment.'],
 ['Is AINV an official receipt?', 'No. AINV is an internal bill reference. Keep the paper official receipt.'],
 ['When does tracking run?', 'Only while the delivery screen is visible. Leaving stops tracking. Background tracking is unavailable.'],
 ['What are the three map markers?', 'Red pin: Market destination, the Inspector-verified stall. Blue pin: Drop-off point, an optional fixed point chosen by Delivery Staff. Green car: Delivery Staff, the last shared GPS position. A dashed line shows the straight-line direction to the destination, not a road route. Completion hides the car and the line and keeps both pins. Completed drop-off editing stays closed.'],
 ['Which weight is used?', 'Pig/Cow calculated carcass weight is live weight × 0.8. An optional current scale measurement takes precedence. Invoice weight is the stored issue-time basis, not the current animal calculation. Missing invoice snapshots stay unavailable.'],
 ['What are the fees?', '₱95 per animal: corral ₱15, delivery ₱25, inspection ₱10, facility ₱45.'],
 ['Who can help?', 'Contact your authorized administrator for access, records or receipt discrepancies.']
];
export function HelpPage(){return <section className="monitor-stack">{faq.map(([q,a])=><article className="monitor-card" key={q}><h2>{q}</h2>{a.split(/(?<=\.) /).map((line,i)=><p key={i}>{line}</p>)}</article>)}</section>}
export function SettingsPage({dark,toggle,email,logout}:{dark:boolean;toggle:()=>void;email:string;logout:()=>Promise<void>}){return <div className="monitor-stack"><section className="monitor-card"><h2>Appearance</h2><p>Choose a comfortable reading theme.</p><button className="btn-secondary" onClick={toggle}>{dark?'Use light theme':'Use dark theme'}</button></section><section className="monitor-card"><h2>Account</h2><p className="break-all">{email}</p><button className="btn-secondary" onClick={()=>void logout()}>Sign out</button></section><Link className="btn-secondary" to="/faq">Help & FAQ</Link></div>}
const when=(value:unknown)=>typeof value==='string'&&/T\d{2}:\d{2}/.test(value)?manilaTime(value):typeof value==='string'&&value?dayText(value):'Unavailable';
export function MonitoringDirectory({kind}:{kind:'vendors'|'records'|'notifications'|'invoices'}){
 const [rows,setRows]=useState<any[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0),[query,setQuery]=useState('');
 useEffect(()=>{const abort=new AbortController();setBusy(true);setError('');setRows([]);fetchCompleteList<any>('/api/'+(kind==='records'?'slaughter-records':kind),apiFetch,abort.signal).then(r=>{if(!abort.signal.aborted)setRows(r)}).catch(e=>{if(!abort.signal.aborted)setError(e.message)}).finally(()=>{if(!abort.signal.aborted)setBusy(false)});return()=>abort.abort()},[kind,reload]);
 const visible=rows.filter(r=>[r.name,r.vendor_name,r.message,r.id,r.payment_status].join(' ').toLowerCase().includes(query.toLowerCase()));
 const listName=kind==='records'?'Legacy slaughter records':kind==='vendors'?'Vendor directory':kind==='invoices'?'Invoices':'Notifications';
 const amount=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?money(v):'Unavailable';
 return <section className="monitor-stack">
  <div className="page-toolbar"><label className="directory-search">Search<input className="input mt-1 w-full" value={query} onChange={e=>setQuery(e.target.value)} /></label><div className="page-toolbar-actions"><button className="btn-secondary" disabled={busy} onClick={()=>setReload(r=>r+1)}>Refresh</button></div></div>
  {busy&&<p role="status">Loading all pages…</p>}{error&&<Note tone="danger" role="alert">{error} Refresh to retry.</Note>}
  {kind==='invoices'&&!busy&&!error&&<Note>AINV is an internal bill reference, not an official receipt.</Note>}
  {kind==='records'&&!busy&&!error&&<Note tone="neutral">Slaughter records are separate from animal registrations.</Note>}
  {!busy&&!error&&<div className="record-list"><div className="record-list-head"><h2>{listName}</h2><p>{visible.length} of {rows.length} shown</p></div>
  {!visible.length&&<p>No matching records.</p>}
  {visible.map(r=>kind==='vendors'?<RecordCard key={r.id} level={3} title={r.name||r.id} badges={r.status?<Badge tone={r.status==='Active'?'good':'neutral'}>{r.status}</Badge>:undefined}>
    <Fields rows={[['Address',r.address||'Unavailable'],['Contact number',r.contact_number||'Unavailable'],['Email',r.email||'Unavailable']]}/>
    <MoreDetails label="Vendor record details"><Fields className="is-single" rows={[['Vendor ID',r.id],r.animal_type?['Animal type',r.animal_type]:null,r.created_at?['Created',when(r.created_at)]:null]}/></MoreDetails></RecordCard>
   :kind==='invoices'?<RecordCard key={r.id} level={3} title={r.vendor_name||'Unknown vendor'} subtitle={`Issued ${dayText(r.date_issued)}${r.due_date?` · due ${dayText(r.due_date)}`:''}`} badges={paymentBadge(paymentState(r))}>
    <Fields rows={[['Total',amount(r.total_amount)],['Weight basis at issue',r.carcassBasis?carcassBasisText(r.carcassBasis):'Invoice weight basis unavailable.'],['Payment',r.payment?`${r.payment.method==='cash'?'Cash':r.payment.method} · ${r.payment.receiptReference} · ${manilaTime(r.payment.recordedAt)}`:'Payment details unavailable in this record.']]}/>
    <MoreDetails label="Bill reference"><Fields className="is-single" rows={[['Internal bill reference (AINV)',r.id],['Status',paymentText(r)],r.vendor_id?['Vendor ID',r.vendor_id]:null]}/></MoreDetails></RecordCard>
   :kind==='notifications'?<RecordCard key={r.id} level={3} title={r.message||'Notice'} subtitle={when(r.created_at)}/>
   :<RecordCard key={r.id} level={3} title={r.id} subtitle={when(r.date)} badges={r.status?<Badge>{r.status}</Badge>:undefined}><Fields rows={[['Animal type',r.animal_type||'Unavailable']]}/></RecordCard>)}
  </div>}
 </section>
}
export function FeeSummary(){const [fees,setFees]=useState<any>(null),[error,setError]=useState(''),[reload,setReload]=useState(0);useEffect(()=>{const abort=new AbortController();setFees(null);setError('');apiFetch('/api/operations/settings',{signal:abort.signal}).then(async r=>{const b=await r.json();if(!r.ok||!b.feeSchedule)throw Error('Approved fees unavailable.');if(!abort.signal.aborted)setFees(b.feeSchedule)}).catch(e=>{if(!abort.signal.aborted)setError(e.message)});return()=>abort.abort()},[reload]);
 return <RecordCard title="Approved fees per animal" subtitle={fees?`${fees.syntheticOnly?'Synthetic practice fees':'Approved fee schedule'} · Version ${fees.version}`:undefined} actions={<button className="btn-secondary" onClick={()=>setReload(r=>r+1)}>Refresh fees</button>}>
  {error?<Note tone="danger" role="alert">{error}</Note>:!fees?<p role="status">Loading fees…</p>:<><Fields rows={[['Corral','corralCents'],['Delivery','deliveryCents'],['Inspection','inspectionCents'],['Facility','facilityCents']].map(([label,key])=>[label,Number.isSafeInteger(fees[key])?money(fees[key]/100):'Unavailable'])}/><Note tone="neutral">Historical invoices keep their recorded fee snapshot.</Note></>}
 </RecordCard>}
