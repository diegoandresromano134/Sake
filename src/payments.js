// Medios de pago.
//  - Mercado Pago (Checkout Pro): tarjetas de crédito y débito, dinero en cuenta y cuotas.
//    Se activa con la variable de entorno MP_ACCESS_TOKEN (credencial de producción de la cuenta de Mercado Pago).
//  - Transferencia bancaria: el pedido queda reservado hasta que el administrador confirma el pago.
//  - Prueba: aprueba al instante; sólo fuera de producción y sin Mercado Pago (para desarrollo y tests).
import { getSettings, getTextSettings } from './settings.js';

const MP_API = 'https://api.mercadopago.com';

export const mpEnabled = () => !!process.env.MP_ACCESS_TOKEN;
export const testPaymentsEnabled = () =>
  process.env.NODE_ENV !== 'production' && !mpEnabled() && process.env.PAYMENTS_TEST !== '0';

export function bankInfo(db) {
  const t = getTextSettings(db);
  return { holder: t.bank_holder, bank: t.bank_name, cbu: t.bank_cbu, alias: t.bank_alias, cuit: t.bank_cuit, contact: t.payment_contact };
}
export const transferEnabled = db => { const b = bankInfo(db); return !!(b.cbu || b.alias); };

// Medios disponibles para mostrar en el checkout.
export function paymentMethods(db) {
  const s = getSettings(db);
  const list = [];
  if (mpEnabled()) list.push({ id: 'mercadopago', label: 'Mercado Pago', detail: 'Tarjetas de crédito y débito, dinero en cuenta y cuotas.', discountPct: 0 });
  if (transferEnabled(db)) list.push({ id: 'transferencia', label: 'Transferencia bancaria', detail: `Te mostramos el alias y el CBU. Reservamos tu pedido por ${s.transfer_expiry_hours} horas.`, discountPct: s.transfer_discount_pct });
  if (testPaymentsEnabled()) list.push({ id: 'prueba', label: 'Pago de prueba', detail: 'Modo desarrollo: se aprueba al instante. No aparece en la tienda publicada.', discountPct: 0 });
  return list;
}

async function mp(path, { method = 'GET', body } = {}) {
  const res = await fetch(MP_API + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Mercado Pago respondió ${res.status}: ${data.message || 'error'}`);
    err.status = 502;
    throw err;
  }
  return data;
}

// Crea una preferencia de Checkout Pro y devuelve el link de pago.
export async function createCheckout({ reference, title, items, payerEmail, baseUrl, expiresAt }) {
  const pref = await mp('/checkout/preferences', {
    method: 'POST',
    body: {
      items: items.map(i => ({ id: i.id, title: i.title, quantity: i.qty, unit_price: i.unitPrice, currency_id: 'ARS' })),
      external_reference: reference,
      payer: payerEmail ? { email: payerEmail } : undefined,
      back_urls: {
        success: `${baseUrl}/pago/retorno?ref=${encodeURIComponent(reference)}`,
        pending: `${baseUrl}/pago/retorno?ref=${encodeURIComponent(reference)}`,
        failure: `${baseUrl}/pago/retorno?ref=${encodeURIComponent(reference)}`,
      },
      auto_return: 'approved',
      notification_url: `${baseUrl}/api/payments/mercadopago/webhook`,
      statement_descriptor: 'KOMATSU',
      metadata: { title },
      ...(expiresAt ? { expires: true, expiration_date_to: expiresAt } : {}),
    },
  });
  return { url: pref.init_point, preferenceId: pref.id };
}

export const getMpPayment = id => mp(`/v1/payments/${encodeURIComponent(id)}`);

// Busca si hay un pago aprobado para una referencia (pedido o cuota del Club).
export async function findApprovedPayment(reference) {
  const r = await mp(`/v1/payments/search?external_reference=${encodeURIComponent(reference)}&sort=date_created&criteria=desc`);
  return (r.results || []).find(p => p.status === 'approved') || null;
}

// Monto de un pedido con el descuento por transferencia (sobre el subtotal, no sobre el envío).
export function applyMethodDiscount(quote, method, db) {
  const pct = method === 'transferencia' ? getSettings(db).transfer_discount_pct : 0;
  const discount = Math.round(quote.subtotal * pct / 100);
  return { discount, total: quote.subtotal - discount + quote.shipping };
}
