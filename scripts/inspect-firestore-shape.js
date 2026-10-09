// Read-only inventory of database edition, collection names, and field shapes.
// Never prints field values or document IDs.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
  console.error('Set FIREBASE_PROJECT_ID before inspecting Firestore.');
  process.exit(1);
}

try {
  const credential = applicationDefault();
  const app = getApps()[0] || initializeApp({ credential, projectId });
  const db = getFirestore(app);

  const token = (await credential.getAccessToken()).access_token;
  const info = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000)
  });
  if (info.ok) {
    const metadata = await info.json();
    console.log(`Database edition: ${metadata.databaseEdition || 'unknown'}; location: ${metadata.locationId || 'unknown'}`);
  } else {
    console.log(`Database edition: unavailable (HTTP ${info.status})`);
  }

  const fieldType = (value) => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (value?.constructor?.name === 'Timestamp') return 'timestamp';
    if (value?.constructor?.name === 'GeoPoint') return 'geopoint';
    return typeof value === 'object' ? 'map' : typeof value;
  };
  const collections = await db.listCollections();
  for (const collection of collections) {
    const sample = await collection.limit(50).get();
    const fields = new Map();
    const shapes = new Map();
    const childNames = new Set();
    for (const doc of sample.docs) {
      const data = doc.data();
      const shape = Object.keys(data).sort().join(', ') || '(empty)';
      shapes.set(shape, (shapes.get(shape) || 0) + 1);
      for (const [name, value] of Object.entries(data)) {
        const typedName = `${name}:${fieldType(value)}`;
        fields.set(typedName, (fields.get(typedName) || 0) + 1);
      }
      const children = await doc.ref.listCollections();
      children.forEach((child) => childNames.add(child.id));
    }
    console.log(`${collection.id}: sampled=${sample.size}${sample.size === 50 ? ' (limit reached)' : ''}; sample subcollections=${[...childNames].sort().join(', ') || '(none)'}`);
    console.log(`  fields: ${[...fields.entries()].sort().map(([field, count]) => `${field} (${count})`).join(', ') || '(none)'}`);
    for (const [shape, count] of shapes) console.log(`  shape (${count}): ${shape}`);
  }
  if (collections.length === 0) console.log('No root collections found.');
} catch (error) {
  console.error(`Firestore shape inspection failed: ${error?.code || error?.message || error}`);
  process.exitCode = 1;
}
