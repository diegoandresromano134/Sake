// Sesiones persistentes: cookie httpOnly con token aleatorio; en la base sólo se guarda su hash.
import { CONFIG } from './config.js';
import { newToken, sha256, HttpError } from './security.js';
import { isMember } from './membership.js';

export const COOKIE = 'km_sid';

export function createSession(db, res, userId, remember) {
  const token = newToken();
  const ms = remember ? CONFIG.sessionDays * 864e5 : CONFIG.shortSessionHours * 36e5;
  const expires = new Date(Date.now() + ms);
  db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(sha256(token), userId, expires.toISOString());
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/',
    ...(remember ? { maxAge: ms } : {}),
  });
}

export function destroySession(db, req, res) {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.clearCookie(COOKIE, { path: '/' });
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// Carga req.user y req.member en cada pedido.
export function loadUser(db) {
  const q = db.prepare(`SELECT u.id,u.email,u.name,u.role,u.phone,u.created_at,s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`);
  return (req, res, next) => {
    req.user = null; req.member = false;
    const token = readCookie(req, COOKIE);
    if (token) {
      const row = q.get(sha256(token));
      if (row && new Date(row.expires_at) > new Date()) {
        req.user = row;
        req.member = isMember(db, row.id);
      } else if (row) {
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
      }
    }
    next();
  };
}

export const requireAuth = (req, res, next) =>
  req.user ? next() : next(new HttpError(401, 'Iniciá sesión para continuar.', 'auth_required'));
export const requireMember = (req, res, next) =>
  !req.user ? next(new HttpError(401, 'Iniciá sesión para continuar.', 'auth_required'))
  : req.member || req.user.role === 'admin' ? next()
  : next(new HttpError(403, 'Sección exclusiva para socios del Club Komatsu.', 'member_required'));
export const requireAdmin = (req, res, next) =>
  req.user?.role === 'admin' ? next() : next(new HttpError(403, 'Acceso restringido.', 'admin_required'));
