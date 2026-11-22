// Base de datos SQLite (módulo nativo node:sqlite, sin dependencias compiladas).
// Esquema + datos iniciales (catálogo, anuncios, degustaciones, usuario admin).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './security.js';

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  phone         TEXT,
  birthdate     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  name_jp       TEXT NOT NULL,
  variety       TEXT NOT NULL,
  format        TEXT NOT NULL CHECK (format IN ('botella','tokkuri','pack')),
  volume_ml     INTEGER NOT NULL,
  vintage       INTEGER NOT NULL,
  tagline       TEXT NOT NULL,
  description   TEXT NOT NULL,
  tasting_notes TEXT NOT NULL,
  pairing       TEXT NOT NULL,
  ingredients   TEXT,
  abv           REAL NOT NULL,
  price         INTEGER NOT NULL,
  member_price  INTEGER NOT NULL,
  stock         INTEGER NOT NULL DEFAULT 0,
  members_only  INTEGER NOT NULL DEFAULT 0,
  presale_until TEXT,
  image         TEXT NOT NULL,
  accent        TEXT NOT NULL DEFAULT 'gold',
  active        INTEGER NOT NULL DEFAULT 1,
  sort          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS memberships (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status               TEXT NOT NULL CHECK (status IN ('active','past_due','expired')),
  monthly_price        INTEGER NOT NULL,
  started_at           TEXT NOT NULL,
  current_period_end   TEXT NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  member_number        TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS membership_payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount       INTEGER NOT NULL,
  period_start TEXT NOT NULL,
  period_end   TEXT NOT NULL,
  status       TEXT NOT NULL,
  provider_ref TEXT,
  method       TEXT NOT NULL DEFAULT 'prueba',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL UNIQUE,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  status         TEXT NOT NULL CHECK (status IN ('pendiente_pago','pagado','preparando','enviado','entregado','cancelado')),
  channel        TEXT NOT NULL CHECK (channel IN ('publico','member')),
  subtotal       INTEGER NOT NULL,
  savings        INTEGER NOT NULL DEFAULT 0,
  shipping       INTEGER NOT NULL,
  total          INTEGER NOT NULL,
  delivery       TEXT NOT NULL CHECK (delivery IN ('envio','retiro')),
  ship_name      TEXT NOT NULL,
  ship_phone     TEXT NOT NULL,
  ship_address   TEXT,
  ship_city      TEXT,
  ship_province  TEXT,
  ship_zip       TEXT,
  notes          TEXT,
  provider_ref   TEXT,
  payment_method TEXT NOT NULL DEFAULT 'prueba',
  discount       INTEGER NOT NULL DEFAULT 0,
  expires_at     TEXT,
  paid_at        TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  name       TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  qty        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK (kind IN ('anuncio','premio','lanzamiento')),
  title      TEXT NOT NULL,
  title_jp   TEXT,
  body       TEXT NOT NULL,
  public     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  title_jp    TEXT,
  description TEXT NOT NULL,
  starts_at   TEXT NOT NULL,
  location    TEXT NOT NULL,
  capacity    INTEGER NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guests     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS editions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  vintage    INTEGER NOT NULL,
  name       TEXT,
  size       INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bottle_codes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  edition_id    INTEGER NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
  number        INTEGER NOT NULL,
  code          TEXT NOT NULL UNIQUE,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  claimed_at    TEXT,
  UNIQUE (edition_id, number)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alliances (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'proveedor',
  description TEXT NOT NULL DEFAULT '',
  url         TEXT,
  sort        INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;

const VINTAGE = 2026;

const PRODUCTS = [
  {
    slug: 'komatsu-frutado-700', name: 'Komatsu Junmai Frutado', name_jp: '小松 純米 果実香',
    variety: 'frutado', format: 'botella', volume_ml: 700,
    tagline: 'Perfil aromático, fresco y floral — como un blanco frutado.',
    description: 'Nuestro Junmai insignia. Arroz orgánico Koshihikari pulido, koji de arroz y levaduras seleccionadas, fermentado lentamente en frío en tanques cilindrocónicos de acero inoxidable con control térmico.',
    tasting_notes: 'Pera, melón blanco y flor de azahar. Boca sedosa, final limpio y levemente mineral.',
    pairing: 'Sashimi, ceviche, quesos frescos, cocina nikkei.',
    abv: 15.5, price: 28000, member_price: 23800, stock: 120, accent: 'gold', sort: 1,
  },
  {
    slug: 'komatsu-cereza-700', name: 'Komatsu Junmai Cereza', name_jp: '小松 純米 桜桃',
    variety: 'cereza', format: 'botella', volume_ml: 700,
    tagline: 'Partida limitada: junmai con cereza, delicado, rosado y de final largo.',
    description: 'Partida limitada y numerada. Una base Junmai frutada que reposa con cerezas seleccionadas. Mantiene la pureza del arroz con un perfil frutal rojo, elegante y equilibrado.',
    tasting_notes: 'Cereza fresca, frutos rojos y un toque de almendra. Dulzor sutil, acidez viva.',
    pairing: 'Pato, cerdo laqueado, postres con frutos rojos, chocolate amargo.',
    abv: 14.5, price: 30000, member_price: 25500, stock: 90, accent: 'red', sort: 2,
  },
  {
    slug: 'komatsu-pack-duo-700', name: 'Pack Dúo Komatsu', name_jp: '小松 二本セット',
    variety: 'duo', format: 'pack', volume_ml: 1400,
    tagline: 'Frutado + Cereza en estuche de regalo.',
    description: 'Las dos expresiones de la cosecha en un estuche negro con hot stamping dorado. Ideal para regalar o para comparar en una cata en casa.',
    tasting_notes: 'Incluye 1 × Junmai Frutado 700 ml y 1 × Junmai Cereza 700 ml.',
    pairing: 'Una mesa completa: de entradas frías a postre.',
    abv: 15.0, price: 54000, member_price: 45000, stock: 45, accent: 'gold', sort: 3,
  },
  {
    slug: 'komatsu-tokkuri-frutado-330', name: 'Tokkuri Frutado', name_jp: '徳利 果実香',
    variety: 'frutado', format: 'tokkuri', volume_ml: 330,
    tagline: 'Formato jarrita vertedora, pensado para la mesa del restaurante.',
    description: 'El Junmai Frutado en tokkuri de 330 ml: se sirve directo en la mesa, en ochoko, frío o a temperatura ambiente.',
    tasting_notes: 'Pera, melón blanco y flor de azahar.',
    pairing: 'Barra de sushi, izakaya, omakase.',
    abv: 15.5, price: 15000, member_price: 12750, stock: 200, accent: 'gold', sort: 4,
  },
  {
    slug: 'komatsu-tokkuri-cereza-330', name: 'Tokkuri Cereza', name_jp: '徳利 桜桃',
    variety: 'cereza', format: 'tokkuri', volume_ml: 330,
    tagline: 'La versión cereza en jarrita de servicio.',
    description: 'El Junmai Cereza en tokkuri de 330 ml, para compartir en la mesa.',
    tasting_notes: 'Cereza fresca y frutos rojos.',
    pairing: 'Robata, yakitori, postres.',
    abv: 14.5, price: 16000, member_price: 13600, stock: 150, accent: 'red', sort: 5,
  },
  {
    slug: 'komatsu-reserva-shokunin-700', name: 'Reserva Shokunin', name_jp: '職人 限定',
    variety: 'reserva', format: 'botella', volume_ml: 700,
    tagline: 'Tirada limitada y numerada. Exclusiva Club Member.',
    description: 'Selección del maestro: un único tanque de la cosecha, embotellado a mano y numerado. Sólo para socios del Club Komatsu.',
    tasting_notes: 'Arroz cocido, nuez fresca, durazno blanco. Textura profunda y final muy largo.',
    pairing: 'Wagyu, hongos, quesos maduros.',
    abv: 16.0, price: 52000, member_price: 52000, stock: 60, accent: 'red', sort: 6,
    members_only: 1,
  },
];

const PRODUCT_PHOTOS = {
  'komatsu-frutado-700': '/img/prod-frutado.jpg', 'komatsu-cereza-700': '/img/prod-cereza.jpg',
  'komatsu-pack-duo-700': '/img/prod-duo.jpg', 'komatsu-reserva-shokunin-700': '/img/prod-reserva.jpg',
};

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  if (!db.prepare("SELECT 1 FROM pragma_table_info('events') WHERE name='active'").get())
    db.exec('ALTER TABLE events ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  if (!db.prepare("SELECT 1 FROM pragma_table_info('products') WHERE name='ingredients'").get())
    db.exec('ALTER TABLE products ADD COLUMN ingredients TEXT');
  // Migración: pedidos con pago pendiente (bases creadas antes de los medios de pago reales)
  const ordersSql = db.prepare("SELECT sql FROM sqlite_master WHERE name='orders'").get()?.sql || '';
  if (!ordersSql.includes('pendiente_pago')) {
    // Método recomendado por SQLite: tabla nueva, copiar, borrar la vieja y renombrar (las referencias a «orders» siguen válidas).
    const ddl = SCHEMA.slice(SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS orders'), SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS order_items'))
      .replace('CREATE TABLE IF NOT EXISTS orders', 'CREATE TABLE orders_new');
    const cols = db.prepare("SELECT name FROM pragma_table_info('orders')").all().map(c => c.name).join(',');
    db.exec('PRAGMA foreign_keys = OFF; BEGIN;');
    try {
      db.exec(ddl);
      db.exec(`INSERT INTO orders_new (${cols}) SELECT ${cols} FROM orders; DROP TABLE orders; ALTER TABLE orders_new RENAME TO orders;`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id); COMMIT;');
    } catch (e) { db.exec('ROLLBACK'); throw e; } finally { db.exec('PRAGMA foreign_keys = ON;'); }
  }
  if (!db.prepare("SELECT 1 FROM pragma_table_info('membership_payments') WHERE name='method'").get())
    db.exec("ALTER TABLE membership_payments ADD COLUMN method TEXT NOT NULL DEFAULT 'prueba'");
  // Migración: foto real del producto (ruta pública /uploads/...)
  if (!db.prepare("SELECT 1 FROM pragma_table_info('products') WHERE name='photo'").get())
    db.exec('ALTER TABLE products ADD COLUMN photo TEXT');
  seed(db);
  return db;
}

function seed(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (count === 0) {
    const ins = db.prepare(`INSERT INTO products
      (slug,name,name_jp,variety,format,volume_ml,vintage,tagline,description,tasting_notes,pairing,abv,price,member_price,stock,members_only,presale_until,image,accent,sort)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    // La cosecha nueva arranca con 14 días de preventa exclusiva para socios.
    const presale = new Date(Date.now() + 14 * 864e5).toISOString();
    for (const p of PRODUCTS) {
      ins.run(p.slug, p.name, p.name_jp, p.variety, p.format, p.volume_ml, VINTAGE, p.tagline, p.description,
        p.tasting_notes, p.pairing, p.abv, p.price, p.member_price, p.stock, p.members_only || 0,
        p.variety === 'cereza' && p.format === 'botella' ? presale : null,
        p.format === 'tokkuri' ? 'tokkuri' : 'botella', p.accent, p.sort);
    }
    // Fotos de la botella Barrica 700 (se cambian desde el panel)
    const ph = db.prepare('UPDATE products SET photo=? WHERE slug=?');
    for (const [slug, f] of Object.entries(PRODUCT_PHOTOS)) ph.run(f, slug);
  }

  if (db.prepare('SELECT COUNT(*) AS n FROM announcements').get().n === 0) {
    const ins = db.prepare('INSERT INTO announcements (kind,title,title_jp,body,public) VALUES (?,?,?,?,?)');
    ins.run('lanzamiento', `Cosecha ${VINTAGE}: preventa para socios`, '新酒 先行予約',
      `La etiqueta ${VINTAGE} del Junmai Cereza abre en preventa exclusiva para el Club durante 14 días antes de llegar al Shop Público.`, 1);
    ins.run('premio', 'Medalla de plata — Concurso de Sakes de Sudamérica', '銀賞',
      'El Junmai Frutado fue reconocido por su equilibrio aromático y su final limpio. Gracias a todos los socios que nos acompañan.', 1);
    ins.run('anuncio', 'Reserva Shokunin: quedan pocas botellas', '職人 限定',
      'La tirada numerada de la Reserva Shokunin es sólo para socios. Cada socio puede reservar hasta 2 botellas.', 0);
  }

  if (db.prepare('SELECT COUNT(*) AS n FROM events').get().n === 0) {
    const ins = db.prepare('INSERT INTO events (title,title_jp,description,starts_at,location,capacity) VALUES (?,?,?,?,?,?)');
    const d = (days, h) => { const x = new Date(Date.now() + days * 864e5); x.setUTCHours(h, 0, 0, 0); return x.toISOString(); };
    ins.run('Degustación guiada: Frutado vs. Cereza', '利き酒会',
      'Cata comparativa con el maestro sakero, con maridaje de bocados nikkei. Cupos limitados.', d(12, 22), 'Bodega Komatsu', 20);
    ins.run('Visita a la planta + almuerzo', '蔵見学',
      'Recorrido por la sala de koji y los tanques de fermentación en frío, seguido de un almuerzo japonés.', d(26, 15), 'Bodega Komatsu', 14);
  }

  if (db.prepare('SELECT COUNT(*) AS n FROM alliances').get().n === 0) {
    const ins = db.prepare('INSERT INTO alliances (name,category,description,sort) VALUES (?,?,?,?)');
    ins.run('Productores de arroz orgánico', 'proveedor', 'Koshihikari cultivado en Argentina, con trazabilidad por cosecha.', 1);
    ins.run('Restaurantes japoneses y nikkei', 'restaurante', 'Formato Tokkuri 330 ml pensado para el servicio en mesa.', 2);
    ins.run('Vinotecas y tiendas gourmet', 'punto de venta', 'Puntos de venta seleccionados para cada nueva tirada.', 3);
    ins.run('Comunidad nikkei', 'comunidad', 'Encuentros, degustaciones y difusión de la cultura del sake.', 4);
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@komatsu.local';
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!exists) {
    const pass = process.env.ADMIN_PASSWORD || 'komatsu-admin';
    db.prepare("INSERT INTO users (email,name,password_hash,role) VALUES (?,?,?,'admin')")
      .run(adminEmail, 'Administración Komatsu', hashPassword(pass));
  }
}

// Envuelve una función en una transacción.
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
