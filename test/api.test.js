import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let server, base, db;
const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'km-up-'));
before(async () => {
  db = openDb(':memory:');
  server = createApp(db, { uploadsDir }).listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

// Cliente mínimo con cookie jar
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(base + url, {
      method, headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
      body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
}
const adult = '1990-05-10';
const ship = { name: 'Ana Pérez', phone: '1155556666', address: 'Av. Rivadavia 1234', city: 'Morón', province: 'Buenos Aires', zip: '1708' };

test('catálogo público oculta exclusivos y muestra precio regular', async () => {
  const c = client();
  const { body } = await c('GET', '/products');
  assert.equal(body.member, false);
  assert.ok(body.products.length >= 5);
  assert.ok(body.products.every(p => !p.membersOnly));
  const f = body.products.find(p => p.slug === 'komatsu-frutado-720');
  assert.equal(f.finalPrice, f.price);
});

test('registro valida mayoría de edad y email duplicado', async () => {
  const c = client();
  let r = await c('POST', '/auth/register', { name: 'Menor', email: 'menor@x.com', password: '12345678', birthdate: '2015-01-01' });
  assert.equal(r.status, 403);
  r = await c('POST', '/auth/register', { name: 'Ana', email: 'ana@x.com', password: '12345678', birthdate: adult });
  assert.equal(r.status, 201);
  r = await client()('POST', '/auth/register', { name: 'Ana 2', email: 'ANA@x.com', password: '12345678', birthdate: adult });
  assert.equal(r.status, 409);
  r = await c('GET', '/auth/me');
  assert.equal(r.body.user.email, 'ana@x.com');
});

test('login, sesión persistente y logout', async () => {
  const c = client();
  assert.equal((await c('POST', '/auth/login', { email: 'ana@x.com', password: 'mala-clave' })).status, 401);
  assert.equal((await c('POST', '/auth/login', { email: 'ana@x.com', password: '12345678' })).status, 200);
  assert.equal((await c('GET', '/auth/me')).body.user.name, 'Ana');
  await c('POST', '/auth/logout');
  assert.equal((await c('GET', '/auth/me')).body.user, null);
});

test('no socio: no puede comprar exclusivos ni preventa; compra pública con envío', async () => {
  const c = client();
  await c('POST', '/auth/register', { name: 'Beto', email: 'beto@x.com', password: '12345678', birthdate: adult });
  assert.equal((await c('GET', '/club/feed')).status, 403);
  let q = (await c('POST', '/cart/quote', { items: [{ slug: 'komatsu-reserva-shokunin-720', qty: 1 }, { slug: 'komatsu-cereza-720', qty: 1 }] })).body;
  assert.equal(q.issues.length, 2);
  q = (await c('POST', '/cart/quote', { items: [{ slug: 'komatsu-frutado-720', qty: 1 }] })).body;
  assert.equal(q.subtotal, 28000);
  assert.equal(q.shipping, 5000);
  const before = db.prepare(`SELECT stock FROM products WHERE slug='komatsu-frutado-720'`).get().stock;
  const r = await c('POST', '/orders', { items: [{ slug: 'komatsu-frutado-720', qty: 2 }], delivery: 'envio', paymentMethod: 'prueba', ...ship });
  assert.equal(r.status, 201);
  assert.equal(r.body.order.total, 56000 + 5000);
  assert.equal(r.body.order.channel, 'publico');
  assert.equal(db.prepare(`SELECT stock FROM products WHERE slug='komatsu-frutado-720'`).get().stock, before - 2);
  assert.equal((await c('GET', '/orders')).body.orders.length, 1);
});

test('checkout requiere sesión', async () => {
  const r = await client()('POST', '/orders', { items: [{ slug: 'komatsu-frutado-720', qty: 1 }], delivery: 'retiro', paymentMethod: 'prueba', ...ship });
  assert.equal(r.status, 401);
});

test('membresía: alta, precios de socio, exclusivos, club y baja', async () => {
  const c = client();
  await c('POST', '/auth/register', { name: 'Caro', email: 'caro@x.com', password: '12345678', birthdate: adult });
  assert.equal((await c('POST', '/membership/subscribe', { paymentMethod: 'prueba' })).status, 400);
  const s = await c('POST', '/membership/subscribe', { acceptTerms: true, paymentMethod: 'prueba' });
  assert.equal(s.status, 201);
  assert.equal(s.body.membership.active, true);
  assert.equal(s.body.membership.monthlyPrice, 20000);
  assert.equal((await c('POST', '/membership/subscribe', { acceptTerms: true, paymentMethod: 'prueba' })).status, 409);

  const products = (await c('GET', '/products?channel=member')).body.products;
  assert.ok(products.some(p => p.membersOnly));
  assert.ok(products.every(p => p.finalPrice === p.memberPrice));

  let q = (await c('POST', '/cart/quote', { items: [{ slug: 'komatsu-reserva-shokunin-720', qty: 3 }] })).body;
  assert.equal(q.issues.length, 1, 'tope de 2 por socio');
  const r = await c('POST', '/orders', { items: [{ slug: 'komatsu-cereza-720', qty: 1 }, { slug: 'komatsu-reserva-shokunin-720', qty: 2 }], delivery: 'envio', paymentMethod: 'prueba', ...ship });
  assert.equal(r.status, 201);
  assert.equal(r.body.order.shipping, 0);
  assert.equal(r.body.order.subtotal, 25500 + 104000);
  assert.equal(r.body.order.savings, 4500);
  assert.equal(r.body.order.channel, 'member');

  const feed = (await c('GET', '/club/feed')).body;
  assert.ok(feed.announcements.length >= 3);
  const ev = feed.events[0];
  assert.equal((await c('POST', `/club/events/${ev.id}/rsvp`, { guests: 1 })).status, 200);
  const after = (await c('GET', '/club/feed')).body.events[0];
  assert.equal(after.seatsLeft, ev.seatsLeft - 2);
  assert.equal(after.attending, true);

  const can = await c('POST', '/membership/cancel');
  assert.equal(can.body.membership.status, 'cancela_al_vencer');
  assert.equal(can.body.membership.active, true);
  assert.equal((await c('POST', '/membership/resume')).body.membership.status, 'activa');
});

test('admin: resumen y cambio de estado con devolución de stock', async () => {
  const c = client();
  assert.equal((await c('POST', '/auth/login', { email: 'admin@komatsu.local', password: 'komatsu-admin' })).status, 200);
  const sum = (await c('GET', '/admin/summary')).body;
  assert.equal(sum.members, 1);
  assert.equal(sum.orders, 2);
  const { orders } = (await c('GET', '/admin/orders')).body;
  const o = orders.find(x => x.channel === 'publico');
  const stock = () => db.prepare(`SELECT stock FROM products WHERE slug='komatsu-frutado-720'`).get().stock;
  const s0 = stock();
  assert.equal((await c('PATCH', `/admin/orders/${o.code}`, { status: 'cancelado' })).status, 200);
  assert.equal(stock(), s0 + 2);
  assert.equal((await client()('GET', '/admin/summary')).status, 403);
});

test('admin sube y quita la foto real de un producto', async () => {
  const c = client();
  await c('POST', '/auth/login', { email: 'admin@komatsu.local', password: 'komatsu-admin' });
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  assert.equal((await c('POST', '/admin/products/1/photo', { dataUrl: 'data:text/html;base64,PGI+' })).status, 400);
  const up = await c('POST', '/admin/products/1/photo', { dataUrl: png });
  assert.equal(up.status, 201);
  const file = await fetch(base.replace('/api', '') + up.body.photo);
  assert.equal(file.status, 200);
  const prod = (await client()('GET', '/products')).body.products.find(p => p.id === 1);
  assert.equal(prod.photo, up.body.photo);
  assert.equal((await c('DELETE', '/admin/products/1/photo')).status, 200);
  assert.equal((await client()('GET', '/products')).body.products.find(p => p.id === 1).photo, null);
  assert.equal(fs.readdirSync(uploadsDir).length, 0);
  assert.equal((await client()('POST', '/admin/products/1/photo', { dataUrl: png })).status, 403);
});

test('admin edita degustaciones, anuncios, alianzas, fichas y ajustes', async () => {
  const c = client();
  await c('POST', '/auth/login', { email: 'admin@komatsu.local', password: 'komatsu-admin' });
  // Degustaciones: crear, cambiar fecha/cupo, ocultar, borrar
  const when = new Date(Date.now() + 5 * 864e5).toISOString();
  assert.equal((await c('POST', '/admin/events', { title: 'Cata de otoño', description: 'Cata guiada', startsAt: when, location: 'Bodega', capacity: 10 })).status, 201);
  let ev = (await c('GET', '/admin/events')).body.events.find(e => e.title === 'Cata de otoño');
  const later = new Date(Date.now() + 9 * 864e5).toISOString();
  assert.equal((await c('PATCH', `/admin/events/${ev.id}`, { title: 'Cata de otoño II', description: 'Cata guiada', startsAt: later, location: 'Bodega', capacity: 30 })).status, 200);
  ev = (await c('GET', '/admin/events')).body.events.find(e => e.id === ev.id);
  assert.equal(ev.capacity, 30); assert.equal(ev.startsAt, later); assert.equal(ev.title, 'Cata de otoño II');
  assert.equal((await c('DELETE', `/admin/events/${ev.id}`)).status, 200);
  assert.ok(!(await c('GET', '/admin/events')).body.events.some(e => e.id === ev.id));
  // Anuncios: editar y borrar
  const ann = (await c('GET', '/admin/announcements')).body.announcements[0];
  await c('PATCH', `/admin/announcements/${ann.id}`, { kind: 'premio', title: 'Título nuevo', body: 'Texto nuevo', public: true });
  assert.ok((await client()('GET', '/news')).body.news.some(n => n.title === 'Título nuevo'));
  await c('DELETE', `/admin/announcements/${ann.id}`);
  assert.ok(!(await c('GET', '/admin/announcements')).body.announcements.some(a => a.id === ann.id));
  // Alianzas: alta, edición, baja
  assert.equal((await c('POST', '/admin/alliances', { name: 'Arrocera del Litoral', category: 'proveedor', description: 'Arroz', url: 'https://ejemplo.com' })).status, 201);
  let al = (await client()('GET', '/alliances')).body.alliances.find(a => a.name === 'Arrocera del Litoral');
  assert.ok(al);
  assert.equal((await c('PATCH', `/admin/alliances/${al.id}`, { name: 'Arrocera Norte', category: 'proveedor', active: false })).status, 200);
  assert.ok(!(await client()('GET', '/alliances')).body.alliances.some(a => a.id === al.id));
  assert.equal((await c('POST', '/admin/alliances', { name: 'Mala', url: 'javascript:alert(1)' })).status, 400);
  await c('DELETE', `/admin/alliances/${al.id}`);
  // Ficha de producto y producto nuevo
  await c('PATCH', '/admin/products/1', { tagline: 'Bajada nueva', tasting_notes: 'Notas nuevas', ingredients: 'Agua, arroz, koji' });
  const p1 = (await client()('GET', '/products/komatsu-frutado-720')).body.product;
  assert.equal(p1.tagline, 'Bajada nueva'); assert.equal(p1.ingredients, 'Agua, arroz, koji');
  const np = await c('POST', '/admin/products', { name: 'Komatsu Yuzu', variety: 'yuzu', price: 31000, member_price: 26000, stock: 10, active: true });
  assert.equal(np.status, 201);
  assert.ok((await client()('GET', '/products')).body.products.some(p => p.slug === np.body.slug));
  // Ajustes: precio del Club y envío
  await c('PATCH', '/admin/settings', { membership_price: 25000, shipping_flat: 7000, free_shipping_from: 80000 });
  assert.equal((await client()('GET', '/club/plan')).body.monthlyPrice, 25000);
  const q = (await client()('POST', '/cart/quote', { items: [{ slug: 'komatsu-tokkuri-frutado-330', qty: 1 }] })).body;
  assert.equal(q.shipping, 7000); assert.equal(q.freeShippingFrom, 80000);
  assert.equal((await client()('PATCH', '/admin/settings', { membership_price: 1 })).status, 403);
});

test('app instalable: manifest y assetlinks', async () => {
  const root = base.replace('/api', '');
  const m = await (await fetch(root + '/manifest.webmanifest')).json();
  assert.equal(m.name, 'Bodega Komatsu');
  process.env.ANDROID_SHA256 = 'aa:bb';
  const al = await (await fetch(root + '/.well-known/assetlinks.json')).json();
  assert.equal(al[0].target.package_name, 'com.bodegakomatsu.app');
  assert.deepEqual(al[0].target.sha256_cert_fingerprints, ['AA:BB']);
  delete process.env.ANDROID_SHA256;
});

test('botellas numeradas: edición, verificación y registro a nombre del dueño', async () => {
  const admin = client();
  await admin('POST', '/auth/login', { email: 'admin@komatsu.local', password: 'komatsu-admin' });
  assert.equal((await client()('POST', '/admin/editions', { productId: 1, vintage: 2027, size: 5 })).status, 403);
  const ed = await admin('POST', '/admin/editions', { productId: 1, vintage: 2027, size: 50, name: 'Primera nieve' });
  assert.equal(ed.status, 201);
  const codes = (await admin('GET', `/admin/editions/${ed.body.id}/codes`)).body.codes;
  assert.equal(codes.length, 50);
  assert.equal(new Set(codes.map(c => c.code)).size, 50);
  const code = codes[6].code;
  // Verificación pública (acepta minúsculas y sin guión)
  const v = await client()('GET', '/certificates/' + code.toLowerCase().replace('-', ''));
  assert.equal(v.status, 200);
  assert.equal(v.body.certificate.number, 7);
  assert.equal(v.body.certificate.size, 50);
  assert.equal(v.body.certificate.claimed, false);
  assert.equal((await client()('GET', '/certificates/XXXXX-XXXXX')).status, 404);
  // Registro
  const u1 = client(), u2 = client();
  await u1('POST', '/auth/register', { name: 'Diego Tanaka', email: 'cert1@x.com', password: '12345678', birthdate: adult });
  await u2('POST', '/auth/register', { name: 'Otra Persona', email: 'cert2@x.com', password: '12345678', birthdate: adult });
  assert.equal((await client()('POST', `/certificates/${code}/claim`)).status, 401);
  const c1 = await u1('POST', `/certificates/${code}/claim`);
  assert.equal(c1.status, 200);
  assert.equal(c1.body.certificate.mine, true);
  assert.equal(c1.body.certificate.owner, 'Diego T.');
  assert.equal((await u2('POST', `/certificates/${code}/claim`)).status, 409);
  assert.equal((await u1('GET', '/certificates/mine')).body.certificates.length, 1);
  const csv = await fetch(base + `/admin/editions/${ed.body.id}/codes.csv`, { headers: {} });
  assert.equal(csv.status, 403);
  const list = (await admin('GET', '/admin/editions')).body.editions[0];
  assert.equal(list.claimed, 1);
});

test('pago por transferencia: reserva, datos bancarios, confirmación y vencimiento', async () => {
  const admin = client();
  await admin('POST', '/auth/login', { email: 'admin@komatsu.local', password: 'komatsu-admin' });
  const c = client();
  await c('POST', '/auth/register', { name: 'Tomás Transfer', email: 'tr@x.com', password: '12345678', birthdate: adult });
  // Sin cuenta bancaria cargada, la transferencia no se ofrece
  assert.ok(!(await c('GET', '/payment-methods')).body.methods.some(m => m.id === 'transferencia'));
  await admin('PATCH', '/admin/settings', { transfer_discount_pct: 10, transfer_expiry_hours: 48, text: { bank_alias: 'KOMATSU.SAKE.MP', bank_holder: 'Bodega Komatsu', bank_cbu: '0000003100000000000001' } });
  const m = (await c('GET', '/payment-methods')).body.methods.find(x => x.id === 'transferencia');
  assert.equal(m.discountPct, 10);
  const stock = () => db.prepare(`SELECT stock FROM products WHERE slug='komatsu-tokkuri-frutado-330'`).get().stock;
  const s0 = stock();
  const r = await c('POST', '/orders', { items: [{ slug: 'komatsu-tokkuri-frutado-330', qty: 2 }], delivery: 'retiro', paymentMethod: 'transferencia', ...ship });
  assert.equal(r.status, 201);
  const o = r.body.order;
  assert.equal(o.status, 'pendiente_pago');
  assert.equal(o.bank.alias, 'KOMATSU.SAKE.MP');
  assert.equal(o.discount, Math.round(o.subtotal * 0.10));
  assert.equal(o.total, o.subtotal - o.discount);
  assert.equal(stock(), s0 - 2, 'el stock queda reservado');
  // El admin confirma el pago
  assert.equal((await admin('PATCH', `/admin/orders/${o.code}`, { status: 'pagado' })).status, 200);
  assert.equal((await c('GET', `/orders/${o.code}`)).body.order.status, 'pagado');
  // Un segundo pedido que vence sin pagar libera el stock
  const r2 = await c('POST', '/orders', { items: [{ slug: 'komatsu-tokkuri-frutado-330', qty: 3 }], delivery: 'retiro', paymentMethod: 'transferencia', ...ship });
  const s1 = stock();
  db.prepare(`UPDATE orders SET expires_at='2000-01-01T00:00:00Z' WHERE code=?`).run(r2.body.order.code);
  const { expirePendingOrders } = await import('../src/routes/shop.js');
  assert.equal(expirePendingOrders(db), 1);
  assert.equal(stock(), s1 + 3);
  assert.equal((await c('GET', `/orders/${r2.body.order.code}`)).body.order.status, 'cancelado');
  // Club por transferencia: pendiente hasta que el admin confirma
  const sub = await c('POST', '/membership/subscribe', { acceptTerms: true, paymentMethod: 'transferencia' });
  assert.equal(sub.body.pending, true);
  assert.equal(sub.body.membership, null);
  const pend = (await admin('GET', '/admin/membership-payments')).body.payments.find(p => p.email === 'tr@x.com');
  assert.ok(pend);
  await admin('POST', `/admin/membership-payments/${pend.id}/confirm`);
  assert.equal((await c('GET', '/auth/me')).body.user.member, true);
});

test('Mercado Pago: genera el link de pago y acredita con la notificación', async () => {
  const realFetch = globalThis.fetch;
  const payments = {};
  let lastPref = null;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (!u.startsWith('https://api.mercadopago.com')) return realFetch(url, opts);
    const json = data => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.endsWith('/checkout/preferences')) { lastPref = JSON.parse(opts.body); return json({ id: 'PREF1', init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=PREF1' }); }
    const m = u.match(/\/v1\/payments\/(\d+)$/); if (m) return json(payments[m[1]]);
    if (u.includes('/v1/payments/search')) { const ref = new URL(u).searchParams.get('external_reference'); return json({ results: Object.values(payments).filter(p => p.external_reference === ref) }); }
    return new Response('{}', { status: 404 });
  };
  process.env.MP_ACCESS_TOKEN = 'TEST-TOKEN';
  try {
    const c = client();
    await c('POST', '/auth/register', { name: 'Marta MP', email: 'mp@x.com', password: '12345678', birthdate: adult });
    const methods = (await c('GET', '/payment-methods')).body.methods.map(m => m.id);
    assert.ok(methods.includes('mercadopago'));
    assert.ok(!methods.includes('prueba'), 'con Mercado Pago activo no se ofrece el pago de prueba');
    const r = await c('POST', '/orders', { items: [{ slug: 'komatsu-frutado-720', qty: 1 }], delivery: 'envio', paymentMethod: 'mercadopago', ...ship });
    assert.equal(r.status, 201);
    assert.match(r.body.checkoutUrl, /mercadopago/);
    const code = r.body.order.code;
    assert.equal(lastPref.external_reference, code);
    assert.equal(lastPref.items.reduce((n, i) => n + i.unit_price * i.quantity, 0), r.body.order.total);
    assert.match(lastPref.notification_url, /\/api\/payments\/mercadopago\/webhook$/);
    // Notificación de un pago rechazado: no cambia nada
    payments['111'] = { id: 111, status: 'rejected', external_reference: code };
    await realFetch(base + '/payments/mercadopago/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'payment', data: { id: '111' } }) });
    await new Promise(r => setTimeout(r, 50));
    assert.equal(db.prepare('SELECT status FROM orders WHERE code=?').get(code).status, 'pendiente_pago');
    // Notificación de pago aprobado: el pedido queda pagado
    payments['222'] = { id: 222, status: 'approved', external_reference: code };
    await realFetch(base + '/payments/mercadopago/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'payment', data: { id: '222' } }) });
    await new Promise(r => setTimeout(r, 50));
    const row = db.prepare('SELECT status, provider_ref FROM orders WHERE code=?').get(code);
    assert.equal(row.status, 'pagado'); assert.equal(row.provider_ref, 'MP-222');
    // Club por Mercado Pago, acreditado al volver del pago
    const sub = await c('POST', '/membership/subscribe', { acceptTerms: true, paymentMethod: 'mercadopago' });
    assert.match(sub.body.checkoutUrl, /mercadopago/);
    payments['333'] = { id: 333, status: 'approved', external_reference: sub.body.reference };
    const back = await realFetch(base.replace('/api', '') + '/pago/retorno?ref=' + sub.body.reference, { redirect: 'manual' });
    assert.equal(back.status, 302);
    assert.equal((await c('GET', '/auth/me')).body.user.member, true);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.MP_ACCESS_TOKEN;
  }
});

test('escrituras sin JSON se rechazan (CSRF)', async () => {
  const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=a&password=b' });
  assert.equal(res.status, 415);
});
