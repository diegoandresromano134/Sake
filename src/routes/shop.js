import { Router } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../auth.js';
import { productView, quote } from '../pricing.js';
import { paymentMethods, applyMethodDiscount, createCheckout, findApprovedPayment, mpEnabled, bankInfo } from '../payments.js';
import { getSettings } from '../settings.js';
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

  r.get('/payment-methods', (req, res) => res.json({ methods: paymentMethods(db) }));

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
    const methods = paymentMethods(db);
    const method = methods.find(m => m.id === b.paymentMethod)?.id;
    if (!method) throw new HttpError(400, methods.length ? 'Elegí un medio de pago.' : 'Los pagos todavía no están configurados. Escribinos para comprar.');
    const q = quote(db, b.items, { member: req.member, delivery });
    if (q.issues.length) throw new HttpError(409, q.issues.map(i => i.message).join(' '), 'cart_issues');
    if (!q.lines.length) throw new HttpError(400, 'El carrito está vacío.');
    const { discount, total } = applyMethodDiscount(q, method, db);

    const code = `KMT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const hours = method === 'transferencia' ? getSettings(db).transfer_expiry_hours : method === 'mercadopago' ? 2 : 0;
    const expiresAt = hours ? new Date(Date.now() + hours * 36e5).toISOString() : null;
    const status = method === 'prueba' ? 'pagado' : 'pendiente_pago';

    // Reserva el stock en el momento del pedido; si el pago no llega a tiempo, se libera solo.
    const orderId = tx(db, () => {
      const dec = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
      for (const l of q.lines) {
        if (dec.run(l.qty, l.id, l.qty).changes !== 1) throw new HttpError(409, `Sin stock suficiente de ${l.name}.`);
      }
      const { lastInsertRowid } = db.prepare(`INSERT INTO orders
        (code,user_id,status,channel,subtotal,savings,shipping,total,delivery,ship_name,ship_phone,ship_address,ship_city,ship_province,ship_zip,notes,provider_ref,payment_method,discount,expires_at,paid_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(code, req.user.id, status, req.member ? 'member' : 'publico', q.subtotal, q.savings, q.shipping, total, delivery,
          ship.name, ship.phone, ship.address, ship.city, ship.province, ship.zip, ship.notes,
          method === 'prueba' ? `PRUEBA-${crypto.randomBytes(4).toString('hex').toUpperCase()}` : null,
          method, discount, expiresAt, status === 'pagado' ? new Date().toISOString() : null);
      const insItem = db.prepare('INSERT INTO order_items (order_id,product_id,name,unit_price,qty) VALUES (?,?,?,?,?)');
      for (const l of q.lines) insItem.run(lastInsertRowid, l.id, `${l.name} ${l.volumeMl} ml · ${l.vintage}`, l.finalPrice, l.qty);
      return Number(lastInsertRowid);
    });

    let checkoutUrl = null;
    if (method === 'mercadopago') {
      try {
        const items = q.lines.map(l => ({ id: l.slug, title: `${l.name} ${l.volumeMl} ml`, qty: l.qty, unitPrice: l.finalPrice }));
        if (q.shipping) items.push({ id: 'envio', title: 'Envío', qty: 1, unitPrice: q.shipping });
        ({ url: checkoutUrl } = await createCheckout({ reference: code, title: `Pedido ${code}`, items, payerEmail: req.user.email, baseUrl: baseUrl(req), expiresAt }));
      } catch (e) {
        cancelOrder(db, orderId);
        throw new HttpError(502, 'No pudimos conectar con Mercado Pago. Probá de nuevo o elegí transferencia.');
      }
    }
    res.status(201).json({ order: getOrder(db, req.user.id, orderId), checkoutUrl });
  });

  r.get('/orders', requireAuth, (req, res) => {
    const ids = db.prepare('SELECT id FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
    res.json({ orders: ids.map(o => getOrder(db, req.user.id, o.id)) });
  });

  r.get('/orders/:code', requireAuth, async (req, res) => {
    const o = db.prepare('SELECT id FROM orders WHERE code = ? AND user_id = ?').get(req.params.code, req.user.id);
    if (!o) throw new HttpError(404, 'Pedido no encontrado.');
    await syncOrderPayment(db, req.params.code).catch(() => {});
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
    paymentMethod: o.payment_method, discount: o.discount, expiresAt: o.expires_at, paidAt: o.paid_at,
    ...(o.status === 'pendiente_pago' && o.payment_method === 'transferencia' ? { bank: bankInfo(db) } : {}),
    trackable: o.delivery === 'envio' && ['enviado', 'entregado'].includes(o.status) && !!db.prepare('SELECT 1 FROM deliveries WHERE order_id = ?').get(o.id),
  };
}

export const baseUrl = req => process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

// Marca un pedido como pagado (idempotente).
export function markOrderPaid(db, code, ref) {
  return db.prepare(`UPDATE orders SET status='pagado', paid_at=?, provider_ref=COALESCE(?, provider_ref), expires_at=NULL
    WHERE code=? AND status='pendiente_pago'`).run(new Date().toISOString(), ref ?? null, code).changes === 1;
}

// Cancela un pedido y devuelve el stock reservado (idempotente).
export function cancelOrder(db, id) {
  return tx(db, () => {
    const o = db.prepare('SELECT status FROM orders WHERE id=?').get(id);
    if (!o || o.status === 'cancelado') return false;
    for (const it of db.prepare('SELECT product_id, qty FROM order_items WHERE order_id=?').all(id))
      db.prepare('UPDATE products SET stock = stock + ? WHERE id=?').run(it.qty, it.product_id);
    db.prepare("UPDATE orders SET status='cancelado', expires_at=NULL WHERE id=?").run(id);
    return true;
  });
}

// Consulta Mercado Pago por un pedido pendiente (por si la notificación no llegó).
export async function syncOrderPayment(db, code) {
  const o = db.prepare("SELECT payment_method, status FROM orders WHERE code=?").get(code);
  if (!o || o.status !== 'pendiente_pago' || o.payment_method !== 'mercadopago' || !mpEnabled()) return false;
  const p = await findApprovedPayment(code);
  return p ? markOrderPaid(db, code, `MP-${p.id}`) : false;
}

// Libera los pedidos pendientes cuyo plazo de pago venció.
export function expirePendingOrders(db) {
  const due = db.prepare("SELECT id FROM orders WHERE status='pendiente_pago' AND expires_at IS NOT NULL AND expires_at < ?").all(new Date().toISOString());
  for (const o of due) cancelOrder(db, o.id);
  return due.length;
}
