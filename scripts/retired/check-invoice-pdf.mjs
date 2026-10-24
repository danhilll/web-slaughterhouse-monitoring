/** Actual invoice download regression, isolated mock data/API; no Firebase or existing services.
 * Use PLAYWRIGHT_MODULE / CHROMIUM_EXECUTABLE as in check-workspace-ui.mjs.
 * PDF_EVIDENCE_DIR optionally selects the ignored output directory for PDFs/screenshots/results.
 */
import assert from 'node:assert/strict';
import { writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
const repo = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.PDF_EVIDENCE_DIR || path.join(repo, '.rehearsal-runtime', `pdf-layout-${Date.now()}`);
await mkdir(output, { recursive: true, mode: 0o700 });
const fixture = await mkdtemp(path.join(repo, '.pdf-layout-ui-'));
const common = { vendor_id: 'SYNTHETIC-VENDOR', date_issued: '2026-10-17', due_date: '2026-10-18',
  number_of_heads_cow: 2, number_of_heads_pig: 3, corral_fee: 100, delivery_fee: 200,
  anti_mortem_fee: 300, facility_fee: 400, total_amount: 1000 };
const address = ('SYNTHETIC ADDRESS: Rizal Avenue, Barangay Test, Calauag, Quezon; ').repeat(6).slice(0, 300);
const notes = Array.from({ length: 100 }, (_, i) => `SYNTHETIC NOTE ${String(i + 1).padStart(3, '0')}: delivery instructions only; no payment confirmation.`).join('\n');
const invoices = [
  { ...common, id: 'PDF-LONG', vendor_name: ('SYNTHETIC Calauag Community Livestock Cooperative Association Market Services ').repeat(2).slice(0, 120), payment_status: 'Unpaid', notes },
  // Deliberately beyond onboarding limits: preserved/legacy multiline text must also paginate safely.
  { ...common, id: 'PDF-MULTIPAGE', vendor_name: Array.from({ length: 85 }, (_, i) => `SYNTHETIC BUSINESS LINE ${i + 1}`).join('\n'), payment_status: 'Paid', notes },
  { ...common, id: 'PDF-LATIN', vendor_name: 'SYNTHETIC Peña Muñoz café — “Market”', payment_status: 'Unpaid', notes: 'Résumé • €10; historical text only.' },
  { ...common, id: 'PDF-UNICODE', vendor_name: 'SYNTHETIC Peña — 中文 العربية 🐖', payment_status: 'Unpaid', notes: 'Original unsupported text must remain on screen.' }
];
const api = path.join(fixture, 'mock-api.ts'), firebase = path.join(fixture, 'mock-firebase.ts');
await writeFile(path.join(output, 'inputs.json'), JSON.stringify({ address, invoices }, null, 2));
await writeFile(firebase, 'export const auth=null; export const isFirebaseConfigured=true;');
await writeFile(api, `export const WEB_ACCESS_LOST_EVENT='mock-access-lost'; const invoices=${JSON.stringify(invoices)};
 const vendors=[{id:'SYNTHETIC-VENDOR',name:invoices[0].vendor_name,address:${JSON.stringify(address)},status:'Active',animal_type:'Both'}];
 export async function apiFetch(url){const body=url.startsWith('/api/dashboard')?{}:url.startsWith('/api/service-fees')?{fee_config:[],configured:true}:{items:url.startsWith('/api/invoices')?invoices:url.startsWith('/api/vendors')?vendors:[],nextCursor:null};return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});}`);
await writeFile(path.join(fixture, 'index.html'), '<div id="root"></div><script type="module" src="/entry.tsx"></script>');
await writeFile(path.join(fixture, 'entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import App from ${JSON.stringify(path.join(repo, 'src/App.tsx'))};import ${JSON.stringify(path.join(repo, 'src/index.css'))};createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/invoices']}><App session={{uid:'SYNTHETIC',email:'synthetic@example.test',role:'admin',writesEnabled:false}} onLogout={async()=>{}}/></MemoryRouter>);`);
let server, browser;
const results = [];
try {
  server = await createServer({ root: fixture, configFile: path.join(repo, 'vite.config.ts'),
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repo] } },
    plugins: [{ name: 'isolated-pdf-api', enforce: 'pre', resolveId(source) {
      if (source === './api') return api;
      if (source === './firebase') return firebase;
    } }] });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [], downloads = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('download', download => downloads.push(download));
  await page.goto(origin);
  for (const row of invoices) {
    await page.getByRole('button', { name: `View invoice ${row.id}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Invoice record', exact: true }); await dialog.waitFor();
    if (row.id === 'PDF-UNICODE') {
      const count = downloads.length;
      await dialog.getByRole('button', { name: 'Download PDF', exact: true }).click();
      const alert = dialog.getByRole('alert'); await alert.waitFor();
      assert.match(await alert.innerText(), /unsupported text.*U\+4E2D/);
      assert.match(await alert.innerText(), /No PDF was downloaded/);
      assert.ok((await dialog.innerText()).includes(row.vendor_name));
      assert.equal(downloads.length, count);
      await alert.screenshot({ path: path.join(output, 'unsupported-text-alert.png') });
      results.push({ case: row.id, result: 'PASS', downloadBlocked: true, originalTextPreserved: true });
    } else {
      const pending = page.waitForEvent('download');
      await dialog.getByRole('button', { name: 'Download PDF', exact: true }).click();
      const download = await pending;
      assert.equal(download.suggestedFilename(), `${row.id}.pdf`);
      const chunks = []; for await (const chunk of await download.createReadStream()) chunks.push(chunk);
      const bytes = Buffer.concat(chunks), pdf = bytes.toString('latin1');
      assert.match(pdf, /^%PDF-1\.[0-9]/); assert.match(pdf, /%%EOF\s*$/);
      assert.ok(pdf.includes(`TOTAL: PHP 1,000.00   [${row.payment_status}]`));
      assert.ok(pdf.includes('Business address'));
      assert.ok(pdf.includes('not an official receipt'));
      assert.doesNotMatch(pdf, /\/JavaScript\b|\/JS\b|\/Launch\b|SAME-DAY PAYMENT REQUIRED|No advance payment accepted/);
      const pages = [...pdf.matchAll(/\/Type \/Page\b/g)].length;
      if (row.id !== 'PDF-LATIN') { assert.ok(pages >= 3); assert.ok(pdf.includes('SYNTHETIC NOTE 100:')); }
      await writeFile(path.join(output, `${row.id}.pdf`), bytes, { mode: 0o600 });
      results.push({ case: row.id, result: 'PASS', pages, status: row.payment_status });
    }
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), results, pageErrors: errors }, null, 2));
  console.log(JSON.stringify({ output, results }));
} finally {
  await browser?.close(); await server?.close(); await rm(fixture, { recursive: true, force: true });
}
