import { Router } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../auth.js';
import { productView, quote } from '../pricing.js';
import { chargeOrder } from '../payments.js';
import { HttpError, str } from '../security.js';
import { tx } from '../db.js';

export default function shopRoutes(db) {
  const r = Router();

  // Catálogo. ?channel=member devuelve también los exclusivos (requiere socio para comprarlos).
  r.get('/products', (req, res) => {
    const channel = req.query.channel === 'member' ? 'member' : 'publico';
    const rows = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY sort, id').all();
    const products = rows
      .filter(p => channel === 'member' || !p.members_only)
      .map(p => productView(p, req.member));
    res.json({ channel, member: req.member, products });
  });

  r.get('/products/:slug', (req, res) => {
    const p = db.prepare('SELECT * FROM products WHERE slug = ? AND active = 1').get(req.params.slug);
    if (!p) throw new HttpError(404, 'Producto no encontrado.');
    res.json({ member: req.member, product: productView(p, req.member) });
  });

  r.post('/cart/quote', (req, res) => {
    const delivery = req.body.delivery === 'retiro' ? 'retiro' : 'envio';
    res.json(quote(db, req.body.items, { member: req.member, delivery }));
  });

  r.post('/orders', requireAuth, async (req, res) => {
    const b = req.body;
    const delivery = b.delivery === 'retiro' ? 'retiro' : 'envio';
    const ship = {
      name: str(b.name, { min: 2, max: 80, field: 'Nombre' }),
      phone: str(b.phone, { min: 6, max: 40, field: 'Teléfono' }),
      address: delivery === 'envio' ? str(b.address, { min: 4, max: 160, field: 'Dirección' }) : null,
      city: delivery === 'envio' ? str(b.city, { min: 2, max: 80, field: 'Ciudad' }) : null,
      province: delivery === 'envio' ? str(b.province, { min: 2, max: 80, field: 'Provincia' }) : null,
      zip: delivery === 'envio' ? str(b.zip, { min: 3, max: 12, field: 'Código postal' }) : null,
      notes: str(b.notes ?? '', { max: 500, field: 'Notas' }) || null,
    };
    const q = quote(db, b.items, { member: req.member, delivery });
    if (q.issues.length) throw new HttpError(409, q.issues.map(i => i.message).join(' '), 'cart_issues');
    if (!q.lines.length) throw new HttpError(400, 'El carrito está vacío.');

    const pay = await chargeOrder({ amount: q.total, description: `Pedido Komatsu (${q.lines.length} ítems)` });
    if (!pay.ok) throw new HttpError(402, 'El pago fue rechazado.');

    const code = `KMT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const order = tx(db, () => {
      // Descuenta stock de forma atómica; si alguien se adelantó, falla el pedido completo.
      const dec = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
      for (const l of q.lines) {
        if (dec.run(l.qty, l.id, l.qty).changes !== 1) throw new HttpError(409, `Sin stock suficiente de ${l.name}.`);
      }
      const { lastInsertRowid } = db.prepare(`INSERT INTO orders
        (code,user_id,status,channel,subtotal,savings,shipping,total,delivery,ship_name,ship_phone,ship_address,ship_city,ship_province,ship_zip,notes,provider_ref)
        VALUES (?,?,'pagado',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(code, req.user.id, req.member ? 'member' : 'publico', q.subtotal, q.savings, q.shipping, q.total, delivery,
          ship.name, ship.phone, ship.address, ship.city, ship.province, ship.zip, ship.notes, pay.ref);
      const insItem = db.prepare('INSERT INTO order_items (order_id,product_id,name,unit_price,qty) VALUES (?,?,?,?,?)');
      for (const l of q.lines) insItem.run(lastInsertRowid, l.id, `${l.name} ${l.volumeMl} ml · ${l.vintage}`, l.finalPrice, l.qty);
      return lastInsertRowid;
    });
    res.status(201).json({ order: getOrder(db, req.user.id, Number(order)) });
  });

  r.get('/orders', requireAuth, (req, res) => {
    const ids = db.prepare('SELECT id FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
    res.json({ orders: ids.map(o => getOrder(db, req.user.id, o.id)) });
  });

  r.get('/orders/:code', requireAuth, (req, res) => {
    const o = db.prepare('SELECT id FROM orders WHERE code = ? AND user_id = ?').get(req.params.code, req.user.id);
    if (!o) throw new HttpError(404, 'Pedido no encontrado.');
    res.json({ order: getOrder(db, req.user.id, o.id) });
  });

  return r;
}

export function getOrder(db, userId, id) {
  const o = userId == null
    ? db.prepare('SELECT o.*, u.email FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id = ?').get(id)
    : db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(id, userId);
  if (!o) return null;
  const items = db.prepare('SELECT name, unit_price AS unitPrice, qty FROM order_items WHERE order_id = ?').all(id);
  return {
    code: o.code, status: o.status, channel: o.channel, createdAt: o.created_at, email: o.email,
    subtotal: o.subtotal, savings: o.savings, shipping: o.shipping, total: o.total, delivery: o.delivery,
    shipTo: { name: o.ship_name, phone: o.ship_phone, address: o.ship_address, city: o.ship_city, province: o.ship_province, zip: o.ship_zip },
    notes: o.notes, items: items.map(i => ({ ...i })),
  };
}
