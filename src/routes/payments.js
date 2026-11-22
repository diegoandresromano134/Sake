// Mercado Pago: notificaciones (webhook) y regreso del comprador después de pagar.
// Nunca se confía en el contenido de la notificación: se vuelve a consultar el pago a Mercado Pago con nuestra credencial.
import { Router } from 'express';
import { getMpPayment, findApprovedPayment, mpEnabled } from '../payments.js';
import { markOrderPaid, syncOrderPayment } from './shop.js';
import { confirmMembershipPayment } from '../membership.js';

export async function applyApprovedPayment(db, payment) {
  if (!payment || payment.status !== 'approved') return false;
  const ref = String(payment.external_reference || '');
  if (ref.startsWith('CLUB-')) return confirmMembershipPayment(db, Number(ref.slice(5)), `MP-${payment.id}`);
  return markOrderPaid(db, ref, `MP-${payment.id}`);
}

export default function paymentRoutes(db) {
  const api = Router();
  api.post('/payments/mercadopago/webhook', async (req, res) => {
    res.sendStatus(200); // Mercado Pago sólo necesita el OK; el trabajo sigue después.
    if (!mpEnabled()) return;
    const type = req.body?.type || req.query.type || req.query.topic;
    const id = req.body?.data?.id || req.query['data.id'] || req.query.id;
    if (!id || !String(type || '').includes('payment')) return;
    try { await applyApprovedPayment(db, await getMpPayment(id)); }
    catch (e) { console.error('webhook mercadopago', e.message); }
  });

  // Regreso desde Mercado Pago: sincroniza y lleva al pedido o a la membresía.
  const page = Router();
  page.get('/pago/retorno', async (req, res) => {
    const ref = String(req.query.ref || '');
    try {
      if (ref.startsWith('CLUB-')) {
        if (mpEnabled()) await applyApprovedPayment(db, await findApprovedPayment(ref));
        return res.redirect('/#/cuenta?tab=club');
      }
      await syncOrderPayment(db, ref);
    } catch (e) { console.error('retorno mercadopago', e.message); }
    res.redirect(/^KMT-[A-Z0-9-]+$/.test(ref) ? `/#/pedido/${ref}` : '/#/cuenta');
  });
  return { api, page };
}
