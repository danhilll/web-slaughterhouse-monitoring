import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const projectId = process.env.FIREBASE_PROJECT_ID;
const uid = String(process.env.WEB_ADMIN_UIDS || '').split(',')[0]?.trim();
if (!projectId || !uid) {
  console.error('Set FIREBASE_PROJECT_ID and WEB_ADMIN_UIDS before checking Firebase.');
  process.exit(1);
}

try {
  const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId });
  const [feeDoc, user] = await Promise.all([
    getFirestore(app).doc('config/serviceFees').get(),
    getAuth(app).getUser(uid)
  ]);
  console.log(`Firestore reachable: ${projectId}`);
  console.log(`Service fee document exists: ${feeDoc.exists}`);
  console.log(`Selected admin account exists: ${user.uid === uid}`);
  console.log(`Selected admin account enabled: ${!user.disabled}`);
} catch (error) {
  console.error(`Firebase connection check failed: ${error?.code || error?.message || error}`);
  process.exitCode = 1;
}
