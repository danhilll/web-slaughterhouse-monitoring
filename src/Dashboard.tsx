import {useEffect,useMemo,useRef,useState,type ReactElement,type ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {BarChart,Bar,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip} from 'recharts';
import {ArrowDownRight,ArrowUpRight,CheckCircle2,Clock3,RefreshCw,Truck,UserCheck,Minus} from 'lucide-react';
import {apiFetch} from './api';
import {fetchCompleteList} from './listPages';
import {completeCursorList,periodBounds,type Period} from './monitoringMetrics';
import {chartBuckets,kpis,change,animalSeries,moneySeries,feeBreakdown,topVendors,pipeline,recentInvoices,type AnimalRow,type InvoiceRow,type Kpi} from './dashboardData';
// Read-only municipal Dashboard. Palette validated with the dataviz validator against the
// card surfaces (#ffffff light, #292522 dark); slots 3-4 are sub-3:1 in light, so the fee
// breakdown always shows its values as text.
const PALETTE={light:['#2a78d6','#eb6834','#1baf7a','#eda100'],dark:['#3987e5','#d95926','#199e70','#c98500']};
const PERIODS:[Period,string,string][]=[['day','Today','yesterday'],['week','This week','the same days last week'],['month','This month','the same days last month'],['year','This year','the same days last year']];
const peso=(n:number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:n>=100000?0:2}).format(n);
const compactPeso=(n:number)=>'₱'+new Intl.NumberFormat('en-PH',{notation:'compact',maximumFractionDigits:1}).format(n);
const count=(n:number)=>n.toLocaleString('en-PH');
const lastDay=(end:string)=>{const d=new Date(end+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);};
const longDay=(day:string)=>new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(day+'T00:00:00Z'));
const DELIVERY:Record<string,string>={assigned:'Assigned',in_transit:'In transit',delivered:'Delivered'};

function Delta({k,versus}:{k:Kpi;versus:string}){
 const c=change(k);
 if(c===null)return <p className="dash-delta">{k.current===null?'Comparison unavailable':`No comparison with ${versus}`}</p>;
 const Icon=c>0?ArrowUpRight:c<0?ArrowDownRight:Minus;
 return <p className={`dash-delta ${c>0?'is-up':''}`}><Icon size={14} aria-hidden="true"/><span>{c>0?'+':''}{c}% vs {versus}</span></p>;
}
function ChartCard({title,subtitle,children,table,note,wide}:{title:string;subtitle:string;children:ReactNode;table?:ReactNode;note?:string;wide?:boolean}){
 return <section className={`dash-card dash-chart${wide?' is-wide':''}`} aria-label={title}><header><h2>{title}</h2><p>{subtitle}</p></header>{children}{note&&<p className="dash-note">{note}</p>}{table&&<details className="dash-table-toggle"><summary>Show as table</summary><div className="dash-table-wrap">{table}</div></details>}</section>;
}
const excludedNote=(n:number)=>n?`${n} record${n===1?'':'s'} left out: missing a readable date or amount.`:undefined;
function TooltipBox({active,payload,label,format,colors}:any){
 if(!active||!payload?.length)return null;
 return <div className="dash-tooltip"><p className="dash-tooltip-label">{label}</p>{payload.map((p:any)=><p key={p.dataKey}><span className="dash-key" style={{background:colors[p.dataKey]}} aria-hidden="true"/><b>{p.value===null?'—':format(p.value)}</b> <span>{p.dataKey}</span></p>)}</div>;
}
function Legend({items}:{items:[string,string,'bar'|'line'][]}){
 return <ul className="dash-legend">{items.map(([label,color,shape])=><li key={label}><span className={shape==='line'?'dash-key-line':'dash-key'} style={{background:color}} aria-hidden="true"/>{label}</li>)}</ul>;
}

// Measures its own box so the chart is redrawn at the real width after any resize.
function Plot({height,children}:{height:number;children:(width:number)=>ReactElement}){
 const ref=useRef<HTMLDivElement>(null),[width,setWidth]=useState(0);
 useEffect(()=>{const el=ref.current;if(!el)return;const measure=()=>setWidth(Math.floor(el.getBoundingClientRect().width));measure();const ro=new ResizeObserver(measure);ro.observe(el);return()=>ro.disconnect();},[]);
 return <div ref={ref} className="dash-plot" style={{height}}>{width>0&&children(width)}</div>;
}
export function Dashboard({dark=false}:{dark?:boolean}){
 const [period,setPeriod]=useState<Period>('week'),[reload,setReload]=useState(0);
 const [animals,setAnimals]=useState<AnimalRow[]|null>(null),[invoices,setInvoices]=useState<InvoiceRow[]|null>(null);
 const [busy,setBusy]=useState(true),[loaded,setLoaded]=useState(false),[errors,setErrors]=useState<string[]>([]),[updatedAt,setUpdatedAt]=useState<Date|null>(null);
 useEffect(()=>{const abort=new AbortController();setBusy(true);setErrors([]);
  const timeout=setTimeout(()=>{abort.abort();setBusy(false);setErrors(['Loading timed out. Refresh to retry.']);},30000);
  Promise.allSettled([completeCursorList('/api/animals',apiFetch,abort.signal),fetchCompleteList<InvoiceRow>('/api/invoices',apiFetch,abort.signal)]).then(([a,i])=>{clearTimeout(timeout);if(abort.signal.aborted)return;
   // A failed source becomes unavailable instead of keeping numbers that no longer match the other source.
   setAnimals(a.status==='fulfilled'?a.value as AnimalRow[]:null);setInvoices(i.status==='fulfilled'?i.value:null);
   const failed:[string,PromiseSettledResult<unknown>][]=[['Animals',a],['Invoices',i]];
   setErrors(failed.flatMap(([name,r])=>r.status==='rejected'?[`${name} could not load: ${String((r.reason as Error)?.message||r.reason)}`]:[]));
   setBusy(false);setLoaded(true);setUpdatedAt(new Date());});
  return()=>{clearTimeout(timeout);abort.abort();};},[reload]);
 const colors=PALETTE[dark?'dark':'light'];
 const [,,versus]=PERIODS.find(p=>p[0]===period)!;
 const bounds=periodBounds(period),buckets=useMemo(()=>chartBuckets(period),[period,updatedAt]);
 const k=kpis(animals,invoices,period);
 const herd=animals?animalSeries(animals,buckets):null,cash=invoices?moneySeries(invoices,buckets):null;
 const fees=invoices?feeBreakdown(invoices,bounds):null,vendors=invoices?topVendors(invoices,bounds):null,flow=invoices?pipeline(invoices):null,recent=invoices?recentInvoices(invoices):[];
 const periodWord=period==='day'?'today':`this ${period}`,rangeText=period==='day'?longDay(bounds[0]):`${longDay(bounds[0])} – ${longDay(lastDay(bounds[1]))}`;
 const chartRange=period==='day'?'Last 14 days':rangeText,grid=dark?'#403a35':'#e5dfda',axis=dark?'#b2a9a3':'#746d68';
 const rate=k.paid.current!==null&&k.billed.current?Math.round(k.paid.current/k.billed.current*100):null;
 const value=(n:number|null,kind:'money'|'count')=>busy&&!loaded?'Loading…':n===null?'Unavailable':kind==='money'?peso(n):count(n);
 const animalsSplit=herd&&!busy?herd.data.reduce((s,d)=>({Pig:s.Pig+(d.Pig??0),Cow:s.Cow+(d.Cow??0)}),{Pig:0,Cow:0}):null;
 const unavailable=(rows:unknown)=>rows===null?<p className="dash-empty" role="status">{busy&&!loaded?'Loading…':'Unavailable until the records load. Refresh to retry.'}</p>:null;
 const noHerd=herd&&!herd.data.some(d=>(d.Pig??0)+(d.Cow??0)>0),noCash=cash&&!cash.data.some(d=>(d.Billed??0)>0||(d.Collected??0)>0);
 return <div className={`dash${busy&&loaded?' is-refreshing':''}`} aria-busy={busy}>
  <div className="dash-toolbar">
   <div role="group" aria-label="Report period" className="dash-segment">{PERIODS.map(([p,label])=><button key={p} type="button" aria-pressed={p===period} onClick={()=>setPeriod(p)}>{label}</button>)}</div>
   <p className="dash-range">{rangeText} · Asia/Manila</p>
   <div className="dash-toolbar-end"><p className="dash-updated" role="status">{busy?(loaded?'Refreshing…':'Loading…'):updatedAt?`Updated ${updatedAt.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Manila'})}`:''}</p><button type="button" className="dash-refresh" disabled={busy} onClick={()=>setReload(r=>r+1)}><RefreshCw size={15} aria-hidden="true"/>Refresh</button></div>
  </div>
  {errors.map((e,i)=><p role="alert" className="dash-alert" key={i}>{e}</p>)}
  <div className="dash-hero-row">
   <section className="dash-card dash-hero" aria-label="Amount collected">
    <p className="dash-eyebrow">Collected {periodWord}</p>
    <p className="dash-hero-value metric-value">{value(k.paid.current,'money')}</p>
    <Delta k={k.paid} versus={versus}/>
    <div className="dash-meter-block"><div className="dash-meter-text"><span>Collection rate</span><b>{rate===null?'—':`${rate}%`}</b></div>
     <div className="dash-meter" role="meter" aria-label="Collected compared with billed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rate===null?undefined:Math.min(rate,100)} aria-valuetext={rate===null?'Unavailable':`${rate}%`}><span style={{width:`${rate===null?0:Math.min(rate,100)}%`,background:colors[0]}}/></div>
     <p className="dash-sub">{k.billed.current===null?'Billed amount unavailable.':`of ${peso(k.billed.current)} billed ${periodWord}. Payments count when recorded.`}</p></div>
   </section>
   <section className="dash-card dash-outstanding" aria-label="Outstanding balance">
    <p className="dash-eyebrow">Outstanding balance</p>
    <p className="dash-big">{flow?(flow.outstanding===null?'Unavailable':peso(flow.outstanding)):value(null,'money')}</p>
    <p className="dash-sub">{flow?`${count(flow.unpaid)} unpaid invoice${flow.unpaid===1?'':'s'} · all dates`:'Unpaid invoices unavailable.'}</p>
    <div className="dash-mini-stats"><div><span>In transit now</span><b>{flow?count(flow.counts.in_transit):'—'}</b></div><div><span>Awaiting assignment</span><b>{flow?count(flow.counts.awaiting):'—'}</b></div></div>
    <Link className="dash-link" to="/billing">Open invoices & payments →</Link>
   </section>
  </div>
  <div className="dash-kpis">
   {([['Animals registered',k.animals,'count',animalsSplit?`${count(animalsSplit.Pig)} Pig · ${count(animalsSplit.Cow)} Cow`:''],['Invoices issued',k.invoices,'count','By issue date'],['Amount billed',k.billed,'money','By issue date, approved fee snapshot'],['Deliveries completed',k.delivered,'count','By completion time']] as [string,Kpi,'money'|'count',string][]).map(([label,kpi,kind,sub])=>
    <section className="dash-card dash-kpi" key={label} aria-label={label}><h2>{label}</h2><p className="metric-value">{value(kpi.current,kind)}</p><Delta k={kpi} versus={versus}/><p className="dash-sub">{sub}</p></section>)}
  </div>
  <div className="dash-grid">
   <ChartCard title="Registrations by species" subtitle={`${chartRange} · by registration time`} note={herd?excludedNote(herd.excluded):undefined}
    table={herd&&<table><thead><tr><th>Day</th><th>Pig</th><th>Cow</th></tr></thead><tbody>{herd.data.filter(d=>!d.future).map(d=><tr key={d.key}><td>{d.label}</td><td>{d.Pig}</td><td>{d.Cow}</td></tr>)}</tbody></table>}>
    {unavailable(herd)??(noHerd?<p className="dash-empty">No animals registered in this range yet.</p>:<><Legend items={[['Pig',colors[0],'bar'],['Cow',colors[1],'bar']]}/>
     <Plot height={240}>{w=><BarChart width={w} height={240} data={herd!.data} margin={{top:8,right:8,left:-12,bottom:0}} barCategoryGap="18%">
      <CartesianGrid vertical={false} stroke={grid}/><XAxis dataKey="label" tick={{fill:axis,fontSize:11}} tickLine={false} axisLine={{stroke:grid}} interval="preserveStartEnd" minTickGap={16}/><YAxis allowDecimals={false} tick={{fill:axis,fontSize:11}} tickLine={false} axisLine={false} width={36}/>
      <Tooltip cursor={{fill:dark?'#ffffff10':'#00000008'}} content={<TooltipBox format={count} colors={{Pig:colors[0],Cow:colors[1]}}/>}/>
      <Bar dataKey="Pig" stackId="a" isAnimationActive={false} fill={colors[0]} maxBarSize={24}/><Bar dataKey="Cow" stackId="a" isAnimationActive={false} fill={colors[1]} radius={[4,4,0,0]} maxBarSize={24}/>
     </BarChart>}</Plot></>)}
   </ChartCard>
   <ChartCard title="Billed vs collected" subtitle={`${chartRange} · running total. The gap is unpaid.`} note={cash?excludedNote(cash.excluded):undefined}
    table={cash&&<table><thead><tr><th>Day</th><th>Billed</th><th>Collected</th></tr></thead><tbody>{cash.data.filter(d=>d.Billed!==null).map(d=><tr key={d.key}><td>{d.label}</td><td>{peso(d.Billed!)}</td><td>{peso(d.Collected!)}</td></tr>)}</tbody></table>}>
    {unavailable(cash)??(noCash?<p className="dash-empty">No billing activity in this range yet.</p>:<><Legend items={[['Billed',colors[0],'line'],['Collected',colors[1],'line']]}/>
     <Plot height={240}>{w=><LineChart width={w} height={240} data={cash!.data} margin={{top:8,right:12,left:-4,bottom:0}}>
      <CartesianGrid vertical={false} stroke={grid}/><XAxis dataKey="label" tick={{fill:axis,fontSize:11}} tickLine={false} axisLine={{stroke:grid}} interval="preserveStartEnd" minTickGap={16}/><YAxis tickFormatter={compactPeso} tick={{fill:axis,fontSize:11}} tickLine={false} axisLine={false} width={52}/>
      <Tooltip cursor={{stroke:axis,strokeWidth:1}} content={<TooltipBox format={peso} colors={{Billed:colors[0],Collected:colors[1]}}/>}/>
      <Line type="monotone" dataKey="Billed" stroke={colors[0]} strokeWidth={2} dot={false} activeDot={{r:4,stroke:dark?'#292522':'#ffffff',strokeWidth:2}} connectNulls={false} isAnimationActive={false}/>
      <Line type="monotone" dataKey="Collected" stroke={colors[1]} strokeWidth={2} dot={false} activeDot={{r:4,stroke:dark?'#292522':'#ffffff',strokeWidth:2}} connectNulls={false} isAnimationActive={false}/>
     </LineChart>}</Plot></>)}
   </ChartCard>
   <ChartCard title="Fee breakdown" subtitle={`Invoices issued ${periodWord} · approved fee components`} note={fees?excludedNote(fees.excluded):undefined}>
    {unavailable(fees)??(fees!.total===0?<p className="dash-empty">No invoices issued {periodWord} yet.</p>:<>
     <div className="dash-stack" role="img" aria-label={fees!.parts.map(p=>`${p.label} ${Math.round(p.share*100)}%`).join(', ')}>{fees!.parts.filter(p=>p.amount>0).map(p=>{const i=fees!.parts.indexOf(p);return <span key={p.label} style={{flexGrow:p.share,background:colors[i],color:i===3?'#0b0b0b':'#ffffff'}}>{p.share>=0.14?`${Math.round(p.share*100)}%`:''}</span>})}</div>
     <table className="dash-fee-table"><tbody>{fees!.parts.map((p,i)=><tr key={p.label}><td><span className="dash-key" style={{background:colors[i]}} aria-hidden="true"/>{p.label}</td><td>{peso(p.amount)}</td><td>{Math.round(p.share*100)}%</td></tr>)}<tr className="is-total"><td>Total billed</td><td>{peso(fees!.total)}</td><td>100%</td></tr></tbody></table></>)}
   </ChartCard>
   <ChartCard title="Top vendors" subtitle={`Amount billed ${periodWord}`} note={vendors?excludedNote(vendors.excluded):undefined}>
    {unavailable(vendors)??(!vendors!.rows.length?<p className="dash-empty">No vendor invoices {periodWord} yet.</p>:<ol className="dash-bars">{vendors!.rows.map(v=><li key={v.name}><div className="dash-bar-head"><span>{v.name}</span><b>{peso(v.amount)}</b></div><div className="dash-bar-track"><span style={{width:`${Math.max(2,v.amount/vendors!.rows[0].amount*100)}%`,background:colors[0]}}/></div><p className="dash-sub">{count(v.invoices)} invoice{v.invoices===1?'':'s'}</p></li>)}</ol>)}
   </ChartCard>
   <ChartCard title="Delivery pipeline" subtitle="Current status of every invoice" wide>
    {unavailable(flow)??<><ol className="dash-pipeline">{([['Awaiting assignment',flow!.counts.awaiting,Clock3],['Assigned',flow!.counts.assigned,UserCheck],['In transit',flow!.counts.in_transit,Truck],['Delivered',flow!.counts.delivered,CheckCircle2]] as const).map(([label,n,Icon])=><li key={label}><Icon size={18} aria-hidden="true"/><b>{count(n)}</b><span>{label}</span></li>)}</ol>{flow!.counts.unknown>0&&<p className="dash-note">{flow!.counts.unknown} invoice{flow!.counts.unknown===1?' has':'s have'} an unrecognised delivery status.</p>}<Link className="dash-link" to="/delivery">Open deliveries →</Link></>}
   </ChartCard>
  </div>
  <section className="dash-card" aria-label="Recent invoices">
   <header className="dash-table-head"><div><h2>Recent invoices</h2><p>Latest {recent.length||''} by issue date · AINV is an internal bill reference, not an official receipt.</p></div><Link className="dash-link" to="/invoice-history">All invoice records →</Link></header>
   {invoices===null?unavailable(null):!recent.length?<p className="dash-empty">No invoices yet.</p>:<div className="dash-table-wrap"><table className="dash-table"><thead><tr><th>Bill reference</th><th>Vendor</th><th>Animal</th><th>Issued</th><th className="num">Amount</th><th>Payment</th><th>Delivery</th></tr></thead><tbody>{recent.map(r=><tr key={r.id}>
    <td className="mono">{r.id}</td><td>{r.vendor_name||'Unknown vendor'}</td><td>{r.number_of_heads_pig?'Pig':r.number_of_heads_cow?'Cow':'—'}</td><td>{longDay(r.date_issued!)}</td><td className="num">{typeof r.total_amount==='number'&&Number.isFinite(r.total_amount)?peso(r.total_amount):'Unavailable'}</td>
    <td>{r.payment_status==='Paid'?<span className="dash-pill is-good"><CheckCircle2 size={13} aria-hidden="true"/>Paid</span>:r.payment_status==='Unpaid'?<span className="dash-pill"><Clock3 size={13} aria-hidden="true"/>Unpaid</span>:'Unavailable'}</td>
    <td>{r.delivery?DELIVERY[r.delivery.status||'']||'Unrecognised':'Not assigned'}</td></tr>)}</tbody></table></div>}
  </section>
  <p className="dash-footnote">Read-only. Totals use complete record lists: invoices by issue date, payments by recording time, deliveries by completion time, animals by registration time. Changes are compared with {versus}. Weeks start Monday.</p>
 </div>;
}
