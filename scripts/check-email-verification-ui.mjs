/** Focused actual AuthGate/apiFetch browser checks. Firebase and API are mocked;
 * no credentials, shared services, account/fixture writes, or external requests.
 * Uses the external Playwright configuration documented in WORKSPACE_UI_CHECK.md.
 */
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repo = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = await mkdtemp(path.join(repo, '.email-policy-check-'));
let browser, server;
const errors = [], external = [];
try {
  const provider = path.join(fixture, 'provider.ts'), firebase = path.join(fixture, 'firebase.ts'), app = path.join(fixture, 'workspace.tsx');
  await writeFile(firebase, `export {auth} from './provider'; export const isFirebaseConfigured=true;`);
  await writeFile(app, `import {UsersPage} from ${JSON.stringify(path.join(repo,'src/UsersPage.tsx'))}; export default function Workspace({onLogout}:any){return <main><h1>Authorized workspace sentinel</h1><button onClick={onLogout}>Normal logout</button><UsersPage/></main>}`);
  await writeFile(provider, `
    const listeners=new Set<any>();
    const state=(globalThis as any).__emailPolicy={verificationRequests:0,resetRequests:[],forceRefreshes:0,verifiedAtProvider:false,claimed:false,resetError:'',reloadError:false};
    const user=(email:string)=>({uid:email.startsWith('admin')?'ADMIN':'MOBILE',email,emailVerified:email.startsWith('admin'),getIdToken:async(force=false)=>{if(force){state.forceRefreshes++;state.claimed=auth.currentUser?.emailVerified===true;}return state.claimed?'verified':'unverified';}});
    export const auth:any={currentUser:null};
    export function onIdTokenChanged(_auth:any,callback:any){listeners.add(callback);queueMicrotask(()=>{if(listeners.has(callback))void callback(auth.currentUser);});return()=>listeners.delete(callback);}
    export async function signInWithEmailAndPassword(_auth:any,email:string,_password:string){auth.currentUser=user(email);state.claimed=auth.currentUser.emailVerified;await Promise.all([...listeners].map(f=>f(auth.currentUser)));}
    export async function signOut(){auth.currentUser=null;await Promise.all([...listeners].map(f=>f(null)));}
    export async function sendEmailVerification(target:any){if(target!==auth.currentUser)throw Error('wrong user');state.verificationRequests++;}
    export async function reload(target:any){if(state.reloadError)throw Error('Synthetic failure');target.emailVerified=state.verifiedAtProvider;}
    export async function sendPasswordResetEmail(_auth:any,email:string){state.resetRequests.push(email);if(state.resetError)throw {code:state.resetError};}
  `);
  await writeFile(path.join(fixture, 'index.html'), '<div id="root"></div><script type="module" src="/entry.tsx"></script>');
  await writeFile(path.join(fixture, 'entry.tsx'), `import ${JSON.stringify(path.join(repo,'src/main.tsx'))};`);
  server = await createServer({ root: fixture, configFile: path.join(repo,'vite.config.ts'), resolve:{dedupe:['react','react-dom']}, optimizeDeps:{include:['react','react-dom/client','react-router-dom','lucide-react']}, server: { host:'127.0.0.1', port:0, fs:{allow:[repo]} },
    plugins:[{name:'isolated-email-policy',enforce:'pre',resolveId(source,importer){
      if(source==='firebase/auth')return provider;
      if(source==='./firebase')return firebase;
      if(source==='./App'&&importer?.endsWith('/src/AuthGate.tsx'))return app;
    }}] });
  await server.listen();
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
  const context=await browser.newContext();let apiCalls=0, vendorStatus='pending';
  const vendor={uid:'VENDOR',fullName:'Synthetic vendor',email:'vendor@example.test',role:'vendor',status:'pending',invitationStatus:'sent',vendorBusinessId:'BUSINESS'};
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin&&url.protocol!=='data:'){external.push('external request');return route.abort();}
    if(!url.pathname.startsWith('/api/'))return route.continue();
    apiCalls++;
    const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(url.pathname.startsWith('/api/accounts')) {
      assert.equal(request.headers().authorization,'Bearer verified');
      if(url.pathname==='/api/accounts/settings')return reply({enabled:true,canManageAccounts:true,canDeactivate:true,canActivateAccounts:true,municipalScopeId:'SCOPE',municipalityName:'Synthetic municipality'});
      if(url.pathname==='/api/accounts/vendors')return reply({items:[],nextCursor:null});
      if(url.pathname==='/api/accounts/VENDOR/activate'){
        assert.equal(request.method(),'POST');assert.deepEqual(request.postDataJSON(),{});vendorStatus='active';
        return reply({message:'Membership approved. Email verification remains required.'});
      }
      assert.equal(url.pathname,'/api/accounts');assert.equal(request.method(),'GET');
      return reply({items:[{...vendor,status:vendorStatus}],nextCursor:null});
    }
    assert.equal(request.method(),'GET');assert.equal(url.pathname,'/api/session');
    const verified=request.headers().authorization==='Bearer verified';
    const page=context.pages()[0],uid=await page.evaluate(()=>globalThis.__emailPolicyUid||'MOBILE');
    return route.fulfill({status:!verified||uid!=='ADMIN'?403:200,contentType:'application/json',body:JSON.stringify(!verified?{code:'EMAIL_VERIFICATION_REQUIRED',message:'Verify your email address before accessing this service.'}:uid!=='ADMIN'?{message:'This account does not have web administrator access.'}:{uid:'ADMIN',email:'admin@example.test',role:'admin',writesEnabled:false})});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/users');
  const button=name=>page.getByRole('button',{name,exact:true});
  await page.getByLabel('Email',{exact:true}).fill('mobile@example.test');
  await button('Reset Firebase password').click();
  await page.getByRole('status').filter({hasText:'If this email belongs'}).waitFor();
  await page.evaluate(()=>{globalThis.__emailPolicy.resetError='auth/user-not-found';});
  await button('Reset Firebase password').click();
  await page.getByRole('status').filter({hasText:'If this email belongs'}).waitFor();
  await page.evaluate(()=>{globalThis.__emailPolicy.resetError='auth/too-many-requests';});
  await button('Reset Firebase password').click();
  await page.getByRole('alert').filter({hasText:'Too many reset requests'}).waitFor();
  await page.getByLabel('Password',{exact:true}).fill('synthetic-placeholder');
  await button('Sign in to workspace').click();
  await page.getByRole('region',{name:'Email verification',exact:true}).waitFor();
  assert.equal(apiCalls,0);
  await button('Send verification email').click();
  await page.getByRole('status').filter({hasText:'delivery is not guaranteed'}).waitFor();
  assert.equal(await page.evaluate(()=>globalThis.__emailPolicy.verificationRequests),1);
  await button('I verified my email — check again').click();
  await page.getByRole('status').filter({hasText:'still unverified'}).waitFor();
  assert.equal(apiCalls,0);
  await page.evaluate(()=>{globalThis.__emailPolicy.reloadError=true;});
  await button('I verified my email — check again').click();
  await page.getByRole('alert').filter({hasText:'Could not complete email verification'}).waitFor();
  assert.equal(apiCalls,0);
  await page.evaluate(()=>{globalThis.__emailPolicy.reloadError=false;globalThis.__emailPolicy.verifiedAtProvider=true;});
  await button('I verified my email — check again').click();
  await page.getByRole('alert').filter({hasText:'no longer has web administrator access'}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Authorized workspace sentinel'}).count(),0);
  assert.ok(await page.evaluate(()=>globalThis.__emailPolicy.forceRefreshes>=2));
  await button('Sign out').click();
  await page.evaluate(()=>{globalThis.__emailPolicyUid='ADMIN';});
  await page.getByLabel('Email',{exact:true}).fill('admin@example.test');
  await page.getByLabel('Password',{exact:true}).fill('synthetic-placeholder');
  await button('Sign in to workspace').click();
  await page.getByRole('heading',{name:'Authorized workspace sentinel'}).waitFor();
  const vendorCard=page.locator('article').filter({has:page.getByText('vendor@example.test',{exact:true})});
  await vendorCard.waitFor();assert.match(await vendorCard.innerText(),/vendor · pending/);
  assert.equal(await page.locator('input[type=password]').count(),0);
  page.once('dialog',async dialog=>{assert.match(dialog.message(),/Email verification remains required/);await dialog.accept();});
  await vendorCard.getByRole('button',{name:'Activate mobile access',exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('article')].some(el=>el.textContent?.includes('vendor@example.test')&&el.textContent.includes('vendor · active')));
  await button('Normal logout').click();
  await button('Sign in to workspace').waitFor();
  assert.equal(await page.getByRole('heading',{name:'Authorized workspace sentinel'}).count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: unverified sign-in blocked without API/data reads; resend; still-unverified and failed refresh; forced token renewal; verified non-admin denial; authorized admin; explicit vendor approval UI without password fields; normal logout; official reset request, enumeration-safe response and throttling. Mock-only, no mailbox/device acceptance.');
  await context.close();
} finally { await browser?.close();await server?.close();await rm(fixture,{recursive:true,force:true}); }
