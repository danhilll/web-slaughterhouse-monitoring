// Only these verifier errors establish that the caller's credential was rejected.
// In this API, argument-error means malformed JWT/content (including wrong project).
const REJECTED_ID_TOKEN_CODES = new Set([
  'auth/argument-error', 'auth/invalid-id-token', 'auth/id-token-expired',
  'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found'
]);

export const EMAIL_VERIFICATION_REQUIRED = 'EMAIL_VERIFICATION_REQUIRED';
export const EMAIL_VERIFICATION_MESSAGE = 'Verify your email address before accessing this service.';

export async function verifyFirebaseIdToken(auth, token) {
  let decoded;
  try {
    decoded = await auth.verifyIdToken(token, true);
  } catch (error) {
    // Never pass SDK messages or arbitrary error statuses through to clients.
    throw Object.assign(new Error('Authentication is unavailable.'), {
      status: REJECTED_ID_TOKEN_CODES.has(error?.code) ? 401 : 503
    });
  }
  // Firebase's signed claim is required; missing/truthy substitute values fail closed.
  // Administrator approval never changes Firebase mailbox ownership.
  if (decoded.email_verified !== true) throw Object.assign(new Error(EMAIL_VERIFICATION_MESSAGE), {
    status: 403, code: EMAIL_VERIFICATION_REQUIRED
  });
  return decoded;
}

export function parseAdminUids(value) {
  return new Set(String(value || '').split(',').map((uid) => uid.trim()).filter(Boolean));
}

export function createWebAdminMiddleware(getAuth, allowedUids) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const match = /^Bearer (\S+)$/i.exec(String(req.headers.authorization || ''));
    if (!match) return res.status(401).json({ message: 'Sign in is required.' });

    try {
      const auth = getAuth();
      if (!auth) return res.status(503).json({ message: 'Authentication is unavailable.' });
      const decoded = await verifyFirebaseIdToken(auth, match[1]);
      if (!allowedUids.has(decoded.uid)) {
        return res.status(403).json({ message: 'This account does not have web administrator access.' });
      }
      req.webUser = { uid: decoded.uid, email: decoded.email || null, role: 'admin' };
      next();
    } catch (error) {
      if (error?.code === EMAIL_VERIFICATION_REQUIRED) return res.status(403).json({ code: error.code, message: EMAIL_VERIFICATION_MESSAGE });
      if (error?.status === 401) {
        return res.status(401).json({ message: 'Your session is invalid or expired. Please sign in again.' });
      }
      return res.status(503).json({ message: 'Authentication is unavailable.' });
    }
  };
}

export function createWriteGuard(writesEnabled) {
  return (req, res, next) => {
    if (writesEnabled || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    return res.status(503).json({ message: 'Web changes are paused until the mobile and web data models are connected.' });
  };
}
