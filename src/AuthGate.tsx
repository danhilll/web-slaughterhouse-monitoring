import { useEffect, useState } from 'react';
import { onIdTokenChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import App from './App';
import { apiFetch, WEB_ACCESS_LOST_EVENT } from './api';
import { auth, isFirebaseConfigured } from './firebase';
import { ArrowUpRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { AmbientBackdrop, LedgerArtwork, WorkspaceBrand } from './WorkspaceIdentity';
import { MotionToggle } from './WorkspaceMotion';

export type WebSession = {
  uid: string;
  email: string | null;
  role: 'admin';
  writesEnabled: boolean;
};

async function sessionError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.message === 'string') return body.message;
  } catch {
    // A network or non-JSON response is handled below.
  }
  return `Unable to verify web access (HTTP ${response.status}).`;
}

function signInErrorMessage(reason: unknown): string {
  const code = typeof reason === 'object' && reason !== null && 'code' in reason
    ? String(reason.code)
    : '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code)) {
    return `Firebase did not accept this email and password (${code}). Use the password for this Firebase account.`;
  }
  if (code === 'auth/network-request-failed') return 'Could not reach Firebase Authentication. Check your internet connection and retry.';
  if (code === 'auth/too-many-requests') return 'Too many sign-in attempts. Please wait before trying again.';
  if (code === 'auth/operation-not-allowed') return 'Email and password sign-in is disabled in this Firebase project.';
  if (code === 'auth/unauthorized-domain') return 'This local address is not authorized in Firebase Authentication settings.';
  if (code === 'auth/invalid-api-key') return 'The Firebase web configuration has an invalid API key.';
  return `Firebase sign-in failed${code ? ` (${code})` : ''}.`;
}

export default function AuthGate() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [session, setSession] = useState<WebSession | null>(null);
  const [loading, setLoading] = useState(Boolean(auth));
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!auth) return;
    let active = true;
    let requestId = 0;
    const handleAccessLost = (event: Event) => {
      requestId += 1;
      setSession(null);
      setLoading(false);
      setError((event as CustomEvent<number>).detail === 401
        ? 'Your web session expired or was revoked. Please sign in again.'
        : 'This account no longer has web administrator access.');
    };
    window.addEventListener(WEB_ACCESS_LOST_EVENT, handleAccessLost);
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      const currentRequest = ++requestId;
      if (!active) return;
      setAuthUser(user);
      setSession(null);
      setLoading(true);
      setError('');
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const response = await apiFetch('/api/session');
        if (!response.ok) throw new Error(await sessionError(response));
        const nextSession = await response.json() as WebSession;
        if (active && currentRequest === requestId) setSession(nextSession);
      } catch (reason) {
        if (active && currentRequest === requestId) {
          setError(reason instanceof Error ? reason.message : 'Unable to verify web access.');
        }
      } finally {
        if (active && currentRequest === requestId) setLoading(false);
      }
    });
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener(WEB_ACCESS_LOST_EVENT, handleAccessLost);
    };
  }, [retryCount]);

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!auth || submitting) return;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setPassword('');
    } catch (reason) {
      setPassword('');
      setError(signInErrorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!auth || !email.trim() || resetting) return;
    setResetting(true);
    setError('');
    setNotice('');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setPassword('');
      setNotice('If this email belongs to a Firebase account, a reset link has been sent. Check your inbox and spam folder.');
    } catch (reason) {
      const code = typeof reason === 'object' && reason !== null && 'code' in reason ? String(reason.code) : '';
      if (code === 'auth/user-not-found') {
        setNotice('If this email belongs to a Firebase account, a reset link has been sent. Check your inbox and spam folder.');
      } else if (code === 'auth/invalid-email') {
        setError('Enter a valid email address before requesting a reset.');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many reset requests. Please wait before trying again.');
      } else {
        setError(`Could not send a reset email${code ? ` (${code})` : ''}.`);
      }
    } finally {
      setResetting(false);
    }
  };

  const handleSignOut = async () => {
    if (auth) await signOut(auth);
  };

  if (session) return <App session={session} onLogout={handleSignOut} />;

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <section className="auth-story" aria-label="Municipal operations workspace">
          <AmbientBackdrop />
          <WorkspaceBrand />
          <div className="auth-story-copy">
            <p className="eyebrow">Built around your daily work</p>
            <h2>Better clarity.<br /><span>Every working day.</span></h2>
            <p>A connected workspace for municipal slaughterhouse records, vendors, and billing.</p>
          </div>
          <LedgerArtwork />
          <div className="auth-story-footer"><span>Municipal office / Operations</span><ArrowUpRight size={17} /></div>
        </section>
      <section className="auth-form-panel" aria-labelledby="sign-in-title">
        <div>
          <p className="auth-form-kicker"><ShieldCheck size={14} /> Administrator access</p>
          <h1 id="sign-in-title">Welcome to your<br />workspace<span className="heading-dot">.</span></h1>
          <p className="auth-form-description">Sign in to the slaughterhouse dashboard with your authorized administrator account.</p>
        </div>

        {!isFirebaseConfigured ? (
          <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Firebase web configuration is missing. Add the VITE_FIREBASE values from Project Settings to your local .env file.
          </p>
        ) : loading ? (
          <p role="status" className="text-sm text-slate-600 dark:text-slate-300">Checking access…</p>
        ) : (
          <>
            {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {notice && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
            {authUser && (
              <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
                Signed in as {authUser.email || authUser.uid}. Web access could not be verified.
              </p>
            )}
            {authUser && error && (
              <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="btn-ghost mb-4 w-full">
                Retry access check
              </button>
            )}
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label htmlFor="admin-email" className="label">Email</label>
                <input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="input" />
              </div>
              <div>
                <label htmlFor="admin-password" className="label">Password</label>
                <div className="password-wrap">
                  <input id="admin-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="input pr-11" />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="password-toggle">
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={submitting} className="btn-primary w-full">{submitting ? 'Signing in…' : 'Sign in to workspace'}<ArrowUpRight size={16} /></button>
            </form>
            <button type="button" disabled={!email.trim() || resetting} onClick={() => void handlePasswordReset()} className="btn-ghost mt-3 w-full">
              {resetting ? 'Sending reset email…' : 'Reset Firebase password'}
            </button>
            <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">This does not change your Google account password.</p>
            {authUser && <button type="button" onClick={() => void handleSignOut()} className="btn-ghost mt-4 w-full">Sign out</button>}
          </>
        )}
        <p className="auth-form-footnote"><ShieldCheck size={13} /> Authorized municipal personnel only</p>
        <div className="auth-motion-control"><MotionToggle showLabel /></div>
      </section>
      </div>
    </main>
  );
}
