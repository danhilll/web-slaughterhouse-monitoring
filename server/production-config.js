import {operationsPolicyApproved,carcassPolicyApproved} from './production-policy.js';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const features = ['accountManagement','activation','animals','inspection','carcass','billing','payment','delivery','tracking'];
const operationFeatures = ['billing','payment','delivery','tracking'];
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const reject = message => { throw new Error(`Production configuration: ${message}`); };

// A real project cannot opt into the rehearsal path by omitting NODE_ENV.
export function loadProductionConfig(env = process.env, read = path => JSON.parse(readFileSync(path, 'utf8'))) {
  const production = env.NODE_ENV === 'production' || Boolean(env.PRODUCTION_RELEASE_MANIFEST) ||
    Boolean(env.FIREBASE_PROJECT_ID && !env.FIREBASE_PROJECT_ID.startsWith('demo-'));
  if (!production) return null;
  if (!env.PRODUCTION_RELEASE_MANIFEST) reject('PRODUCTION_RELEASE_MANIFEST is required.');
  let manifest;
  try { manifest = read(env.PRODUCTION_RELEASE_MANIFEST); } catch { reject('release manifest cannot be read.'); }
  if (!manifest || manifest.version !== 1 || manifest.mode !== 'production') reject('unsupported release manifest.');
  const { projectId, municipalScopeId, apiOrigin } = manifest;
  if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId) || projectId.startsWith('demo-') || !identifier(municipalScopeId)) reject('exact real project and municipal scope are required.');
  for (const key of ['FIREBASE_PROJECT_ID','VITE_FIREBASE_PROJECT_ID']) if (env[key] !== projectId) reject(`${key} must match the manifest.`);
  for (const key of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT']) if (env[key] && env[key] !== projectId) reject(`${key} must match the manifest.`);
  if (env.MUNICIPAL_SCOPE_ID !== municipalScopeId) reject('MUNICIPAL_SCOPE_ID must match the manifest.');
  if (Object.keys(env).some(key => key.endsWith('_EMULATOR_HOST') && env[key])) reject('emulator hosts are forbidden.');
  let origin;
  try { origin = new URL(apiOrigin); } catch { reject('approved HTTPS API origin is required.'); }
  if (origin.protocol !== 'https:' || origin.origin !== apiOrigin || origin.username || origin.password ||
      origin.hostname === 'localhost' || origin.hostname.endsWith('.localhost') || origin.hostname === '[::1]' || /^127\./.test(origin.hostname)) reject('approved HTTPS API origin is required.');
  const configured = manifest.features === undefined ? {} : manifest.features;
  if (env.CORS_ORIGIN && env.CORS_ORIGIN !== apiOrigin) reject('CORS_ORIGIN must match the approved API origin for this same-origin release.');
  if (!configured || typeof configured !== 'object' || Array.isArray(configured) || Object.keys(configured).some(key => !features.includes(key))) reject('unknown feature configuration.');
  const effective = Object.fromEntries(features.map(key => {
    if (configured[key] !== undefined && typeof configured[key] !== 'boolean') reject(`feature ${key} must be boolean.`);
    return [key, configured[key] === true];
  }));
  const ownerOperationsApproved=operationsPolicyApproved(manifest.policies?.operations);
  if(operationFeatures.some(key=>effective[key])&&!ownerOperationsApproved)reject('matching approved owner operations policy is required; corrections remain disabled and AINV is an internal bill reference only.');
  const carcassDefinitionApproved=carcassPolicyApproved(manifest.policies?.carcassDefinition);
  if(effective.carcass&&!carcassDefinitionApproved)reject('approved owner-local Pig/Cow definition including head/hide/feet and excluding organs is required; collection choice stays separate.');
  if (effective.accountManagement && !env.VITE_FIREBASE_API_KEY?.trim()) reject('invitation API key is required for account management.');
  const master = env.CURSOR_SIGNING_SECRET;
  if (typeof master !== 'string' || Buffer.byteLength(master.trim()) < 32 || Buffer.byteLength(master) > 4096 || /^(placeholder|change.?me|example)/i.test(master)) reject('CURSOR_SIGNING_SECRET must be a stable server-only secret of at least 32 bytes.');
  const cursorSecret = domain => createHmac('sha256', master).update(`municipal-api/cursor/v1/${domain}`).digest();
  return Object.freeze({ projectId, municipalScopeId, apiOrigin, features: Object.freeze(effective), carcassDefinitionApproved, ownerOperationsApproved, cursorSecret });
}

export function assertProductionProject(config, projectId) {
  if (config && projectId !== config.projectId) reject('connected Firestore project does not match the manifest.');
}
