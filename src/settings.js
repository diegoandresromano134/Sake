// Ajustes editables desde el panel (precio del Club, envío, topes). Los valores de entorno son sólo el valor inicial.
import { CONFIG } from './config.js';

export const SETTINGS = {
  membership_price: { label: 'Cuota mensual del Club', def: () => CONFIG.membershipMonthly, min: 0 },
  shipping_flat: { label: 'Costo de envío', def: () => CONFIG.shippingFlat, min: 0 },
  free_shipping_from: { label: 'Envío sin cargo desde', def: () => CONFIG.freeShippingFrom, min: 0 },
  max_reserva: { label: 'Tope por socio en exclusivos', def: () => CONFIG.maxReservaPerOrder, min: 1 },
  transfer_discount_pct: { label: 'Descuento por transferencia (%)', def: () => 0, min: 0, max: 50 },
  transfer_expiry_hours: { label: 'Horas de reserva para pagar por transferencia', def: () => 48, min: 1, max: 720 },
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

// Datos de texto: cuenta bancaria para transferencias y contacto de pagos.
export const TEXT_SETTINGS = {
  bank_holder: 'Titular de la cuenta', bank_name: 'Banco', bank_cbu: 'CBU o CVU', bank_alias: 'Alias',
  bank_cuit: 'CUIT del titular', payment_contact: 'Contacto para enviar el comprobante (WhatsApp o email)',
};
export function getTextSettings(db) {
  const rows = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value]));
  return Object.fromEntries(Object.keys(TEXT_SETTINGS).map(k => [k, rows[k] || '']));
}
export function setTextSettings(db, values) {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(values)) if (TEXT_SETTINGS[k] !== undefined) up.run(k, String(v ?? '').trim().slice(0, 120));
}

export const publicSettings = s => ({ membershipPrice: s.membership_price, shippingFlat: s.shipping_flat, freeShippingFrom: s.free_shipping_from, maxReserva: s.max_reserva, transferDiscountPct: s.transfer_discount_pct, transferExpiryHours: s.transfer_expiry_hours });
