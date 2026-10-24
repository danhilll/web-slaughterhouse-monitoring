/** Actual main/AuthGate/App with BrowserRouter and isolated Firebase/API mocks.
 * No credentials, shared services, emulator fixtures or external requests.
 * PLAYWRIGHT_MODULE / CHROMIUM_EXECUTABLE match check-workspace-ui.mjs.
 * Optional ROUTER_EVIDENCE_DIR (or PDF_EVIDENCE_DIR) retains sanitized results.
 */
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

const repo = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = await mkdtemp(path.join(repo, '.router-check-'));
const output = process.env.ROUTER_EVIDENCE_DIR || process.env.PDF_EVIDENCE_DIR;
const results = [], errors = [], unexpected = [];
let server, browser;
const routes = [
  ['/', 'Dashboard', 'Collected this'],
  ['/animals', 'Animal Register', 'Animal register'],
  ['/vendors', 'Vendors', 'Vendor directory'],
  ['/billing', 'Invoices & payments', 'Invoices & payments'],
  ['/delivery', 'Deliveries', 'Deliveries'],
  ['/users', 'Mobile Users', 'Mobile'],
  ['/notifications', 'Notifications', 'Notifications'],
  ['/invoice-history', 'All invoice records', 'ROUTER-INVOICE'],
  ['/service-computation', 'Fee summary', 'Approved fees'],
  ['/settings', 'Settings', 'Settings'],
  ['/faq', 'FAQ', 'What can each role do?']
];
const vendor = { id: 'ROUTER-VENDOR', name: 'Synthetic route business', stall_number: 'TEST', contact_number: '', address: 'Synthetic address' };
const invoice = { id: 'ROUTER-INVOICE', vendor_id: vendor.id, vendor_name: vendor.name, date_issued: '2026-10-17', due_date: '2026-10-17', number_of_heads_cow: 0, number_of_heads_pig: 1, corral_fee: 1, delivery_fee: 0, anti_mortem_fee: 1, facility_fee: 1, total_amount: 3, payment_status: 'Unpaid' };
const dashboard = { summary: { totalVendors: 1, totalRecordsToday: 0, totalRecordsThisMonth: 0, totalRevenueThisMonth: 0, unpaidInvoicesCount: 1 }, recentSlaughterRecords: [], recentInvoices: [invoice], monthlySlaughterVolume: [], feeBreakdown: [], municipality: 'Synthetic municipality' };

try {
  const firebase = path.join(fixture, 'mock-firebase.ts');
  const provider = path.join(fixture, 'mock-provider.ts');
  await writeFile(firebase, `export {auth} from './mock-provider'; export const isFirebaseConfigured=true;`);
  await writeFile(provider, `
    const key='router-check-user', listeners=new Set<any>();
    const user=(uid:string)=>({uid,emailVerified:true,email:uid+'@example.test',getIdToken:async()=> 'synthetic-'+uid});
    export const auth={currentUser:sessionStorage.getItem(key)?user(sessionStorage.getItem(key)!):null};
    export function onIdTokenChanged(_auth:any,callback:any){listeners.add(callback);queueMicrotask(()=>{if(listeners.has(callback))void callback(auth.currentUser);});return()=>listeners.delete(callback);}
    export async function signInWithEmailAndPassword(_auth:any,email:string,_password:string){const uid=email.startsWith('denied')?'DENIED':'ADMIN';sessionStorage.setItem(key,uid);auth.currentUser=user(uid);await Promise.all([...listeners].map(f=>f(auth.currentUser)));}
    export async function signOut(){sessionStorage.removeItem(key);auth.currentUser=null;await Promise.all([...listeners].map(f=>f(null)));}
    export async function sendPasswordResetEmail(){throw new Error('Password reset is outside this isolated check.');}
    export async function reload(){}
    export async function sendEmailVerification(){throw new Error('Email verification is outside this isolated check.');}
  `);
  await writeFile(path.join(fixture, 'index.html'), '<div id="root"></div><script type="module" src="/entry.tsx"></script>');
  await writeFile(path.join(fixture, 'entry.tsx'), `import ${JSON.stringify(path.join(repo, 'src/main.tsx'))};`);
  server = await createServer({
    // A private dependency cache: a shared one can be re-optimized mid-run and reload the page.
    root: fixture, configFile: path.join(repo, 'vite.config.ts'), cacheDir: path.join(fixture, 'cache'),
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repo] } },
    plugins: [{ name: 'isolated-router-auth', enforce: 'pre', resolveId(source) {
      if (source === './firebase') return firebase;
      if (source === 'firebase/auth') return provider;
    } }]
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let deniedStatus = 0, apiRequests = 0;
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin && url.protocol !== 'data:') { unexpected.push('external request'); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    apiRequests++;
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() !== 'GET') { unexpected.push('API mutation'); return reply({ message: 'No writes in route checks.' }, 405); }
    const token = request.headers().authorization;
    if (token !== 'Bearer synthetic-ADMIN') return reply({ message: 'Synthetic administrator access denied.' }, token ? 403 : 401);
    if (['/api/session', '/api/operations/settings'].includes(url.pathname) && deniedStatus) return reply({ message: 'Synthetic access revoked.' }, deniedStatus);
    if (url.pathname === '/api/session') return reply({ uid: 'ADMIN', email: 'admin@example.test', role: 'admin', writesEnabled: true });
    if (url.pathname === '/api/dashboard') return reply(dashboard);
    if (url.pathname === '/api/service-fees') return reply({ configured: true, fee_config: [] });
    if (url.pathname.endsWith('/settings')) return reply({ enabled: false, canManageAccounts: false, canDeactivate: false, canRecord: false });
    if (url.pathname === '/api/vendors') return reply({ items: [vendor], nextCursor: null });
    if (url.pathname === '/api/invoices') return reply({ items: [invoice], nextCursor: null });
    return reply({ items: [], nextCursor: null });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  const signedOut = async () => {
    await page.getByRole('button', { name: 'Sign in to workspace', exact: true }).waitFor();
    assert.equal(await page.locator('.workspace').count(), 0);
    assert.equal(await page.getByRole('navigation', { name: 'Primary' }).count(), 0);
  };
  const login = async (email = 'admin@example.test') => {
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('synthetic-placeholder');
    await page.getByRole('button', { name: 'Sign in to workspace', exact: true }).click();
  };
  const at = async (url, title) => {
    await page.waitForURL(origin + url);
    await page.getByRole('navigation', { name: 'Primary' }).waitFor();
    await page.locator('.header-breadcrumb strong').filter({ hasText: new RegExp('^' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).waitFor();
  };
  const nav = label => page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: label, exact: true });
  const pass = message => { results.push(message); console.log('PASS: ' + message); };

  await page.goto(origin + '/invoice-history?source=direct#record');
  await signedOut();
  assert.equal(apiRequests, 0);
  await login('denied@example.test');
  await page.getByRole('alert').filter({ hasText: 'no longer has web administrator access' }).waitFor();
  await signedOut();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await login();
  await at('/invoice-history?source=direct#record', 'All invoice records');
  await page.locator('#workspace-content').getByText('ROUTER-INVOICE', { exact: true }).waitFor();
  pass('anonymous deep link blocked; denied account stays outside workspace; login retains URL/query/hash');

  for (const [url, title, text] of routes) {
    await page.goto(origin + url);
    await at(url, title);
    await page.locator('#workspace-content').getByText(text, { exact: false }).first().waitFor();
    await page.reload();
    await at(url, title);
    await page.locator('#workspace-content').getByText(text, { exact: false }).first().waitFor();
  }
  pass('all eleven current routes load by direct URL and refresh through the root splat/nested Routes');

  await page.goto(origin + '/invoices'); await at('/billing', 'Invoices & payments');
  await page.goto(origin + '/statistics'); await at('/', 'Dashboard');
  pass('retired /invoices and /statistics links redirect to their current pages');

  await nav('Vendors').click(); await at('/vendors', 'Vendors');
  await page.locator('.workspace-header').evaluate(el => el.dataset.routerCheck = 'retained');
  await nav('Invoices & payments').click(); await at('/billing', 'Invoices & payments');
  await nav('Deliveries').click(); await at('/delivery', 'Deliveries');
  await page.goBack(); await at('/billing', 'Invoices & payments');
  await page.goBack(); await at('/vendors', 'Vendors');
  await page.goForward(); await at('/billing', 'Invoices & payments');
  assert.equal(await page.locator('.workspace-header').getAttribute('data-router-check'), 'retained');
  await nav('Dashboard').click(); await at('/', 'Dashboard');
  await page.getByRole('link', { name: 'Open invoices & payments →', exact: true }).click(); await at('/billing', 'Invoices & payments');
  pass('nested client navigation and dashboard links preserve layout; Back/Forward restores the expected routes');

  await page.getByRole('button', { name: 'Profile menu', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signedOut();
  const requestsAfterLogout = apiRequests;
  await page.goBack(); await signedOut();
  await page.goForward(); await signedOut();
  await page.reload(); await signedOut();
  assert.equal(apiRequests, requestsAfterLogout);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('router-check-user')), null);
  pass('normal logout removes workspace; history and refresh cannot restore it or issue protected requests');

  for (const status of [401, 403]) {
    await page.goto(origin + '/vendors'); await signedOut();
    await login(); await at('/vendors', 'Vendors');
    deniedStatus = status;
    await nav('Invoices & payments').click();
    await signedOut();
    await page.getByRole('alert').filter({ hasText: status === 401 ? 'expired or was revoked' : 'no longer has web administrator access' }).waitFor();
    await page.reload(); await signedOut();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    deniedStatus = 0;
  }
  pass('real apiFetch 401/403 access-loss events clear AuthGate and block navigation/refresh while denial persists');
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  if (output) {
    await mkdir(output, { recursive: true, mode: 0o700 });
    await page.screenshot({ path: path.join(output, 'signed-out.png') });
    await writeFile(path.join(output, 'router-results.json'), JSON.stringify({ results, pageErrors: errors, unexpected, routes: routes.map(([url]) => url) }, null, 2) + '\n', { mode: 0o600 });
  }
  await context.close();
} finally {
  await browser?.close(); await server?.close(); await rm(fixture, { recursive: true, force: true });
}
