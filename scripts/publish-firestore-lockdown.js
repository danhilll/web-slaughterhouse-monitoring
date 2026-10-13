// One-time, guarded deployment for the temporary Firestore client lockdown.
// Run with --publish only after the owner has approved blocking direct clients.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getSecurityRules } from 'firebase-admin/security-rules';

const root = new URL('../', import.meta.url);
const envPath = fileURLToPath(new URL('.env', root));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const projectId = process.env.FIREBASE_PROJECT_ID;
const rulesPath = fileURLToPath(new URL('firestore.rules', root));
const backupPath = fileURLToPath(new URL('.firestore-rules-backup.local.json', root));
const publish = process.argv.includes('--publish');

if (projectId !== 'com-slaughterhouse-app') {
  console.error('Refusing to manage rules for an unexpected Firebase project.');
  process.exit(1);
}

try {
  const source = readFileSync(rulesPath, 'utf8');
  if (!/allow read, write: if false;/.test(source) || /allow\s+\w+(?:,\s*\w+)?:\s*if\s+(?!false\s*;)/.test(source)) {
    throw new Error('The local rules are not the expected deny-all lockdown.');
  }

  const app = initializeApp({ credential: applicationDefault(), projectId });
  const rules = getSecurityRules(app);
  const previous = await rules.getFirestoreRuleset();
  const previousSource = previous.source.map((file) => file.content).join('\n');
  if (previousSource.trim() === source.trim()) {
    console.log('The deployed Firestore rules already match the local lockdown.');
    process.exit(0);
  }
  if (!previousSource.includes('request.time < timestamp.date(2026, 10, 18)')) {
    throw new Error('Deployed rules differ from the reviewed public rule; inspect before publishing.');
  }

  if (!publish) {
    console.log('Reviewed public rule is still deployed. Pass --publish to back it up, validate, and release the lockdown.');
    process.exit(0);
  }
  if (existsSync(backupPath)) {
    throw new Error('A local rules backup already exists; inspect it before retrying.');
  }

  writeFileSync(backupPath, JSON.stringify({ projectId, ruleset: previous.name, source: previous.source }, null, 2), {
    flag: 'wx',
    mode: 0o600
  });
  console.log('Saved the currently deployed rules to a Git-ignored local backup.');

  // The Rules API validates syntax and semantics when it creates a ruleset.
  // Creating a ruleset does not deploy it; release is a separate call.
  const file = rules.createRulesFileFromSource('firestore.rules', source);
  const candidate = await rules.createRuleset(file);
  if (candidate.source.length !== 1 || candidate.source[0].content.trim() !== source.trim()) {
    throw new Error('The validated ruleset source differs from the local file; nothing was released.');
  }
  console.log('The Firebase Rules API accepted the lockdown ruleset.');

  await rules.releaseFirestoreRuleset(candidate.name);
  const current = await rules.getFirestoreRuleset();
  if (current.name !== candidate.name || current.source[0]?.content.trim() !== source.trim()) {
    throw new Error('Release verification did not match the validated ruleset.');
  }
  console.log(`Verified Firestore rules release: ${current.name}`);
} catch (error) {
  console.error(`Firestore rules operation failed: ${error?.code || error?.message || error}`);
  process.exitCode = 1;
}
