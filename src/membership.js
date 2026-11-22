import { CONFIG } from './config.js';
import { chargeSubscription } from './payments.js';
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

export async function subscribe(db, userId) {
  const current = getMembership(db, userId);
  if (current && isMember(db, userId)) throw new HttpError(409, 'Ya sos socio del Club Komatsu.');
  const amount = CONFIG.membershipMonthly;
  const pay = await chargeSubscription({ amount, userId });
  if (!pay.ok) throw new HttpError(402, 'No se pudo procesar el pago de la membresía.');
  const start = new Date().toISOString();
  const end = addMonth(start);
  return tx(db, () => {
    if (current) {
      db.prepare(`UPDATE memberships SET status='active', monthly_price=?, current_period_end=?, cancel_at_period_end=0 WHERE user_id=?`)
        .run(amount, end, userId);
    } else {
      const number = `KM-${String(userId).padStart(5, '0')}`;
      db.prepare(`INSERT INTO memberships (user_id,status,monthly_price,started_at,current_period_end,member_number) VALUES (?,?,?,?,?,?)`)
        .run(userId, 'active', amount, start, end, number);
    }
    db.prepare(`INSERT INTO membership_payments (user_id,amount,period_start,period_end,status,provider_ref) VALUES (?,?,?,?,'aprobado',?)`)
      .run(userId, amount, start, end, pay.ref);
    return getMembership(db, userId);
  });
}

export function setCancel(db, userId, cancel) {
  if (!isMember(db, userId)) throw new HttpError(404, 'No tenés una membresía activa.');
  db.prepare('UPDATE memberships SET cancel_at_period_end=? WHERE user_id=?').run(cancel ? 1 : 0, userId);
  return getMembership(db, userId);
}

// Renovación automática: cobra el mes siguiente a las membresías vencidas que no pidieron la baja.
export async function renewDue(db) {
  const now = new Date().toISOString();
  const due = db.prepare(`SELECT * FROM memberships WHERE status='active' AND current_period_end <= ?`).all(now);
  let renewed = 0;
  for (const m of due) {
    if (m.cancel_at_period_end) {
      db.prepare(`UPDATE memberships SET status='expired' WHERE id=?`).run(m.id);
      continue;
    }
    const pay = await chargeSubscription({ amount: m.monthly_price, userId: m.user_id });
    if (!pay.ok) { db.prepare(`UPDATE memberships SET status='past_due' WHERE id=?`).run(m.id); continue; }
    const start = m.current_period_end, end = addMonth(start);
    tx(db, () => {
      db.prepare('UPDATE memberships SET current_period_end=? WHERE id=?').run(end, m.id);
      db.prepare(`INSERT INTO membership_payments (user_id,amount,period_start,period_end,status,provider_ref) VALUES (?,?,?,?,'aprobado',?)`)
        .run(m.user_id, m.monthly_price, start, end, pay.ref);
    });
    renewed++;
  }
  return renewed;
}
