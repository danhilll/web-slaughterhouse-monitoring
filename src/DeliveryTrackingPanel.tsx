import {useEffect,useState} from 'react';
import {apiFetch} from './api';
type Position={latitude:number;longitude:number;accuracyMeters:number;capturedAt:string;receivedAt:string};
type Tracking={invoiceId:string;deliveryStatus:string;trackingState:string;location:Position|null;serverTime:string;updateIntervalSeconds:number};
export function DeliveryTrackingPanel({invoiceId,onClose}:{invoiceId:string;onClose:()=>void}) {
  const [data,setData]=useState<Tracking|null>(null),[error,setError]=useState(''),[clock,setClock]=useState(Date.now());
  const [receivedAt,setReceivedAt]=useState(Date.now());
  useEffect(()=>{
    let disposed=false,pending=false,ended=false,timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined;
    setData(null);setError('');
    async function poll(){
      if(disposed||pending||ended||document.hidden)return;
      pending=true;controller=new AbortController();let delay=10000,timedOut=false;
      const timeout=setTimeout(()=>{timedOut=true;controller?.abort();},8000);
      try{
        const response=await apiFetch(`/api/operations/invoices/${encodeURIComponent(invoiceId)}/tracking`,{signal:controller.signal});
        if(response.status===401||response.status===403){ended=true;if(!disposed)setData(null);}
        if(response.status===429){const seconds=Number(response.headers.get('Retry-After'));if(Number.isFinite(seconds))delay=Math.max(delay,seconds*1000);}
        const body=await response.json();if(!response.ok)throw new Error(body.message||'Tracking unavailable.');
        const p=body.location;
        if(body.invoiceId!==invoiceId||!Number.isFinite(Date.parse(body.serverTime))||!['unassigned','assigned','in_transit','delivered'].includes(body.deliveryStatus)||!['completed','not_started','waiting','stale','recent'].includes(body.trackingState)||p&&(!Number.isFinite(p.latitude)||Math.abs(p.latitude)>90||!Number.isFinite(p.longitude)||Math.abs(p.longitude)>180||!Number.isFinite(p.accuracyMeters)||p.accuracyMeters<0||!Number.isFinite(Date.parse(p.capturedAt))||!Number.isFinite(Date.parse(p.receivedAt))))throw new Error('Tracking response requires review.');
        if(!disposed){setData(body);setError('');setClock(Date.now());setReceivedAt(Date.now());ended=body.deliveryStatus==='delivered';}
      }catch(e){if(!disposed&&(timedOut||!controller.signal.aborted))setError(timedOut?'Tracking request timed out. Retrying when visible.':(e as Error).message);}
      finally{clearTimeout(timeout);pending=false;if(!disposed&&!ended&&!document.hidden)timer=setTimeout(()=>void poll(),delay);}
    }
    const visible=()=>{if(timer)clearTimeout(timer);if(document.hidden)controller?.abort();else void poll();};
    document.addEventListener('visibilitychange',visible);void poll();
    const tick=setInterval(()=>{if(!document.hidden)setClock(Date.now());},1000);
    return()=>{disposed=true;controller?.abort();if(timer)clearTimeout(timer);clearInterval(tick);document.removeEventListener('visibilitychange',visible);};
  },[invoiceId]);
  const position=data?.location;
  const age=position&&data?Math.max(0,Math.floor((Date.parse(data.serverTime)-Date.parse(position.capturedAt)+clock-receivedAt)/1000)):null;
  const stale=age!==null&&age>45;
  const label=error?'Connection unavailable':data?.deliveryStatus==='delivered'?'Delivery completed':data?.deliveryStatus!=='in_transit'?'Tracking not started':!position?'Waiting for location':stale?'Location outdated':'Recent location';
  return <section className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex items-center justify-between gap-3"><h4 className="font-semibold">Delivery tracking</h4><button className="btn-secondary" onClick={onClose}>Close tracking</button></div>
    <p role="status" className="mt-3 font-medium">{data||error?label:'Loading location…'}</p>
    {position&&<><p className="mt-2">Last reported position: {position.latitude}, {position.longitude}</p><p className="text-sm">Accuracy ±{Math.round(position.accuracyMeters)} m{position.accuracyMeters>100?' — approximate position':''}</p><p className="text-sm">Captured {age} seconds ago · {new Date(position.capturedAt).toLocaleString()}</p></>}
    {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error} Any position shown is the last received location.</p>}
    <p className="mt-3 text-xs text-slate-500">Refreshes this delivery every 10 seconds while visible. Foreground tracking only; no map or screen-off tracking is claimed.</p>
  </section>;
}
