import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

export const PROJECT_ID = 'demo-mobile-rehearsal';
const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
export function assertEmulators(env = process.env) {
  for (const key of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT_ID']) {
    if (env[key] && env[key] !== PROJECT_ID) throw new Error(`Refusing non-rehearsal ${key}`);
  }
  for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL', 'FIREBASE_CONFIG']) {
    if (env[key]) throw new Error(`Refusing credential/config environment: ${key}`);
  }
  const parse = (key) => {
    const value = env[key];
    if (!value || !/^127\.0\.0\.1:\d+$/.test(value)) throw new Error(`${key} must be explicitly configured as 127.0.0.1:port`);
    const port = Number(value.split(':')[1]);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`Invalid ${key}`);
    return { host: '127.0.0.1', port, address: value };
  };
  const auth = parse('FIREBASE_AUTH_EMULATOR_HOST');
  const firestore = parse('FIRESTORE_EMULATOR_HOST');
  if (auth.port === firestore.port) throw new Error('Auth and Firestore require separate ports');
  return { auth, firestore, projectId: PROJECT_ID };
}

// Installed before SDK imports. A mistaken HTTP/fetch/socket destination fails instead of reaching Google.
export function enforceLoopbackOnly() {
  const allow = (host) => { if (!loopback.has(host)) throw new Error('Rehearsal refuses non-loopback network access'); };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    allow(url.hostname);
    if (url.protocol !== 'http:') throw new Error('Rehearsal requires local HTTP');
    return originalFetch(input, { ...options, redirect: 'error' });
  };
  for (const method of ['request', 'get']) {
    const original = http[method];
    http[method] = function (input, ...rest) {
      const host = typeof input === 'string' || input instanceof URL ? new URL(input).hostname : input.hostname || input.host || 'localhost';
      allow(host);
      return original.call(this, input, ...rest);
    };
    https[method] = () => { throw new Error('Rehearsal refuses HTTPS/production connections'); };
  }
  const originalConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const input = Array.isArray(args[0]) ? args[0] : args;
    const options = typeof input[0] === 'object' ? input[0] : { host: typeof input[1] === 'string' ? input[1] : 'localhost' };
    if (!options.path) allow(options.host || options.hostname || 'localhost');
    return originalConnect.apply(this, args);
  };
}
