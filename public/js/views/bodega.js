import { eyebrow, esc } from '../ui.js';
import { api } from '../api.js';

const HOTSPOTS = [
  { x: 20, y: 52, t: 'Tanques cilindrocónicos', d: 'Acero inoxidable con camisa de frío y chiller: la fermentación se mantiene a baja temperatura durante semanas.' },
  { x: 50, y: 40, t: 'Sugidama y altar', d: 'La esfera de cedro anuncia el sake nuevo. Junto a ella, los barriles de la casa.' },
  { x: 60, y: 62, t: 'Control de mosto', d: 'Medición diaria de temperatura, densidad y acidez de cada tanque.' },
  { x: 80, y: 50, t: 'Sala de koji y vapor', d: 'El arroz Koshihikari se cuece al vapor antes de inocular el koji.' },
];

function tour() {
  // La foto se repite original + espejada para que el giro no tenga costura.
  const spots = mirror => HOTSPOTS.map(h => `<div class="hotspot" style="left:${mirror ? 100 - h.x : h.x}%;top:${h.y}%"><button type="button" aria-label="${h.t}">+</button><div class="tip"><b>${h.t}</b>${h.d}</div></div>`).join('');
  const tile = (mirror, alt) => `<div class="pano${mirror ? ' mirror' : ''}"><img src="/img/bodega-planta.jpg" alt="${alt}" draggable="false">${spots(mirror)}</div>`;
  const loop = tile(false, 'Planta de elaboración de Komatsu con tanques de fermentación') + tile(true, '');
  const pano = loop;
  return `<div class="tour" id="tour" tabindex="0" aria-label="Recorrido panorámico por la planta. Arrastrá o usá las flechas para girar.">
    <div class="tour-track">${pano}<div style="display:contents" aria-hidden="true">${pano.replace(/<button /g, '<button tabindex="-1" ').replace(/alt="[^"]*"/g, 'alt=""')}</div></div>
    <div class="tour-hint">⟷ Arrastrá para recorrer · 360°</div></div>`;
}

function mountTour(root) {
  const el = root.querySelector('#tour');
  const track = el.querySelector('.tour-track');
  const img = track.querySelector('img');
  let x = 0, width = 0, dragging = false, lastX = 0, moved = 0, auto = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const measure = () => { const t = track.querySelectorAll('.pano'); width = t[0].getBoundingClientRect().width + t[1].getBoundingClientRect().width; };
  const apply = () => { if (width) { x = ((x % width) + width) % width; track.style.transform = `translateX(${-x}px)`; } };
  img.complete ? measure() : img.addEventListener('load', measure);
  addEventListener('resize', measure);
  el.addEventListener('pointerdown', e => {
    if (e.target.closest('.hotspot')) return;
    dragging = true; auto = false; lastX = e.clientX; moved = 0; el.classList.add('dragging'); el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx); x -= dx; apply(); });
  const end = () => { dragging = false; el.classList.remove('dragging'); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { x -= 60; auto = false; apply(); } if (e.key === 'ArrowRight') { x += 60; auto = false; apply(); } });
  el.addEventListener('click', e => {
    const b = e.target.closest('.hotspot button');
    el.querySelectorAll('.hotspot.open').forEach(h => h !== b?.parentElement && h.classList.remove('open'));
    if (b) { b.parentElement.classList.toggle('open'); auto = false; }
  });
  const tick = () => { if (!el.isConnected) return; if (auto) { x += 0.25; apply(); } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

export default async function bodega({ params }) {
  const section = params[0];
  const { alliances } = await api('/alliances');
  return {
    title: 'La Bodega',
    scrollTo: section || null,
    html: `
    <section class="section" id="quienes"><div class="container grid-2">
      <div>
        ${eyebrow('La Bodega · Quiénes somos', '酒蔵について')}
        <h1>Komatsu 小松<span class="title-jp">小さな松</span></h1>
        <hr class="gold-rule">
        <p class="lead">Somos una bodega boutique de sake Junmai en Argentina. Elaboramos tiradas anuales limitadas, cada una con su etiqueta de cosecha, uniendo el rigor del oficio japonés con materias primas locales seleccionadas.</p>
        <div class="subnav">
          <a class="chip" href="#/bodega/historia">Historia</a><a class="chip" href="#/bodega/filosofia">Filosofía</a>
          <a class="chip" href="#/bodega/materias-primas">Materias primas</a><a class="chip" href="#/bodega/recorrido">Recorrido 360°</a>
          <a class="chip" href="#/bodega/alianzas">Alianzas</a>
        </div>
      </div>
      <img src="/img/logo-komatsu.jpg" alt="Logo de Komatsu" width="900" height="1198" style="max-height:560px;width:auto;margin:auto">
    </div></section>

    <section class="section" id="historia"><div class="container grid-2">
      <div>${eyebrow('Cómo nacimos', '由来')}<h2>Un homenaje a la familia Komatsu.</h2></div>
      <div class="prose">
        <p>El nombre rinde homenaje a la familia japonesa Komatsu —la familia de Néstor Komatsu, tío del fundador— y a la formación japonesa recibida en el Seibu de Morón, donde la disciplina, el respeto por el oficio y la cultura japonesa se volvieron parte de la vida cotidiana.</p>
        <p>En japonés, <strong class="gold-text">小松 (Komatsu)</strong> significa «pequeño pino». En Japón, el pino es símbolo de longevidad, resistencia y constancia: el árbol que se mantiene verde todo el año. Es exactamente lo que queremos para cada botella: paciencia en la elaboración y un carácter que perdure.</p>
      </div>
    </div></section>

    <section class="section" id="filosofia"><div class="container">
      ${eyebrow('Filosofía', '職人の心')}
      <h2>Shokunin: el oficio como camino.</h2>
      <hr class="gold-rule">
      <div class="grid-3">
        <div class="pillar"><span class="kanji">純</span><h3>Junmai · pureza</h3><p>Sólo arroz, koji, levadura y agua. Sin alcohol agregado ni azúcares.</p></div>
        <div class="pillar"><span class="kanji">忍</span><h3>Paciencia</h3><p>Fermentación lenta en frío, con control térmico preciso en cada tanque.</p></div>
        <div class="pillar"><span class="kanji">限</span><h3>Escala boutique</h3><p>Tiradas anuales limitadas y etiqueta por cosecha. A futuro, un espacio gastronómico japonés propio.</p></div>
      </div>
    </div></section>

    <section class="section" id="materias-primas"><div class="container grid-2">
      <div>${eyebrow('Materias primas', '原料')}<h2>Cuatro ingredientes. Ninguno de más.</h2><div class="badges"><span class="badge gold">Sin TACC · グルテンフリー</span></div>
        <p class="muted">El sake Junmai es naturalmente libre de gluten: apto para celíacos, también en sus variantes frutadas.</p></div>
      <dl class="spec">
        <dt>Arroz 米</dt><dd>Koshihikari orgánico de producción local, pulido para un perfil limpio.</dd>
        <dt>Koji 麹</dt><dd>Koji de arroz (Aspergillus oryzae), que transforma el almidón en azúcares fermentables.</dd>
        <dt>Levadura 酵母</dt><dd>Cepas seleccionadas por su perfil aromático frutal y floral.</dd>
        <dt>Agua 水</dt><dd>Agua pura, de baja dureza, base de la suavidad del sake.</dd>
        <dt>Proceso 工程</dt><dd>Fermentación en frío en tanques cilindrocónicos de acero inoxidable con chiller y control térmico.</dd>
      </dl>
    </div></section>

    <section class="section" id="recorrido"><div class="container">
      ${eyebrow('Recorrido 360°', '蔵見学')}
      <h2>Recorré la planta.</h2>
      <p class="muted">Arrastrá la imagen (o usá las flechas del teclado) y tocá los puntos dorados para conocer cada etapa.</p>
      ${tour()}
      <p class="muted" style="font-size:13px;margin-top:10px">¿Querés verla en persona? Los socios del Club tienen visitas guiadas a la bodega.</p>
    </div></section>

    <section class="section" id="alianzas"><div class="container">
      ${eyebrow('Marcas y alianzas', '提携')}
      <h2>Con quiénes trabajamos.</h2>
      <hr class="gold-rule">
      <div class="grid-3">${alliances.map(a => `<div class="ally"><span class="kind">${esc(a.category)}</span><b>${esc(a.name)}</b>${a.description ? `<span class="muted">${esc(a.description)}</span>` : ''}${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">Visitar sitio ↗</a>` : ''}</div>`).join('') || '<p class="muted">Pronto vamos a sumar a nuestros aliados.</p>'}
      </div>
      <p class="muted" style="margin-top:20px">¿Tenés un restaurante o tienda? Escribinos para sumar Komatsu a tu carta.</p>
    </div></section>`,
    mount: mountTour,
  };
}
