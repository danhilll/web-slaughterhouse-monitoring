import { assertEmulators, enforceLoopbackOnly, PROJECT_ID } from './safety.mjs';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const hosts = assertEmulators();
const toolsPath = process.env.FIREBASE_TOOLS_PATH;
const jar = process.env.FIRESTORE_EMULATOR_JAR;
if (!toolsPath || !existsSync(join(toolsPath, 'lib/emulator/auth/server.js'))) throw new Error('Set FIREBASE_TOOLS_PATH to installed firebase-tools 15.33.0');
if (JSON.parse(readFileSync(join(toolsPath, 'package.json'), 'utf8')).version !== '15.33.0') throw new Error('Rehearsal requires firebase-tools 15.33.0; review internal Auth API before upgrading');
if (!jar || !existsSync(jar)) throw new Error('Set FIRESTORE_EMULATOR_JAR to the downloaded Firestore 1.22.0 jar');
// Separate CLI config store prevents reading a Firebase user login; no Firebase CLI entry point is executed.
const runtime = resolve('.rehearsal-runtime');
mkdirSync(runtime, { recursive: true });
process.env.XDG_CONFIG_HOME = join(runtime, 'empty-cli-config');
enforceLoopbackOnly();
const { createApp } = await import(pathToFileURL(join(toolsPath, 'lib/emulator/auth/server.js')).href);
const authApp = await createApp(PROJECT_ID, 2); // Single-project ERROR mode.
const auth = authApp.listen(hosts.auth.port, hosts.auth.host);
await new Promise((ready, reject) => { auth.once('listening', ready); auth.once('error', reject); });
const java = spawn(process.env.REHEARSAL_JAVA || 'java', ['-jar', resolve(jar), '--host', hosts.firestore.host,
  '--port', String(hosts.firestore.port), '--project_id', PROJECT_ID, '--single_project_mode', 'true',
  '--rules', fileURLToPath(new URL('./firestore.rules', import.meta.url))],
  { stdio: 'inherit', windowsHide: true, cwd: runtime });
java.on('exit', (code) => { auth.close(); process.exitCode = code || 0; });
java.on('error', (failure) => { console.error(failure.message); auth.close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { java.kill(); auth.close(); });
console.log(`Demo-only Auth listening at ${hosts.auth.address}; Firestore starting at ${hosts.firestore.address}`);
