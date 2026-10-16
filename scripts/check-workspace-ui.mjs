/** Browser regression check against real components, isolated mock API, no Firebase.
 * Supply Playwright from an external installation with PLAYWRIGHT_MODULE (absolute
 * path to its index.mjs), or install it in the development environment. Optionally
 * set CHROMIUM_EXECUTABLE. No live credentials or services are used.
 */
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

const repo = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = await mkdtemp(path.join(repo, '.ui-check-'));
let server, browser;
try {
  const app = path.join(repo, 'src/App.tsx');
  const auth = path.join(repo, 'src/AuthGate.tsx');
  const motion = path.join(repo, 'src/WorkspaceMotion.tsx');
  const css = path.join(repo, 'src/index.css');
  const api = path.join(fixture, 'mock-api.ts');
  const firebase = path.join(fixture, 'mock-firebase.ts');
  await writeFile(firebase, 'export const auth=null; export const isFirebaseConfigured=true;');
  await writeFile(api, `export const WEB_ACCESS_LOST_EVENT='mock-access-lost';
    const invoices=['Unpaid','Paid'].map(payment_status=>({id:'UI-'+payment_status,vendor_id:'UI-VENDOR',vendor_name:'Synthetic vendor',date_issued:'2026-10-16',due_date:'2026-10-16',number_of_heads_cow:0,number_of_heads_pig:1,corral_fee:1,delivery_fee:0,anti_mortem_fee:1,facility_fee:1,total_amount:3,payment_status}));
    export async function apiFetch(url:string) {
      const body=url.startsWith('/api/service-fees')?{fee_config:[],configured:true}:url.startsWith('/api/dashboard')?{}:{items:url.startsWith('/api/invoices')?invoices:[],nextCursor:null};
      return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
    }`);
  await writeFile(path.join(fixture, 'index.html'), '<div id="root"></div><script type="module" src="/entry.tsx"></script>');
  await writeFile(path.join(fixture, 'entry.tsx'), `import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client'; import {BrowserRouter} from 'react-router-dom';
    import App from ${JSON.stringify(app)}; import AuthGate from ${JSON.stringify(auth)};
    import {WorkspaceMotion} from ${JSON.stringify(motion)}; import ${JSON.stringify(css)};
    function Fixture(){const [signedIn,setSignedIn]=useState(true);return <WorkspaceMotion><BrowserRouter>{signedIn?<App session={{uid:'UI-CHECK',email:'ui@example.test',role:'admin',writesEnabled:true}} onLogout={async()=>setSignedIn(false)}/>:<AuthGate/>}</BrowserRouter></WorkspaceMotion>}
    createRoot(document.getElementById('root')!).render(<Fixture/>);`);
  server = await createServer({
    root: fixture,
    configFile: path.join(repo, 'vite.config.ts'),
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repo] } },
    plugins: [{ name: 'isolated-ui-api', enforce: 'pre', resolveId(source) {
      if (source === './api') return api;
      if (source === './firebase') return firebase;
    } }],
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_EXECUTABLE || undefined, args:['--no-sandbox']});
  for (const width of [1280,390]) for (const dark of [false,true]) for (const paused of [false,true]) {
    const context = await browser.newContext({viewport:{width,height:800},reducedMotion:'no-preference'});
    await context.route('**/*', route => {
      const url=new URL(route.request().url());
      return url.origin===origin || url.protocol==='data:' ? route.continue() : route.abort();
    });
    await context.addInitScript(({dark,paused})=>{
      localStorage.setItem('slaughterhouse-dark-mode',dark?'1':'0');
      localStorage.setItem('slaughterhouse-motion',paused?'paused':'enabled');
    },{dark,paused});
    const page=await context.newPage();
    const errors=[]; page.on('pageerror',e=>{errors.push(e.message);console.error('UI error:',e.message);});
    await page.goto(`${origin}/vendors`);
    await page.getByRole('button',{name:'Add Vendor',exact:true}).waitFor();
    await page.waitForTimeout(700);
    const brand = await page.getByRole('button',{name:'Add Vendor',exact:true}).evaluate(el=>{
      const style=getComputedStyle(el);return {background:style.backgroundColor,color:style.color};
    });
    assert.equal(brand.background,'rgb(194, 65, 12)');
    assert.equal(brand.color,'rgb(255, 255, 255)');
    // Header menu must remain above animated pages, including early in entrance.
    await page.getByRole('button',{name:'Profile menu'}).click();
    await page.getByRole('button',{name:'Sign out',exact:true}).click({trial:true});
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Add Vendor',exact:true}).click();
    const dialog=page.getByRole('dialog');
    await dialog.waitFor();
    await page.waitForTimeout(350);
    const geometry=await dialog.evaluate(el=>{
      const root=el.closest('.fixed'); const box=root.getBoundingClientRect();
      return {portalled:root.parentElement===document.body,top:box.top,left:box.left,width:box.width,height:box.height,motion:root.dataset.motion};
    });
    assert.equal(geometry.top,0); assert.equal(geometry.left,0);
    assert.equal(geometry.width,width); assert.equal(geometry.height,800);
    assert.equal(geometry.motion,paused?'paused':'enabled');
    await dialog.locator('input').first().fill('Synthetic UI check');
    await dialog.getByRole('button',{name:'Close',exact:true}).click();
    await dialog.waitFor({state:'detached'});
    // The centering wrapper must not swallow outside clicks.
    await page.getByRole('button',{name:'Add Vendor',exact:true}).click();
    await page.getByRole('button',{name:'Close dialog',exact:true}).click({position:{x:5,y:5}});
    await dialog.waitFor({state:'detached'});
    await page.getByRole('button',{name:'Add Vendor',exact:true}).click();
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'detached'});
    // Both theme and motion toggles remain operable after dialog dismissal.
    await page.getByRole('button',{name:dark?'Switch to light mode':'Switch to dark mode'}).click();
    await page.getByRole('button',{name:dark?'Switch to dark mode':'Switch to light mode'}).click();
    await page.getByRole('button',{name:paused?'Enable animations':'Pause animations',exact:true}).click();
    await page.getByRole('button',{name:paused?'Pause animations':'Enable animations',exact:true}).click();
    for (const [label,button] of [['Invoices','Add Invoice'],['Slaughter Records','Add Record']]) {
      if(width<1024) await page.getByRole('button',{name:'Toggle navigation'}).click();
      await page.getByRole('navigation',{name:'Primary'}).getByRole('link',{name:label,exact:true}).click();
      await page.getByRole('button',{name:button,exact:true}).click();
      await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
      await dialog.waitFor({state:'detached'});
      if (label==='Invoices' && width===1280 && !dark && !paused) {
        for (const status of ['Unpaid','Paid']) {
          await page.getByRole('button',{name:`View invoice UI-${status}`,exact:true}).click();
          const record=page.getByRole('dialog',{name:'Invoice record',exact:true});
          const printText=await record.locator('.print-area').innerText();
          assert.match(printText,/Historical record copy; not an official receipt/);
          assert.match(printText,/policies await approval/);
          assert.doesNotMatch(printText,/Official Receipt|SAME-DAY PAYMENT REQUIRED|No advance payment accepted|Treasurer Signature/);
          const downloadPromise=page.waitForEvent('download');
          await record.getByRole('button',{name:'Download PDF',exact:true}).click();
          const download=await downloadPromise;
          const chunks=[]; for await (const chunk of await download.createReadStream()) chunks.push(chunk);
          const pdf=Buffer.concat(chunks).toString('latin1');
          assert.match(pdf,/Invoice record - Slaughterhouse Service Fees/);
          assert.match(pdf,/not an official receipt/);
          assert.doesNotMatch(pdf,/Official Receipt|SAME-DAY PAYMENT REQUIRED|No advance payment accepted|Treasurer Signature/);
          await record.getByRole('button',{name:'Close',exact:true}).click();
          console.log(`PASS: ${status} invoice display/print/PDF makes no unapproved receipt or payment-policy claim`);
        }
      }
    }
    await page.getByRole('button',{name:'Profile menu'}).click();
    await page.getByRole('button',{name:'Sign out',exact:true}).click();
    await page.locator('.auth-form-panel').waitFor();
    assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('dark')),false);
    assert.equal(await page.evaluate(()=>localStorage.getItem('slaughterhouse-dark-mode')),dark?'1':'0');
    const colors=await page.locator('.auth-form-panel .input').first().evaluate(el=>{
      const s=getComputedStyle(el);return {color:s.color,background:s.backgroundColor};
    });
    const luminance=color=>{const channels=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
    const a=luminance(colors.color),b=luminance(colors.background);
    assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5, 'Login input contrast must remain readable');
    assert.deepEqual(errors,[]);
    console.log(`PASS: ${width}px, ${dark?'dark':'light'}, motion ${paused?'paused':'enabled'}: menu, dialog input/close/backdrop/Escape, toggles, logout theme`);
    await context.close();
  }
} finally {
  await browser?.close(); await server?.close(); await rm(fixture,{recursive:true,force:true});
}
