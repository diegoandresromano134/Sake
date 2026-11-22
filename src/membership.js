import { getSettings } from './settings.js';
import crypto from 'node:crypto';
import { testPaymentsEnabled } from './payments.js';
import { HttpError } from './security.js';
import { tx } from './db.js';

const addMonth = iso => { const d = new Date(iso); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString(); };

export function getMembership(db, userId) {
  return db.prepare('SELECT * FROM memberships WHERE user_id = ?').get(userId) || null;
}

// Es socio si tiene una membresía con período vigente (aunque haya pedido la baja al fin del período).
export function isMember(db, userId) {
  if (!userId) return false;
  const m = getMembership(db, userId);
  return !!m && m.status === 'active' && new Date(m.current_period_end) > new Date();
}

export function publicMembership(m) {
  if (!m) return null;
  const active = m.status === 'active' && new Date(m.current_period_end) > new Date();
  return {
    status: active ? (m.cancel_at_period_end ? 'cancela_al_vencer' : 'activa') : (m.status === 'past_due' ? 'pago_pendiente' : 'vencida'),
    active,
    memberNumber: m.member_number,
    monthlyPrice: m.monthly_price,
    startedAt: m.started_at,
    currentPeriodEnd: m.current_period_end,
    cancelAtPeriodEnd: !!m.cancel_at_period_end,
  };
}

// Acredita un mes pagado: alta nueva, reactivación o extensión del período vigente (idempotente por pago).
export function confirmMembershipPayment(db, paymentId, ref) {
  return tx(db, () => {
    const p = db.prepare('SELECT * FROM membership_payments WHERE id=?').get(paymentId);
    if (!p || p.status === 'aprobado') return false;
    if (p.status !== 'pendiente') return false;
    const m = getMembership(db, p.user_id);
    const now = new Date();
    const start = m && m.status === 'active' && new Date(m.current_period_end) > now ? m.current_period_end : now.toISOString();
    const end = addMonth(start);
    if (m) {
      db.prepare(`UPDATE memberships SET status='active', monthly_price=?, current_period_end=?, cancel_at_period_end=0 WHERE user_id=?`).run(p.amount, end, p.user_id);
    } else {
      db.prepare(`INSERT INTO memberships (user_id,status,monthly_price,started_at,current_period_end,member_number) VALUES (?,?,?,?,?,?)`)
        .run(p.user_id, 'active', p.amount, now.toISOString(), end, `KM-${String(p.user_id).padStart(5, '0')}`);
    }
    db.prepare(`UPDATE membership_payments SET status='aprobado', period_start=?, period_end=?, provider_ref=COALESCE(?, provider_ref) WHERE id=?`).run(start, end, ref ?? null, paymentId);
    return true;
  });
}

// Inicia el pago de un mes del Club. Con «prueba» se aprueba al instante; con transferencia o Mercado Pago queda pendiente.
export function startMembershipPayment(db, userId, method) {
  const m = getMembership(db, userId);
  if (m && isMember(db, userId) && new Date(m.current_period_end) - Date.now() > 7 * 864e5)
    throw new HttpError(409, 'Ya sos socio del Club Komatsu. Podés pagar el próximo mes desde 7 días antes del vencimiento.');
  if (db.prepare("SELECT 1 FROM membership_payments WHERE user_id=? AND status='pendiente' AND method='transferencia'").get(userId) && method === 'transferencia')
    throw new HttpError(409, 'Ya tenés un pago por transferencia pendiente de confirmación.');
  const amount = getSettings(db).membership_price;
  const now = new Date().toISOString();
  const { lastInsertRowid } = db.prepare(`INSERT INTO membership_payments (user_id,amount,period_start,period_end,status,provider_ref,method) VALUES (?,?,?,?,'pendiente',?,?)`)
    .run(userId, amount, now, now, method === 'prueba' ? `PRUEBA-${crypto.randomBytes(4).toString('hex').toUpperCase()}` : null, method);
  const id = Number(lastInsertRowid);
  if (method === 'prueba') confirmMembershipPayment(db, id);
  return { paymentId: id, amount };
}

export function setCancel(db, userId, cancel) {
  if (!isMember(db, userId)) throw new HttpError(404, 'No tenés una membresía activa.');
  db.prepare('UPDATE memberships SET cancel_at_period_end=? WHERE user_id=?').run(cancel ? 1 : 0, userId);
  return getMembership(db, userId);
}

// Vencimientos: sin cobro recurrente automático, la membresía vence al final del período pagado
// y el socio paga el mes siguiente desde su cuenta. En modo prueba se renueva sola.
export async function renewDue(db) {
  const now = new Date().toISOString();
  const due = db.prepare(`SELECT * FROM memberships WHERE status='active' AND current_period_end <= ?`).all(now);
  let renewed = 0;
  for (const m of due) {
    if (m.cancel_at_period_end || !testPaymentsEnabled()) {
      db.prepare(`UPDATE memberships SET status='expired' WHERE id=?`).run(m.id);
      continue;
    }
    const { paymentId } = startMembershipPayment(db, m.user_id, 'prueba');
    if (paymentId) renewed++;
  }
  return renewed;
}
