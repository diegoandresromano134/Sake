import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUser } from './auth.js';
import { HttpError } from './security.js';
import authRoutes from './routes/auth.js';
import shopRoutes from './routes/shop.js';
import clubRoutes from './routes/club.js';
import adminRoutes from './routes/admin.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    next();
  });

  app.use('/api', express.json({ limit: '50kb' }), (req, res, next) => { req.body ??= {}; next(); });
  // Protección CSRF: las escrituras a la API deben ser JSON (un formulario de otro sitio no puede enviarlo).
  app.use('/api', (req, res, next) => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && !req.is('application/json'))
      return next(new HttpError(415, 'Se espera JSON.'));
    next();
  });
  app.use('/api', loadUser(db));
  app.use('/api/auth', authRoutes(db));
  app.use('/api', shopRoutes(db));
  app.use('/api', clubRoutes(db));
  app.use('/api/admin', adminRoutes(db));
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api', (req, res, next) => next(new HttpError(404, 'Ruta no encontrada.')));

  app.use(express.static(PUBLIC, { maxAge: '1h', index: 'index.html' }));
  // SPA: cualquier otra ruta devuelve la app
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Error interno. Probá de nuevo.' : err.message, code: err.code });
  });
  return app;
}
