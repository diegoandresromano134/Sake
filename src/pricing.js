// Cotización de carrito: aplica precio público o de socio y valida reglas de venta.
import { CONFIG } from './config.js';
import { getSettings } from './settings.js';
import { HttpError } from './security.js';

export function productView(p, member) {
  const presale = p.presale_until && new Date(p.presale_until) > new Date();
  return {
    id: p.id, slug: p.slug, name: p.name, nameJp: p.name_jp, variety: p.variety, format: p.format,
    volumeMl: p.volume_ml, vintage: p.vintage, tagline: p.tagline, description: p.description,
    tastingNotes: p.tasting_notes, pairing: p.pairing, ingredients: p.ingredients || null, sort: p.sort, abv: p.abv, image: p.image, photo: p.photo || null, accent: p.accent,
    price: p.price, memberPrice: p.member_price,
    finalPrice: member ? p.member_price : p.price,
    stock: p.stock, inStock: p.stock > 0, lowStock: p.stock > 0 && p.stock <= 10,
    membersOnly: !!p.members_only,
    presaleUntil: presale ? p.presale_until : null,
    // Puede comprarse ahora por este usuario
    purchasable: p.stock > 0 && (member || (!p.members_only && !presale)),
    glutenFree: true,
  };
}

export function quote(db, rawItems, { member, delivery = 'envio' }) {
  if (!Array.isArray(rawItems)) throw new HttpError(400, 'Carrito inválido.');
  const merged = new Map();
  for (const it of rawItems.slice(0, 50)) {
    const slug = typeof it?.slug === 'string' ? it.slug : '';
    const qty = Math.trunc(Number(it?.qty));
    if (!slug || !(qty > 0)) continue;
    merged.set(slug, Math.min((merged.get(slug) || 0) + qty, CONFIG.maxQtyPerItem));
  }
  const S = getSettings(db);
  const get = db.prepare('SELECT * FROM products WHERE slug = ? AND active = 1');
  const lines = [], issues = [];
  let subtotal = 0, regular = 0;
  for (const [slug, qty] of merged) {
    const p = get.get(slug);
    if (!p) { issues.push({ slug, message: 'Producto no disponible.' }); continue; }
    const v = productView(p, member);
    let problem = null;
    if (v.membersOnly && !member) problem = 'Exclusivo para socios del Club.';
    else if (v.presaleUntil && !member) problem = 'En preventa exclusiva para socios.';
    else if (p.stock < qty) problem = p.stock > 0 ? `Sólo quedan ${p.stock} unidades.` : 'Sin stock.';
    else if (v.membersOnly && qty > S.max_reserva) problem = `Máximo ${S.max_reserva} por socio.`;
    const lineTotal = v.finalPrice * qty;
    lines.push({ ...v, qty, lineTotal, problem });
    if (problem) { issues.push({ slug, message: problem }); continue; }
    subtotal += lineTotal;
    regular += p.price * qty;
  }
  const okLines = lines.filter(l => !l.problem);
  const shipping = okLines.length === 0 || delivery === 'retiro' || member || subtotal >= S.free_shipping_from ? 0 : S.shipping_flat;
  return {
    member, delivery, lines, issues,
    subtotal, savings: regular - subtotal, shipping, total: subtotal + shipping,
    freeShippingFrom: S.free_shipping_from,
  };
}
