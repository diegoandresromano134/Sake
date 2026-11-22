import { Router } from 'express';
import { createSession, destroySession, requireAuth } from '../auth.js';
import { hashPassword, verifyPassword, isEmail, str, HttpError, rateLimit } from '../security.js';
import { getMembership, publicMembership } from '../membership.js';

export default function authRoutes(db) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 15 * 60e3, max: 20 });

  const me = (req) => req.user && {
    id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role, phone: req.user.phone,
    createdAt: req.user.created_at, member: req.member,
    membership: publicMembership(getMembership(db, req.user.id)),
  };

  r.get('/me', (req, res) => res.json({ user: me(req) }));

  r.post('/register', limiter, (req, res) => {
    const name = str(req.body.name, { min: 2, max: 80, field: 'Nombre' });
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!isEmail(email)) throw new HttpError(400, 'Email inválido.');
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (password.length < 8 || password.length > 200) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.');
    const birthdate = String(req.body.birthdate || '');
    const b = new Date(birthdate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate) || isNaN(b)) throw new HttpError(400, 'Fecha de nacimiento inválida.');
    const adult = new Date(b); adult.setFullYear(adult.getFullYear() + 18);
    if (adult > new Date()) throw new HttpError(403, 'Tenés que ser mayor de 18 años para registrarte.');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Ya existe una cuenta con ese email.');
    const { lastInsertRowid } = db.prepare('INSERT INTO users (email,name,password_hash,birthdate) VALUES (?,?,?,?)')
      .run(email, name, hashPassword(password), birthdate);
    createSession(db, res, Number(lastInsertRowid), req.body.remember !== false);
    res.status(201).json({ ok: true });
  });

  r.post('/login', limiter, (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const u = db.prepare('SELECT id,password_hash FROM users WHERE email = ?').get(email);
    if (!u || !verifyPassword(password, u.password_hash)) throw new HttpError(401, 'Email o contraseña incorrectos.');
    createSession(db, res, u.id, req.body.remember !== false);
    res.json({ ok: true });
  });

  r.post('/logout', (req, res) => { destroySession(db, req, res); res.json({ ok: true }); });

  r.patch('/me', requireAuth, (req, res) => {
    const name = str(req.body.name, { min: 2, max: 80, field: 'Nombre' });
    const phone = str(req.body.phone ?? '', { max: 40, field: 'Teléfono' });
    db.prepare('UPDATE users SET name=?, phone=? WHERE id=?').run(name, phone || null, req.user.id);
    res.json({ ok: true });
  });

  r.post('/password', requireAuth, limiter, (req, res) => {
    const u = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
    if (!verifyPassword(String(req.body.current || ''), u.password_hash)) throw new HttpError(401, 'La contraseña actual no es correcta.');
    const next = String(req.body.next || '');
    if (next.length < 8 || next.length > 200) throw new HttpError(400, 'La nueva contraseña debe tener al menos 8 caracteres.');
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(next), req.user.id);
    // Cierra las otras sesiones
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.user.id);
    createSession(db, res, req.user.id, true);
    res.json({ ok: true });
  });

  return r;
}
