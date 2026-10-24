// Synthetic only: real operations routers on an in-memory store, other reads intercepted; no production connection.
// Phases: loading, error, empty, populated (desktop/phone, light/dark). The Vite cache is private to each run so
// dependency optimization cannot reload the page mid-check (the cause of the earlier first-run timeout).
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
import {fixture,bill,payment} from '../server/test-support/operations-fixture.js';
const repo=fileURLToPath(new URL('../',import.meta.url));
const temp=await mkdtemp(path.join(repo,'.monitor-test-'));
const evidence=process.env.MONITOR_EVIDENCE_DIR||path.join(repo,'.monitor-evidence');
let server,browser,cleanup;
const pages=['/','/vendors','/animals','/billing','/delivery','/users','/notifications','/invoice-history','/service-computation','/faq','/settings'];
try {
 await mkdir(evidence,{recursive:true});
 const f=await fixture({after:fn=>{cleanup=fn;}},true);
 const api=path.join(temp,'api.ts');
 await writeFile(api,`export const WEB_ACCESS_LOST_EVENT='synthetic-access-lost';export const EMAIL_VERIFICATION_REQUIRED='synthetic-verification';export const apiFetch=(url:string,init?:RequestInit)=>fetch(url,init);`);
 await writeFile(path.join(temp,'index.html'),'<div id="root"></div><script type="module" src="/entry.tsx"></script>');
 await writeFile(path.join(temp,'entry.tsx'),`import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import App from${JSON.stringify(path.join(repo,'src/App.tsx'))};import{WorkspaceMotion}from${JSON.stringify(path.join(repo,'src/WorkspaceMotion.tsx'))};import${JSON.stringify(path.join(repo,'src/index.css'))};createRoot(document.getElementById('root')!).render(<WorkspaceMotion><BrowserRouter><App session={{uid:'ADMIN',email:'synthetic-admin@example.test',role:'admin',writesEnabled:false}} onLogout={async()=>{}}/></BrowserRouter></WorkspaceMotion>);`);
 server=await createServer({root:temp,configFile:false,cacheDir:path.join(temp,'cache'),logLevel:'warn',plugins:[react(),{name:'synthetic-api',enforce:'pre',resolveId(s){if(s==='./api')return api;}}],
  server:{host:'127.0.0.1',port:0,fs:{allow:[repo,await realpath(path.join(repo,'node_modules'))]},proxy:{'/api/operations':f.origin}}});
 await server.listen();
 const origin='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
 const page=await browser.newPage();const errors=[],mutations=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('request',r=>{if(r.method()!=='GET')mutations.push([r.method(),new URL(r.url()).pathname]);});
 const now=new Date().toISOString();
 let mode='populated';const held=[];
 const invoiceRows=()=>[...f.rows].filter(([k])=>k.startsWith('invoices/')).map(([,r])=>({...r})).concat(history.invoices);
 // Deterministic synthetic history for the Dashboard: 45 days of animals, invoices, payments and deliveries.
 const history=(()=>{const vendors=['Synthetic Meat Stall A','Synthetic Meat Stall B','Synthetic Market C','Synthetic Vendor D','Synthetic Vendor E','Synthetic Vendor F'],animals=[],invoices=[];let seed=7;const rnd=()=>(seed=(seed*48271)%2147483647)/2147483647;
  const manila=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(t);
  for(let d=44;d>=0;d--){const base=Date.now()-d*86400000;const n=1+Math.floor(rnd()*4);for(let j=0;j<n;j++){const t=new Date(base-Math.floor(rnd()*6)*3600000);const species=rnd()<0.8?'Pig':'Cow';const id=`SYN-${d}-${j}`;animals.push({id:'ANM-'+id,createdAt:t.toISOString(),species,vendorBusinessId:'VEN-'+(j%6)});
   if(rnd()<0.85){const paid=rnd()<0.72&&d>0,delivered=paid&&rnd()<0.8;const v=Math.floor(rnd()*rnd()*6);invoices.push({id:'AINV-'+id,vendor_id:'VEN-'+v,vendor_name:vendors[v],date_issued:manila(t),total_amount:95,corral_fee:15,delivery_fee:25,anti_mortem_fee:10,facility_fee:45,number_of_heads_pig:species==='Pig'?1:0,number_of_heads_cow:species==='Cow'?1:0,payment_status:paid?'Paid':'Unpaid',...(paid?{payment:{amountCents:9500,method:'cash',receiptReference:'SYN-OR-'+id,recordedAt:new Date(t.getTime()+3600000*(2+Math.floor(rnd()*20))).toISOString()}}:{}),...(delivered?{delivery:{status:'delivered',deliveredAt:new Date(t.getTime()+3600000*30).toISOString()}}:rnd()<0.3?{delivery:{status:rnd()<0.5?'assigned':'in_transit'}}:{})});}}}
  return {animals,invoices};})();
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());
  if(mode==='loading'){held.push(route);return;}
  if(mode==='error')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic service outage.'})});
  if(url.pathname.startsWith('/api/operations/'))return route.continue();
  const empty=mode==='empty';let body={items:[],nextCursor:null};
  if(url.pathname==='/api/animals'&&!empty){const all=[{id:'ANM-SYNTHETIC',createdAt:now,species:'Pig'},...history.animals],start=Number(url.searchParams.get('cursor')||0);body={items:all.slice(start,start+25),nextCursor:start+25<all.length?String(start+25):null};}
  if(url.pathname==='/api/invoices'&&!empty){const all=invoiceRows(),start=Number(url.searchParams.get('cursor')||0);body={items:all.slice(start,start+100),nextCursor:start+100<all.length?String(start+100):null};}
  if(url.pathname==='/api/vendors'&&!empty)body={items:[{id:'VEN-SYNTHETIC',name:'Synthetic Market Vendor',address:'Sample stall',status:'Active'}],nextCursor:null};
  if(url.pathname==='/api/accounts/settings')body={enabled:true,canManageAccounts:true,canDeactivate:true,canActivateAccounts:true,municipalScopeId:'SCOPE',municipalityName:'Synthetic municipality',staffInspectorAvailable:true};
  if(url.pathname==='/api/accounts'&&!empty)body={items:[{uid:'U-SYN',fullName:'Synthetic Staff',email:'staff@example.test',role:'staff',status:'pending',invitationStatus:'sent',staffPermissions:['billing']}],nextCursor:null};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 const open=async destination=>{await page.goto(origin+destination,{waitUntil:'domcontentloaded'});await page.locator('h1').waitFor({timeout:60000});};
 // Let charts finish painting before a full-page capture (headless capture can reuse a stale raster).
 const shot=async name=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.waitForTimeout(300);await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:true});};
 const noOverflow=async label=>{const r=await page.evaluate(()=>({over:document.documentElement.scrollWidth>innerWidth,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,iw:innerWidth,vw:innerWidth,wide:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(-4).map(e=>e.tagName+'.'+e.className+' '+(e.textContent||'').slice(0,50))}));assert.equal(r.over,false,'horizontal overflow '+label+' '+JSON.stringify(r));};
 const tag=d=>d.replaceAll('/','')||'overview';
 await page.setViewportSize({width:1440,height:1000});
 // Loading: requests are held, so each page must show its own loading state.
 mode='loading';
 for(const [destination,text] of [['/','Loading…'],['/billing','Loading billing workspace…'],['/delivery','Loading delivery workspace…'],['/vendors','Loading all pages…']]){
  await open(destination);await page.getByText(text,{exact:false}).first().waitFor();await shot('state-loading-'+tag(destination));
 }
 mode='error';for(const r of held.splice(0))await r.abort().catch(()=>{});
 // Error: every read fails; each page shows an alert instead of empty data or zero.
 for(const destination of ['/','/billing','/delivery','/vendors','/service-computation']){
  await open(destination);await page.getByRole('alert').first().waitFor();await shot('state-error-'+tag(destination));
 }
 // Empty: real routers with no invoices or assignments yet; intercepted lists are empty.
 mode='empty';
 await open('/billing');await page.getByText('No animal invoices on this page',{exact:false}).waitFor();await shot('state-empty-billing');
 await open('/delivery');await page.getByText('No authorized assignments on this page',{exact:false}).waitFor();await shot('state-empty-delivery');
 await open('/vendors');await page.getByText('No matching records.',{exact:true}).waitFor();await shot('state-empty-vendors');
 await open('/');await page.getByText('Loading…',{exact:true}).first().waitFor({state:'detached'});
 assert.equal(await page.locator('.dash-hero-value').textContent(),'₱0.00');assert.equal(await page.locator('.dash-kpi .metric-value').first().textContent(),'0');await page.getByText('No animals registered in this range yet.').waitFor();await shot('state-empty-overview');
 // Populated: one assigned, in-transit, paid invoice issued through the real routers.
 const inv=(await f.call('/animals/ANM-A/invoice','billing',bill)).body;
 assert.equal((await f.call(`/invoices/${inv.id}/delivery`,'inspector',{expectedRevision:1,assigneeUid:'delivery',destination:'Synthetic Market / Meat / Stall A',destinationConfirmed:true})).status,200);
 assert.equal((await f.call(`/deliveries/${inv.id}/status`,'delivery',{expectedRevision:2,status:'in_transit',notes:'Synthetic departure'})).status,200);
 assert.equal((await f.call(`/invoices/${inv.id}/payment`,'billing',payment(3))).status,200);
 mode='populated';
 for(const [label,width,height] of [['desktop',1440,1000],['phone',390,844]]) {
  await page.setViewportSize({width,height});
  for(const dark of [false,true]) {
   await open('/settings');
   const desired=dark?'Use dark theme':'Use light theme';
   if(await page.getByRole('button',{name:desired,exact:true}).count())await page.getByRole('button',{name:desired,exact:true}).click();
   for(const destination of pages) {
    await open(destination);
    if(destination==='/'){await page.getByText('Loading…',{exact:true}).first().waitFor({state:'detached'});await page.getByRole('button',{name:'This month',exact:true}).click();assert.equal(await page.getByRole('button',{name:'This month',exact:true}).getAttribute('aria-pressed'),'true');for(const chart of ['Registrations by species','Billed vs collected','Fee breakdown','Top vendors','Delivery pipeline','Recent invoices'])await page.getByRole('region',{name:chart,exact:true}).waitFor();assert.ok(await page.locator('.recharts-bar-rectangle').count()>0,'animal bars');assert.equal(await page.locator('.recharts-line').count(),2);assert.equal(await page.getByRole('alert').count(),0);assert.notEqual(await page.locator('.dash-hero-value').textContent(),'Unavailable');}
    if(destination==='/billing')await page.getByRole('heading',{name:`Internal bill reference: ${inv.id}`}).waitFor();
    if(destination==='/delivery')await page.getByText('Stall A',{exact:false}).first().waitFor();
    if(destination==='/users')await page.getByRole('button',{name:'Activate mobile access'}).waitFor();
    await noOverflow(destination);
    await shot(`${label}-${dark?'dark':'light'}-${tag(destination)}`);
   }
  }
 }
 assert.deepEqual(mutations,[]);assert.deepEqual(errors,[]);
 console.log('PASS: synthetic monitoring; loading, error, empty and populated states; real operations routers; desktop/phone light/dark; no mutations or runtime errors.');
} finally {await browser?.close();await server?.close();await cleanup?.();await rm(temp,{recursive:true,force:true});}
