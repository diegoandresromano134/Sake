// Seguimiento de pedidos en el mapa.
// El admin asigna un repartidor y obtiene un link secreto; el repartidor lo abre en su celular
// y comparte el GPS mientras reparte. El cliente ve la posición en el mapa desde su cuenta.
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import { HttpError, newToken, str, rateLimit } from '../security.js';
import { getTextSettings } from '../settings.js';
import { baseUrl } from './shop.js';
import { tx } from '../db.js';

export const VEHICLES = { moto: 'Moto', auto: 'Auto', bici: 'Bicicleta' };
const STALE_MS = 15 * 60e3; // una posición más vieja que esto no se muestra como "en vivo"

const deliveryOf = (db, orderId) => db.prepare('SELECT * FROM deliveries WHERE order_id = ?').get(orderId);
const firstName = n => String(n || '').trim().split(/\s+/)[0];
export const mapsKey = db => process.env.GOOGLE_MAPS_API_KEY || getTextSettings(db).google_maps_key || '';
const destination = o => o.delivery === 'envio' ? [o.ship_address, o.ship_city, o.ship_province, 'Argentina'].filter(Boolean).join(', ') : null;

// Resumen para el panel (incluye el link del repartidor).
export function adminDelivery(db, orderId, req) {
  const d = deliveryOf(db, orderId);
  if (!d) return null;
  return { courierName: d.courier_name, vehicle: d.vehicle, link: `${baseUrl(req)}/#/reparto/${d.token}`,
    startedAt: d.started_at, finishedAt: d.finished_at, locatedAt: d.located_at };
}

function position(d) {
  if (d?.lat == null || !d.located_at) return null;
  return { lat: d.lat, lng: d.lng, accuracy: d.accuracy, heading: d.heading, speed: d.speed, at: d.located_at,
    stale: Date.now() - new Date(d.located_at).getTime() > STALE_MS };
}

function num(v, min, max) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export default function deliveryRoutes(db) {
  const r = Router();
  const courierLimit = rateLimit({ windowMs: 60e3, max: 90 });

  // ----- Admin: asignar o quitar repartidor -----
  r.post('/admin/orders/:code/delivery', requireAdmin, (req, res) => {
    const o = db.prepare('SELECT * FROM orders WHERE code = ?').get(req.params.code);
    if (!o) throw new HttpError(404, 'Pedido no encontrado.');
    if (o.delivery !== 'envio') throw new HttpError(409, 'Este pedido es para retirar en la bodega.');
    if (!['pagado', 'preparando', 'enviado'].includes(o.status)) throw new HttpError(409, 'Sólo se puede asignar repartidor a un pedido pagado que todavía no se entregó.');
    const name = str(req.body.courierName, { min: 2, max: 60, field: 'Nombre del repartidor' });
    const vehicle = VEHICLES[req.body.vehicle] ? req.body.vehicle : 'moto';
    const token = newToken(); // cada asignación genera un link nuevo: el anterior deja de funcionar
    db.prepare(`INSERT INTO deliveries (order_id, token, courier_name, vehicle) VALUES (?,?,?,?)
      ON CONFLICT(order_id) DO UPDATE SET token=excluded.token, courier_name=excluded.courier_name, vehicle=excluded.vehicle,
      started_at=NULL, finished_at=NULL, lat=NULL, lng=NULL, accuracy=NULL, heading=NULL, speed=NULL, located_at=NULL`)
      .run(o.id, token, name, vehicle);
    res.status(201).json({ delivery: adminDelivery(db, o.id, req) });
  });

  r.delete('/admin/orders/:code/delivery', requireAdmin, (req, res) => {
    const o = db.prepare('SELECT id FROM orders WHERE code = ?').get(req.params.code);
    if (!o) throw new HttpError(404, 'Pedido no encontrado.');
    db.prepare('DELETE FROM deliveries WHERE order_id = ?').run(o.id);
    res.json({ ok: true });
  });

  // ----- Repartidor: link secreto, sin cuenta -----
  const byToken = token => {
    const d = typeof token === 'string' && token.length >= 20 ? db.prepare('SELECT * FROM deliveries WHERE token = ?').get(token) : null;
    const o = d && db.prepare('SELECT * FROM orders WHERE id = ?').get(d.order_id);
    if (!d || !o || o.status === 'cancelado') throw new HttpError(404, 'Este link de reparto no existe o ya no está activo.');
    return { d, o };
  };
  const courierView = (d, o) => ({
    order: { code: o.code, status: o.status, notes: o.notes,
      shipTo: { name: o.ship_name, phone: o.ship_phone, address: o.ship_address, city: o.ship_city, province: o.ship_province, zip: o.ship_zip },
      destination: destination(o),
      items: db.prepare('SELECT name, qty FROM order_items WHERE order_id = ?').all(o.id).map(i => ({ ...i })) },
    courier: { name: d.courier_name, vehicle: d.vehicle },
    startedAt: d.started_at, finishedAt: d.finished_at, locatedAt: d.located_at,
  });

  r.get('/delivery/:token', courierLimit, (req, res) => {
    const { d, o } = byToken(req.params.token);
    res.json(courierView(d, o));
  });

  r.post('/delivery/:token/start', courierLimit, (req, res) => {
    const { d, o } = byToken(req.params.token);
    if (d.finished_at || o.status === 'entregado') throw new HttpError(409, 'Este pedido ya se entregó.');
    tx(db, () => {
      db.prepare('UPDATE deliveries SET started_at = COALESCE(started_at, ?) WHERE order_id = ?').run(new Date().toISOString(), o.id);
      db.prepare("UPDATE orders SET status = 'enviado' WHERE id = ? AND status IN ('pagado','preparando')").run(o.id);
    });
    const fresh = byToken(req.params.token);
    res.json(courierView(fresh.d, fresh.o));
  });

  r.post('/delivery/:token/location', courierLimit, (req, res) => {
    const { d, o } = byToken(req.params.token);
    if (!d.started_at || d.finished_at || o.status !== 'enviado') throw new HttpError(409, 'El recorrido no está activo.');
    const lat = num(req.body.lat, -90, 90), lng = num(req.body.lng, -180, 180);
    if (lat == null || lng == null) throw new HttpError(400, 'Ubicación inválida.');
    db.prepare('UPDATE deliveries SET lat=?, lng=?, accuracy=?, heading=?, speed=?, located_at=? WHERE order_id=?')
      .run(lat, lng, num(req.body.accuracy, 0, 1e5), num(req.body.heading, 0, 360), num(req.body.speed, 0, 200), new Date().toISOString(), o.id);
    res.json({ ok: true });
  });

  r.post('/delivery/:token/delivered', courierLimit, (req, res) => {
    const { o } = byToken(req.params.token);
    if (!['pagado', 'preparando', 'enviado', 'entregado'].includes(o.status)) throw new HttpError(409, 'Este pedido no se puede marcar como entregado.');
    tx(db, () => {
      // Al entregar se borra la ubicación: no queda registro de dónde estuvo el repartidor.
      db.prepare(`UPDATE deliveries SET finished_at = COALESCE(finished_at, ?), lat=NULL, lng=NULL, accuracy=NULL, heading=NULL, speed=NULL, located_at=NULL
        WHERE order_id = ?`).run(new Date().toISOString(), o.id);
      db.prepare("UPDATE orders SET status = 'entregado' WHERE id = ?").run(o.id);
    });
    res.json({ ok: true });
  });

  // ----- Cliente: seguimiento de su propio pedido -----
  r.get('/orders/:code/tracking', requireAuth, (req, res) => {
    const o = db.prepare('SELECT * FROM orders WHERE code = ? AND user_id = ?').get(req.params.code, req.user.id);
    if (!o) throw new HttpError(404, 'Pedido no encontrado.');
    const d = deliveryOf(db, o.id);
    res.json({
      code: o.code, status: o.status, delivery: o.delivery, destination: destination(o),
      courier: d ? { name: firstName(d.courier_name), vehicle: d.vehicle, startedAt: d.started_at, finishedAt: d.finished_at } : null,
      position: o.status === 'enviado' ? position(d) : null,
      mapsKey: mapsKey(db) || null,
    });
  });

  return r;
}
