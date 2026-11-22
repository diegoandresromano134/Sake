# Sake Komatsu 小松 — E-commerce & Club Member

Tienda online de **Sake Komatsu (Sake Junmai Argentino)** con Shop Público, Member Shop exclusivo,
membresía mensual del Club, área de socios, carrito, checkout y panel de administración.

- **Backend:** Node.js 22+ · Express 5 · SQLite nativo (`node:sqlite`, sin compilar nada).
- **Frontend:** SPA en JavaScript sin build (módulos ES), estética negro mate / dorado / rojo hanko, bilingüe español–japonés.
- **Única dependencia:** `express`.

## Probarlo

```bash
npm install
npm start          # http://localhost:3000
npm test           # tests de la API (auth, precios, membresía, pedidos, admin)
```

Usuario administrador inicial (cambialo con variables de entorno antes de publicar):
`admin@komatsu.local` / `komatsu-admin`.

## App para celulares (Bodega Komatsu)

- **Android / Google Play:** proyecto en `android/` (ícono 小松, nombre *Bodega Komatsu*). Se compila solo en
  GitHub (**Actions → App Android → Run workflow**). Pasos para publicar en `android/README.md`.
- **iPhone:** la tienda se instala desde Safari con **Compartir → Agregar a inicio** (ícono 小松, nombre Komatsu).
- La web es una app instalable (PWA): `public/manifest.webmanifest`, `public/sw.js`.
- Variables del servidor para la app: `ANDROID_SHA256` (huellas de firma, separadas por coma) y
  `ANDROID_PACKAGE` (por defecto `com.bodegakomatsu.app`), publicadas en `/.well-known/assetlinks.json`.

## Demo sin servidor

`npm run build:demo` genera en `dist/demo/` una versión que funciona sola en el navegador
(sin servidor ni base de datos): la API se reemplaza por `demo/mock-api.js` y los datos
quedan guardados sólo en ese navegador. Trae una barra para ver la tienda como socio
(`socio@komatsu.demo` / `socio1234`), como administrador o como visitante, y un botón para reiniciarla.

## Estructura

```
sake/
├── server.js               arranque + renovación horaria de membresías
├── src/
│   ├── app.js              Express: seguridad, rutas, SPA
│   ├── db.js               esquema SQLite + catálogo y contenidos iniciales
│   ├── config.js           precios de membresía, envío, topes
│   ├── security.js         scrypt, tokens, rate-limit, validaciones
│   ├── auth.js             sesiones persistentes por cookie httpOnly + guards
│   ├── membership.js       alta, baja al fin del período, renovación
│   ├── pricing.js          cotización: precio público vs. socio, preventa, exclusivos, envío
│   ├── payments.js         Mercado Pago, transferencia y pago de prueba
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
| `#/shop` | Shop Público con filtros (700 ml, Tokkuri 330 ml, Pack dúo) |
| `#/producto/:slug` | Ficha: notas de cata, maridaje, sin TACC, precio público y de socio |
| `#/club` | Beneficios y alta de socio ($20.000/mes) |
| `#/club/shop` | Member Shop (sólo socios): precios de socio, preventas, Reserva Shokunin |
| `#/club/socios` | Área de socios: tarjeta de socio, anuncios, premios, reservas a degustaciones |
| `#/carrito`, `#/checkout` | Carrito (en el navegador; el servidor recalcula siempre los precios), envío o retiro |
| `#/cuenta` | Pedidos, membresía (baja/reactivación, historial de pagos), perfil, contraseña |
| `#/admin` | KPIs, estados de pedidos, precios/stock/preventas, socios, anuncios y eventos |

## Qué se edita desde el panel (`#/admin`)

| Pestaña | Qué se puede cambiar |
|---|---|
| Pedidos | Estado de cada pedido (cancelar devuelve el stock) |
| Productos | Precios, precio socio, stock, cosecha, preventa, exclusivo, visible, **foto**; ficha completa (nombre, japonés, estilo, formato, volumen, graduación, textos, notas de cata, maridaje, ingredientes) y **productos nuevos** |
| Degustaciones | Crear, cambiar **fecha, hora, cupo, lugar** y textos, ocultar o eliminar; ver quién reservó |
| Anuncios y premios | Crear, editar, eliminar; elegir si es público o sólo para socios |
| Marcas y alianzas | Proveedores, restaurantes, puntos de venta: crear, editar, ocultar, eliminar (se ven en La Bodega) |
| Socios | Listado de socios y vencimientos |
| Ajustes | Cuota mensual del Club, costo de envío, envío gratis desde, tope por socio en exclusivos |

Siguen fijos en el código los textos institucionales de La Bodega (historia, filosofía, materias primas)
y la lista de beneficios del Club.

## Fotos de productos

En **Administración → Productos y stock**, cada producto tiene **Subir foto**. La imagen se achica
en el navegador (lado mayor 1400 px) y reemplaza a la ilustración en el Shop, el Member Shop,
la ficha y el carrito. **Quitar foto** vuelve a la ilustración. Ideal: foto vertical (4:5),
botella centrada sobre fondo oscuro. Las fotos se guardan en `data/uploads/` (`UPLOADS_DIR`).

## Cobros

| Medio | Qué cubre | Cómo se activa |
|---|---|---|
| **Mercado Pago** (Checkout Pro) | Tarjetas de crédito y débito, dinero en cuenta, cuotas | Variable `MP_ACCESS_TOKEN` en el servidor con la credencial de producción |
| **Transferencia bancaria** | Alias / CBU / CVU, con descuento opcional | Panel → Ajustes → Medios de pago: cargar alias o CBU |
| Pago de prueba | Aprueba al instante | Sólo en desarrollo; nunca aparece con `NODE_ENV=production` ni con Mercado Pago activo |

**Mercado Pago, paso a paso**
1. En [Mercado Pago Developers](https://www.mercadopago.com.ar/developers) → *Tus integraciones* → crear una aplicación (Checkout Pro).
2. Copiar el **Access Token de producción** y cargarlo en Render como variable de entorno `MP_ACCESS_TOKEN`.
3. (Opcional) `PUBLIC_URL=https://tu-dominio` si la dirección pública difiere de la que ve el servidor.
4. Las notificaciones llegan solas a `/api/payments/mercadopago/webhook` (se envía en cada pago); el servidor
   vuelve a consultar cada pago a Mercado Pago antes de acreditarlo, así que no confía en lo que recibe.

**Cómo funciona**
- El pedido reserva el stock al confirmarse y queda *pendiente de pago*. Mercado Pago lo acredita solo; la
  transferencia la confirma el administrador (Panel → Pedidos → *Confirmar pago*).
- Si el pago no llega en el plazo (48 h por defecto para transferencia, 2 h para Mercado Pago), el pedido se
  cancela y el stock se libera automáticamente.
- El Club se paga mes a mes con los mismos medios. Desde 7 días antes del vencimiento, el socio paga el mes
  siguiente en *Mi cuenta → Membresía*; las transferencias del Club se confirman en Panel → Socios.

## Seguimiento de pedidos en el mapa

1. **Panel → Pedidos:** en un pedido pagado con envío, escribir el nombre del repartidor, elegir moto, auto o bici
   y tocar *Asignar y crear link*. Copiar el link o mandarlo por WhatsApp al repartidor.
2. **Repartidor:** abre el link en su celular (no necesita cuenta). Ve la dirección, las notas, el botón
   *Cómo llegar* (abre Google Maps) y *Llamar*. Toca *Salir a entregar*: el pedido pasa a **Enviado** y el GPS
   del celular se comparte cada pocos segundos. Al terminar toca *Marcar como entregado*.
3. **Cliente:** en *Mi cuenta → Pedidos* aparece *Seguir en el mapa*: ve los pasos del pedido, el mapa de Google
   con la ubicación del repartidor (se actualiza sola) y cuándo se actualizó por última vez.

- **Mapa:** sin configurar nada se usa el mapa de Google embebido. Con una clave de Google Maps (Panel → Ajustes,
  o la variable `GOOGLE_MAPS_API_KEY`) el cliente ve el mapa oscuro de la marca con el repartidor deslizándose
  en vivo, la dirección hacia donde va y el destino marcado. En Google Cloud hay que habilitar *Maps JavaScript
  API* y *Geocoding API* y restringir la clave al dominio de la tienda.
- **Privacidad:** sólo se guarda la última posición (no el recorrido), el cliente ve sólo el nombre de pila del
  repartidor y la ubicación se borra al entregar. Reasignar el repartidor genera un link nuevo y anula el anterior.
- **Límite del navegador:** el celular manda la ubicación mientras la página del repartidor está abierta (la
  pantalla se mantiene encendida sola). Si apaga la pantalla o pasa a otra app, puede pausarse hasta que vuelva.

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
| `UPLOADS_DIR` | `./data/uploads` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@komatsu.local` / `komatsu-admin` |
| `MEMBERSHIP_PRICE` | `20000` |
| `SHIPPING_FLAT` / `FREE_SHIPPING_FROM` | `5000` / `60000` |
| `NODE_ENV=production` | activa cookie `Secure` y desactiva el pago de prueba |
| `MP_ACCESS_TOKEN` | credencial de Mercado Pago (activa el cobro con tarjetas) |
| `PUBLIC_URL` | dirección pública, para los links de retorno de Mercado Pago y del repartidor |
| `GOOGLE_MAPS_API_KEY` | opcional: mapa en vivo del seguimiento (también se carga desde el panel) |

## Pendiente para producción

1. **Pagos:** cargar `MP_ACCESS_TOKEN` y los datos bancarios (ver *Cobros*). Opcional: débito automático del Club con suscripciones de Mercado Pago.
2. **Emails** (confirmación de pedido, bienvenida al Club, recupero de contraseña).
3. **Fotos reales** de cada producto: se suben desde el panel admin (sin foto se muestra la ilustración).
4. **Recorrido 360° real:** cambiar la foto por una panorámica equirectangular (por ejemplo con Pannellum).
5. Precios y textos son de ejemplo: editables desde el panel admin o en `src/db.js`.
6. Hosting con disco persistente para el archivo SQLite (o migrar a Postgres).
