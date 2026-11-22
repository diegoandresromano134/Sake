import { api } from '../api.js';
import { esc, eyebrow, money, toast, dateFmt, timeFmt, hanko } from '../ui.js';
import { state, isMember, isAdmin, refreshUser } from '../store.js';
import { needLogin, go } from '../app.js';

export function memberCard(user) {
  const m = user.membership;
  return `<div class="member-card">
    <div class="row" style="justify-content:space-between"><span style="letter-spacing:.4em;font-size:12px">KOMATSU CLUB</span>${hanko()}</div>
    <div><div class="num">${esc(m.memberNumber)}</div>
    <div class="row" style="justify-content:space-between;margin-top:8px;font-size:12px"><span>${esc(user.name)}</span><span class="muted">Vence ${dateFmt(m.currentPeriodEnd, { day: '2-digit', month: '2-digit', year: '2-digit' })}</span></div></div>
  </div>`;
}

export async function clubView() {
  const plan = await api('/club/plan');
  const member = isMember();
  const user = state.user;
  return {
    title: 'Club Member',
    html: `
    <section class="club-hero"><div class="container">
      ${eyebrow('Club Member', '小松会')}
      <h1>El Club Komatsu</h1>
      <p class="lead" style="margin:16px auto">Para quienes quieren cada cosecha primero. Precios de socio, tiradas limitadas y encuentros en la bodega.</p>
      <div class="price-tag">${money(plan.monthlyPrice)} <small>/ MES</small></div>
      <p class="muted" style="font-size:13px">Débito mensual automático · Cancelás cuando quieras</p>
      <div class="row center" style="margin-top:22px">
        ${member ? `<a class="btn gold" href="#/club/shop">Ir al Member Shop</a><a class="btn" href="#/club/socios">Área de socios</a>`
                 : `<button class="btn gold" id="join">Hacerme socio</button>`}
      </div>
    </div></section>
    <section class="section"><div class="container">
      ${eyebrow('Beneficios', '特典')}
      <h2 style="margin-bottom:28px">Lo que incluye tu membresía</h2>
      <div class="grid-3">${plan.benefits.map(b => `<div class="pillar benefit"><span class="jp">${esc(b.jp)}</span><h3 style="margin-top:8px">${esc(b.title)}</h3><p>${esc(b.text)}</p></div>`).join('')}</div>
    </div></section>
    ${!member ? `<section class="section" id="alta"><div class="container" style="max-width:640px">
      <div class="panel gold" id="join-panel">
        <h2 style="font-size:22px">Alta de socio <span class="jp gold-text">入会</span></h2>
        ${user ? `
          <p class="muted">Vas a suscribirte como <strong>${esc(user.name)}</strong> (${esc(user.email)}).</p>
          <div class="sum-row"><span>Membresía mensual</span><span>${money(plan.monthlyPrice)}</span></div>
          <div class="sum-row total"><span>Hoy pagás</span><span>${money(plan.monthlyPrice)}</span></div>
          <label class="check" style="margin:16px 0"><input type="checkbox" id="terms"> Acepto la renovación mensual automática y las <a href="#/legal" class="gold-text">condiciones del Club</a>. Puedo cancelar en cualquier momento.</label>
          <p class="muted" style="font-size:13px">Modo demostración: el pago se aprueba automáticamente (preparado para suscripciones de Mercado Pago).</p>
          <p class="error-msg" id="err" hidden></p>
          <button class="btn gold block" id="subscribe">Confirmar y pagar</button>`
        : `<p class="muted">Para sumarte al Club necesitás una cuenta.</p>
           <div class="row"><a class="btn gold" href="#/registro?next=club">Crear cuenta</a><a class="btn" href="#/login?next=club">Ya tengo cuenta</a></div>`}
      </div></div></section>` : ''}`,
    mount(root) {
      root.querySelector('#join')?.addEventListener('click', () => root.querySelector('#alta').scrollIntoView({ behavior: 'smooth' }));
      const btn = root.querySelector('#subscribe');
      btn?.addEventListener('click', async () => {
        const err = root.querySelector('#err'); err.hidden = true;
        if (!root.querySelector('#terms').checked) { err.textContent = 'Tenés que aceptar las condiciones del Club.'; err.hidden = false; return; }
        btn.disabled = true; btn.textContent = 'Procesando…';
        try {
          await api('/membership/subscribe', { method: 'POST', body: { acceptTerms: true } });
          await refreshUser();
          toast('¡Bienvenido al Club Komatsu! · 入会ありがとうございます');
          go('club/socios');
        } catch (ex) {
          if (ex.status === 401) return needLogin();
          err.textContent = ex.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Confirmar y pagar';
        }
      });
    },
  };
}

export async function membersAreaView() {
  if (!state.user) return needLogin();
  if (!isMember() && !isAdmin()) { go('club'); return null; }
  const { announcements, events } = await api('/club/feed');
  const user = state.user;
  const render = () => events.map(e => {
    const d = new Date(e.startsAt);
    return `<article class="event">
      <div class="event-date"><b>${d.getDate()}</b><span>${d.toLocaleDateString('es-AR', { month: 'short' })}</span></div>
      <div><h3>${esc(e.title)} ${e.titleJp ? `<span class="jp gold-text" style="font-size:14px">${esc(e.titleJp)}</span>` : ''}</h3>
        <p class="muted" style="margin:6px 0">${esc(e.description)}</p>
        <p style="font-size:13px;margin:0 0 10px">${dateFmt(e.startsAt, { weekday: 'long', day: 'numeric', month: 'long' })} · ${timeFmt(e.startsAt)} · ${esc(e.location)} · <span class="${e.seatsLeft ? '' : 'gold-text'}">${e.seatsLeft ? `${e.seatsLeft} cupos` : 'Completo'}</span></p>
        ${e.attending
          ? `<div class="row"><span class="badge gold">Reservado${e.myGuests ? ' +1' : ''}</span><button class="link" data-cancel="${e.id}">Cancelar reserva</button></div>`
          : `<div class="row"><select data-guests="${e.id}" aria-label="Acompañantes" style="min-height:36px;background:var(--carbon);border:1px solid var(--line);padding:0 8px"><option value="0">Sólo yo</option><option value="1">Yo + 1</option></select>
             <button class="btn small gold" data-rsvp="${e.id}" ${e.seatsLeft ? '' : 'disabled'}>Reservar lugar</button></div>`}
      </div></article>`;
  }).join('') || '<p class="muted">No hay degustaciones programadas por ahora.</p>';

  return {
    title: 'Área de socios',
    html: `<section class="section"><div class="container">
      <div class="grid-2" style="align-items:start">
        <div>
          ${eyebrow('Área de socios', '会員ページ')}
          <h1>Hola, ${esc(user.name.split(' ')[0])}</h1>
          <p class="lead">Gracias por ser parte del Club. Acá vas a encontrar anuncios, premios y las próximas degustaciones.</p>
          <div class="row" style="margin-top:18px"><a class="btn gold" href="#/club/shop">Member Shop</a><a class="btn" href="#/cuenta?tab=club">Mi membresía</a></div>
        </div>
        ${user.membership ? memberCard(user) : ''}
      </div>
    </div></section>
    <section class="section"><div class="container grid-2" style="align-items:start">
      <div>${eyebrow('Degustaciones y eventos', '利き酒会')}<div id="events">${render()}</div></div>
      <div>${eyebrow('Anuncios y premios', 'お知らせ')}
        ${announcements.map(a => `<article class="feed-item"><span class="kind ${esc(a.kind)}">${esc(a.kind)}${a.titleJp ? ` · <span class="jp">${esc(a.titleJp)}</span>` : ''}</span><h3>${esc(a.title)}</h3><p class="muted" style="margin:4px 0">${esc(a.body)}</p><small class="muted">${dateFmt(a.createdAt)}</small></article>`).join('')}
      </div>
    </div></section>`,
    mount(root) {
      root.querySelector('#events').addEventListener('click', async e => {
        const rsvp = e.target.closest('[data-rsvp]'), cancel = e.target.closest('[data-cancel]');
        if (!rsvp && !cancel) return;
        try {
          if (rsvp) {
            const guests = Number(root.querySelector(`[data-guests="${rsvp.dataset.rsvp}"]`).value);
            await api(`/club/events/${rsvp.dataset.rsvp}/rsvp`, { method: 'POST', body: { guests } });
            toast('Lugar reservado. ¡Te esperamos! · お待ちしております');
          } else {
            await api(`/club/events/${cancel.dataset.cancel}/rsvp`, { method: 'DELETE' });
            toast('Reserva cancelada');
          }
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        } catch (ex) { toast(ex.message, 'error'); }
      });
    },
  };
}
