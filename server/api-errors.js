// Parser/SDK error messages can contain request bodies, credentials or headers.
// Log only fixed classifications, never the error object or its message.
export function createApiErrorHandler(log = console.error) {
  return (err, req, res, next) => {
    const status = [400, 413, 503].includes(err?.status) ? err.status : 500;
    log('[api] Request failed', { status });
    if (res.headersSent) return next(new Error('API response failed.'));
    if (status === 413) return res.status(413).json({ message: 'Request body is too large.' });
    if (status === 503) return res.status(503).json({ message: err.publicMessage === true ? err.message : 'API read is unavailable.' });
    if (status === 400) return res.status(400).json({ message: 'Invalid request body.' });
    return res.status(500).json({ message: 'Internal server error.' });
  };
}
