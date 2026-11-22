import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUser } from './auth.js';
import { HttpError } from './security.js';
import authRoutes from './routes/auth.js';
import shopRoutes from './routes/shop.js';
import clubRoutes from './routes/club.js';
import adminRoutes from './routes/admin.js';
import certificateRoutes from './routes/certificates.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function createApp(db, { uploadsDir } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    next();
  });

  // Las fotos de producto viajan en base64: sólo esa ruta acepta cuerpos grandes.
  app.use('/api/admin/products/:id/photo', express.json({ limit: '8mb' }));
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
  app.use('/api', certificateRoutes(db));
  app.use('/api/admin', adminRoutes(db, { uploadsDir }));
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api', (req, res, next) => next(new HttpError(404, 'Ruta no encontrada.')));

  // Verificación de la app de Android: vincula el dominio con la huella SHA-256 de la firma de la app.
  app.get('/.well-known/assetlinks.json', (req, res) => {
    const fingerprints = (process.env.ANDROID_SHA256 || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    res.json(fingerprints.length ? [{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: process.env.ANDROID_PACKAGE || 'com.bodegakomatsu.app', sha256_cert_fingerprints: fingerprints },
    }] : []);
  });
  app.get('/sw.js', (req, res, next) => { res.set('Cache-Control', 'no-cache'); next(); });
  if (uploadsDir) app.use('/uploads', express.static(uploadsDir, { maxAge: '7d', fallthrough: false }));
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
