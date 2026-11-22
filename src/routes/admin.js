import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { getOrder } from './shop.js';
import { HttpError, int, str } from '../security.js';

const STATUSES = ['pagado', 'preparando', 'enviado', 'entregado', 'cancelado'];

export default function adminRoutes(db) {
  const r = Router();
  r.use(requireAdmin);

  r.get('/summary', (req, res) => {
    const one = sql => db.prepare(sql).get().n;
    res.json({
      revenue: one(`SELECT COALESCE(SUM(total),0) n FROM orders WHERE status<>'cancelado'`),
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
    db.exec('BEGIN');
    try {
      // Cancelar devuelve el stock
      if (status === 'cancelado' && o.status !== 'cancelado') {
        for (const it of db.prepare('SELECT product_id, qty FROM order_items WHERE order_id=?').all(o.id))
          db.prepare('UPDATE products SET stock = stock + ? WHERE id=?').run(it.qty, it.product_id);
      }
      db.prepare('UPDATE orders SET status=? WHERE id=?').run(status, o.id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    res.json({ ok: true });
  });

  r.get('/products', (req, res) => res.json({ products: db.prepare('SELECT * FROM products ORDER BY sort,id').all().map(p => ({ ...p })) }));

  r.patch('/products/:id', (req, res) => {
    const id = int(req.params.id, { min: 1 });
    const b = req.body;
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(id);
    if (!p) throw new HttpError(404, 'Producto no encontrado.');
    const next = {
      price: b.price != null ? int(b.price, { min: 0, field: 'Precio' }) : p.price,
      member_price: b.member_price != null ? int(b.member_price, { min: 0, field: 'Precio socio' }) : p.member_price,
      stock: b.stock != null ? int(b.stock, { min: 0, field: 'Stock' }) : p.stock,
      active: b.active != null ? (b.active ? 1 : 0) : p.active,
      members_only: b.members_only != null ? (b.members_only ? 1 : 0) : p.members_only,
      vintage: b.vintage != null ? int(b.vintage, { min: 2000, max: 2100, field: 'Cosecha' }) : p.vintage,
      presale_until: b.presale_until !== undefined ? (b.presale_until ? new Date(b.presale_until).toISOString() : null) : p.presale_until,
    };
    db.prepare('UPDATE products SET price=?,member_price=?,stock=?,active=?,members_only=?,vintage=?,presale_until=? WHERE id=?')
      .run(next.price, next.member_price, next.stock, next.active, next.members_only, next.vintage, next.presale_until, id);
    res.json({ ok: true });
  });

  r.get('/members', (req, res) => {
    res.json({ members: db.prepare(`SELECT u.name,u.email,m.member_number AS number,m.status,m.current_period_end AS periodEnd,m.cancel_at_period_end AS cancelAtEnd
      FROM memberships m JOIN users u ON u.id=m.user_id ORDER BY m.id DESC`).all().map(x => ({ ...x })) });
  });

  r.post('/announcements', (req, res) => {
    const kind = ['anuncio', 'premio', 'lanzamiento'].includes(req.body.kind) ? req.body.kind : 'anuncio';
    db.prepare('INSERT INTO announcements (kind,title,title_jp,body,public) VALUES (?,?,?,?,?)').run(
      kind, str(req.body.title, { min: 3, max: 140, field: 'Título' }), str(req.body.titleJp ?? '', { max: 60, field: 'Título JP' }) || null,
      str(req.body.body, { min: 3, max: 2000, field: 'Texto' }), req.body.public ? 1 : 0);
    res.status(201).json({ ok: true });
  });

  r.post('/events', (req, res) => {
    const starts = new Date(req.body.startsAt);
    if (isNaN(starts)) throw new HttpError(400, 'Fecha inválida.');
    db.prepare('INSERT INTO events (title,title_jp,description,starts_at,location,capacity) VALUES (?,?,?,?,?,?)').run(
      str(req.body.title, { min: 3, max: 140, field: 'Título' }), str(req.body.titleJp ?? '', { max: 60 }) || null,
      str(req.body.description, { min: 3, max: 2000, field: 'Descripción' }), starts.toISOString(),
      str(req.body.location, { min: 2, max: 140, field: 'Lugar' }), int(req.body.capacity, { min: 1, max: 500, field: 'Cupo' }));
    res.status(201).json({ ok: true });
  });

  return r;
}
