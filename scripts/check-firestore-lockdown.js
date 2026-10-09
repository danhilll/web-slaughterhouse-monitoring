// Read-only anonymous probe. Never prints returned document data.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const projectId = process.env.FIREBASE_PROJECT_ID;
if (projectId !== 'com-slaughterhouse-app') {
  console.error('Unexpected Firebase project.');
  process.exit(1);
}

try {
  const path = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/Users/V001`;
  const response = await fetch(path, { signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (response.status === 403 && result.error?.status === 'PERMISSION_DENIED') {
    console.log('Anonymous Firestore document read denied by security rules.');
  } else {
    console.error(`Unexpected anonymous Firestore response: HTTP ${response.status}, ${result.error?.status || 'no error status'}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`Anonymous Firestore probe failed: ${error?.code || error?.message || error}`);
  process.exitCode = 1;
}
