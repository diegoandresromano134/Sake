import { api } from '../api.js';
import { esc, eyebrow, productArt, money, toast, formData, dateFmt } from '../ui.js';
import { state, setQty, clearCart } from '../store.js';
import { needLogin, go } from '../app.js';

let delivery = 'envio';

function summary(q, cta) {
  return `<aside class="panel summary">
    <h3 style="margin-bottom:14px">Resumen <span class="jp gold-text">合計</span></h3>
    ${q.member ? '<p class="badge gold" style="margin:0 0 12px">Precios de socio aplicados</p>' : ''}
    <div class="sum-row"><span>Subtotal</span><span>${money(q.subtotal)}</span></div>
    ${q.savings ? `<div class="sum-row save"><span>Ahorro socio</span><span>−${money(q.savings)}</span></div>` : ''}
    <div class="sum-row"><span>Envío</span><span>${q.shipping ? money(q.shipping) : 'Sin cargo'}</span></div>
    <div class="sum-row total"><span>Total</span><span>${money(q.total)}</span></div>
    ${!q.member && q.delivery === 'envio' && q.shipping ? `<p class="muted" style="font-size:12px">Envío sin cargo desde ${money(q.freeShippingFrom)} o siendo socio.</p>` : ''}
    ${cta}
  </aside>`;
}

export async function cartView() {
  if (!state.cart.length) return emptyCart();
  const q = await api('/cart/quote', { method: 'POST', body: { items: state.cart, delivery } });
  return {
    title: 'Carrito',
    html: `<section class="section"><div class="container">
      ${eyebrow('Carrito', 'カート')}<h1 style="margin-bottom:28px">Tu selección</h1>
      <div class="cart-layout">
        <div>
          ${q.lines.map(l => `<div class="cart-line">
            <a class="thumb" href="#/producto/${esc(l.slug)}">${productArt(l)}</a>
            <div><a href="#/producto/${esc(l.slug)}" style="text-decoration:none"><strong style="font-weight:500">${esc(l.name)}</strong></a>
              <div class="muted" style="font-size:13px">${l.volumeMl} ml · Cosecha ${l.vintage} · ${money(l.finalPrice)} c/u</div>
              ${l.problem ? `<div class="problem">${esc(l.problem)}</div>` : ''}
              <div class="row" style="margin-top:8px">
                <div class="qty"><button data-slug="${esc(l.slug)}" data-d="-1" aria-label="Menos">−</button><output>${l.qty}</output><button data-slug="${esc(l.slug)}" data-d="1" aria-label="Más">+</button></div>
                <button class="link" data-remove="${esc(l.slug)}">Quitar</button>
              </div></div>
            <div class="num">${money(l.lineTotal)}</div></div>`).join('')}
          ${q.issues.length ? `<p class="error-msg" style="margin-top:16px">Hay productos que no se pueden comprar. Quitalos para continuar${!q.member ? ' o <a href="#/club">hacete socio</a>' : ''}.</p>` : ''}
        </div>
        ${summary(q, `<a class="btn gold block" style="margin-top:16px" href="#/checkout" ${q.issues.length ? 'aria-disabled="true" data-blocked' : ''}>Finalizar compra</a>
          <a class="btn ghost block" style="margin-top:8px" href="#/shop">Seguir comprando</a>`)}
      </div></div></section>`,
    mount(root) {
      const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
      root.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => {
        const it = state.cart.find(i => i.slug === b.dataset.slug);
        setQty(b.dataset.slug, (it?.qty || 0) + Number(b.dataset.d)); rerender();
      }));
      root.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => { setQty(b.dataset.remove, 0); rerender(); }));
      root.querySelector('[data-blocked]')?.addEventListener('click', e => { e.preventDefault(); toast('Quitá los productos marcados para continuar.', 'error'); });
    },
  };
}

function emptyCart() {
  return { title: 'Carrito', html: `<div class="container empty"><span class="kanji">空</span><h2>Tu carrito está vacío</h2><a class="btn gold" href="#/shop">Ir al Shop</a></div>` };
}

export async function checkoutView() {
  if (!state.user) return needLogin();
  if (!state.cart.length) return emptyCart();
  const quoteFor = d => api('/cart/quote', { method: 'POST', body: { items: state.cart, delivery: d } });
  let q = await quoteFor(delivery);
  if (q.issues.length) { go('carrito'); return null; }
  const u = state.user;
  return {
    title: 'Checkout',
    html: `<section class="section"><div class="container">
      ${eyebrow('Checkout', 'お会計')}<h1 style="margin-bottom:28px">Datos de entrega</h1>
      <div class="cart-layout">
        <form class="form panel" id="co" novalidate>
          <div class="seg" role="group" aria-label="Modo de entrega">
            <button type="button" data-del="envio" aria-pressed="${delivery === 'envio'}">Envío a domicilio</button>
            <button type="button" data-del="retiro" aria-pressed="${delivery === 'retiro'}">Retiro en bodega</button>
          </div>
          <div class="form-2">
            <div class="field"><label for="name">Nombre y apellido</label><input id="name" name="name" required autocomplete="name" value="${esc(u.name)}"></div>
            <div class="field"><label for="phone">Teléfono</label><input id="phone" name="phone" required autocomplete="tel" value="${esc(u.phone || '')}"></div>
          </div>
          <fieldset id="ship" style="border:0;padding:0;margin:0" class="form" ${delivery === 'retiro' ? 'hidden' : ''}>
            <div class="field"><label for="address">Dirección</label><input id="address" name="address" autocomplete="street-address"></div>
            <div class="form-2">
              <div class="field"><label for="city">Ciudad</label><input id="city" name="city" autocomplete="address-level2"></div>
              <div class="field"><label for="province">Provincia</label><input id="province" name="province" autocomplete="address-level1"></div>
              <div class="field"><label for="zip">Código postal</label><input id="zip" name="zip" autocomplete="postal-code"></div>
            </div>
          </fieldset>
          <div class="field"><label for="notes">Notas (opcional)</label><textarea id="notes" name="notes" maxlength="500" placeholder="Horario de entrega, regalo, etc."></textarea></div>
          <div class="panel" style="background:var(--black)">
            <p class="label" style="margin:0 0 6px">Pago</p>
            <p class="muted" style="margin:0;font-size:14px">Modo demostración: el pago se aprueba automáticamente. Preparado para integrar Mercado Pago.</p>
          </div>
          <label class="check"><input type="checkbox" name="adult" required> Confirmo que soy mayor de 18 años y que quien reciba el pedido también lo es.</label>
          <p class="error-msg" id="err" hidden></p>
          <button class="btn gold block" type="submit" id="pay">Pagar ${money(q.total)}</button>
        </form>
        <div id="sum">${summary(q, '')}</div>
      </div></div></section>`,
    mount(root) {
      const form = root.querySelector('#co'), err = root.querySelector('#err'), pay = root.querySelector('#pay');
      root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
        delivery = b.dataset.del;
        root.querySelectorAll('[data-del]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        root.querySelector('#ship').hidden = delivery === 'retiro';
        q = await quoteFor(delivery);
        root.querySelector('#sum').innerHTML = summary(q, '');
        pay.textContent = `Pagar ${money(q.total)}`;
      }));
      form.addEventListener('submit', async e => {
        e.preventDefault(); err.hidden = true;
        const data = formData(form);
        if (!data.adult) { err.textContent = 'Tenés que confirmar la mayoría de edad.'; err.hidden = false; return; }
        pay.disabled = true; pay.textContent = 'Procesando…';
        try {
          const { order } = await api('/orders', { method: 'POST', body: { ...data, delivery, items: state.cart } });
          clearCart();
          go('pedido/' + order.code);
        } catch (ex) {
          err.textContent = ex.message; err.hidden = false; pay.disabled = false; pay.textContent = `Pagar ${money(q.total)}`;
          if (ex.status === 401) needLogin();
        }
      });
    },
  };
}

export function orderDetail(o) {
  return `<div class="order">
    <div class="order-head"><strong style="font-weight:500;letter-spacing:.08em">${esc(o.code)}</strong>
      <span class="row"><span class="badge ${o.channel === 'member' ? 'gold' : ''}">${o.channel === 'member' ? 'Member Shop' : 'Shop Público'}</span><span class="status ${esc(o.status)}">${esc(o.status)}</span></span></div>
    <div class="muted" style="font-size:13px">${dateFmt(o.createdAt)} · ${o.delivery === 'retiro' ? 'Retiro en bodega' : `Envío a ${esc([o.shipTo.address, o.shipTo.city, o.shipTo.province].filter(Boolean).join(', '))}`}</div>
    <ul>${o.items.map(i => `<li>${i.qty} × ${esc(i.name)} — ${money(i.unitPrice * i.qty)}</li>`).join('')}</ul>
    <div class="row" style="justify-content:space-between;font-size:14px">
      <span class="muted">Envío ${o.shipping ? money(o.shipping) : 'sin cargo'}${o.savings ? ` · Ahorro socio ${money(o.savings)}` : ''}</span>
      <strong style="font-weight:500">Total ${money(o.total)}</strong></div></div>`;
}

export async function orderView({ params }) {
  if (!state.user) return needLogin();
  const { order } = await api('/orders/' + encodeURIComponent(params[0]));
  return {
    title: 'Pedido confirmado',
    html: `<section class="section"><div class="container" style="max-width:760px">
      <div style="text-align:center;margin-bottom:32px">
        <div class="hanko big" aria-hidden="true"><span>小</span><span>松</span></div>
        <h1 style="margin-top:18px">¡Gracias por tu compra!<span class="title-jp">ありがとうございます</span></h1>
        <p class="muted">Te avisaremos por email cuando tu pedido esté en camino.</p>
      </div>
      ${orderDetail(order)}
      <div class="row center" style="margin-top:24px"><a class="btn" href="#/cuenta">Ver mis pedidos</a><a class="btn ghost" href="#/shop">Seguir comprando</a></div>
    </div></section>`,
  };
}
