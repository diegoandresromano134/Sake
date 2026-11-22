// Router SPA por hash + shell (menú, carrito, puerta de edad).
import { state, onChange, refreshUser, cartCount, isAdmin } from './store.js';
import { esc } from './ui.js';
import { api } from './api.js';
import home from './views/home.js';
import bodega from './views/bodega.js';
import { shopView, memberShopView, productView } from './views/shop.js';
import { cartView, checkoutView, orderView } from './views/cart.js';
import { loginView, registerView } from './views/auth.js';
import { clubView, membersAreaView } from './views/club.js';
import accountView from './views/account.js';
import adminView from './views/admin.js';
import legalView from './views/legal.js';
import certificateView from './views/certificate.js';

const routes = [
  [/^$/, home],
  [/^bodega(?:\/([\w-]+))?$/, bodega],
  [/^shop$/, shopView],
  [/^producto\/([\w-]+)$/, productView],
  [/^club$/, clubView],
  [/^club\/shop$/, memberShopView],
  [/^club\/socios$/, membersAreaView],
  [/^carrito$/, cartView],
  [/^checkout$/, checkoutView],
  [/^pedido\/([\w-]+)$/, orderView],
  [/^login$/, loginView],
  [/^registro$/, registerView],
  [/^cuenta$/, accountView],
  [/^admin$/, adminView],
  [/^legal$/, legalView],
  [/^certificado(?:\/([A-Za-z0-9-]+))?$/, certificateView],
];

const main = document.getElementById('main');
let renderSeq = 0;

export function currentPath() { return location.hash.replace(/^#\/?/, ''); }
export function go(path) { location.hash = '#/' + path.replace(/^\/+/, ''); }

// Redirige al login preservando el destino.
export function needLogin() { go('login?next=' + encodeURIComponent(currentPath())); }

async function render() {
  const seq = ++renderSeq;
  const [path, qs = ''] = currentPath().split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  const match = routes.map(([re, view]) => [path.match(re), view]).find(([m]) => m);
  closeDrawer();
  main.innerHTML = '<div class="loading">読み込み中 · Cargando</div>';
  let out;
  try {
    out = match ? await match[1]({ params: match[0].slice(1), query, path }) : notFound();
  } catch (e) {
    console.error(e);
    out = { html: `<div class="container empty"><span class="kanji">誤</span><p>${esc(e.message || 'Ocurrió un error.')}</p><a class="btn" href="#/">Volver al inicio</a></div>` };
  }
  if (seq !== renderSeq || !out) return; // otra navegación ganó, o la vista redirigió
  main.innerHTML = out.html;
  document.title = out.title ? `${out.title} · Komatsu 小松` : 'Komatsu · Sake Junmai Argentino';
  out.mount?.(main);
  if (out.scrollTo) document.getElementById(out.scrollTo)?.scrollIntoView();
  else window.scrollTo(0, 0);
  markActive();
}

function notFound() {
  return { title: 'No encontrado', html: '<div class="container empty"><span class="kanji">無</span><h2>Página no encontrada</h2><a class="btn" href="#/">Ir al inicio</a></div>' };
}

// ----- Shell -----
const drawer = document.getElementById('drawer');
const backdrop = document.getElementById('drawer-backdrop');
const menuBtn = document.getElementById('menu-btn');
function openDrawer() { drawer.hidden = false; backdrop.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); drawer.querySelector('a, summary')?.focus(); }
function closeDrawer() { if (drawer.hidden) return; drawer.hidden = true; backdrop.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
menuBtn.addEventListener('click', () => drawer.hidden ? openDrawer() : closeDrawer());
backdrop.addEventListener('click', closeDrawer);
document.getElementById('drawer-close').addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
drawer.addEventListener('click', e => { if (e.target.closest('a')) closeDrawer(); });

function markActive() {
  const h = location.hash || '#/';
  drawer.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === h));
}

function paintHeader() {
  const n = cartCount();
  const c = document.getElementById('cart-count');
  c.textContent = n; c.hidden = n === 0;
  document.querySelector('.member-dot').hidden = !state.user?.member;
  document.getElementById('drawer-account').textContent = state.user ? `Mi cuenta · ${state.user.name.split(' ')[0]}` : 'Ingresar / Registrarse';
  document.getElementById('drawer-admin').hidden = !isAdmin();
  document.getElementById('login-link').hidden = !!state.user;
}

// Botón flotante de WhatsApp: número y mensaje se configuran desde el panel.
async function setupWhatsApp() {
  try {
    const { whatsapp } = await api('/settings');
    const a = document.getElementById('wa-float');
    if (!whatsapp) { a.hidden = true; return; }
    a.href = `https://wa.me/${whatsapp.number}?text=${encodeURIComponent(whatsapp.message)}`;
    a.hidden = false;
  } catch { /* sin conexión: no se muestra */ }
}
onChange(paintHeader);

function ageGate() {
  let ok = false;
  try { ok = localStorage.getItem('komatsu.age') === 'ok'; } catch { /* sin storage */ }
  if (ok) return;
  const dlg = document.getElementById('age-gate');
  dlg.addEventListener('cancel', e => e.preventDefault());
  document.getElementById('age-yes').onclick = () => { try { localStorage.setItem('komatsu.age', 'ok'); } catch { /* */ } dlg.close(); };
  document.getElementById('age-no').onclick = () => { dlg.querySelector('.age-inner').innerHTML = '<div class="hanko big"><span>小</span><span>松</span></div><h2>Te esperamos más adelante</h2><p class="muted">El sitio es sólo para mayores de 18 años.</p>'; };
  dlg.showModal();
}

window.addEventListener('hashchange', render);
window.addEventListener('komatsu:settings', () => setupWhatsApp());
// App instalable (Android / iPhone): registra el service worker.
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
(async () => {
  ageGate();
  paintHeader();
  await refreshUser();
  render();
  setupWhatsApp();
})();
