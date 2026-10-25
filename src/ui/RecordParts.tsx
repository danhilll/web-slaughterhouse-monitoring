import type {ReactNode} from 'react';
import {AlertTriangle, CheckCircle2, Clock3, Info} from 'lucide-react';
// Shared presentation for records: identity, status and key values first; secondary IDs, revisions and
// audit metadata inside a named disclosure. Presentation only: no data is computed or rounded here.
export type Tone='neutral'|'good'|'warning'|'danger'|'info';
const icons:Record<Tone,ReactNode>={neutral:<Clock3 size={13} aria-hidden="true"/>,good:<CheckCircle2 size={13} aria-hidden="true"/>,warning:<AlertTriangle size={13} aria-hidden="true"/>,danger:<AlertTriangle size={13} aria-hidden="true"/>,info:<Info size={13} aria-hidden="true"/>};
/** Status label with an icon, so meaning never depends on colour alone. */
export function Badge({tone='neutral',children}:{tone?:Tone;children:ReactNode}){return <span className={`badge badge-${tone}`}>{icons[tone]}{children}</span>;}
export type Row=[ReactNode,ReactNode]|false|null|undefined;
/** Short label/value rows instead of run-on sentences. */
export function Fields({rows,className=''}:{rows:Row[];className?:string}){
 const visible=rows.filter((r):r is [ReactNode,ReactNode]=>Boolean(r));
 // Long values (sentences, references) take a full row so short amounts stay aligned side by side.
 return <dl className={`fields ${className}`}>{visible.map(([label,value],i)=><div className={`field${typeof value==='string'&&value.length>26?' is-wide':''}`} key={i}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
export function RecordCard({title,subtitle,badges,children,actions,level=3,label}:{title:ReactNode;subtitle?:ReactNode;badges?:ReactNode;children?:ReactNode;actions?:ReactNode;level?:3|4;label?:string}){
 const Heading=level===3?'h3':'h4';
 return <article className="record-card" aria-label={label}>
  <header className="record-head"><div className="record-title"><Heading>{title}</Heading>{subtitle&&<p className="record-sub">{subtitle}</p>}</div>{badges&&<div className="record-badges">{badges}</div>}</header>
  {children}
  {actions&&<div className="record-actions">{actions}</div>}
 </article>;
}
/** Secondary details, closed by default. Never use it for action-critical warnings. */
export function MoreDetails({label='More details',children}:{label?:string;children:ReactNode}){return <details className="more-details"><summary>{label}</summary><div className="more-details-body">{children}</div></details>;}
/** A short visible note. Warnings stay outside MoreDetails. */
export function Note({tone='info',children,role}:{tone?:Tone;children:ReactNode;role?:'alert'|'status'}){return <p className={`note note-${tone}`} role={role}>{icons[tone]}<span>{children}</span></p>;}
export function Toolbar({children,description}:{children:ReactNode;description?:ReactNode}){return <div className="page-toolbar">{description&&<p className="page-toolbar-text">{description}</p>}<div className="page-toolbar-actions">{children}</div></div>;}
/** A Manila calendar day (YYYY-MM-DD) as "Oct 25, 2026"; unreadable input is shown unchanged. */
export function dayText(day:unknown):string{
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))return typeof day==='string'&&day?day:'Unavailable';
 const d=new Date(day+'T00:00:00Z');return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(d):day;
}
export function paymentBadge(state:'Paid'|'Unpaid'|'Overdue'|null){return state==='Paid'?<Badge tone="good">Paid</Badge>:state==='Overdue'?<Badge tone="warning">Overdue</Badge>:state==='Unpaid'?<Badge>Unpaid</Badge>:<Badge tone="danger">Payment status unavailable</Badge>;}
