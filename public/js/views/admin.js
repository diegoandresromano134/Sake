import { api } from '../api.js';
import { esc, eyebrow, money, toast, dateFmt, formData, productArt, resizeImage } from '../ui.js';
import { state, isAdmin } from '../store.js';
import { needLogin, go } from '../app.js';
import { orderDetail } from './cart.js';

const TABS = [['pedidos', 'Pedidos'], ['productos', 'Productos y stock'], ['socios', 'Socios'], ['publicar', 'Anuncios y eventos']];
const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

export default async function admin({ query }) {
  if (!state.user) return needLogin();
  if (!isAdmin()) return { title: 'Acceso restringido', html: '<div class="container empty"><span class="kanji">禁</span><h2>Acceso restringido</h2></div>' };
  const tab = TABS.some(([t]) => t === query.tab) ? query.tab : 'pedidos';
  const s = await api('/admin/summary');
  let body = '';

  if (tab === 'pedidos') {
    const { orders, statuses } = await api('/admin/orders');
    body = orders.length ? orders.map(o => `<div>${orderDetail(o)}
      <div class="row" style="margin:-6px 0 22px;font-size:13px"><span class="muted">${esc(o.email)} · ${esc(o.shipTo.name)} · ${esc(o.shipTo.phone)}${o.shipTo.zip ? ` · CP ${esc(o.shipTo.zip)}` : ''}${o.notes ? ` · “${esc(o.notes)}”` : ''}</span>
        <label class="label" for="st-${esc(o.code)}">Estado</label>
        <select id="st-${esc(o.code)}" data-order="${esc(o.code)}" style="min-height:34px;background:var(--carbon);border:1px solid var(--line);padding:0 8px">${statuses.map(x => `<option ${x === o.status ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>`).join('')
      : '<p class="muted">Todavía no hay pedidos.</p>';
  } else if (tab === 'productos') {
    const { products } = await api('/admin/products');
    body = `<p class="muted" style="margin-top:0">Fotos: ideal vertical (4:5), botella centrada sobre fondo oscuro. Se achican solas antes de subir.</p><div class="table-wrap"><table><thead><tr><th>Foto</th><th>Producto</th><th>Cosecha</th><th class="num">Precio</th><th class="num">Precio socio</th><th class="num">Stock</th><th>Preventa socios hasta</th><th>Exclusivo</th><th>Activo</th><th></th></tr></thead><tbody>
      ${products.map(p => `<tr data-id="${p.id}">
        <td><div class="photo-cell">
          <div class="photo-thumb">${productArt({ id: 'adm' + p.id, name: p.name, format: p.format, accent: p.accent, vintage: p.vintage, photo: p.photo })}</div>
          <div class="photo-actions">
            <label class="btn small file-btn">${p.photo ? 'Cambiar foto' : 'Subir foto'}<input type="file" accept="image/jpeg,image/png,image/webp" data-photo="${p.id}" aria-label="Foto de ${esc(p.name)}"></label>
            ${p.photo ? `<button class="link" data-unphoto="${p.id}">Quitar foto</button>` : ''}
          </div></div></td>
        <td>${esc(p.name)}<div class="muted" style="font-size:12px">${p.volume_ml} ml</div></td>
        <td><input name="vintage" type="number" value="${p.vintage}" style="width:80px"></td>
        <td class="num"><input name="price" type="number" min="0" value="${p.price}"></td>
        <td class="num"><input name="member_price" type="number" min="0" value="${p.member_price}"></td>
        <td class="num"><input name="stock" type="number" min="0" value="${p.stock}" style="width:80px"></td>
        <td><input name="presale_until" type="date" value="${p.presale_until ? p.presale_until.slice(0, 10) : ''}" style="width:150px"></td>
        <td><input name="members_only" type="checkbox" ${p.members_only ? 'checked' : ''} style="width:auto;min-height:0"></td>
        <td><input name="active" type="checkbox" ${p.active ? 'checked' : ''} style="width:auto;min-height:0"></td>
        <td><button class="btn small" data-save="${p.id}">Guardar</button></td></tr>`).join('')}
    </tbody></table></div>`;
  } else if (tab === 'socios') {
    const { members } = await api('/admin/members');
    body = `<div class="table-wrap"><table><thead><tr><th>N°</th><th>Nombre</th><th>Email</th><th>Estado</th><th>Vence</th></tr></thead><tbody>
      ${members.map(m => `<tr><td>${esc(m.number)}</td><td>${esc(m.name)}</td><td>${esc(m.email)}</td><td><span class="status ${m.status === 'active' ? 'activa' : 'vencida'}">${m.status === 'active' ? (m.cancelAtEnd ? 'cancela al vencer' : 'activa') : esc(m.status)}</span></td><td>${dateFmt(m.periodEnd)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin socios todavía.</td></tr>'}
    </tbody></table></div>`;
  } else {
    body = `<div class="grid-2" style="align-items:start">
      <form class="form panel" id="ann"><h3>Nuevo anuncio / premio</h3>
        <div class="field"><label for="a-kind">Tipo</label><select id="a-kind" name="kind"><option value="anuncio">Anuncio</option><option value="premio">Premio</option><option value="lanzamiento">Lanzamiento</option></select></div>
        <div class="field"><label for="a-title">Título</label><input id="a-title" name="title" required></div>
        <div class="field"><label for="a-jp">Título en japonés (opcional)</label><input id="a-jp" name="titleJp"></div>
        <div class="field"><label for="a-body">Texto</label><textarea id="a-body" name="body" required></textarea></div>
        <label class="check"><input type="checkbox" name="public"> Mostrar también en la home pública</label>
        <button class="btn gold" type="submit">Publicar</button></form>
      <form class="form panel" id="evt"><h3>Nueva degustación / evento</h3>
        <div class="field"><label for="e-title">Título</label><input id="e-title" name="title" required></div>
        <div class="field"><label for="e-jp">Título en japonés (opcional)</label><input id="e-jp" name="titleJp"></div>
        <div class="field"><label for="e-desc">Descripción</label><textarea id="e-desc" name="description" required></textarea></div>
        <div class="form-2"><div class="field"><label for="e-date">Fecha y hora</label><input id="e-date" name="startsAt" type="datetime-local" required></div>
        <div class="field"><label for="e-cap">Cupo</label><input id="e-cap" name="capacity" type="number" min="1" value="20" required></div></div>
        <div class="field"><label for="e-loc">Lugar</label><input id="e-loc" name="location" value="Bodega Komatsu" required></div>
        <button class="btn gold" type="submit">Crear evento</button></form></div>`;
  }

  return {
    title: 'Administración',
    html: `<section class="section"><div class="container">
      ${eyebrow('Administración', '管理')}<h1 style="margin-bottom:24px">Panel Komatsu</h1>
      <div class="kpis">
        <div class="kpi"><b>${money(s.revenue)}</b><span>Ventas</span></div>
        <div class="kpi"><b>${s.orders}</b><span>Pedidos</span></div>
        <div class="kpi"><b>${s.pending}</b><span>A preparar</span></div>
        <div class="kpi"><b>${s.members}</b><span>Socios activos</span></div>
        <div class="kpi"><b>${money(s.mrr)}</b><span>Ingreso mensual Club</span></div>
        <div class="kpi"><b>${s.users}</b><span>Clientes</span></div>
      </div>
      <div class="tabs" role="tablist">${TABS.map(([t, l]) => `<button role="tab" aria-selected="${t === tab}" data-tab="${t}">${l}</button>`).join('')}</div>
      ${body}
    </div></section>`,
    mount(root) {
      root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => go('admin?tab=' + b.dataset.tab)));
      root.querySelectorAll('[data-order]').forEach(sel => sel.addEventListener('change', async () => {
        try { await api('/admin/orders/' + sel.dataset.order, { method: 'PATCH', body: { status: sel.value } }); toast('Estado actualizado'); reload(); }
        catch (ex) { toast(ex.message, 'error'); }
      }));
      root.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', async () => {
        const tr = b.closest('tr'), v = n => tr.querySelector(`[name="${n}"]`);
        try {
          await api('/admin/products/' + b.dataset.save, { method: 'PATCH', body: {
            vintage: Number(v('vintage').value), price: Number(v('price').value), member_price: Number(v('member_price').value), stock: Number(v('stock').value),
            presale_until: v('presale_until').value ? v('presale_until').value + 'T23:59:59' : null,
            members_only: v('members_only').checked, active: v('active').checked } });
          toast('Producto actualizado');
        } catch (ex) { toast(ex.message, 'error'); }
      }));
      root.querySelectorAll('[data-photo]').forEach(input => input.addEventListener('change', async () => {
        const file = input.files[0]; if (!file) return;
        const label = input.parentElement; label.firstChild.textContent = 'Subiendo…';
        try {
          const dataUrl = await resizeImage(file);
          await api(`/admin/products/${input.dataset.photo}/photo`, { method: 'POST', body: { dataUrl } });
          toast('Foto actualizada'); reload();
        } catch (ex) { toast(ex.message, 'error'); label.firstChild.textContent = 'Subir foto'; }
      }));
      root.querySelectorAll('[data-unphoto]').forEach(b => b.addEventListener('click', async () => {
        try { await api(`/admin/products/${b.dataset.unphoto}/photo`, { method: 'DELETE' }); toast('Foto quitada: vuelve el dibujo'); reload(); }
        catch (ex) { toast(ex.message, 'error'); }
      }));
      const wire = (sel, path, map = d => d) => root.querySelector(sel)?.addEventListener('submit', async e => {
        e.preventDefault();
        try { await api(path, { method: 'POST', body: map(formData(e.target)) }); toast('Publicado'); e.target.reset(); }
        catch (ex) { toast(ex.message, 'error'); }
      });
      wire('#ann', '/admin/announcements', d => ({ ...d, public: !!d.public }));
      wire('#evt', '/admin/events', d => ({ ...d, startsAt: new Date(d.startsAt).toISOString(), capacity: Number(d.capacity) }));
    },
  };
}
