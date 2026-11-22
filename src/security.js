import crypto from 'node:crypto';

// Contraseñas con scrypt (incluido en Node): "scrypt$<salt>$<hash>"
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(password, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Límite simple de intentos por IP (en memoria) para login/registro.
export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const rec = hits.get(key);
    if (!rec || rec.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++rec.n > max) return next(new HttpError(429, 'Demasiados intentos. Probá de nuevo en unos minutos.'));
    if (hits.size > 10000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    next();
  };
}

// Validaciones básicas
export const isEmail = s => typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export function str(v, { min = 0, max = 200, field = 'campo' } = {}) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min) throw new HttpError(400, min > 1 ? `${field}: mínimo ${min} caracteres.` : `Falta ${field}.`);
  if (s.length > max) throw new HttpError(400, `${field}: máximo ${max} caracteres.`);
  return s;
}
export function int(v, { min = -Infinity, max = Infinity, field = 'valor' } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${field} inválido.`);
  return n;
}
