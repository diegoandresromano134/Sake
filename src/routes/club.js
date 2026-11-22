import { Router } from 'express';
import { requireAuth, requireMember } from '../auth.js';
import { getMembership, publicMembership, subscribe, setCancel } from '../membership.js';
import { CONFIG } from '../config.js';
import { HttpError, int } from '../security.js';

export default function clubRoutes(db) {
  const r = Router();

  r.get('/club/plan', (req, res) => res.json({
    monthlyPrice: CONFIG.membershipMonthly,
    benefits: [
      { title: 'Precios de socio', jp: '会員価格', text: '15% menos en todo el catálogo, todo el año.' },
      { title: 'Prioridad en tiradas limitadas', jp: '先行予約', text: 'Preventa exclusiva de cada cosecha antes que el Shop Público.' },
      { title: 'Reserva Shokunin', jp: '職人限定', text: 'Acceso a ediciones numeradas que no salen a la venta pública.' },
      { title: 'Envío sin cargo', jp: '送料無料', text: 'En todos tus pedidos del Member Shop.' },
      { title: 'Degustaciones en la bodega', jp: '利き酒会', text: 'Catas guiadas, visitas a la planta y encuentros con el maestro sakero.' },
      { title: 'Anuncios y premios', jp: 'お知らせ', text: 'Novedades, reconocimientos y lanzamientos antes que nadie.' },
    ],
  }));

  r.get('/membership', requireAuth, (req, res) => {
    const payments = db.prepare('SELECT amount, period_start AS periodStart, period_end AS periodEnd, status, provider_ref AS ref, created_at AS createdAt FROM membership_payments WHERE user_id=? ORDER BY id DESC').all(req.user.id);
    res.json({ membership: publicMembership(getMembership(db, req.user.id)), payments: payments.map(p => ({ ...p })) });
  });

  r.post('/membership/subscribe', requireAuth, async (req, res) => {
    if (req.body.acceptTerms !== true) throw new HttpError(400, 'Tenés que aceptar las condiciones del Club.');
    const m = await subscribe(db, req.user.id);
    res.status(201).json({ membership: publicMembership(m) });
  });
  r.post('/membership/cancel', requireAuth, (req, res) => res.json({ membership: publicMembership(setCancel(db, req.user.id, true)) }));
  r.post('/membership/resume', requireAuth, (req, res) => res.json({ membership: publicMembership(setCancel(db, req.user.id, false)) }));

  // Novedades públicas (para la home)
  r.get('/news', (req, res) => {
    res.json({ news: db.prepare('SELECT id,kind,title,title_jp AS titleJp,body,created_at AS createdAt FROM announcements WHERE public=1 ORDER BY id DESC LIMIT 6').all().map(x => ({ ...x })) });
  });

  // Área de socios
  r.get('/club/feed', requireMember, (req, res) => {
    const announcements = db.prepare('SELECT id,kind,title,title_jp AS titleJp,body,created_at AS createdAt FROM announcements ORDER BY id DESC').all();
    const events = db.prepare(`SELECT e.*, 
        (SELECT COALESCE(SUM(1+guests),0) FROM event_rsvps r WHERE r.event_id=e.id) AS taken,
        (SELECT guests FROM event_rsvps r WHERE r.event_id=e.id AND r.user_id=?) AS myGuests
      FROM events e WHERE e.starts_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day') ORDER BY e.starts_at`).all(req.user.id);
    res.json({
      announcements: announcements.map(a => ({ ...a })),
      events: events.map(e => ({
        id: e.id, title: e.title, titleJp: e.title_jp, description: e.description, startsAt: e.starts_at, location: e.location,
        capacity: e.capacity, seatsLeft: Math.max(0, e.capacity - e.taken), attending: e.myGuests != null, myGuests: e.myGuests ?? 0,
      })),
    });
  });

  r.post('/club/events/:id/rsvp', requireMember, (req, res) => {
    const id = int(req.params.id, { min: 1, field: 'Evento' });
    const guests = int(req.body.guests ?? 0, { min: 0, max: 1, field: 'Acompañantes' });
    const e = db.prepare(`SELECT e.capacity, (SELECT COALESCE(SUM(1+guests),0) FROM event_rsvps r WHERE r.event_id=e.id AND r.user_id<>?) AS taken FROM events e WHERE e.id=?`).get(req.user.id, id);
    if (!e) throw new HttpError(404, 'Evento no encontrado.');
    if (e.taken + 1 + guests > e.capacity) throw new HttpError(409, 'No quedan cupos suficientes.');
    db.prepare(`INSERT INTO event_rsvps (event_id,user_id,guests) VALUES (?,?,?)
      ON CONFLICT(event_id,user_id) DO UPDATE SET guests=excluded.guests`).run(id, req.user.id, guests);
    res.json({ ok: true });
  });

  r.delete('/club/events/:id/rsvp', requireMember, (req, res) => {
    db.prepare('DELETE FROM event_rsvps WHERE event_id=? AND user_id=?').run(int(req.params.id, { min: 1 }), req.user.id);
    res.json({ ok: true });
  });

  return r;
}
