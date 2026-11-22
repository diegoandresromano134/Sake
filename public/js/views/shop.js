import { api } from '../api.js';
import { esc, eyebrow, productArt, priceBlock, flags, formatLabel, money, toast, dateFmt } from '../ui.js';
import { state, isMember, isAdmin, addToCart } from '../store.js';
import { productCard } from './home.js';
import { needLogin, go } from '../app.js';

const FILTERS = [['', 'Todo'], ['botella', 'Botellas 700 ml'], ['tokkuri', 'Tokkuri 330 ml'], ['pack', 'Pack dúo']];

function grid(products, member, base, formato) {
  const list = formato ? products.filter(p => p.format === formato) : products;
  return `
    <div class="filters" role="group" aria-label="Filtrar por formato">
      ${FILTERS.map(([v, l]) => `<a class="chip" aria-pressed="${(formato || '') === v}" href="#/${base}${v ? `?formato=${v}` : ''}">${l}</a>`).join('')}
    </div>
    <div class="products" style="margin-top:20px">${list.map(p => productCard(p, member)).join('') || '<p class="muted" style="padding:24px;background:var(--black)">No hay productos en este formato.</p>'}</div>`;
}

export async function shopView({ query }) {
  const { products, member } = await api('/products');
  return {
    title: 'Shop',
    html: `<section class="section"><div class="container">
      <div class="shop-head"><div>${eyebrow('Shop Público', '販売')}<h1>Catálogo</h1></div></div>
      ${member
        ? `<div class="notice"><span class="hanko">${'<span>小</span><span>松</span>'}</span><p>Estás viendo tus <strong>precios de socio</strong>. Las tiradas exclusivas están en el Member Shop.</p><a class="btn small gold" href="#/club/shop">Ir al Member Shop</a></div>`
        : `<div class="notice"><p>Los socios del Club tienen precios especiales, envío sin cargo y prioridad en cada cosecha.</p><a class="btn small" href="#/club">Conocer el Club</a></div>`}
      ${grid(products, member, 'shop', query.formato)}
    </div></section>`,
  };
}

export async function memberShopView({ query }) {
  if (!state.user) return needLogin();
  if (!isMember() && !isAdmin()) {
    return {
      title: 'Member Shop',
      html: `<section class="club-hero"><div class="container">
        ${eyebrow('Member Shop', '会員限定')}<h1>Acceso exclusivo para socios</h1>
        <p class="lead" style="margin:16px auto">El Member Shop tiene precios de socio, preventas y ediciones numeradas como la Reserva Shokunin.</p>
        <a class="btn gold" href="#/club">Hacerme socio</a></div></section>`,
    };
  }
  const { products } = await api('/products?channel=member');
  const exclusives = products.filter(p => p.membersOnly || p.presaleUntil);
  return {
    title: 'Member Shop',
    html: `<section class="section"><div class="container">
      <div class="shop-head"><div>${eyebrow('Member Shop', '会員限定ショップ')}<h1>Bienvenido, ${esc(state.user.name.split(' ')[0])}</h1></div>
        <a class="btn small" href="#/club/socios">Área de socios</a></div>
      ${exclusives.length ? `<h2 style="font-size:20px;margin-bottom:16px">Exclusivos y preventas <span class="jp gold-text">先行</span></h2>
        <div class="products" style="margin-bottom:48px">${exclusives.map(p => productCard(p, true)).join('')}</div>` : ''}
      <h2 style="font-size:20px;margin-bottom:16px">Todo el catálogo a precio de socio</h2>
      ${grid(products.filter(p => !p.membersOnly), true, 'club/shop', query.formato)}
    </div></section>`,
  };
}

export async function productView({ params }) {
  const { product: p, member } = await api('/products/' + encodeURIComponent(params[0]));
  let qty = 1;
  const blocked = !p.purchasable;
  const reason = !p.inStock ? 'Agotado' : p.membersOnly ? 'Exclusivo para socios' : p.presaleUntil ? `Preventa para socios hasta el ${dateFmt(p.presaleUntil)}` : '';
  return {
    title: p.name,
    html: `<section class="section"><div class="container">
      <p class="muted" style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;margin:0 0 24px"><a href="#/shop">Shop</a> / ${esc(formatLabel(p))}</p>
      <div class="pdp">
        <div class="pdp-art">${productArt(p)}</div>
        <div>
          ${eyebrow(`${formatLabel(p)} · ${p.volumeMl} ml · Cosecha ${p.vintage}`, p.nameJp)}
          <h1>${esc(p.name)}</h1>
          <p class="lead" style="margin-top:12px">${esc(p.tagline)}</p>
          <div class="badges">${flags(p)}<span class="badge">Sin TACC</span><span class="badge">Junmai</span></div>
          ${priceBlock(p, member)}
          ${!member && p.memberPrice < p.price && !p.membersOnly ? `<p class="muted" style="font-size:13px">Ahorrás ${money(p.price - p.memberPrice)} por unidad siendo socio. <a href="#/club" class="gold-text">Ver Club</a></p>` : ''}
          <div class="row" style="margin:24px 0">
            <div class="qty" aria-label="Cantidad"><button type="button" data-q="-1" aria-label="Menos">−</button><output id="qty">1</output><button type="button" data-q="1" aria-label="Más">+</button></div>
            <button class="btn gold" id="add" ${blocked ? 'disabled' : ''}>Agregar al carrito</button>
          </div>
          ${blocked ? `<p class="error-msg">${esc(reason)}${!member && (p.membersOnly || p.presaleUntil) ? ' · <a href="#/club">Hacete socio</a>' : ''}</p>` : ''}
          <hr class="gold-rule">
          <div class="prose"><p>${esc(p.description)}</p></div>
          <dl class="spec">
            <dt>Notas de cata</dt><dd>${esc(p.tastingNotes)}</dd>
            <dt>Maridaje</dt><dd>${esc(p.pairing)}</dd>
            <dt>Graduación</dt><dd>${p.abv}% vol.</dd>
            <dt>Servicio</dt><dd>Frío (8–10 °C) o a temperatura ambiente, en ochoko o copa de vino blanco.</dd>
            <dt>Ingredientes</dt><dd>${p.ingredients ? esc(p.ingredients) : `Agua, arroz Koshihikari orgánico, koji de arroz, levadura${p.variety === 'cereza' ? ', cereza' : ''}. Sin TACC.`}</dd>
          </dl>
        </div>
      </div>
    </div></section>`,
    mount(root) {
      const out = root.querySelector('#qty');
      root.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
        qty = Math.max(1, Math.min(12, qty + Number(b.dataset.q))); out.textContent = qty;
      }));
      root.querySelector('#add')?.addEventListener('click', () => {
        addToCart(p.slug, qty);
        toast(`${p.name} ×${qty} agregado al carrito`);
      });
      root.querySelector('.error-msg a')?.addEventListener('click', e => { e.preventDefault(); go('club'); });
    },
  };
}
