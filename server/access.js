// Only these verifier errors establish that the caller's credential was rejected.
// In this API, argument-error means malformed JWT/content (including wrong project).
const REJECTED_ID_TOKEN_CODES = new Set([
  'auth/argument-error', 'auth/invalid-id-token', 'auth/id-token-expired',
  'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found'
]);

export async function verifyFirebaseIdToken(auth, token) {
  try {
    return await auth.verifyIdToken(token, true);
  } catch (error) {
    // Never pass SDK messages or arbitrary error statuses through to clients.
    throw Object.assign(new Error('Authentication is unavailable.'), {
      status: REJECTED_ID_TOKEN_CODES.has(error?.code) ? 401 : 503
    });
  }
}

export function parseAdminUids(value) {
  return new Set(String(value || '').split(',').map((uid) => uid.trim()).filter(Boolean));
}

export function createWebAdminMiddleware(getAuth, allowedUids) {
  return async (req, res, next) => {
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
