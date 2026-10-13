import { assertEmulators, enforceLoopbackOnly, PROJECT_ID } from './safety.mjs';
import { generateKeyPairSync } from 'node:crypto';

export async function createRehearsalContext() {
  const hosts = assertEmulators();
  enforceLoopbackOnly();
  const [{ initializeApp, cert }, { getAuth }, { getFirestore }] = await Promise.all([
    import('firebase-admin/app'), import('firebase-admin/auth'), import('firebase-admin/firestore')
  ]);
  // Ephemeral synthetic key, never persisted or used against OAuth. No ADC or real key discovery.
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const app = initializeApp({ projectId: PROJECT_ID, credential: cert({ projectId: PROJECT_ID,
    clientEmail: `synthetic@${PROJECT_ID}.iam.gserviceaccount.com`, privateKey }) }, `rehearsal-${Date.now()}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  db.settings({ host: hosts.firestore.address, ssl: false });
  return { app, auth, db, hosts };
}
