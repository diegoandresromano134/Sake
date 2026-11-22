// Pasarela de pago simulada.
// Punto de integración: reemplazar estas funciones por Mercado Pago
// (Checkout Pro para pedidos y "preapproval" / suscripciones para el Club).
import crypto from 'node:crypto';

export async function chargeOrder({ amount, description }) {
  if (!(amount > 0)) return { ok: false, error: 'Monto inválido' };
  return { ok: true, ref: `SIM-ORD-${crypto.randomBytes(5).toString('hex').toUpperCase()}`, description };
}

export async function chargeSubscription({ amount, userId }) {
  if (!(amount > 0)) return { ok: false, error: 'Monto inválido' };
  return { ok: true, ref: `SIM-SUB-${userId}-${crypto.randomBytes(4).toString('hex').toUpperCase()}` };
}
