# Sake Komatsu 小松 — E-commerce & Club Member

Tienda online de **Sake Komatsu (Sake Junmai Argentino)** con Shop Público, Member Shop exclusivo,
membresía mensual del Club, área de socios, carrito, checkout y panel de administración.

- **Backend:** Node.js 22+ · Express 5 · SQLite nativo (`node:sqlite`, sin compilar nada).
- **Frontend:** SPA en JavaScript sin build (módulos ES), estética negro mate / dorado / rojo hanko, bilingüe español–japonés.
- **Única dependencia:** `express`.

## Probarlo

```bash
cd komatsu
npm install
npm start          # http://localhost:3000
npm test           # tests de la API (auth, precios, membresía, pedidos, admin)
```

Usuario administrador inicial (cambialo con variables de entorno antes de publicar):
`admin@komatsu.local` / `komatsu-admin`.

## Estructura

```
komatsu/
├── server.js               arranque + renovación horaria de membresías
├── src/
│   ├── app.js              Express: seguridad, rutas, SPA
│   ├── db.js               esquema SQLite + catálogo y contenidos iniciales
│   ├── config.js           precios de membresía, envío, topes
│   ├── security.js         scrypt, tokens, rate-limit, validaciones
│   ├── auth.js             sesiones persistentes por cookie httpOnly + guards
│   ├── membership.js       alta, baja al fin del período, renovación
│   ├── pricing.js          cotización: precio público vs. socio, preventa, exclusivos, envío
│   ├── payments.js         pasarela SIMULADA (punto de integración Mercado Pago)
│   └── routes/             auth · shop · club · admin
├── public/
│   ├── index.html          shell: header, menú desplegable, puerta +18
│   ├── css/styles.css
│   ├── img/                logo, botella, planta
│   └── js/                 router, store (carrito), vistas
└── test/api.test.js
```

## Secciones

| Ruta | Qué hay |
|---|---|
| `#/` | Home: hero, pilares, sakes destacados, novedades, historia |
| `#/bodega` (+ `/historia`, `/filosofia`, `/materias-primas`, `/recorrido`, `/alianzas`) | La Bodega, con recorrido panorámico arrastrable con puntos de interés |
| `#/shop` | Shop Público con filtros (720 ml, Tokkuri 330 ml, Pack dúo) |
| `#/producto/:slug` | Ficha: notas de cata, maridaje, sin TACC, precio público y de socio |
| `#/club` | Beneficios y alta de socio ($20.000/mes) |
| `#/club/shop` | Member Shop (sólo socios): precios de socio, preventas, Reserva Shokunin |
| `#/club/socios` | Área de socios: tarjeta de socio, anuncios, premios, reservas a degustaciones |
| `#/carrito`, `#/checkout` | Carrito (en el navegador; el servidor recalcula siempre los precios), envío o retiro |
| `#/cuenta` | Pedidos, membresía (baja/reactivación, historial de pagos), perfil, contraseña |
| `#/admin` | KPIs, estados de pedidos, precios/stock/preventas, socios, anuncios y eventos |

## Reglas de negocio

- **Precio de socio** (≈15% menos) aplicado por el servidor según la sesión; envío sin cargo para socios.
- Envío fijo $5.000, sin cargo desde $60.000 o con retiro en bodega.
- **Preventa**: un producto con `presale_until` futuro sólo lo pueden comprar socios hasta esa fecha
  (la Cereza 2026 arranca con 14 días de preventa).
- **Exclusivos** (`members_only`): no aparecen en el Shop Público; tope de 2 por pedido.
- Stock descontado en transacción; cancelar un pedido desde el admin lo devuelve.
- Membresía: cobro por mes adelantado; la baja mantiene beneficios hasta el fin del período;
  la renovación automática corre cada hora en el servidor.
- Registro sólo para mayores de 18 (fecha de nacimiento) y puerta de edad al entrar.

## Seguridad

Contraseñas con scrypt · sesiones con token aleatorio (en la base se guarda sólo su hash) en cookie
`httpOnly` + `SameSite=Lax` (+ `Secure` en producción) · escrituras sólo JSON (protección CSRF) ·
CSP estricta · límite de intentos en login/registro · todo el contenido se escapa al renderizar.

## Variables de entorno

| Variable | Default |
|---|---|
| `PORT` | `3000` |
| `DB_FILE` | `./data/komatsu.db` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@komatsu.local` / `komatsu-admin` |
| `MEMBERSHIP_PRICE` | `20000` |
| `SHIPPING_FLAT` / `FREE_SHIPPING_FROM` | `5000` / `60000` |
| `NODE_ENV=production` | activa cookie `Secure` |

## Pendiente para producción

1. **Pagos reales:** reemplazar `src/payments.js` por Mercado Pago (Checkout Pro para pedidos,
   suscripciones/preapproval para el Club) y confirmar pagos por webhook.
2. **Emails** (confirmación de pedido, bienvenida al Club, recupero de contraseña).
3. **Fotos reales** de cada producto (hoy las tarjetas usan ilustraciones SVG de la botella y el tokkuri).
4. **Recorrido 360° real:** cambiar la foto por una panorámica equirectangular (por ejemplo con Pannellum).
5. Precios y textos son de ejemplo: editables desde el panel admin o en `src/db.js`.
6. Hosting con disco persistente para el archivo SQLite (o migrar a Postgres).
