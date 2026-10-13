import { createRehearsalContext } from './context.mjs';
import { seed } from './fixtures.mjs';

export async function startRehearsal({ seedData = true, port = 5002 } = {}) {
  const context = await createRehearsalContext();
  if (seedData) await seed(context);
  const [{ default: express }, { createMobileRouter, createMobileFirestoreStore }] = await Promise.all([
    import('express'), import('../server/mobile.js')
  ]);
  const app = express();
  app.use('/api/mobile', createMobileRouter({ getAuth: () => context.auth,
    store: createMobileFirestoreStore(() => context.db) }));
  // Rehearsal control exists only here, never on the production Express server.
  app.get('/rehearsal/health', (req, res) => res.json({ projectId: context.hosts.projectId, syntheticOnly: true }));
  // Inject a temporary invalid canonical record into this demo database to rehearse real error UI.
  app.post('/rehearsal/schema-error/:enabled', async (req, res) => {
    try {
      if (req.params.enabled === 'true') await context.db.doc('invoices/INV-VEN-A-001').update({ total_amount: 'invalid-synthetic-value' });
      else await context.db.doc('invoices/INV-VEN-A-001').update({ total_amount: 95 });
      res.json({ syntheticOnly: true });
    } catch { res.status(503).json({ code: 'unavailable' }); }
  });
  const server = app.listen(port, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  return { ...context, server, origin: `http://127.0.0.1:${server.address().port}` };
}

if (process.argv.includes('--serve')) {
  const runtime = await startRehearsal();
  console.log(`Demo-only mobile API listening at ${runtime.origin}; synthetic fixtures ready`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
    runtime.server.close(); await runtime.db.terminate(); process.exit(0);
  });
}
