import { api } from '../api.js';
import { esc, eyebrow, money, toast, dateFmt, timeFmt, productArt, resizeImage } from '../ui.js';
import { state, isAdmin } from '../store.js';
import { needLogin, go } from '../app.js';
import { orderDetail } from './cart.js';

const TABS = [
  ['pedidos', 'Pedidos'], ['productos', 'Productos'], ['ediciones', 'Ediciones numeradas'], ['degustaciones', 'Degustaciones'], ['anuncios', 'Anuncios y premios'],
  ['alianzas', 'Marcas y alianzas'], ['socios', 'Socios'], ['ajustes', 'Ajustes'],
];
const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

// ---------- Editor genérico (alta, edición y baja) ----------
const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };

function field(f, value, uid) {
  const id = `${uid}-${f.name}`;
  const v = value ?? f.default ?? '';
  const wrap = inner => `<div class="field${f.full ? ' full' : ''}"><label for="${id}">${esc(f.label)}</label>${inner}${f.hint ? `<small class="muted">${esc(f.hint)}</small>` : ''}</div>`;
  switch (f.type) {
    case 'textarea': return wrap(`<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" ${f.required ? 'required' : ''}>${esc(v)}</textarea>`);
    case 'select': return wrap(`<select id="${id}" name="${f.name}">${f.options.map(([o, l]) => `<option value="${esc(o)}" ${String(o) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`);
    case 'checkbox': return `<label class="check${f.full ? ' full' : ''}"><input type="checkbox" id="${id}" name="${f.name}" ${(value ?? f.default) ? 'checked' : ''}> ${esc(f.label)}</label>`;
    case 'datetime': return wrap(`<input id="${id}" name="${f.name}" type="datetime-local" value="${esc(toLocalInput(value))}" ${f.required ? 'required' : ''}>`);
    case 'date': return wrap(`<input id="${id}" name="${f.name}" type="date" value="${esc(value ? String(value).slice(0, 10) : '')}">`);
    case 'number': return wrap(`<input id="${id}" name="${f.name}" type="number" step="${f.step || 1}" ${f.min != null ? `min="${f.min}"` : ''} value="${esc(v)}" ${f.required ? 'required' : ''}>`);
    default: return wrap(`<input id="${id}" name="${f.name}" ${f.list ? `list="${f.list}"` : ''} placeholder="${esc(f.placeholder || '')}" value="${esc(v)}" ${f.required ? 'required' : ''}>`);
  }
}

function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    const el = form.elements[f.name]; if (!el) continue;
    if (f.type === 'checkbox') out[f.name] = el.checked;
    else if (f.type === 'number') out[f.name] = el.value === '' ? '' : Number(el.value);
    else if (f.type === 'datetime') out[f.name] = el.value ? new Date(el.value).toISOString() : '';
    else if (f.type === 'date') out[f.name] = el.value ? el.value + 'T23:59:59' : null;
    else out[f.name] = el.value;
  }
  return out;
}

const EDITORS = {};
function editor(key, { endpoint, fields, newFields = fields, items, newLabel, title, meta, extra, canDelete = true, open }) {
  EDITORS[key] = { endpoint, fields, newFields };
  const form = (item, uid) => `<form class="form editor-form" data-ed="${key}" data-id="${item ? item.id : ''}" novalidate>
      <div class="editor-grid">${(item ? fields : newFields).map(f => field(f, item ? item[f.name] : undefined, uid)).join('')}</div>
      ${item && extra ? extra(item) : ''}
      <div class="row"><button class="btn gold small" type="submit">${item ? 'Guardar cambios' : 'Crear'}</button>
        ${item && canDelete ? '<button class="btn ghost small" type="button" data-del>Eliminar</button>' : ''}</div>
    </form>`;
  return `<details class="editor-item editor-new"${open ? ' open' : ''}><summary><span class="gold-text">+ ${esc(newLabel)}</span></summary>${form(null, `${key}-new`)}</details>
    ${items.map(it => `<details class="editor-item"><summary><span>${title(it)}</span><span class="muted editor-meta">${meta ? meta(it) : ''}</span></summary>${form(it, `${key}-${it.id}`)}</details>`).join('')
      || '<p class="muted">Todavía no hay nada cargado.</p>'}`;
}

function mountEditors(root) {
  root.querySelectorAll('form[data-ed]').forEach(form => {
    const { endpoint, fields, newFields } = EDITORS[form.dataset.ed];
    const id = form.dataset.id;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try {
        await api(id ? `${endpoint}/${id}` : endpoint, { method: id ? 'PATCH' : 'POST', body: readForm(form, id ? fields : newFields) });
        toast(id ? 'Cambios guardados' : 'Creado'); reload();
      } catch (ex) { toast(ex.message, 'error'); btn.disabled = false; }
    });
    form.querySelector('[data-del]')?.addEventListener('click', async ev => {
      const b = ev.currentTarget;
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Confirmar: eliminar'; b.classList.add('red'); return; }
      try { await api(`${endpoint}/${id}`, { method: 'DELETE' }); toast('Eliminado'); reload(); }
      catch (ex) { toast(ex.message, 'error'); }
    });
  });
}

// ---------- Definición de campos ----------
const PRODUCT_FIELDS = [
  { name: 'name', label: 'Nombre', required: true },
  { name: 'name_jp', label: 'Nombre en japonés' },
  { name: 'variety', label: 'Estilo', placeholder: 'frutado, cereza, yuzu…' },
  { name: 'format', label: 'Formato', type: 'select', options: [['botella', 'Botella'], ['tokkuri', 'Tokkuri'], ['pack', 'Pack']] },
  { name: 'volume_ml', label: 'Volumen (ml)', type: 'number', min: 10 },
  { name: 'vintage', label: 'Cosecha', type: 'number', min: 2000 },
  { name: 'abv', label: 'Graduación (% vol.)', type: 'number', step: 0.1, min: 0 },
  { name: 'accent', label: 'Color de detalle (dibujo)', type: 'select', options: [['gold', 'Dorado'], ['red', 'Rojo']] },
  { name: 'sort', label: 'Orden en el catálogo', type: 'number', min: 0 },
  { name: 'tagline', label: 'Bajada (frase corta)', full: true },
  { name: 'description', label: 'Descripción', type: 'textarea', full: true },
  { name: 'tasting_notes', label: 'Notas de cata', type: 'textarea', rows: 2, full: true },
  { name: 'pairing', label: 'Maridaje', full: true },
  { name: 'ingredients', label: 'Ingredientes', full: true, placeholder: 'Agua, arroz Koshihikari orgánico, koji de arroz, levadura. Sin TACC.' },
];
const NEW_PRODUCT_FIELDS = [
  ...PRODUCT_FIELDS,
  { name: 'price', label: 'Precio público', type: 'number', min: 0, required: true },
  { name: 'member_price', label: 'Precio socio', type: 'number', min: 0, required: true },
  { name: 'stock', label: 'Stock', type: 'number', min: 0, default: 0 },
  { name: 'members_only', label: 'Exclusivo para socios', type: 'checkbox' },
  { name: 'active', label: 'Visible en la tienda', type: 'checkbox', default: true },
];
const EVENT_FIELDS = [
  { name: 'title', label: 'Título', required: true },
  { name: 'titleJp', label: 'Título en japonés (opcional)' },
  { name: 'startsAt', label: 'Fecha y hora', type: 'datetime', required: true },
  { name: 'capacity', label: 'Cupo (personas)', type: 'number', min: 1, default: 20 },
  { name: 'location', label: 'Lugar', default: 'Bodega Komatsu', full: true },
  { name: 'description', label: 'Descripción', type: 'textarea', full: true },
  { name: 'active', label: 'Visible para los socios', type: 'checkbox', default: true, full: true },
];
const ANN_FIELDS = [
  { name: 'kind', label: 'Tipo', type: 'select', options: [['anuncio', 'Anuncio'], ['premio', 'Premio'], ['lanzamiento', 'Lanzamiento']] },
  { name: 'title', label: 'Título', required: true },
  { name: 'titleJp', label: 'Título en japonés (opcional)' },
  { name: 'body', label: 'Texto', type: 'textarea', full: true },
  { name: 'public', label: 'Mostrar también en la página de inicio (si no, sólo lo ven los socios)', type: 'checkbox', full: true },
];
const ALLY_FIELDS = [
  { name: 'name', label: 'Nombre', required: true },
  { name: 'category', label: 'Tipo', list: 'ally-kinds', placeholder: 'proveedor, restaurante, punto de venta…' },
  { name: 'url', label: 'Sitio web o Instagram (opcional)', placeholder: 'https://…' },
  { name: 'sort', label: 'Orden', type: 'number', min: 0, default: 0 },
  { name: 'description', label: 'Descripción', type: 'textarea', rows: 2, full: true },
  { name: 'active', label: 'Mostrar en La Bodega', type: 'checkbox', default: true, full: true },
];

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
        <select id="st-${esc(o.code)}" data-order="${esc(o.code)}" class="mini-select">${statuses.map(x => `<option ${x === o.status ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>`).join('')
      : '<p class="muted">Todavía no hay pedidos.</p>';
  } else if (tab === 'productos') {
    const { products } = await api('/admin/products');
    body = `<h3 class="admin-h">Precios, stock y fotos</h3>
      <p class="muted" style="margin-top:0">Fotos: ideal vertical (4:5), botella centrada sobre fondo oscuro. Se achican solas antes de subir.</p>
      <div class="table-wrap"><table><thead><tr><th>Foto</th><th>Producto</th><th>Cosecha</th><th class="num">Precio</th><th class="num">Precio socio</th><th class="num">Stock</th><th>Preventa socios hasta</th><th>Exclusivo</th><th>Visible</th><th></th></tr></thead><tbody>
      ${products.map(p => `<tr data-id="${p.id}">
        <td><div class="photo-cell">
          <div class="photo-thumb">${productArt({ id: 'adm' + p.id, name: p.name, format: p.format, accent: p.accent, vintage: p.vintage, photo: p.photo })}</div>
          <div class="photo-actions">
            <label class="btn small file-btn">${p.photo ? 'Cambiar foto' : 'Subir foto'}<input type="file" accept="image/jpeg,image/png,image/webp" data-photo="${p.id}" aria-label="Foto de ${esc(p.name)}"></label>
            ${p.photo ? `<button class="link" data-unphoto="${p.id}">Quitar foto</button>` : ''}
          </div></div></td>
        <td>${esc(p.name)}<div class="muted" style="font-size:12px">${p.volume_ml} ml</div></td>
        <td><input name="vintage" type="number" value="${p.vintage}" style="width:80px" aria-label="Cosecha"></td>
        <td class="num"><input name="price" type="number" min="0" value="${p.price}" aria-label="Precio"></td>
        <td class="num"><input name="member_price" type="number" min="0" value="${p.member_price}" aria-label="Precio socio"></td>
        <td class="num"><input name="stock" type="number" min="0" value="${p.stock}" style="width:80px" aria-label="Stock"></td>
        <td><input name="presale_until" type="date" value="${p.presale_until ? p.presale_until.slice(0, 10) : ''}" style="width:150px" aria-label="Preventa hasta"></td>
        <td><input name="members_only" type="checkbox" ${p.members_only ? 'checked' : ''} style="width:auto;min-height:0" aria-label="Exclusivo"></td>
        <td><input name="active" type="checkbox" ${p.active ? 'checked' : ''} style="width:auto;min-height:0" aria-label="Visible"></td>
        <td><button class="btn small" data-save="${p.id}">Guardar</button></td></tr>`).join('')}
      </tbody></table></div>
      <h3 class="admin-h">Fichas de producto</h3>
      <p class="muted" style="margin-top:0">Nombre, textos, notas de cata, maridaje e ingredientes que se ven en la tienda. Para sacar un producto de la venta, destildá «Visible».</p>
      ${editor('productos', { endpoint: '/admin/products', fields: PRODUCT_FIELDS, newFields: NEW_PRODUCT_FIELDS, items: products, newLabel: 'Nuevo producto',
        canDelete: false, title: p => esc(p.name), meta: p => `${p.volume_ml} ml · ${p.vintage}${p.active ? '' : ' · oculto'}` })}`;
  } else if (tab === 'ediciones') {
    const [{ editions }, { products }] = await Promise.all([api('/admin/editions'), api('/admin/products')]);
    const sel = editions.find(e => String(e.id) === query.ed);
    const codes = sel ? (await api(`/admin/editions/${sel.id}/codes?limit=300`)).codes : [];
    body = `<p class="muted" style="margin-top:0">Cada edición genera un código único por botella (Nº 1 a N). La imprenta lo pone en la etiqueta junto a un QR con el link del certificado; el comprador lo registra a su nombre en la web.</p>
      <form class="form panel" id="new-edition" style="margin-bottom:28px">
        <h3>Nueva edición numerada</h3>
        <div class="editor-grid">
          <div class="field"><label for="ed-prod">Producto</label><select id="ed-prod" name="productId">${products.map(p => `<option value="${p.id}">${esc(p.name)} · ${p.volume_ml} ml</option>`).join('')}</select></div>
          <div class="field"><label for="ed-vin">Cosecha</label><input id="ed-vin" name="vintage" type="number" min="2000" value="${new Date().getFullYear()}"></div>
          <div class="field"><label for="ed-size">Cantidad de botellas</label><input id="ed-size" name="size" type="number" min="1" max="20000" value="1000"></div>
          <div class="field"><label for="ed-name">Nombre de la edición (opcional)</label><input id="ed-name" name="name" placeholder="Primera nieve"></div>
        </div>
        <button class="btn gold small" type="submit">Generar códigos</button>
      </form>
      ${editions.length ? `<div class="table-wrap"><table><thead><tr><th>Edición</th><th>Cosecha</th><th class="num">Botellas</th><th class="num">Registradas</th><th></th></tr></thead><tbody>
        ${editions.map(e => `<tr><td>${esc(e.product)}${e.name ? `<div class="muted" style="font-size:12px">${esc(e.name)}</div>` : ''}</td><td>${e.vintage}</td><td class="num">${e.size}</td><td class="num">${e.claimed}</td>
          <td><a class="btn small" href="#/admin?tab=ediciones&ed=${e.id}">Ver códigos</a> <a class="link" href="/api/admin/editions/${e.id}/codes.csv">Descargar CSV para imprenta</a></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Todavía no hay ediciones numeradas.</p>'}
      ${sel ? `<h3 class="admin-h">Códigos · ${esc(sel.product)} ${sel.vintage}${sel.name ? ' · ' + esc(sel.name) : ''}</h3>
        <div class="table-wrap"><table><thead><tr><th>Nº</th><th>Código</th><th>Propietario</th><th></th></tr></thead><tbody>
        ${codes.map(c => `<tr><td>${c.number} / ${sel.size}</td><td class="mono">${esc(c.code)}</td><td>${c.owner ? esc(c.owner) : '<span class="muted">—</span>'}</td><td><a class="link" href="#/certificado/${esc(c.code)}">Ver certificado</a></td></tr>`).join('')}
        </tbody></table></div>${sel.size > codes.length ? `<p class="muted" style="font-size:13px">Se muestran las primeras ${codes.length}. El CSV tiene todas.</p>` : ''}` : ''}`;
  } else if (tab === 'degustaciones') {
    const { events } = await api('/admin/events');
    body = `<p class="muted" style="margin-top:0">Las degustaciones visibles aparecen en el Área de socios para reservar lugar. Podés cambiar fecha, cupo y lugar en cualquier momento.</p>
      ${editor('eventos', { endpoint: '/admin/events', fields: EVENT_FIELDS, items: events, newLabel: 'Nueva degustación o evento', open: !events.length,
        title: e => esc(e.title), meta: e => `${dateFmt(e.startsAt, { day: 'numeric', month: 'short', year: 'numeric' })} · ${timeFmt(e.startsAt)} · ${e.taken}/${e.capacity} lugares${e.active ? '' : ' · oculto'}${new Date(e.startsAt) < new Date() ? ' · pasado' : ''}`,
        extra: e => `<div class="attendees"><p class="label">Reservas (${e.taken} personas)</p>${e.attendees.length
          ? `<ul>${e.attendees.map(a => `<li>${esc(a.name)} <span class="muted">· ${esc(a.email)}${a.guests ? ' · +1' : ''}</span></li>`).join('')}</ul>` : '<p class="muted">Nadie reservó todavía.</p>'}</div>` })}`;
  } else if (tab === 'anuncios') {
    const { announcements } = await api('/admin/announcements');
    body = editor('anuncios', { endpoint: '/admin/announcements', fields: ANN_FIELDS, items: announcements, newLabel: 'Nuevo anuncio o premio',
      title: a => esc(a.title), meta: a => `${esc(a.kind)} · ${dateFmt(a.createdAt, { day: 'numeric', month: 'short' })} · ${a.public ? 'público' : 'sólo socios'}` });
  } else if (tab === 'alianzas') {
    const { alliances } = await api('/admin/alliances');
    body = `<p class="muted" style="margin-top:0">Proveedores, restaurantes, puntos de venta y marcas que aparecen en La Bodega → Marcas y alianzas.</p>
      <datalist id="ally-kinds"><option value="proveedor"><option value="restaurante"><option value="punto de venta"><option value="marca aliada"><option value="comunidad"></datalist>
      ${editor('alianzas', { endpoint: '/admin/alliances', fields: ALLY_FIELDS, items: alliances, newLabel: 'Nueva marca, proveedor o alianza',
        title: a => esc(a.name), meta: a => `${esc(a.category)}${a.active ? '' : ' · oculto'}` })}`;
  } else if (tab === 'socios') {
    const { members } = await api('/admin/members');
    body = `<div class="table-wrap"><table><thead><tr><th>N°</th><th>Nombre</th><th>Email</th><th>Estado</th><th>Vence</th></tr></thead><tbody>
      ${members.map(m => `<tr><td>${esc(m.number)}</td><td>${esc(m.name)}</td><td>${esc(m.email)}</td><td><span class="status ${m.status === 'active' ? 'activa' : 'vencida'}">${m.status === 'active' ? (m.cancelAtEnd ? 'cancela al vencer' : 'activa') : esc(m.status)}</span></td><td>${dateFmt(m.periodEnd)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin socios todavía.</td></tr>'}
    </tbody></table></div>`;
  } else {
    const { settings, labels } = await api('/admin/settings');
    body = `<form class="form panel" id="settings" style="max-width:560px">
      ${Object.keys(settings).map(k => field({ name: k, label: labels[k] + (k === 'max_reserva' ? ' (unidades por pedido)' : ' ($)'), type: 'number', min: 0 }, settings[k], 'set')).join('')}
      <p class="muted" style="font-size:13px;margin:0">La nueva cuota del Club se cobra a los socios nuevos y en la próxima renovación de los actuales.</p>
      <button class="btn gold" type="submit">Guardar ajustes</button></form>`;
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
      root.querySelector('#settings')?.addEventListener('submit', async e => {
        e.preventDefault();
        const body = Object.fromEntries([...new FormData(e.target)].map(([k, v]) => [k, Number(v)]));
        try { await api('/admin/settings', { method: 'PATCH', body }); toast('Ajustes guardados'); }
        catch (ex) { toast(ex.message, 'error'); }
      });
      root.querySelector('#new-edition')?.addEventListener('submit', async e => {
        e.preventDefault();
        const f = e.target, btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Generando…';
        try {
          const { id } = await api('/admin/editions', { method: 'POST', body: { productId: Number(f.elements.productId.value), vintage: Number(f.elements.vintage.value), size: Number(f.elements.size.value), name: f.elements.name.value } });
          toast('Edición creada con sus códigos'); go('admin?tab=ediciones&ed=' + id);
        } catch (ex) { toast(ex.message, 'error'); btn.disabled = false; btn.textContent = 'Generar códigos'; }
      });
      mountEditors(root);
    },
  };
}
