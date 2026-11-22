// Botellas numeradas con certificado digital de autenticidad.
// Cada botella lleva un código único (impreso o en QR). El comprador lo registra a su nombre.
import { Router } from 'express';
import crypto from 'node:crypto';
import { requireAuth, requireAdmin } from '../auth.js';
import { HttpError, int, str, rateLimit } from '../security.js';
import { tx } from '../db.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin letras/números confusos
export const normalizeCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const formatCode = c => `${c.slice(0, 5)}-${c.slice(5)}`;
function newCode() {
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}
const firstName = n => { const [a, b] = String(n || '').trim().split(/\s+/); return b ? `${a} ${b[0]}.` : a; };

function certView(db, row, userId) {
  return {
    code: formatCode(row.code), number: row.number, size: row.size, edition: row.edition_name || null,
    product: { name: row.product_name, nameJp: row.name_jp, slug: row.slug, variety: row.variety, format: row.format,
      volumeMl: row.volume_ml, accent: row.accent, photo: row.photo || null, id: row.product_id },
    vintage: row.vintage, claimed: !!row.owner_user_id, owner: row.owner_user_id ? firstName(row.owner_name) : null,
    claimedAt: row.claimed_at, mine: !!userId && row.owner_user_id === userId,
  };
}
const CERT_SQL = `SELECT c.*, e.size, e.vintage, e.name AS edition_name, p.id AS product_id, p.name AS product_name, p.name_jp, p.slug,
  p.variety, p.format, p.volume_ml, p.accent, p.photo, u.name AS owner_name
  FROM bottle_codes c JOIN editions e ON e.id = c.edition_id JOIN products p ON p.id = e.product_id
  LEFT JOIN users u ON u.id = c.owner_user_id`;

export default function certificateRoutes(db) {
  const r = Router();
  const lookupLimit = rateLimit({ windowMs: 15 * 60e3, max: 120 });
  const get = code => db.prepare(`${CERT_SQL} WHERE c.code = ?`).get(normalizeCode(code));

  r.get('/certificates/mine', requireAuth, (req, res) => {
    const rows = db.prepare(`${CERT_SQL} WHERE c.owner_user_id = ? ORDER BY c.claimed_at DESC`).all(req.user.id);
    res.json({ certificates: rows.map(x => certView(db, x, req.user.id)) });
  });

  r.get('/certificates/:code', lookupLimit, (req, res) => {
    const row = get(req.params.code);
    if (!row) throw new HttpError(404, 'No encontramos ese código. Revisá que esté bien escrito.');
    res.json({ certificate: certView(db, row, req.user?.id) });
  });

  r.post('/certificates/:code/claim', requireAuth, lookupLimit, (req, res) => {
    const code = normalizeCode(req.params.code);
    const row = get(code);
    if (!row) throw new HttpError(404, 'No encontramos ese código. Revisá que esté bien escrito.');
    if (row.owner_user_id && row.owner_user_id !== req.user.id) throw new HttpError(409, 'Esta botella ya está registrada a nombre de otra persona.');
    if (!row.owner_user_id) db.prepare(`UPDATE bottle_codes SET owner_user_id=?, claimed_at=? WHERE code=? AND owner_user_id IS NULL`).run(req.user.id, new Date().toISOString(), code);
    res.json({ certificate: certView(db, get(code), req.user.id) });
  });

  // ---------- Administración ----------
  r.get('/admin/editions', requireAdmin, (req, res) => {
    const rows = db.prepare(`SELECT e.*, p.name AS product_name, (SELECT COUNT(*) FROM bottle_codes c WHERE c.edition_id=e.id AND c.owner_user_id IS NOT NULL) AS claimed
      FROM editions e JOIN products p ON p.id=e.product_id ORDER BY e.id DESC`).all();
    res.json({ editions: rows.map(e => ({ id: e.id, productId: e.product_id, product: e.product_name, vintage: e.vintage, name: e.name, size: e.size, claimed: e.claimed, createdAt: e.created_at })) });
  });

  r.post('/admin/editions', requireAdmin, (req, res) => {
    const productId = int(req.body.productId, { min: 1, field: 'Producto' });
    if (!db.prepare('SELECT 1 FROM products WHERE id=?').get(productId)) throw new HttpError(404, 'Producto no encontrado.');
    const vintage = int(req.body.vintage, { min: 2000, max: 2100, field: 'Cosecha' });
    const size = int(req.body.size, { min: 1, max: 20000, field: 'Cantidad de botellas' });
    const name = str(req.body.name ?? '', { max: 80, field: 'Nombre de la edición' }) || null;
    const id = tx(db, () => {
      const { lastInsertRowid } = db.prepare('INSERT INTO editions (product_id,vintage,name,size) VALUES (?,?,?,?)').run(productId, vintage, name, size);
      const ins = db.prepare('INSERT INTO bottle_codes (edition_id,number,code) VALUES (?,?,?)');
      for (let n = 1; n <= size; n++) {
        for (;;) { try { ins.run(lastInsertRowid, n, newCode()); break; } catch (e) { if (!/UNIQUE/.test(e.message)) throw e; } }
      }
      return Number(lastInsertRowid);
    });
    res.status(201).json({ id });
  });

  r.get('/admin/editions/:id/codes', requireAdmin, (req, res) => {
    const id = int(req.params.id, { min: 1 });
    const limit = Math.min(int(req.query.limit ?? 200, { min: 1, max: 20000 }), 20000);
    const rows = db.prepare(`SELECT c.number, c.code, c.claimed_at, u.name AS owner FROM bottle_codes c LEFT JOIN users u ON u.id=c.owner_user_id WHERE c.edition_id=? ORDER BY c.number LIMIT ?`).all(id, limit);
    res.json({ codes: rows.map(c => ({ number: c.number, code: formatCode(c.code), owner: c.owner ? firstName(c.owner) : null, claimedAt: c.claimed_at })) });
  });

  // CSV para la imprenta: número, código y link del QR
  r.get('/admin/editions/:id/codes.csv', requireAdmin, (req, res) => {
    const id = int(req.params.id, { min: 1 });
    const e = db.prepare('SELECT e.*, p.slug FROM editions e JOIN products p ON p.id=e.product_id WHERE e.id=?').get(id);
    if (!e) throw new HttpError(404, 'Edición no encontrada.');
    const base = `${req.protocol}://${req.get('host')}`;
    const rows = db.prepare('SELECT number, code FROM bottle_codes WHERE edition_id=? ORDER BY number').all(id);
    const lines = ['numero,de,codigo,link'].concat(rows.map(c => `${c.number},${e.size},${formatCode(c.code)},${base}/#/certificado/${formatCode(c.code)}`));
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="komatsu-${e.slug}-${e.vintage}-edicion-${id}.csv"`);
    res.send(lines.join('\n') + '\n');
  });

  return r;
}
