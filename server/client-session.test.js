import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('web API client retains access on 503 and reports access loss only on 401/403', async () => {
  // Execute the actual client with a fake Auth provider; never initialize Firebase.
  const source = readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const events = [];
  let status = 503;
  const user = { getIdToken: async () => 'synthetic-token' };
  const auth = { currentUser: user };
  const exports = {};
  runInNewContext(outputText, {
    exports, Headers,
    require: name => { assert.equal(name, './firebase'); return { auth }; },
    window: { dispatchEvent: event => events.push(event.detail) },
    CustomEvent: class { constructor(_type, options) { this.detail = options.detail; } },
    fetch: async (_input, init) => {
      assert.equal(init.headers.get('Authorization'), 'Bearer synthetic-token');
      return Response.json({ message: 'Unavailable' }, { status });
    }
  });
  for (status of [503, 503, 200]) {
    assert.equal((await exports.apiFetch('/api/session')).status, status);
    assert.equal(auth.currentUser, user);
    assert.deepEqual(events, []);
  }
  for (status of [401, 403]) await exports.apiFetch('/api/session');
  assert.deepEqual(events, [401, 403]);
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

const session = uid => ({ uid, email: null, role: 'admin', writesEnabled: false });
const account = uid => ({ uid, email: uid+'@example.test', emailVerified: true, getIdToken: async () => 'synthetic-token' });

function authGateFixture() {
  // Execute the actual TSX and apiFetch with deterministic hooks and fake Firebase.
  // No DOM renderer or new dependency is needed for these state/race regressions.
  const hooks = [], pendingEffects = [], replies = [];
  const auth = { currentUser: null };
  const window = new EventTarget();
  const App = () => {};
  let cursor = 0, listener, tree;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      return hooks[index] ??= { current: initial };
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = hooks[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          hooks[index] = { deps, cleanup: effect() };
        });
      }
    }
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const firebaseAuth = {
    onIdTokenChanged(_auth, callback) { listener = callback; return () => { listener = null; }; },
    async signOut() { auth.currentUser = null; await listener?.(null); }
  };
  const modules = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'firebase/auth': firebaseAuth, './firebase': { auth, isFirebaseConfigured: true },
    './App': { __esModule: true, default: App },
    'lucide-react': {}, './WorkspaceIdentity': {}, './WorkspaceMotion': {}
  };
  const load = path => {
    const exports = {};
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX
    } });
    runInNewContext(outputText, {
      exports, Error, Headers, window, CustomEvent,
      require: name => { assert.ok(name in modules, `Unexpected import: ${name}`); return modules[name]; },
      fetch: async () => {
        assert.ok(replies.length, 'Unexpected API request');
        const reply = replies.shift();
        if (reply instanceof Error) throw reply;
        return typeof reply === 'function' ? reply() : reply;
      }
    });
    return exports;
  };
  modules['./api'] = load('../src/api.ts');
  const AuthGate = load('../src/AuthGate.tsx').default;
  const render = () => {
    cursor = 0;
    tree = AuthGate();
    while (pendingEffects.length) pendingEffects.shift()();
  };
  const nodes = node => !node ? [] : Array.isArray(node) ? node.flatMap(item => nodes(item))
    : typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
  const text = node => !node ? '' : Array.isArray(node) ? node.map(item => text(item)).join(' ')
    : typeof node === 'object' ? text(node.props?.children) : String(node);
  const begin = user => {
    auth.currentUser = user;
    const done = listener(user);
    render();
    return done;
  };
  const notify = async user => { await begin(user); render(); };
  render();
  return {
    auth, firebaseAuth, replies, render, begin, notify, apiFetch: modules['./api'].apiFetch, text: () => text(tree),
    app: () => nodes(tree).find(node => node.type === App),
    async establish(user = account('ADMIN-A')) {
      replies.push(Response.json(session(user.uid)));
      await notify(user);
      assert.equal(this.app()?.props.session.uid, user.uid);
      return user;
    },
    async retry() {
      const button = nodes(tree).find(node => node.type === 'button' && text(node) === 'Retry access check');
      assert.ok(button, 'Recoverable failure must offer retry');
      button.props.onClick(); render();
      await notify(auth.currentUser);
    },
    async click(label) {
      const node = nodes(tree).find(node => node.type === 'button' && text(node) === label);
      assert.ok(node, `Missing button: ${label}`);
      await node.props.onClick(); await new Promise(resolve => setImmediate(resolve)); render();
    },
    input(id, value) { const node = nodes(tree).find(node => node.type === 'input' && node.props.id === id); assert.ok(node); node.props.onChange({ target: { value } }); render(); },
    accessLost(status) { window.dispatchEvent(new CustomEvent(modules['./api'].WEB_ACCESS_LOST_EVENT, { detail: status })); render(); }
  };
}

test('AuthGate preserves an established session through 503/network failure and explicit retry', async () => {
  const f = authGateFixture(), user = await f.establish();
  const original = f.app().props.session;
  const pending = deferred();
  f.replies.push(() => pending.promise);
  const refresh = f.begin(user);
  assert.equal(f.app().props.session, original);
  assert.match(f.text(), /Rechecking access.*has not been reverified/);
  pending.resolve(Response.json({ message: 'Authentication is unavailable.' }, { status: 503 }));
  await refresh; f.render();
  assert.equal(f.app().props.session, original);
  assert.match(f.text(), /Access check unavailable.*has not been reverified/);
  f.replies.push(new TypeError('Failed to fetch'));
  await f.retry();
  assert.equal(f.app().props.session, original);
  assert.match(f.text(), /Retry access check/);
  f.replies.push(Response.json(session(user.uid)));
  await f.retry();
  assert.equal(f.app().props.session.uid, user.uid);
  assert.equal(f.app().props.session.writesEnabled, false);
  assert.doesNotMatch(f.text(), /has not been reverified/);
});

test('AuthGate initial failures and a mismatched success response never open protected screens', async () => {
  for (const reply of [Response.json({}, { status: 503 }), new TypeError('Failed to fetch'),
    Response.json({}, { status: 401 }), Response.json({}, { status: 403 }), Response.json(session('OTHER'))]) {
    const f = authGateFixture(); f.replies.push(reply);
    await f.notify(account('ADMIN-A'));
    assert.equal(f.app(), undefined);
  }
});

test('AuthGate clears established access for rejected credentials and access denial', async () => {
  for (const status of [401, 403]) {
    const f = authGateFixture(), user = await f.establish();
    f.replies.push(Response.json({}, { status }));
    await f.notify(user);
    assert.equal(f.app(), undefined);
    assert.match(f.text(), status === 401 ? /expired or was revoked/ : /no longer has web administrator access/);
  }
  const f = authGateFixture(), user = await f.establish();
  user.getIdToken = async () => { throw Object.assign(new Error('Disabled'), { code: 'auth/user-disabled' }); };
  await f.notify(user);
  assert.equal(f.app(), undefined);
  assert.match(f.text(), /expired or was revoked/);
});

test('AuthGate logout and access-loss events invalidate pending successes', async () => {
  for (const endAccess of ['logout', 'event', 'firebase']) {
    const f = authGateFixture(), user = await f.establish();
    const pending = deferred();
    f.replies.push(() => pending.promise);
    const refresh = f.begin(user);
    if (endAccess === 'logout') { await f.app().props.onLogout(); f.render(); }
    else if (endAccess === 'event') f.accessLost(403);
    else await f.notify(null);
    assert.equal(f.app(), undefined);
    pending.resolve(Response.json(session(user.uid)));
    await refresh; f.render();
    assert.equal(f.app(), undefined);
  }
});

test('AuthGate clears immediately on logout before Firebase finishes signing out', async () => {
  const f = authGateFixture(), user = await f.establish();
  const pending = deferred(), signOut = deferred();
  f.firebaseAuth.signOut = () => signOut.promise;
  f.replies.push(() => pending.promise);
  const refresh = f.begin(user);
  const logout = f.app().props.onLogout(); f.render();
  assert.equal(f.auth.currentUser, user);
  assert.equal(f.app(), undefined);
  pending.resolve(Response.json(session(user.uid)));
  await refresh; f.render();
  assert.equal(f.app(), undefined);
  await f.notify(null);
  signOut.resolve(); await logout;
});

test('AuthGate ignores a success body that finishes parsing after logout', async () => {
  const f = authGateFixture(), user = await f.establish();
  const body = deferred(), parsing = deferred();
  f.replies.push({ ok: true, status: 200, json: () => { parsing.resolve(); return body.promise; } });
  const refresh = f.begin(user);
  await parsing.promise;
  await f.app().props.onLogout(); f.render();
  body.resolve(session(user.uid));
  await refresh; f.render();
  assert.equal(f.app(), undefined);
});

test('AuthGate account switching clears the old session and ignores late old-account responses', async () => {
  const f = authGateFixture(), first = await f.establish();
  const pending = deferred();
  f.replies.push(() => pending.promise);
  const refresh = f.begin(first);
  const second = account('ADMIN-B');
  f.replies.push(Response.json({}, { status: 503 }));
  await f.notify(second);
  assert.equal(f.app(), undefined);
  pending.resolve(Response.json(session(first.uid)));
  await refresh; f.render();
  assert.equal(f.app(), undefined);
  f.replies.push(Response.json(session(second.uid)));
  await f.retry();
  assert.equal(f.app().props.session.uid, second.uid);
  assert.equal(f.app().key, second.uid);
});

test('AuthGate ignores a superseded refresh success after a newer temporary failure', async () => {
  const f = authGateFixture(), user = await f.establish();
  const original = f.app().props.session, pending = deferred();
  f.replies.push(() => pending.promise);
  const old = f.begin(user);
  f.replies.push(Response.json({}, { status: 503 }));
  await f.notify(user);
  pending.resolve(Response.json({ ...session(user.uid), writesEnabled: true }));
  await old; f.render();
  assert.equal(f.app().props.session, original);
  assert.match(f.text(), /has not been reverified/);
});


test('web verification blocks application/API access and sends only the signed-in user to Firebase verification', async () => {
  const f = authGateFixture(), user = { ...account('UNVERIFIED'), emailVerified: false };
  await f.notify(user);
  assert.equal(f.app(), undefined); assert.match(f.text(), /Email verification is required/);
  let mailed;
  f.firebaseAuth.sendEmailVerification = async target => { mailed = target; };
  await f.click('Send verification email');
  assert.equal(mailed, user); assert.equal(f.app(), undefined);
  assert.match(f.text(), /delivery is not guaranteed/);
  f.firebaseAuth.sendEmailVerification = async () => { throw { code: 'auth/too-many-requests' }; };
  await f.click('Send verification email');
  assert.match(f.text(), /Too many verification requests/); assert.equal(f.app(), undefined);
});

test('verification refresh reloads profile then forces a new token and still requires backend authorization', async () => {
  const f = authGateFixture(), user = { ...account('UNVERIFIED'), emailVerified: false }, calls = [];
  await f.notify(user);
  f.firebaseAuth.reload = async target => { assert.equal(target, user); calls.push('reload'); };
  user.getIdToken = async force => { assert.equal(force, true); calls.push('token'); return 'synthetic'; };
  await f.click('I verified my email — check again');
  assert.deepEqual(calls, ['reload','token']); assert.equal(f.app(), undefined); assert.match(f.text(), /still unverified/);
  f.firebaseAuth.reload = async () => { user.emailVerified = true; };
  await f.click('I verified my email — check again');
  // A verified profile is insufficient: even a 503/403 must not grant workspace access.
  assert.equal(f.app(), undefined);
  user.getIdToken = async () => 'synthetic';
  f.replies.push(Response.json({}, { status: 403 })); await f.notify(user);
  assert.equal(f.app(), undefined);
});

test('verification denial clears established access with a recovery-specific message and preserves the response body', async () => {
  const f = authGateFixture(), user = await f.establish();
  f.replies.push(Response.json({ code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Verify your email address before accessing this service.' }, { status: 403 }));
  const response = await f.apiFetch('/api/session'); f.render();
  assert.equal((await response.json()).code, 'EMAIL_VERIFICATION_REQUIRED');
  assert.equal(f.app(), undefined); assert.match(f.text(), /Verify your email address/);
  assert.match(f.text(), /Send verification email/);
});

test('reset recovery uses official Firebase emails, hides unknown-account status, and never grants access', async () => {
  const f = authGateFixture(); await f.notify(null);
  f.input('admin-email', 'recover@example.test');
  let addressed;
  f.firebaseAuth.sendPasswordResetEmail = async (_auth, email) => { addressed = email; };
  await f.click('Reset Firebase password');
  assert.equal(addressed, 'recover@example.test'); assert.match(f.text(), /If this email belongs/); assert.equal(f.app(), undefined);
  f.firebaseAuth.sendPasswordResetEmail = async () => { throw { code: 'auth/user-not-found' }; };
  await f.click('Reset Firebase password'); assert.match(f.text(), /If this email belongs/);
  f.firebaseAuth.sendPasswordResetEmail = async () => { throw { code: 'auth/too-many-requests' }; };
  await f.click('Reset Firebase password'); assert.match(f.text(), /Too many reset requests/); assert.equal(f.app(), undefined);
});

test('unverified notification immediately removes an established workspace, including pending responses', async () => {
  const f = authGateFixture(), user = await f.establish(), pending = deferred();
  f.replies.push(() => pending.promise);
  const refresh = f.begin(user);
  user.emailVerified = false; await f.notify(user);
  assert.equal(f.app(), undefined);
  pending.resolve(Response.json(session(user.uid))); await refresh; f.render();
  assert.equal(f.app(), undefined);
});
