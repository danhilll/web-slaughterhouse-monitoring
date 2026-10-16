import { createRehearsalContext } from './context.mjs';
import { assertEmulators, PROJECT_ID, rehearsalCarcassWeightEnabled } from './safety.mjs';

export const DEMO_ADMIN_UID = 'ALL-ROLE-DEMO-WEB-ADMIN';
const email = 'web-admin@rehearsal.example.test';

// Run before opening listeners. Preserve mode has no provisioning fallback.
export async function prepareWebDemo({ args = process.argv.slice(2), env = process.env,
  createContext = createRehearsalContext } = {}) {
  const hosts = assertEmulators(env);
  const validHosts = value => value?.projectId === PROJECT_ID &&
    value.auth?.address === '127.0.0.1:9199' && value.firestore?.address === '127.0.0.1:8180';
  if (!validHosts(hosts)) throw Error('Use the documented rehearsal ports.');
  const carcassWeightEnabled = rehearsalCarcassWeightEnabled(args, env);
  const context = await createContext(); // Installs the loopback-only network guard before SDK imports.
  if (!validHosts(context.hosts)) throw Error('Use the documented demo project and rehearsal ports.');
  if (args.includes('--preserve-fixtures')) {
    let user;
    try { user = await context.auth.getUser(DEMO_ADMIN_UID); }
    catch (error) {
      throw Error(error?.code === 'auth/user-not-found'
        ? 'Preserve-fixtures prerequisite missing: reserved demo administrator. No fixtures were provisioned.'
        : 'Preserve-fixtures prerequisite unavailable: cannot read reserved demo administrator.');
    }
    // Web access uses this exact UID allowlist, not custom claims or a membership document.
    if (user.uid !== DEMO_ADMIN_UID || user.email !== email || user.disabled !== false ||
        user.emailVerified !== true || !user.providerData?.some(provider =>
          provider.providerId === 'password' && provider.email === email)) {
      throw Error('Preserve-fixtures prerequisite conflict: reserved administrator must have the expected UID/email, be enabled and verified, and have the existing password provider.');
    }
  } else {
    // Preserve the historical provisioning behavior for callers without the flag.
    try { await context.auth.createUser({ uid: DEMO_ADMIN_UID, email,
      password: 'Synthetic-only-42!', emailVerified: true }); }
    catch (error) {
      if (error.code !== 'auth/uid-already-exists') throw error;
      const user = await context.auth.getUser(DEMO_ADMIN_UID);
      if (user.email !== email || user.disabled) throw Error('Reserved demo administrator requires review.');
    }
  }
  return { context, carcassWeightEnabled, uid: DEMO_ADMIN_UID };
}
