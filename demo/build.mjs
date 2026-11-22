// Genera una versión de demostración de la tienda que funciona sin servidor:
// la API se reemplaza por demo/mock-api.js (datos en el navegador) y todo queda en un único HTML.
// Uso: node demo/build.mjs [carpeta-salida]   (por defecto: dist/demo)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'dist', 'demo'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'komatsu-demo-'));

fs.cpSync(path.join(root, 'public', 'js'), tmp, { recursive: true });
fs.copyFileSync(path.join(root, 'demo', 'mock-api.js'), path.join(tmp, 'api-mock-entry.js'));
fs.writeFileSync(path.join(tmp, 'api.js'), "export { api, ApiError } from './api-mock-entry.js';\n");
fs.copyFileSync(path.join(root, 'demo', 'demo-bar.js'), path.join(tmp, 'demo-bar.js'));

// Router en memoria: la demo no depende de location.hash (el visor puede no reflejar rutas tipo #/ruta).
const patch = (file, pairs) => {
  let src = fs.readFileSync(file, 'utf8');
  for (const [a, b] of pairs) {
    if (!src.includes(a)) throw new Error(`No se encontró en ${path.basename(file)}: ${a}`);
    src = src.replace(a, b);
  }
  fs.writeFileSync(file, src);
};
patch(path.join(tmp, 'app.js'), [
  ["export function currentPath() { return location.hash.replace(/^#\\/?/, ''); }",
   "let route = '';\nexport function currentPath() { return route; }"],
  ["export function go(path) { location.hash = '#/' + path.replace(/^\\/+/, ''); }",
   "export function go(path) { route = path.replace(/^\\/+/, ''); render(); }\n" +
   "document.addEventListener('click', e => { const a = e.target.closest('a[href^=\"#/\"]'); if (!a || e.defaultPrevented) return; e.preventDefault(); go(a.getAttribute('href').slice(2)); });"],
  ["const h = location.hash || '#/';", "const h = '#/' + route;"],
  ["import legalView from './views/legal.js';", "import legalView from './views/legal.js';\nimport './demo-bar.js';"],
  ["if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});", ''],
]);

const result = await build({ entryPoints: [path.join(tmp, 'app.js')], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020' });
const js = result.outputFiles[0].text.replace(/\/img\//g, 'img/').replace(/<\/script/gi, '<\\/script');

const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const bodyInner = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace(/"\/img\//g, '"img/');
const css = fs.readFileSync(path.join(root, 'public', 'css', 'styles.css'), 'utf8');
const demoCss = `
.demo-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 10px;padding:8px max(16px,env(safe-area-inset-left,0px));background:var(--red);color:#fff;font-size:12px;letter-spacing:.04em}
.demo-bar button{background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.45);color:#fff;padding:4px 10px;border-radius:999px;cursor:pointer;font-size:12px}
.demo-bar button:hover{background:rgba(0,0,0,.45)}`;

const page = `<title>Sake Komatsu</title>
<meta name="description" content="Demo de la tienda online y Club Member de Sake Komatsu.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600&family=Shippori+Mincho:wght@500;700&display=swap">
<style>
${css}
${demoCss}
</style>
${bodyInner}
<script>${js}</script>
`;

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'img'), { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), page);
for (const f of fs.readdirSync(path.join(root, 'public', 'img'))) fs.copyFileSync(path.join(root, 'public', 'img', f), path.join(out, 'img', f));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Demo generada en ${out}`);
