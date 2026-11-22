import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requireAdmin } from '../auth.js';
import { getOrder, markOrderPaid, cancelOrder } from './shop.js';
import { confirmMembershipPayment } from '../membership.js';
import { mpEnabled, testPaymentsEnabled } from '../payments.js';
import { HttpError, int, str } from '../security.js';
import { getSettings, setSettings, SETTINGS, getTextSettings, setTextSettings, TEXT_SETTINGS } from '../settings.js';

const STATUSES = ['pendiente_pago', 'pagado', 'preparando', 'enviado', 'entregado', 'cancelado'];

const MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export default function adminRoutes(db, { uploadsDir } = {}) {
  const r = Router();
  r.use(requireAdmin);

  r.get('/summary', (req, res) => {
    const one = sql => db.prepare(sql).get().n;
    res.json({
      revenue: one(`SELECT COALESCE(SUM(total),0) n FROM orders WHERE status NOT IN ('cancelado','pendiente_pago')`),
      awaitingPayment: one(`SELECT COUNT(*) n FROM orders WHERE status='pendiente_pago'`) + one(`SELECT COUNT(*) n FROM membership_payments WHERE status='pendiente'`),
      orders: one('SELECT COUNT(*) n FROM orders'),
      pending: one(`SELECT COUNT(*) n FROM orders WHERE status IN ('pagado','preparando')`),
      users: one(`SELECT COUNT(*) n FROM users WHERE role='customer'`),
      members: one(`SELECT COUNT(*) n FROM memberships WHERE status='active' AND current_period_end > strftime('%Y-%m-%dT%H:%M:%fZ','now')`),
      mrr: one(`SELECT COALESCE(SUM(monthly_price),0) n FROM memberships WHERE status='active' AND cancel_at_period_end=0 AND current_period_end > strftime('%Y-%m-%dT%H:%M:%fZ','now')`),
    });
  });

  r.get('/orders', (req, res) => {
    const ids = db.prepare('SELECT id FROM orders ORDER BY id DESC LIMIT 200').all();
    res.json({ orders: ids.map(o => getOrder(db, null, o.id)), statuses: STATUSES });
  });

  r.patch('/orders/:code', (req, res) => {
    const status = req.body.status;
    if (!STATUSES.includes(status)) throw new HttpError(400, 'Estado inválido.');
    const o = db.prepare('SELECT id,status FROM orders WHERE code=?').get(req.params.code);
    if (!o) throw new HttpError(404, 'Pedido no encontrado.');
    if (status === 'cancelado') cancelOrder(db, o.id); // devuelve el stock
    else if (o.status === 'pendiente_pago' && status === 'pagado') markOrderPaid(db, req.params.code, req.body.ref || 'confirmado-manual');
    else if (o.status === 'cancelado') throw new HttpError(409, 'Un pedido cancelado no se puede reactivar: el stock ya se liberó.');
    else db.prepare('UPDATE orders SET status=? WHERE id=?').run(status, o.id);
    res.json({ ok: true });
  });

  r.get('/products', (req, res) => res.json({ products: db.prepare('SELECT * FROM products ORDER BY sort,id').all().map(p => ({ ...p })) }));

  // Ficha completa del producto: todo lo que se ve en la tienda es editable.
  const PRODUCT_TEXT = { name: [2, 80, 'Nombre'], name_jp: [0, 40, 'Nombre en japonés'], tagline: [0, 200, 'Bajada'],
    description: [0, 2000, 'Descripción'], tasting_notes: [0, 1000, 'Notas de cata'], pairing: [0, 500, 'Maridaje'],
    ingredients: [0, 500, 'Ingredientes'], variety: [2, 40, 'Estilo'] };
  const PRODUCT_INT = { price: [0, 1e9, 'Precio'], member_price: [0, 1e9, 'Precio socio'], stock: [0, 1e6, 'Stock'],
    vintage: [2000, 2100, 'Cosecha'], volume_ml: [10, 10000, 'Volumen'], sort: [0, 1000, 'Orden'] };
  function productFields(b, current = {}) {
    const n = { ...current };
    for (const [k, [min, max, field]] of Object.entries(PRODUCT_TEXT)) if (b[k] !== undefined) n[k] = str(b[k] ?? '', { min, max, field });
    for (const [k, [min, max, field]] of Object.entries(PRODUCT_INT)) if (b[k] !== undefined && b[k] !== '') n[k] = int(b[k], { min, max, field });
    if (b.abv !== undefined) { const a = Number(b.abv); if (!(a >= 0 && a <= 40)) throw new HttpError(400, 'Graduación inválida.'); n.abv = a; }
    if (b.format !== undefined) { if (!['botella', 'tokkuri', 'pack'].includes(b.format)) throw new HttpError(400, 'Formato inválido.'); n.format = b.format; n.image = b.format === 'tokkuri' ? 'tokkuri' : 'botella'; }
    if (b.accent !== undefined) n.accent = b.accent === 'red' ? 'red' : 'gold';
    if (b.active !== undefined) n.active = b.active ? 1 : 0;
    if (b.members_only !== undefined) n.members_only = b.members_only ? 1 : 0;
    if (b.presale_until !== undefined) {
      const d = b.presale_until ? new Date(b.presale_until) : null;
      if (d && isNaN(d)) throw new HttpError(400, 'Fecha de preventa inválida.');
      n.presale_until = d ? d.toISOString() : null;
    }
    return n;
  }
  const COLS = ['name', 'name_jp', 'variety', 'format', 'volume_ml', 'vintage', 'tagline', 'description', 'tasting_notes', 'pairing', 'ingredients',
    'abv', 'price', 'member_price', 'stock', 'members_only', 'presale_until', 'image', 'accent', 'active', 'sort'];

  r.patch('/products/:id', (req, res) => {
    const id = int(req.params.id, { min: 1 });
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(id);
    if (!p) throw new HttpError(404, 'Producto no encontrado.');
    const n = productFields(req.body, p);
    db.prepare(`UPDATE products SET ${COLS.map(c => `${c}=?`).join(',')} WHERE id=?`).run(...COLS.map(c => n[c] ?? null), id);
    res.json({ ok: true });
  });

  r.post('/products', (req, res) => {
    const n = productFields({ variety: 'frutado', format: 'botella', volume_ml: 720, vintage: new Date().getFullYear(), tagline: '', description: '',
      tasting_notes: '', pairing: '', abv: 15, stock: 0, accent: 'gold', active: 0, members_only: 0, sort: 50, name_jp: '', ...req.body });
    if (!n.name) throw new HttpError(400, 'Falta el nombre.');
    if (n.price == null || n.member_price == null) throw new HttpError(400, 'Faltan los precios.');
    const base = n.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'producto';
    let slug = `${base}-${n.volume_ml}`, i = 2;
    while (db.prepare('SELECT 1 FROM products WHERE slug=?').get(slug)) slug = `${base}-${n.volume_ml}-${i++}`;
    const { lastInsertRowid } = db.prepare(`INSERT INTO products (slug,${COLS.join(',')}) VALUES (?,${COLS.map(() => '?').join(',')})`)
      .run(slug, ...COLS.map(c => n[c] ?? null));
    res.status(201).json({ id: Number(lastInsertRowid), slug });
  });

  // Foto real del producto: recibe una imagen en data URL (jpg/png/webp, hasta 5 MB).
  const removePhoto = file => {
    if (!file || !uploadsDir || !file.startsWith('/uploads/')) return;
    fs.rmSync(path.join(uploadsDir, path.basename(file)), { force: true });
  };
  r.post('/products/:id/photo', (req, res) => {
    if (!uploadsDir) throw new HttpError(500, 'Carpeta de fotos no configurada.');
    const p = db.prepare('SELECT id, slug, photo FROM products WHERE id=?').get(int(req.params.id, { min: 1 }));
    if (!p) throw new HttpError(404, 'Producto no encontrado.');
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.dataUrl || ''));
    if (!m) throw new HttpError(400, 'Formato de imagen no válido. Usá JPG, PNG o WEBP.');
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length || buf.length > 5 * 1024 * 1024) throw new HttpError(413, 'La imagen supera los 5 MB.');
    const name = `${p.slug}-${crypto.randomBytes(4).toString('hex')}.${MIME[m[1]]}`;
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, name), buf);
    db.prepare('UPDATE products SET photo=? WHERE id=?').run(`/uploads/${name}`, p.id);
    removePhoto(p.photo);
    res.status(201).json({ photo: `/uploads/${name}` });
  });
  r.delete('/products/:id/photo', (req, res) => {
    const p = db.prepare('SELECT id, photo FROM products WHERE id=?').get(int(req.params.id, { min: 1 }));
    if (!p) throw new HttpError(404, 'Producto no encontrado.');
    db.prepare('UPDATE products SET photo=NULL WHERE id=?').run(p.id);
    removePhoto(p.photo);
    res.json({ ok: true });
  });

  r.get('/members', (req, res) => {
    res.json({ members: db.prepare(`SELECT u.name,u.email,m.member_number AS number,m.status,m.current_period_end AS periodEnd,m.cancel_at_period_end AS cancelAtEnd
      FROM memberships m JOIN users u ON u.id=m.user_id ORDER BY m.id DESC`).all().map(x => ({ ...x })) });
  });

  // ---------- Anuncios y premios ----------
  const annFields = b => [
    ['anuncio', 'premio', 'lanzamiento'].includes(b.kind) ? b.kind : 'anuncio',
    str(b.title, { min: 3, max: 140, field: 'Título' }), str(b.titleJp ?? '', { max: 60, field: 'Título JP' }) || null,
    str(b.body, { min: 3, max: 2000, field: 'Texto' }), b.public ? 1 : 0];
  r.get('/announcements', (req, res) => res.json({ announcements: db.prepare('SELECT id,kind,title,title_jp AS titleJp,body,public,created_at AS createdAt FROM announcements ORDER BY id DESC').all().map(x => ({ ...x })) }));
  r.post('/announcements', (req, res) => {
    db.prepare('INSERT INTO announcements (kind,title,title_jp,body,public) VALUES (?,?,?,?,?)').run(...annFields(req.body));
    res.status(201).json({ ok: true });
  });
  r.patch('/announcements/:id', (req, res) => {
    const r2 = db.prepare('UPDATE announcements SET kind=?,title=?,title_jp=?,body=?,public=? WHERE id=?').run(...annFields(req.body), int(req.params.id, { min: 1 }));
    if (!r2.changes) throw new HttpError(404, 'Anuncio no encontrado.');
    res.json({ ok: true });
  });
  r.delete('/announcements/:id', (req, res) => {
    db.prepare('DELETE FROM announcements WHERE id=?').run(int(req.params.id, { min: 1 }));
    res.json({ ok: true });
  });

  // ---------- Degustaciones y eventos ----------
  const evtFields = b => {
    const starts = new Date(b.startsAt);
    if (isNaN(starts)) throw new HttpError(400, 'Fecha inválida.');
    return [str(b.title, { min: 3, max: 140, field: 'Título' }), str(b.titleJp ?? '', { max: 60, field: 'Título JP' }) || null,
      str(b.description, { min: 3, max: 2000, field: 'Descripción' }), starts.toISOString(),
      str(b.location, { min: 2, max: 140, field: 'Lugar' }), int(b.capacity, { min: 1, max: 500, field: 'Cupo' }), b.active === false ? 0 : 1];
  };
  r.get('/events', (req, res) => {
    const events = db.prepare('SELECT * FROM events ORDER BY starts_at DESC').all();
    const att = db.prepare('SELECT u.name, u.email, r.guests FROM event_rsvps r JOIN users u ON u.id=r.user_id WHERE r.event_id=? ORDER BY r.created_at');
    res.json({ events: events.map(e => {
      const attendees = att.all(e.id).map(a => ({ ...a }));
      return { id: e.id, title: e.title, titleJp: e.title_jp, description: e.description, startsAt: e.starts_at, location: e.location,
        capacity: e.capacity, active: !!e.active, attendees, taken: attendees.reduce((n, a) => n + 1 + a.guests, 0) };
    }) });
  });
  r.post('/events', (req, res) => {
    db.prepare('INSERT INTO events (title,title_jp,description,starts_at,location,capacity,active) VALUES (?,?,?,?,?,?,?)').run(...evtFields(req.body));
    res.status(201).json({ ok: true });
  });
  r.patch('/events/:id', (req, res) => {
    const r2 = db.prepare('UPDATE events SET title=?,title_jp=?,description=?,starts_at=?,location=?,capacity=?,active=? WHERE id=?').run(...evtFields(req.body), int(req.params.id, { min: 1 }));
    if (!r2.changes) throw new HttpError(404, 'Evento no encontrado.');
    res.json({ ok: true });
  });
  r.delete('/events/:id', (req, res) => {
    db.prepare('DELETE FROM events WHERE id=?').run(int(req.params.id, { min: 1 }));
    res.json({ ok: true });
  });

  // ---------- Marcas, proveedores y alianzas ----------
  const allyFields = b => {
    const url = str(b.url ?? '', { max: 300, field: 'Sitio web' });
    if (url && !/^https?:\/\//i.test(url)) throw new HttpError(400, 'El sitio web debe empezar con http:// o https://');
    return [str(b.name, { min: 2, max: 120, field: 'Nombre' }), str(b.category ?? '', { max: 60, field: 'Tipo' }) || 'proveedor',
      str(b.description ?? '', { max: 500, field: 'Descripción' }), url || null, b.sort === '' || b.sort == null ? 0 : int(b.sort, { min: 0, max: 1000, field: 'Orden' }),
      b.active === false ? 0 : 1];
  };
  r.get('/alliances', (req, res) => res.json({ alliances: db.prepare('SELECT * FROM alliances ORDER BY sort,id').all().map(a => ({ ...a, active: !!a.active })) }));
  r.post('/alliances', (req, res) => {
    db.prepare('INSERT INTO alliances (name,category,description,url,sort,active) VALUES (?,?,?,?,?,?)').run(...allyFields(req.body));
    res.status(201).json({ ok: true });
  });
  r.patch('/alliances/:id', (req, res) => {
    const r2 = db.prepare('UPDATE alliances SET name=?,category=?,description=?,url=?,sort=?,active=? WHERE id=?').run(...allyFields(req.body), int(req.params.id, { min: 1 }));
    if (!r2.changes) throw new HttpError(404, 'No encontrado.');
    res.json({ ok: true });
  });
  r.delete('/alliances/:id', (req, res) => {
    db.prepare('DELETE FROM alliances WHERE id=?').run(int(req.params.id, { min: 1 }));
    res.json({ ok: true });
  });

  // ---------- Pagos del Club pendientes (transferencias) ----------
  r.get('/membership-payments', (req, res) => {
    res.json({ payments: db.prepare(`SELECT p.id, p.amount, p.method, p.status, p.created_at AS createdAt, u.name, u.email
      FROM membership_payments p JOIN users u ON u.id=p.user_id WHERE p.status='pendiente' ORDER BY p.id DESC`).all().map(x => ({ ...x })) });
  });
  r.post('/membership-payments/:id/confirm', (req, res) => {
    if (!confirmMembershipPayment(db, int(req.params.id, { min: 1 }), 'confirmado-manual')) throw new HttpError(409, 'Ese pago ya no está pendiente.');
    res.json({ ok: true });
  });
  r.post('/membership-payments/:id/reject', (req, res) => {
    db.prepare("UPDATE membership_payments SET status='rechazado' WHERE id=? AND status='pendiente'").run(int(req.params.id, { min: 1 }));
    res.json({ ok: true });
  });

  // ---------- Ajustes ----------
  r.get('/settings', (req, res) => res.json({
    settings: getSettings(db), labels: Object.fromEntries(Object.entries(SETTINGS).map(([k, v]) => [k, v.label])),
    text: getTextSettings(db), textLabels: TEXT_SETTINGS,
    payments: { mercadopago: mpEnabled(), test: testPaymentsEnabled() },
  }));
  r.patch('/settings', (req, res) => {
    const values = {};
    for (const [k, s] of Object.entries(SETTINGS)) if (req.body[k] !== undefined) values[k] = int(req.body[k], { min: s.min, max: s.max ?? 1e9, field: s.label });
    setSettings(db, values);
    if (req.body.text && typeof req.body.text === 'object') setTextSettings(db, req.body.text);
    res.json({ settings: getSettings(db) });
  });

  return r;
}
