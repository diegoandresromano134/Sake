// Ajustes editables desde el panel (precio del Club, envío, topes). Los valores de entorno son sólo el valor inicial.
import { CONFIG } from './config.js';

export const SETTINGS = {
  membership_price: { label: 'Cuota mensual del Club', def: () => CONFIG.membershipMonthly, min: 0 },
  shipping_flat: { label: 'Costo de envío', def: () => CONFIG.shippingFlat, min: 0 },
  free_shipping_from: { label: 'Envío sin cargo desde', def: () => CONFIG.freeShippingFrom, min: 0 },
  max_reserva: { label: 'Tope por socio en exclusivos', def: () => CONFIG.maxReservaPerOrder, min: 1 },
};

export function getSettings(db) {
  const rows = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, Number(r.value)]));
  const out = {};
  for (const [k, s] of Object.entries(SETTINGS)) out[k] = Number.isFinite(rows[k]) ? rows[k] : s.def();
  return out;
}

export function setSettings(db, values) {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(values)) if (SETTINGS[k]) up.run(k, String(v));
}

export const publicSettings = s => ({ membershipPrice: s.membership_price, shippingFlat: s.shipping_flat, freeShippingFrom: s.free_shipping_from, maxReserva: s.max_reserva });
