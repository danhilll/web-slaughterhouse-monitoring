import express from 'express';
import { existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

// Provider health checks receive no project, account or database details.
export function registerReadiness(app, isReady) {
  app.get('/healthz', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const ok = Boolean(isReady());
    res.status(ok ? 200 : 503).json({ ok });
  });
}

// Register after the terminal /api 404 handler. Opt-in keeps development unchanged.
export function registerWebAssets(app, { enabled = false, directory }) {
  if (!enabled) return;
  const entry = join(directory, 'index.html');
  if (!existsSync(entry)) throw new Error('SERVE_WEB requires a built dist/index.html. Run npm run build first.');
  app.use('/assets', express.static(join(directory, 'assets'), {
    index: false, dotfiles: 'deny', maxAge: '1y', immutable: true,
    setHeaders(res, file) {
      // A worker has its own CSP; the renderer document's meta policy is insufficient.
      if (/^maplibre-gl-worker-[\w-]+\.js$/.test(basename(file))) {
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src https://tile.openstreetmap.org; img-src data: blob:; object-src 'none'");
        res.setHeader('Referrer-Policy', 'origin');
      }
    },
  }));
  app.use(express.static(directory, { index: false, dotfiles: 'deny', maxAge: 0 }));
  app.get('*', (req, res, next) => {
    if (req.path === '/api' || req.path.startsWith('/api/') || req.path === '/assets' ||
        req.path.startsWith('/assets/') || extname(req.path) ||
        req.path.split('/').some(part => part.startsWith('.')) || !req.accepts('html')) return next();
    res.set('Cache-Control', 'no-store');
    res.sendFile(entry);
  });
}
