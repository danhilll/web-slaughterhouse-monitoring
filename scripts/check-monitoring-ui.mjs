// Synthetic adapter only: all requests are intercepted, no production connection.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium} from 'playwright';
const repo=fileURLToPath(new URL('../',import.meta.url));
const temp=await mkdtemp(path.join(repo,'.monitor-test-'));
const evidence=process.env.MONITOR_EVIDENCE_DIR||path.join(repo,'.monitor-evidence');
let server,browser;
try {
 await mkdir(evidence,{recursive:true});
 const api=path.join(temp,'api.ts');
 await writeFile(api,`export const WEB_ACCESS_LOST_EVENT='synthetic-access-lost';export const EMAIL_VERIFICATION_REQUIRED='synthetic-verification';export const apiFetch=(url:string,init?:RequestInit)=>fetch(url,init);`);
 await writeFile(path.join(temp,'index.html'),'<div id="root"></div><script type="module" src="/entry.tsx"></script>');
 await writeFile(path.join(temp,'entry.tsx'),`import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import App from${JSON.stringify(path.join(repo,'src/App.tsx'))};import{WorkspaceMotion}from${JSON.stringify(path.join(repo,'src/WorkspaceMotion.tsx'))};import${JSON.stringify(path.join(repo,'src/index.css'))};createRoot(document.getElementById('root')!).render(<WorkspaceMotion><BrowserRouter><App session={{uid:'SYNTHETIC',email:'test@example.test',role:'admin',writesEnabled:true}} onLogout={async()=>{}}/></BrowserRouter></WorkspaceMotion>);`);
 server=await createServer({root:temp,configFile:false,plugins:[react(),{name:'synthetic-api',enforce:'pre',resolveId(s){if(s==='./api')return api;}}],server:{host:'127.0.0.1',port:0,fs:{allow:[repo,await realpath(path.join(repo,'node_modules'))]}}});
 await server.listen();
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
 const page=await browser.newPage();const errors=[],mutations=[];
 page.on('pageerror',e=>errors.push(String(e)));
 const now=new Date().toISOString();
 const invoice={id:'AINV-SYNTHETIC',date_issued:now.slice(0,10),total_amount:95,payment_status:'Paid',payment:{recordedAt:now,amountCents:9500},delivery:{status:'delivered',deliveredAt:now}};
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()!=='GET')mutations.push([request.method(),url.pathname]);
  let body={items:[],nextCursor:null};
  if(url.pathname==='/api/animals')body={items:[{id:'ANM-SYNTHETIC',createdAt:now}],nextCursor:null};
  if(url.pathname==='/api/invoices')body={items:[invoice],nextCursor:null};
  if(url.pathname==='/api/service-fees')body={fee_config:[],configured:true};
  if(url.pathname==='/api/operations/settings')body={feeSchedule:{version:1,corralCents:1500,deliveryCents:2500,inspectionCents:1000,facilityCents:4500}};
  if(url.pathname==='/api/vendors')body={items:[{id:'VEN-SYNTHETIC',name:'Synthetic Market Vendor',address:'Sample stall',status:'Active'}],nextCursor:null};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 const origin='http://127.0.0.1:'+server.httpServer.address().port;
 for(const [label,width,height] of [['desktop',1440,1000],['phone',390,844]]) {
  await page.setViewportSize({width,height});
  for(const dark of [false,true]) {
   await page.goto(origin+'/settings');
   const desired=dark?'Use dark theme':'Use light theme';
   if(await page.getByRole('button',{name:desired,exact:true}).count())await page.getByRole('button',{name:desired,exact:true}).click();
   for(const destination of ['/','/vendors','/animals','/billing','/delivery','/users','/notifications','/invoice-history','/service-computation','/faq','/settings']) {
    await page.goto(origin+destination);
    await page.locator('h1').waitFor();
    if(destination==='/') {await page.getByText('Loading…',{exact:true}).first().waitFor({state:'detached'});await page.getByRole('button',{name:'Week',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Week'}).getAttribute('aria-pressed'),'true');}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow '+destination);
    await page.screenshot({path:path.join(evidence,`${label}-${dark?'dark':'light'}-${destination.replaceAll('/','')||'overview'}.png`),fullPage:true});
   }
  }
 }
 assert.deepEqual(mutations,[]);assert.deepEqual(errors,[]);
 console.log('PASS: synthetic monitoring, period selection, desktop/phone light/dark, no mutations or runtime errors.');
} finally {await browser?.close();await server?.close();await rm(temp,{recursive:true,force:true});}
