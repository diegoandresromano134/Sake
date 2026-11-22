// Backend simulado para la demo sin servidor: implementa la misma API que src/routes/*
// guardando todo en el navegador (localStorage, o memoria si no está disponible).
// Sólo se usa al generar la demo (npm run build:demo); la app real usa el servidor.

export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

const KEY = 'komatsu.demo.db.v1';
const MEMBERSHIP = 20000, MAX_QTY = 12;
const SET = () => DB.settings || (DB.settings = { membership_price: 20000, shipping_flat: 5000, free_shipping_from: 60000, max_reserva: 2 });
const DAY = 864e5;
const now = () => new Date();
const iso = d => new Date(d).toISOString();
const addMonth = s => { const d = new Date(s); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString(); };
const rand = n => Math.random().toString(36).slice(2, 2 + n).toUpperCase();

async function hash(pw) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('komatsu-demo:' + pw));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return 'plain:' + pw; }
}

const PRODUCTS = [
  ['komatsu-frutado-720', 'Komatsu Junmai Frutado', '小松 純米 果実香', 'frutado', 'botella', 720, 'Perfil aromático, fresco y floral — como un blanco frutado.', 'Nuestro Junmai insignia. Arroz orgánico Koshihikari pulido, koji de arroz y levaduras seleccionadas, fermentado lentamente en frío en tanques cilindrocónicos de acero inoxidable con control térmico.', 'Pera, melón blanco y flor de azahar. Boca sedosa, final limpio y levemente mineral.', 'Sashimi, ceviche, quesos frescos, cocina nikkei.', 15.5, 28000, 23800, 120, 'gold', 0],
  ['komatsu-cereza-720', 'Komatsu Junmai Cereza', '小松 純米 桜桃', 'cereza', 'botella', 720, 'Junmai con cereza: delicado, rosado y de final largo.', 'Una base Junmai frutada que reposa con cerezas seleccionadas. Mantiene la pureza del arroz con un perfil frutal rojo, elegante y equilibrado.', 'Cereza fresca, frutos rojos y un toque de almendra. Dulzor sutil, acidez viva.', 'Pato, cerdo laqueado, postres con frutos rojos, chocolate amargo.', 14.5, 30000, 25500, 90, 'red', 0],
  ['komatsu-pack-duo-720', 'Pack Dúo Komatsu', '小松 二本セット', 'duo', 'pack', 1440, 'Frutado + Cereza en estuche de regalo.', 'Las dos expresiones de la cosecha en un estuche negro con hot stamping dorado. Ideal para regalar o para comparar en una cata en casa.', 'Incluye 1 × Junmai Frutado 720 ml y 1 × Junmai Cereza 720 ml.', 'Una mesa completa: de entradas frías a postre.', 15.0, 54000, 45000, 45, 'gold', 0],
  ['komatsu-tokkuri-frutado-330', 'Tokkuri Frutado', '徳利 果実香', 'frutado', 'tokkuri', 330, 'Formato jarrita vertedora, pensado para la mesa del restaurante.', 'El Junmai Frutado en tokkuri de 330 ml: se sirve directo en la mesa, en ochoko, frío o a temperatura ambiente.', 'Pera, melón blanco y flor de azahar.', 'Barra de sushi, izakaya, omakase.', 15.5, 15000, 12750, 200, 'gold', 0],
  ['komatsu-tokkuri-cereza-330', 'Tokkuri Cereza', '徳利 桜桃', 'cereza', 'tokkuri', 330, 'La versión cereza en jarrita de servicio.', 'El Junmai Cereza en tokkuri de 330 ml, para compartir en la mesa.', 'Cereza fresca y frutos rojos.', 'Robata, yakitori, postres.', 14.5, 16000, 13600, 150, 'red', 0],
  ['komatsu-reserva-shokunin-720', 'Reserva Shokunin', '職人 限定', 'reserva', 'botella', 720, 'Tirada limitada y numerada. Exclusiva Club Member.', 'Selección del maestro: un único tanque de la cosecha, embotellado a mano y numerado. Sólo para socios del Club Komatsu.', 'Arroz cocido, nuez fresca, durazno blanco. Textura profunda y final muy largo.', 'Wagyu, hongos, quesos maduros.', 16.0, 52000, 52000, 60, 'red', 1],
];

async function seed() {
  const t = Date.now();
  const at = (days, h) => { const x = new Date(t + days * DAY); x.setUTCHours(h, 0, 0, 0); return x.toISOString(); };
  const db = {
    seq: 100, session: null,
    users: [
      { id: 1, email: 'admin@komatsu.local', name: 'Administración Komatsu', role: 'admin', phone: null, pw: await hash('komatsu-admin'), createdAt: iso(t - 60 * DAY) },
      { id: 2, email: 'socio@komatsu.demo', name: 'Kenji Romano', role: 'customer', phone: '1155550000', pw: await hash('socio1234'), createdAt: iso(t - 40 * DAY) },
    ],
    products: PRODUCTS.map((p, i) => ({
      id: i + 1, slug: p[0], name: p[1], name_jp: p[2], variety: p[3], format: p[4], volume_ml: p[5], vintage: 2026,
      tagline: p[6], description: p[7], tasting_notes: p[8], pairing: p[9], abv: p[10], price: p[11], member_price: p[12],
      stock: p[13], accent: p[14], members_only: p[15], active: 1, sort: i + 1, ingredients: null,
      presale_until: p[3] === 'cereza' && p[4] === 'botella' ? iso(t + 14 * DAY) : null,
      image: p[4] === 'tokkuri' ? 'tokkuri' : 'botella',
    })),
    memberships: [{ user_id: 2, status: 'active', monthly_price: MEMBERSHIP, started_at: iso(t - 35 * DAY), current_period_end: iso(t + 25 * DAY), cancel_at_period_end: 0, member_number: 'KM-00002' }],
    payments: [
      { user_id: 2, amount: MEMBERSHIP, period_start: iso(t - 35 * DAY), period_end: iso(t - 5 * DAY), status: 'aprobado', ref: 'SIM-SUB-2-A1B2', created_at: iso(t - 35 * DAY) },
      { user_id: 2, amount: MEMBERSHIP, period_start: iso(t - 5 * DAY), period_end: iso(t + 25 * DAY), status: 'aprobado', ref: 'SIM-SUB-2-C3D4', created_at: iso(t - 5 * DAY) },
    ],
    orders: [{
      id: 1, code: 'KMT-DEMO-0001', user_id: 2, status: 'entregado', channel: 'member', subtotal: 49300, savings: 8700, shipping: 0, total: 49300,
      delivery: 'envio', ship: { name: 'Kenji Romano', phone: '1155550000', address: 'Sarmiento 820', city: 'Morón', province: 'Buenos Aires', zip: '1708' },
      notes: null, created_at: iso(t - 20 * DAY),
      items: [{ product_id: 1, name: 'Komatsu Junmai Frutado 720 ml · 2026', unitPrice: 23800, qty: 1 }, { product_id: 2, name: 'Komatsu Junmai Cereza 720 ml · 2026', unitPrice: 25500, qty: 1 }],
    }],
    announcements: [
      { id: 3, kind: 'anuncio', title: 'Reserva Shokunin: quedan pocas botellas', titleJp: '職人 限定', body: 'La tirada numerada de la Reserva Shokunin es sólo para socios. Cada socio puede reservar hasta 2 botellas.', public: 0, createdAt: iso(t - 1 * DAY) },
      { id: 2, kind: 'premio', title: 'Medalla de plata — Concurso de Sakes de Sudamérica', titleJp: '銀賞', body: 'El Junmai Frutado fue reconocido por su equilibrio aromático y su final limpio. Gracias a todos los socios que nos acompañan.', public: 1, createdAt: iso(t - 6 * DAY) },
      { id: 1, kind: 'lanzamiento', title: 'Cosecha 2026: preventa para socios', titleJp: '新酒 先行予約', body: 'La etiqueta 2026 del Junmai Cereza abre en preventa exclusiva para el Club durante 14 días antes de llegar al Shop Público.', public: 1, createdAt: iso(t - 10 * DAY) },
    ],
    events: [
      { id: 1, title: 'Degustación guiada: Frutado vs. Cereza', titleJp: '利き酒会', description: 'Cata comparativa con el maestro sakero, con maridaje de bocados nikkei. Cupos limitados.', startsAt: at(12, 22), location: 'Bodega Komatsu', capacity: 20, active: true },
      { id: 2, title: 'Visita a la planta + almuerzo', titleJp: '蔵見学', description: 'Recorrido por la sala de koji y los tanques de fermentación en frío, seguido de un almuerzo japonés.', startsAt: at(26, 15), location: 'Bodega Komatsu', capacity: 14, active: true },
    ],
    rsvps: [{ event_id: 1, user_id: 99, guests: 5 }],
    settings: { membership_price: MEMBERSHIP, shipping_flat: 5000, free_shipping_from: 60000, max_reserva: 2 },
    alliances: [
      { id: 1, name: 'Productores de arroz orgánico', category: 'proveedor', description: 'Koshihikari cultivado en Argentina, con trazabilidad por cosecha.', url: null, sort: 1, active: true },
      { id: 2, name: 'Restaurantes japoneses y nikkei', category: 'restaurante', description: 'Formato Tokkuri 330 ml pensado para el servicio en mesa.', url: null, sort: 2, active: true },
      { id: 3, name: 'Vinotecas y tiendas gourmet', category: 'punto de venta', description: 'Puntos de venta seleccionados para cada nueva tirada.', url: null, sort: 3, active: true },
      { id: 4, name: 'Comunidad nikkei', category: 'comunidad', description: 'Encuentros, degustaciones y difusión de la cultura del sake.', url: null, sort: 4, active: true },
    ],
  };
  return db;
}

let DB = null;
async function load() {
  if (DB) return DB;
  try { DB = JSON.parse(localStorage.getItem(KEY)); } catch { DB = null; }
  if (!DB || !DB.products || !DB.alliances) { DB = await seed(); save(); }
  return DB;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch { /* sin storage: queda en memoria */ } }
export async function resetDemo() { DB = await seed(); save(); }
export async function demoLogin(email) { await load(); const u = DB.users.find(x => x.email === email); DB.session = u?.id ?? null; save(); }

// ---------- lógica de negocio (espejo del servidor) ----------
const err = (s, m, c) => { throw new ApiError(s, m, c); };
const user = () => DB.users.find(u => u.id === DB.session) || null;
const membershipOf = id => DB.memberships.find(m => m.user_id === id) || null;
const isMember = id => { const m = id && membershipOf(id); return !!m && m.status === 'active' && new Date(m.current_period_end) > now(); };
const pubMembership = m => {
  if (!m) return null;
  const active = m.status === 'active' && new Date(m.current_period_end) > now();
  return { status: active ? (m.cancel_at_period_end ? 'cancela_al_vencer' : 'activa') : 'vencida', active, memberNumber: m.member_number,
    monthlyPrice: m.monthly_price, startedAt: m.started_at, currentPeriodEnd: m.current_period_end, cancelAtPeriodEnd: !!m.cancel_at_period_end };
};
const me = () => { const u = user(); return u && { id: u.id, email: u.email, name: u.name, role: u.role, phone: u.phone, createdAt: u.createdAt, member: isMember(u.id), membership: pubMembership(membershipOf(u.id)) }; };
const needUser = () => user() || err(401, 'Iniciá sesión para continuar.', 'auth_required');
const needMember = () => { const u = needUser(); if (!isMember(u.id) && u.role !== 'admin') err(403, 'Sección exclusiva para socios del Club Komatsu.', 'member_required'); return u; };
const needAdmin = () => { const u = needUser(); if (u.role !== 'admin') err(403, 'Acceso restringido.'); return u; };
const s = (v, min, max, field) => { const t = typeof v === 'string' ? v.trim() : ''; if (t.length < min) err(400, min > 1 ? `${field}: mínimo ${min} caracteres.` : `Falta ${field}.`); if (t.length > max) err(400, `${field}: máximo ${max} caracteres.`); return t; };

function productView(p, member) {
  const presale = p.presale_until && new Date(p.presale_until) > now();
  return { id: p.id, slug: p.slug, name: p.name, nameJp: p.name_jp, variety: p.variety, format: p.format, volumeMl: p.volume_ml, vintage: p.vintage,
    tagline: p.tagline, description: p.description, tastingNotes: p.tasting_notes, pairing: p.pairing, ingredients: p.ingredients || null, sort: p.sort, abv: p.abv, image: p.image, photo: p.photo || null, accent: p.accent,
    price: p.price, memberPrice: p.member_price, finalPrice: member ? p.member_price : p.price, stock: p.stock, inStock: p.stock > 0,
    lowStock: p.stock > 0 && p.stock <= 10, membersOnly: !!p.members_only, presaleUntil: presale ? p.presale_until : null,
    purchasable: p.stock > 0 && (member || (!p.members_only && !presale)), glutenFree: true };
}

function quote(items, member, delivery) {
  if (!Array.isArray(items)) err(400, 'Carrito inválido.');
  const merged = new Map();
  for (const it of items.slice(0, 50)) { const q = Math.trunc(Number(it?.qty)); if (it?.slug && q > 0) merged.set(it.slug, Math.min((merged.get(it.slug) || 0) + q, MAX_QTY)); }
  const lines = [], issues = []; let subtotal = 0, regular = 0;
  for (const [slug, qty] of merged) {
    const p = DB.products.find(x => x.slug === slug && x.active);
    if (!p) { issues.push({ slug, message: 'Producto no disponible.' }); continue; }
    const v = productView(p, member);
    let problem = null;
    if (v.membersOnly && !member) problem = 'Exclusivo para socios del Club.';
    else if (v.presaleUntil && !member) problem = 'En preventa exclusiva para socios.';
    else if (p.stock < qty) problem = p.stock > 0 ? `Sólo quedan ${p.stock} unidades.` : 'Sin stock.';
    else if (v.membersOnly && qty > SET().max_reserva) problem = `Máximo ${SET().max_reserva} por socio.`;
    const lineTotal = v.finalPrice * qty;
    lines.push({ ...v, qty, lineTotal, problem });
    if (problem) { issues.push({ slug, message: problem }); continue; }
    subtotal += lineTotal; regular += p.price * qty;
  }
  const ok = lines.filter(l => !l.problem);
  const shipping = !ok.length || delivery === 'retiro' || member || subtotal >= SET().free_shipping_from ? 0 : SET().shipping_flat;
  return { member, delivery, lines, issues, subtotal, savings: regular - subtotal, shipping, total: subtotal + shipping, freeShippingFrom: SET().free_shipping_from };
}

const orderView = o => ({ code: o.code, status: o.status, channel: o.channel, createdAt: o.created_at, email: DB.users.find(u => u.id === o.user_id)?.email,
  subtotal: o.subtotal, savings: o.savings, shipping: o.shipping, total: o.total, delivery: o.delivery, shipTo: o.ship, notes: o.notes, items: o.items });

const taken = (eid, exceptUser) => DB.rsvps.filter(r => r.event_id === eid && r.user_id !== exceptUser).reduce((n, r) => n + 1 + r.guests, 0);

const BENEFITS = [
  { title: 'Precios de socio', jp: '会員価格', text: 'Precios especiales en todo el catálogo, todo el año.' },
  { title: 'Prioridad en tiradas limitadas', jp: '先行予約', text: 'Preventa exclusiva de cada cosecha antes que el Shop Público.' },
  { title: 'Reserva Shokunin', jp: '職人限定', text: 'Acceso a ediciones numeradas que no salen a la venta pública.' },
  { title: 'Envío sin cargo', jp: '送料無料', text: 'En todos tus pedidos del Member Shop.' },
  { title: 'Degustaciones en la bodega', jp: '利き酒会', text: 'Catas guiadas, visitas a la planta y encuentros con el maestro sakero.' },
  { title: 'Anuncios y premios', jp: 'お知らせ', text: 'Novedades, reconocimientos y lanzamientos antes que nadie.' },
];

const annFields = b => ({ kind: ['anuncio', 'premio', 'lanzamiento'].includes(b.kind) ? b.kind : 'anuncio', title: s(b.title, 3, 140, 'Título'),
  titleJp: s(b.titleJp ?? '', 0, 60, 'Título JP') || null, body: s(b.body, 3, 2000, 'Texto'), public: b.public ? 1 : 0 });
const evtFields = b => {
  const d = new Date(b.startsAt); if (isNaN(d)) err(400, 'Fecha inválida.');
  const cap = Number(b.capacity); if (!Number.isInteger(cap) || cap < 1) err(400, 'Cupo inválido.');
  return { title: s(b.title, 3, 140, 'Título'), titleJp: s(b.titleJp ?? '', 0, 60, 'Título JP') || null, description: s(b.description, 3, 2000, 'Descripción'),
    startsAt: d.toISOString(), location: s(b.location, 2, 140, 'Lugar'), capacity: cap, active: b.active !== false };
};
const allyFields = b => {
  const url = s(b.url ?? '', 0, 300, 'Sitio web');
  if (url && !/^https?:\/\//i.test(url)) err(400, 'El sitio web debe empezar con http:// o https://');
  return { name: s(b.name, 2, 120, 'Nombre'), category: s(b.category ?? '', 0, 60, 'Tipo') || 'proveedor', description: s(b.description ?? '', 0, 500, 'Descripción'),
    url: url || null, sort: Number(b.sort) || 0, active: b.active !== false };
};
function productFields(b) {
  const n = {};
  const T = { name: [2, 80, 'Nombre'], name_jp: [0, 40, 'Nombre en japonés'], tagline: [0, 200, 'Bajada'], description: [0, 2000, 'Descripción'],
    tasting_notes: [0, 1000, 'Notas de cata'], pairing: [0, 500, 'Maridaje'], ingredients: [0, 500, 'Ingredientes'], variety: [2, 40, 'Estilo'] };
  for (const [k, [mi, ma, f]] of Object.entries(T)) if (b[k] !== undefined) n[k] = s(b[k] ?? '', mi, ma, f);
  for (const k of ['price', 'member_price', 'stock', 'vintage', 'volume_ml', 'sort']) if (b[k] !== undefined && b[k] !== '') {
    const v = Number(b[k]); if (!Number.isInteger(v) || v < 0) err(400, 'Valor numérico inválido.'); n[k] = v;
  }
  if (b.abv !== undefined && b.abv !== '') n.abv = Number(b.abv);
  if (b.format !== undefined) { n.format = ['botella', 'tokkuri', 'pack'].includes(b.format) ? b.format : 'botella'; n.image = n.format === 'tokkuri' ? 'tokkuri' : 'botella'; }
  if (b.accent !== undefined) n.accent = b.accent === 'red' ? 'red' : 'gold';
  if (b.active !== undefined) n.active = b.active ? 1 : 0;
  if (b.members_only !== undefined) n.members_only = b.members_only ? 1 : 0;
  if (b.presale_until !== undefined) n.presale_until = b.presale_until ? iso(b.presale_until) : null;
  return n;
}

// ---------- rutas ----------
const routes = [
  ['GET', /^\/auth\/me$/, () => ({ user: me() })],
  ['POST', /^\/auth\/register$/, async (b) => {
    const name = s(b.name, 2, 80, 'Nombre');
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) err(400, 'Email inválido.');
    if (typeof b.password !== 'string' || b.password.length < 8) err(400, 'La contraseña debe tener al menos 8 caracteres.');
    const bd = new Date(b.birthdate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.birthdate || '')) || isNaN(bd)) err(400, 'Fecha de nacimiento inválida.');
    const adult = new Date(bd); adult.setFullYear(adult.getFullYear() + 18);
    if (adult > now()) err(403, 'Tenés que ser mayor de 18 años para registrarte.');
    if (DB.users.some(u => u.email === email)) err(409, 'Ya existe una cuenta con ese email.');
    const u = { id: ++DB.seq, email, name, role: 'customer', phone: null, pw: await hash(b.password), createdAt: iso(now()) };
    DB.users.push(u); DB.session = u.id; return { ok: true };
  }],
  ['POST', /^\/auth\/login$/, async (b) => {
    const u = DB.users.find(x => x.email === String(b.email || '').trim().toLowerCase());
    if (!u || u.pw !== await hash(String(b.password || ''))) err(401, 'Email o contraseña incorrectos.');
    DB.session = u.id; return { ok: true };
  }],
  ['POST', /^\/auth\/logout$/, () => { DB.session = null; return { ok: true }; }],
  ['PATCH', /^\/auth\/me$/, (b) => { const u = needUser(); u.name = s(b.name, 2, 80, 'Nombre'); u.phone = s(b.phone ?? '', 0, 40, 'Teléfono') || null; return { ok: true }; }],
  ['POST', /^\/auth\/password$/, async (b) => {
    const u = needUser();
    if (u.pw !== await hash(String(b.current || ''))) err(401, 'La contraseña actual no es correcta.');
    if (String(b.next || '').length < 8) err(400, 'La nueva contraseña debe tener al menos 8 caracteres.');
    u.pw = await hash(b.next); return { ok: true };
  }],

  ['GET', /^\/products(?:\?channel=(\w+))?$/, (b, m) => {
    const u = user(), member = !!u && isMember(u.id), channel = m[1] === 'member' ? 'member' : 'publico';
    return { channel, member, products: DB.products.filter(p => p.active && (channel === 'member' || !p.members_only)).sort((a, c) => a.sort - c.sort || a.id - c.id).map(p => productView(p, member)) };
  }],
  ['GET', /^\/products\/([\w-]+)$/, (b, m) => {
    const p = DB.products.find(x => x.slug === m[1] && x.active) || err(404, 'Producto no encontrado.');
    const u = user(), member = !!u && isMember(u.id);
    return { member, product: productView(p, member) };
  }],
  ['POST', /^\/cart\/quote$/, (b) => { const u = user(); return quote(b.items, !!u && isMember(u.id), b.delivery === 'retiro' ? 'retiro' : 'envio'); }],
  ['POST', /^\/orders$/, (b) => {
    const u = needUser(), member = isMember(u.id), delivery = b.delivery === 'retiro' ? 'retiro' : 'envio';
    const env = delivery === 'envio';
    const ship = { name: s(b.name, 2, 80, 'Nombre'), phone: s(b.phone, 6, 40, 'Teléfono'),
      address: env ? s(b.address, 4, 160, 'Dirección') : null, city: env ? s(b.city, 2, 80, 'Ciudad') : null,
      province: env ? s(b.province, 2, 80, 'Provincia') : null, zip: env ? s(b.zip, 3, 12, 'Código postal') : null };
    const q = quote(b.items, member, delivery);
    if (q.issues.length) err(409, q.issues.map(i => i.message).join(' '), 'cart_issues');
    if (!q.lines.length) err(400, 'El carrito está vacío.');
    for (const l of q.lines) DB.products.find(p => p.id === l.id).stock -= l.qty;
    const o = { id: ++DB.seq, code: `KMT-${Date.now().toString(36).toUpperCase()}-${rand(4)}`, user_id: u.id, status: 'pagado', channel: member ? 'member' : 'publico',
      subtotal: q.subtotal, savings: q.savings, shipping: q.shipping, total: q.total, delivery, ship, notes: s(b.notes ?? '', 0, 500, 'Notas') || null,
      created_at: iso(now()), items: q.lines.map(l => ({ product_id: l.id, name: `${l.name} ${l.volumeMl} ml · ${l.vintage}`, unitPrice: l.finalPrice, qty: l.qty })) };
    DB.orders.push(o); return { order: orderView(o) };
  }],
  ['GET', /^\/orders$/, () => { const u = needUser(); return { orders: DB.orders.filter(o => o.user_id === u.id).sort((a, c) => c.id - a.id).map(orderView) }; }],
  ['GET', /^\/orders\/([\w-]+)$/, (b, m) => { const u = needUser(); const o = DB.orders.find(x => x.code === m[1] && x.user_id === u.id) || err(404, 'Pedido no encontrado.'); return { order: orderView(o) }; }],

  ['GET', /^\/club\/plan$/, () => ({ monthlyPrice: SET().membership_price, benefits: BENEFITS })],
  ['GET', /^\/settings$/, () => ({ membershipPrice: SET().membership_price, shippingFlat: SET().shipping_flat, freeShippingFrom: SET().free_shipping_from, maxReserva: SET().max_reserva })],
  ['GET', /^\/alliances$/, () => ({ alliances: [...DB.alliances].filter(a => a.active).sort((a, c) => a.sort - c.sort || a.id - c.id) })],
  ['GET', /^\/membership$/, () => {
    const u = needUser();
    return { membership: pubMembership(membershipOf(u.id)), payments: DB.payments.filter(p => p.user_id === u.id).reverse()
      .map(p => ({ amount: p.amount, periodStart: p.period_start, periodEnd: p.period_end, status: p.status, ref: p.ref, createdAt: p.created_at })) };
  }],
  ['POST', /^\/membership\/subscribe$/, (b) => {
    const u = needUser();
    if (b.acceptTerms !== true) err(400, 'Tenés que aceptar las condiciones del Club.');
    if (isMember(u.id)) err(409, 'Ya sos socio del Club Komatsu.');
    const start = iso(now()), end = addMonth(start);
    let m = membershipOf(u.id);
    if (m) Object.assign(m, { status: 'active', monthly_price: SET().membership_price, current_period_end: end, cancel_at_period_end: 0 });
    else DB.memberships.push(m = { user_id: u.id, status: 'active', monthly_price: SET().membership_price, started_at: start, current_period_end: end, cancel_at_period_end: 0, member_number: `KM-${String(u.id).padStart(5, '0')}` });
    DB.payments.push({ user_id: u.id, amount: SET().membership_price, period_start: start, period_end: end, status: 'aprobado', ref: `SIM-SUB-${u.id}-${rand(4)}`, created_at: start });
    return { membership: pubMembership(m) };
  }],
  ['POST', /^\/membership\/(cancel|resume)$/, (b, m) => {
    const u = needUser();
    if (!isMember(u.id)) err(404, 'No tenés una membresía activa.');
    const ms = membershipOf(u.id); ms.cancel_at_period_end = m[1] === 'cancel' ? 1 : 0;
    return { membership: pubMembership(ms) };
  }],
  ['GET', /^\/news$/, () => ({ news: DB.announcements.filter(a => a.public).sort((a, c) => c.id - a.id).slice(0, 6) })],
  ['GET', /^\/club\/feed$/, () => {
    const u = needMember(), cutoff = Date.now() - DAY;
    return {
      announcements: [...DB.announcements].sort((a, c) => c.id - a.id),
      events: DB.events.filter(e => e.active !== false && new Date(e.startsAt) >= cutoff).sort((a, c) => a.startsAt.localeCompare(c.startsAt)).map(e => {
        const mine = DB.rsvps.find(r => r.event_id === e.id && r.user_id === u.id);
        return { ...e, seatsLeft: Math.max(0, e.capacity - taken(e.id)), attending: !!mine, myGuests: mine?.guests ?? 0 };
      }),
    };
  }],
  ['POST', /^\/club\/events\/(\d+)\/rsvp$/, (b, m) => {
    const u = needMember(), id = Number(m[1]), guests = Number(b.guests ?? 0) ? 1 : 0;
    const e = DB.events.find(x => x.id === id) || err(404, 'Evento no encontrado.');
    if (taken(id, u.id) + 1 + guests > e.capacity) err(409, 'No quedan cupos suficientes.');
    DB.rsvps = DB.rsvps.filter(r => !(r.event_id === id && r.user_id === u.id));
    DB.rsvps.push({ event_id: id, user_id: u.id, guests }); return { ok: true };
  }],
  ['DELETE', /^\/club\/events\/(\d+)\/rsvp$/, (b, m) => { const u = needMember(); DB.rsvps = DB.rsvps.filter(r => !(r.event_id === Number(m[1]) && r.user_id === u.id)); return { ok: true }; }],

  ['GET', /^\/admin\/summary$/, () => {
    needAdmin();
    const live = DB.memberships.filter(m => m.status === 'active' && new Date(m.current_period_end) > now());
    return { revenue: DB.orders.filter(o => o.status !== 'cancelado').reduce((n, o) => n + o.total, 0), orders: DB.orders.length,
      pending: DB.orders.filter(o => ['pagado', 'preparando'].includes(o.status)).length, users: DB.users.filter(u => u.role === 'customer').length,
      members: live.length, mrr: live.filter(m => !m.cancel_at_period_end).reduce((n, m) => n + m.monthly_price, 0) };
  }],
  ['GET', /^\/admin\/orders$/, () => { needAdmin(); return { orders: [...DB.orders].sort((a, c) => c.id - a.id).map(orderView), statuses: ['pagado', 'preparando', 'enviado', 'entregado', 'cancelado'] }; }],
  ['PATCH', /^\/admin\/orders\/([\w-]+)$/, (b, m) => {
    needAdmin();
    const o = DB.orders.find(x => x.code === m[1]) || err(404, 'Pedido no encontrado.');
    if (!['pagado', 'preparando', 'enviado', 'entregado', 'cancelado'].includes(b.status)) err(400, 'Estado inválido.');
    if (b.status === 'cancelado' && o.status !== 'cancelado') for (const it of o.items) DB.products.find(p => p.id === it.product_id).stock += it.qty;
    o.status = b.status; return { ok: true };
  }],
  ['GET', /^\/admin\/products$/, () => { needAdmin(); return { products: DB.products }; }],
  ['PATCH', /^\/admin\/products\/(\d+)$/, (b, m) => {
    needAdmin();
    const p = DB.products.find(x => x.id === Number(m[1])) || err(404, 'Producto no encontrado.');
    Object.assign(p, productFields(b)); return { ok: true };
  }],
  ['POST', /^\/admin\/products$/, (b) => {
    needAdmin();
    const n = productFields({ variety: 'frutado', format: 'botella', volume_ml: 720, vintage: new Date().getFullYear(), tagline: '', description: '',
      tasting_notes: '', pairing: '', abv: 15, stock: 0, accent: 'gold', active: false, members_only: false, sort: 50, name_jp: '', ...b });
    if (!n.name) err(400, 'Falta el nombre.');
    if (n.price == null || n.member_price == null) err(400, 'Faltan los precios.');
    const base = n.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'producto';
    let slug = `${base}-${n.volume_ml}`, i = 2;
    while (DB.products.some(p => p.slug === slug)) slug = `${base}-${n.volume_ml}-${i++}`;
    const p = { id: ++DB.seq, slug, photo: null, presale_until: null, ...n };
    DB.products.push(p); return { id: p.id, slug };
  }],
  ['POST', /^\/admin\/products\/(\d+)\/photo$/, (b, m) => {
    needAdmin();
    const p = DB.products.find(x => x.id === Number(m[1])) || err(404, 'Producto no encontrado.');
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(String(b.dataUrl || ''))) err(400, 'Formato de imagen no válido. Usá JPG, PNG o WEBP.');
    p.photo = b.dataUrl; return { photo: 'data' };
  }],
  ['DELETE', /^\/admin\/products\/(\d+)\/photo$/, (b, m) => {
    needAdmin();
    const p = DB.products.find(x => x.id === Number(m[1])) || err(404, 'Producto no encontrado.'); p.photo = null; return { ok: true };
  }],
  ['GET', /^\/admin\/members$/, () => {
    needAdmin();
    return { members: DB.memberships.map(m => { const u = DB.users.find(x => x.id === m.user_id); return { name: u?.name, email: u?.email, number: m.member_number, status: m.status, periodEnd: m.current_period_end, cancelAtEnd: m.cancel_at_period_end }; }) };
  }],
  ['GET', /^\/admin\/announcements$/, () => { needAdmin(); return { announcements: [...DB.announcements].sort((a, c) => c.id - a.id) }; }],
  ['POST', /^\/admin\/announcements$/, (b) => { needAdmin(); DB.announcements.push({ id: ++DB.seq, ...annFields(b), createdAt: iso(now()) }); return { ok: true }; }],
  ['PATCH', /^\/admin\/announcements\/(\d+)$/, (b, m) => { needAdmin(); const a = DB.announcements.find(x => x.id === Number(m[1])) || err(404, 'Anuncio no encontrado.'); Object.assign(a, annFields(b)); return { ok: true }; }],
  ['DELETE', /^\/admin\/announcements\/(\d+)$/, (b, m) => { needAdmin(); DB.announcements = DB.announcements.filter(x => x.id !== Number(m[1])); return { ok: true }; }],

  ['GET', /^\/admin\/events$/, () => {
    needAdmin();
    return { events: [...DB.events].sort((a, c) => c.startsAt.localeCompare(a.startsAt)).map(e => {
      const attendees = DB.rsvps.filter(r => r.event_id === e.id).map(r => { const u = DB.users.find(x => x.id === r.user_id); return { name: u?.name || 'Invitado', email: u?.email || '—', guests: r.guests }; });
      return { ...e, active: e.active !== false, attendees, taken: attendees.reduce((n, a) => n + 1 + a.guests, 0) };
    }) };
  }],
  ['POST', /^\/admin\/events$/, (b) => { needAdmin(); DB.events.push({ id: ++DB.seq, ...evtFields(b) }); return { ok: true }; }],
  ['PATCH', /^\/admin\/events\/(\d+)$/, (b, m) => { needAdmin(); const e = DB.events.find(x => x.id === Number(m[1])) || err(404, 'Evento no encontrado.'); Object.assign(e, evtFields(b)); return { ok: true }; }],
  ['DELETE', /^\/admin\/events\/(\d+)$/, (b, m) => { needAdmin(); const id = Number(m[1]); DB.events = DB.events.filter(x => x.id !== id); DB.rsvps = DB.rsvps.filter(r => r.event_id !== id); return { ok: true }; }],

  ['GET', /^\/admin\/alliances$/, () => { needAdmin(); return { alliances: [...DB.alliances].sort((a, c) => a.sort - c.sort || a.id - c.id) }; }],
  ['POST', /^\/admin\/alliances$/, (b) => { needAdmin(); DB.alliances.push({ id: ++DB.seq, ...allyFields(b) }); return { ok: true }; }],
  ['PATCH', /^\/admin\/alliances\/(\d+)$/, (b, m) => { needAdmin(); const a = DB.alliances.find(x => x.id === Number(m[1])) || err(404, 'No encontrado.'); Object.assign(a, allyFields(b)); return { ok: true }; }],
  ['DELETE', /^\/admin\/alliances\/(\d+)$/, (b, m) => { needAdmin(); DB.alliances = DB.alliances.filter(x => x.id !== Number(m[1])); return { ok: true }; }],

  ['GET', /^\/admin\/settings$/, () => { needAdmin(); return { settings: { ...SET() }, labels: { membership_price: 'Cuota mensual del Club', shipping_flat: 'Costo de envío', free_shipping_from: 'Envío sin cargo desde', max_reserva: 'Tope por socio en exclusivos' } }; }],
  ['PATCH', /^\/admin\/settings$/, (b) => {
    needAdmin();
    for (const k of ['membership_price', 'shipping_flat', 'free_shipping_from', 'max_reserva']) if (b[k] !== undefined) {
      const n = Number(b[k]); if (!Number.isInteger(n) || n < (k === 'max_reserva' ? 1 : 0)) err(400, 'Valor inválido.'); SET()[k] = n;
    }
    return { settings: { ...SET() } };
  }],
];

export async function api(path, { method = 'GET', body } = {}) {
  await load();
  await new Promise(r => setTimeout(r, 120)); // latencia simulada
  const route = routes.find(([m, re]) => m === method && re.test(path)) || err(404, 'Ruta no encontrada.');
  const snapshot = JSON.stringify(DB);
  try {
    const out = await route[2](body ? JSON.parse(JSON.stringify(body)) : {}, path.match(route[1]));
    if (method !== 'GET') save();
    return JSON.parse(JSON.stringify(out));
  } catch (e) {
    DB = JSON.parse(snapshot); // como una transacción: si falla, no queda nada a medias
    throw e;
  }
}
