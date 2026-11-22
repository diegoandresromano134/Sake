import { api } from '../api.js';
import { esc, eyebrow, money, toast, dateFmt, formData } from '../ui.js';
import { state, refreshUser, isAdmin, clearCart } from '../store.js';
import { needLogin, go } from '../app.js';
import { orderDetail } from './cart.js';
import { memberCard } from './club.js';

const TABS = [['pedidos', 'Pedidos'], ['club', 'Membresía'], ['perfil', 'Perfil'], ['seguridad', 'Seguridad']];
const STATUS_LABEL = { activa: 'Activa', cancela_al_vencer: 'Se cancela al vencer', vencida: 'Vencida', pago_pendiente: 'Pago pendiente' };

export default async function account({ query }) {
  if (!state.user) return needLogin();
  const tab = TABS.some(([t]) => t === query.tab) ? query.tab : 'pedidos';
  const u = state.user;
  let body = '';
  if (tab === 'pedidos') {
    const { orders } = await api('/orders');
    body = orders.length ? orders.map(orderDetail).join('') : '<div class="empty"><span class="kanji">空</span><p class="muted">Todavía no hiciste pedidos.</p><a class="btn gold" href="#/shop">Ir al Shop</a></div>';
  } else if (tab === 'club') {
    const { membership: m, payments } = await api('/membership');
    body = !m ? `<div class="panel gold"><h3>Todavía no sos socio</h3><p class="muted">Sumate al Club por ${money((await api('/settings')).membershipPrice)} por mes.</p><a class="btn gold" href="#/club">Conocer el Club</a></div>` : `
      <div class="grid-2" style="align-items:start">
        <div>${m.active ? memberCard(u) : ''}</div>
        <div class="panel">
          <dl class="spec" style="margin-top:0">
            <dt>Estado</dt><dd><span class="status ${m.active ? 'activa' : 'vencida'}">${STATUS_LABEL[m.status] || m.status}</span></dd>
            <dt>N° de socio</dt><dd>${esc(m.memberNumber)}</dd>
            <dt>Cuota</dt><dd>${money(m.monthlyPrice)} / mes</dd>
            <dt>Socio desde</dt><dd>${dateFmt(m.startedAt)}</dd>
            <dt>${m.cancelAtPeriodEnd ? 'Beneficios hasta' : 'Próximo cobro'}</dt><dd>${dateFmt(m.currentPeriodEnd)}</dd>
          </dl>
          ${m.active && !m.cancelAtPeriodEnd ? '<button class="btn ghost" data-act="cancel">Cancelar membresía</button>' : ''}
          ${m.active && m.cancelAtPeriodEnd ? '<button class="btn gold" data-act="resume">Mantener mi membresía</button>' : ''}
          ${!m.active ? '<a class="btn gold" href="#/club">Reactivar membresía</a>' : ''}
        </div>
      </div>
      <h3 style="margin:36px 0 14px">Historial de pagos</h3>
      <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Período</th><th>Referencia</th><th class="num">Monto</th></tr></thead><tbody>
        ${payments.map(p => `<tr><td>${dateFmt(p.createdAt)}</td><td>${dateFmt(p.periodStart, { day: 'numeric', month: 'short' })} → ${dateFmt(p.periodEnd, { day: 'numeric', month: 'short', year: 'numeric' })}</td><td class="muted">${esc(p.ref)}</td><td class="num">${money(p.amount)}</td></tr>`).join('')}
      </tbody></table></div>`;
  } else if (tab === 'perfil') {
    body = `<form class="form panel" id="profile" style="max-width:520px">
      <div class="field"><label for="name">Nombre y apellido</label><input id="name" name="name" value="${esc(u.name)}" required></div>
      <div class="field"><label>Email</label><input value="${esc(u.email)}" disabled></div>
      <div class="field"><label for="phone">Teléfono</label><input id="phone" name="phone" value="${esc(u.phone || '')}" autocomplete="tel"></div>
      <p class="error-msg" hidden></p><button class="btn gold" type="submit">Guardar</button></form>`;
  } else {
    body = `<form class="form panel" id="pwd" style="max-width:520px">
      <div class="field"><label for="current">Contraseña actual</label><input id="current" name="current" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="next">Nueva contraseña</label><input id="next" name="next" type="password" autocomplete="new-password" minlength="8" required></div>
      <p class="muted" style="font-size:13px;margin:0">Al cambiarla se cierran tus sesiones en otros dispositivos.</p>
      <p class="error-msg" hidden></p><button class="btn gold" type="submit">Cambiar contraseña</button></form>`;
  }

  return {
    title: 'Mi cuenta',
    html: `<section class="section"><div class="container">
      <div class="shop-head"><div>${eyebrow('Mi cuenta', 'マイページ')}<h1>${esc(u.name)}</h1><p class="muted" style="margin:6px 0 0">${esc(u.email)}${u.member ? ' · <span class="gold-text">Socio del Club</span>' : ''}</p></div>
        <div class="row">${isAdmin() ? '<a class="btn small" href="#/admin">Administración</a>' : ''}<button class="btn small ghost" id="logout">Cerrar sesión</button></div></div>
      <div class="tabs" role="tablist">${TABS.map(([t, l]) => `<button role="tab" aria-selected="${t === tab}" data-tab="${t}">${l}</button>`).join('')}</div>
      ${body}
    </div></section>`,
    mount(root) {
      root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => go('cuenta?tab=' + b.dataset.tab)));
      root.querySelector('#logout').addEventListener('click', async () => {
        await api('/auth/logout', { method: 'POST' }); clearCart(); await refreshUser(); toast('Sesión cerrada · またね'); go('');
      });
      root.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
        // Confirmación en dos pasos (sin diálogos del navegador)
        if (b.dataset.act === 'cancel' && !b.dataset.armed) {
          b.dataset.armed = '1';
          b.textContent = 'Confirmar cancelación';
          b.insertAdjacentHTML('afterend', '<p class="muted" style="font-size:13px">Mantenés los beneficios hasta el fin del período pagado.</p>');
          return;
        }
        try {
          await api('/membership/' + b.dataset.act, { method: 'POST' });
          await refreshUser();
          toast(b.dataset.act === 'cancel' ? 'Membresía cancelada al fin del período' : 'Tu membresía sigue activa');
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        } catch (ex) { toast(ex.message, 'error'); }
      }));
      const wireForm = (sel, path, method, okMsg) => {
        const f = root.querySelector(sel); if (!f) return;
        f.addEventListener('submit', async e => {
          e.preventDefault(); const err = f.querySelector('.error-msg'); err.hidden = true;
          try { await api(path, { method, body: formData(f) }); await refreshUser(); toast(okMsg); if (sel === '#pwd') f.reset(); }
          catch (ex) { err.textContent = ex.message; err.hidden = false; }
        });
      };
      wireForm('#profile', '/auth/me', 'PATCH', 'Datos guardados');
      wireForm('#pwd', '/auth/password', 'POST', 'Contraseña actualizada');
    },
  };
}
