// Utilidades de interfaz: escape, formato, ilustraciones de producto.
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ars = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
export const money = n => ars.format(n);
export const dateFmt = (iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => new Date(iso).toLocaleDateString('es-AR', opts);
export const timeFmt = iso => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

let toastTimer;
export function toast(msg, kind = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (kind === 'error' ? ' error' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

export const hanko = (big = false) => `<span class="hanko${big ? ' big' : ''}" aria-hidden="true"><span>小</span><span>松</span></span>`;

export function eyebrow(es, jp) {
  return `<p class="eyebrow"><span>${esc(es)}</span>${jp ? `<span class="jp">${esc(jp)}</span>` : ''}</p>`;
}

// Ilustraciones SVG de botella / tokkuri / pack con la etiqueta de la marca.
const ACCENT = { gold: '#D4AF37', red: '#B91C1C' };
function label(x, y, w, h, accent, year, small) {
  const fs = small ? 0.8 : 1;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#141414" stroke="#2a2724" stroke-width=".6"/>
    <text x="${x + w / 2}" y="${y + h * 0.36}" text-anchor="middle" font-family="Shippori Mincho, serif" font-weight="700" font-size="${17 * fs}" fill="#D4AF37">小</text>
    <text x="${x + w / 2}" y="${y + h * 0.58}" text-anchor="middle" font-family="Shippori Mincho, serif" font-weight="700" font-size="${17 * fs}" fill="#D4AF37">松</text>
    <rect x="${x + w * 0.68}" y="${y + h * 0.5}" width="${6 * fs}" height="${6 * fs}" fill="${accent}"/>
    <text x="${x + w / 2}" y="${y + h * 0.76}" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="${4.2 * fs}" letter-spacing="1.6" fill="#EDE8DD">KOMATSU</text>
    <text x="${x + w / 2}" y="${y + h * 0.88}" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="${3.2 * fs}" letter-spacing="1" fill="#9B958A">${year}</text>`;
}
function bottle(cx, accent, year, idSuffix) {
  const g = `bg${idSuffix}`;
  return `
    <defs><linearGradient id="${g}" x1="0" x2="1"><stop offset="0" stop-color="#0c0c0c"/><stop offset=".35" stop-color="#2a2a2a"/><stop offset=".6" stop-color="#151515"/><stop offset="1" stop-color="#060606"/></linearGradient></defs>
    <path d="M${cx - 9} 8 h18 v44 c0 10 22 18 22 40 v128 c0 6 -4 8 -8 8 h-46 c-4 0 -8 -2 -8 -8 v-128 c0 -22 22 -30 22 -40z" fill="url(#${g})"/>
    <path d="M${cx - 10} 6 h20 v24 l-10 6 l-10 -6z" fill="#1b1b1b" stroke="#2c2c2c" stroke-width=".5"/>
    <path d="M${cx - 10} 20 q10 6 20 0" stroke="${accent}" stroke-width="1.6" fill="none"/>
    <circle cx="${cx}" cy="22" r="2.4" fill="none" stroke="${accent}" stroke-width="1.2"/>
    ${label(cx - 27, 116, 54, 82, accent, year)}`;
}
function tokkuri(cx, accent, year, idSuffix) {
  const g = `tg${idSuffix}`;
  return `
    <defs><radialGradient id="${g}" cx=".35" cy=".45" r=".8"><stop offset="0" stop-color="#2e2e2e"/><stop offset=".55" stop-color="#121212"/><stop offset="1" stop-color="#050505"/></radialGradient></defs>
    <path d="M${cx - 14} 40 q14 -6 28 0 l-4 6 c0 14 -4 22 -4 30 c24 18 34 46 34 82 c0 40 -18 68 -40 68 s-40 -28 -40 -68 c0 -36 10 -64 34 -82 c0 -8 -4 -16 -4 -30z" fill="url(#${g})"/>
    <path d="M${cx - 6} 76 q6 3 12 0" stroke="${accent}" stroke-width="1.6" fill="none"/>
    ${label(cx - 22, 140, 44, 64, accent, year, true)}`;
}
export function productArt(p) {
  const accent = ACCENT[p.accent] || ACCENT.gold;
  const year = p.vintage;
  if (p.format === 'tokkuri') return `<svg viewBox="0 0 200 240" role="img" aria-label="${esc(p.name)}">${tokkuri(100, accent, year, p.id)}</svg>`;
  if (p.format === 'pack') return `<svg viewBox="0 0 220 240" role="img" aria-label="${esc(p.name)}">
      <g transform="translate(-10.5 6) scale(.95)">${bottle(90, ACCENT.gold, year, p.id + 'a')}</g>
      <g transform="translate(59.5 6) scale(.95)">${bottle(90, ACCENT.red, year, p.id + 'b')}</g>
      <rect x="10" y="226" width="200" height="6" fill="#D4AF37" opacity=".5"/></svg>`;
  return `<svg viewBox="0 0 180 240" role="img" aria-label="${esc(p.name)}">${bottle(90, accent, year, p.id)}</svg>`;
}

export function flags(p) {
  const f = [];
  if (p.membersOnly) f.push('<span class="badge red">Exclusivo socios</span>');
  if (p.presaleUntil) f.push(`<span class="badge gold">Preventa socios</span>`);
  if (!p.inStock) f.push('<span class="badge">Agotado</span>');
  else if (p.lowStock) f.push(`<span class="badge">Últimas ${p.stock}</span>`);
  return f.join('');
}

export function priceBlock(p, member) {
  if (member && p.memberPrice < p.price)
    return `<div class="price"><span class="now">${money(p.memberPrice)}</span><span class="was">${money(p.price)}</span><span class="member-hint">Precio socio</span></div>`;
  if (!member && p.memberPrice < p.price && !p.membersOnly)
    return `<div class="price"><span class="now">${money(p.price)}</span><span class="member-hint">Socios: ${money(p.memberPrice)}</span></div>`;
  return `<div class="price"><span class="now">${money(p.finalPrice)}</span></div>`;
}

export const formatLabel = p => p.format === 'tokkuri' ? 'Tokkuri' : p.format === 'pack' ? 'Pack dúo' : 'Botella';

export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}
