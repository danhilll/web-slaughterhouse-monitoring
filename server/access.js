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
      const decoded = await auth.verifyIdToken(match[1], true);
      if (!allowedUids.has(decoded.uid)) {
        return res.status(403).json({ message: 'This account does not have web administrator access.' });
      }
      req.webUser = { uid: decoded.uid, email: decoded.email || null, role: 'admin' };
      next();
    } catch (error) {
      if (error?.code?.startsWith('auth/')) {
        return res.status(401).json({ message: 'Your session is invalid or expired. Please sign in again.' });
      }
      next(error);
    }
  };
}

export function createWriteGuard(writesEnabled) {
  return (req, res, next) => {
    if (writesEnabled || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    return res.status(503).json({ message: 'Web changes are paused until the mobile and web data models are connected.' });
  };
}
