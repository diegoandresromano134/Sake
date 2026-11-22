// Seguimiento de pedidos en el mapa (cliente) y pantalla del repartidor (link secreto, sin cuenta).
import { api } from '../api.js';
import { esc, eyebrow, toast, timeFmt } from '../ui.js';
import { state } from '../store.js';
import { needLogin } from '../app.js';
import { STATUS_LABEL } from '../payments-ui.js';

export const VEHICLE_LABEL = { moto: 'moto', auto: 'auto', bici: 'bicicleta' };
const GOLD = '#D4AF37', RED = '#B91C1C', INK = '#0A0A0A';

// ---------- utilidades ----------
const alive = el => document.body.contains(el);
function ago(iso) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 10) return 'recién';
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `hace ${m} min` : `a las ${timeFmt(iso)}`;
}
function meters(a, b) {
  const R = 6371e3, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const mapsSearch = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const mapsDirections = (dest, vehicle) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=${vehicle === 'bici' ? 'bicycling' : 'driving'}`;

// ---------- mapa ----------
// Con clave de Google Maps: mapa oscuro con el repartidor moviéndose en vivo.
// Sin clave (o si la clave falla): el mapa de Google embebido, que se actualiza cuando el repartidor se mueve.
const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#15130f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9B958A' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0A0A0A' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#3a352c' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A2724' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#36312a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#5a4a22' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c1214' }] },
];

let mapsPromise = null;
function loadGoogleMaps(key) {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  return mapsPromise ||= new Promise((resolve, reject) => {
    window.__komatsuMapsReady = () => resolve(window.google.maps);
    window.gm_authFailure = () => { window.__komatsuMapsFailed = true; window.dispatchEvent(new Event('komatsu:maps-failed')); };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__komatsuMapsReady&loading=async&v=weekly&language=es&region=AR`;
    s.async = true;
    s.onerror = () => { mapsPromise = null; reject(new Error('No se pudo cargar Google Maps.')); };
    document.head.append(s);
  });
}

class EmbedMap {
  constructor(box) {
    this.box = box; this.last = null;
    box.innerHTML = '<iframe title="Mapa de Google con la ubicación del pedido" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>';
    this.frame = box.querySelector('iframe');
  }
  show({ position, destination }) {
    const q = position ? `${position.lat.toFixed(6)},${position.lng.toFixed(6)}` : destination;
    if (!q) return;
    // Recargar el mapa embebido sólo si el repartidor se movió lo suficiente (evita parpadeos).
    if (position && this.last?.lat != null && meters(this.last, position) < 35) return;
    if (!position && this.last === q) return;
    this.last = position || q;
    this.frame.src = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=${position ? 16 : 15}&hl=es&output=embed`;
  }
}

class LiveMap {
  constructor(box, maps) {
    this.maps = maps;
    box.innerHTML = '';
    this.map = new maps.Map(box, { center: { lat: -34.6037, lng: -58.3816 }, zoom: 12, styles: DARK_STYLE, disableDefaultUI: true,
      zoomControl: true, gestureHandling: 'greedy', backgroundColor: '#15130f', clickableIcons: false });
    this.fitted = false; this.dest = null; this.destTried = null;
  }
  icon(heading) {
    const m = this.maps;
    return heading != null
      ? { path: m.SymbolPath.FORWARD_CLOSED_ARROW, scale: 6, rotation: heading, fillColor: GOLD, fillOpacity: 1, strokeColor: INK, strokeWeight: 2 }
      : { path: m.SymbolPath.CIRCLE, scale: 9, fillColor: GOLD, fillOpacity: 1, strokeColor: INK, strokeWeight: 3 };
  }
  geocode(address) {
    if (!address || this.destTried === address) return;
    this.destTried = address;
    new this.maps.Geocoder().geocode({ address, region: 'AR' }).then(({ results }) => {
      const loc = results[0]?.geometry?.location; if (!loc) return;
      this.dest = new this.maps.Marker({ map: this.map, position: loc, title: 'Destino',
        icon: { path: this.maps.SymbolPath.CIRCLE, scale: 7, fillColor: RED, fillOpacity: 1, strokeColor: '#EDE8DD', strokeWeight: 2 } });
      this.fit();
    }).catch(() => { /* sin Geocoding API: se muestra sólo al repartidor */ });
  }
  fit() {
    const pts = [this.marker?.getPosition(), this.dest?.getPosition()].filter(Boolean);
    if (!pts.length) return;
    if (pts.length === 1) { this.map.setCenter(pts[0]); this.map.setZoom(15); }
    else { const b = new this.maps.LatLngBounds(); pts.forEach(p => b.extend(p)); this.map.fitBounds(b, 60); }
    this.fitted = true;
  }
  show({ position, destination }) {
    this.geocode(destination);
    if (!position) { if (!this.marker) this.fit(); return; }
    const to = new this.maps.LatLng(position.lat, position.lng);
    if (!this.marker) {
      this.marker = new this.maps.Marker({ map: this.map, position: to, icon: this.icon(position.heading), title: 'Repartidor', zIndex: 10 });
      this.circle = new this.maps.Circle({ map: this.map, center: to, radius: position.accuracy || 0, strokeOpacity: 0, fillColor: GOLD, fillOpacity: 0.12, clickable: false });
      this.fit();
      return;
    }
    // Desliza el marcador hasta la nueva posición.
    const from = this.marker.getPosition(), t0 = performance.now(), dur = 1200;
    this.marker.setIcon(this.icon(position.heading));
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = k * (2 - k);
      this.marker.setPosition({ lat: from.lat() + (to.lat() - from.lat()) * e, lng: from.lng() + (to.lng() - from.lng()) * e });
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    this.circle.setCenter(to); this.circle.setRadius(position.accuracy || 0);
    const bounds = this.map.getBounds();
    if (bounds && !bounds.contains(to)) this.map.panTo(to);
  }
}

async function createMap(box, key) {
  if (key && !window.__komatsuMapsFailed) {
    try { return new LiveMap(box, await loadGoogleMaps(key)); } catch { /* sigue con el mapa embebido */ }
  }
  return new EmbedMap(box);
}

// ---------- cliente ----------
const STEPS = [['pagado', 'Pagado', '支払済'], ['preparando', 'Preparando', '準備中'], ['enviado', 'En camino', '配達中'], ['entregado', 'Entregado', '配達完了']];
const stepIndex = s => ({ pendiente_pago: -1, pagado: 0, preparando: 1, enviado: 2, entregado: 3 }[s] ?? -1);

function stepsHtml(status) {
  const i = stepIndex(status);
  return `<ol class="track-steps">${STEPS.map(([, label, jp], n) => `<li class="${n < i ? 'done' : n === i ? 'now' : ''}"${n === i ? ' aria-current="step"' : ''}><span class="dot"></span><b>${label}</b><span class="jp">${jp}</span></li>`).join('')}</ol>`;
}

function infoHtml(t) {
  const c = t.courier, p = t.position;
  if (t.status === 'cancelado') return '<p class="muted">Este pedido se canceló.</p>';
  if (t.status === 'pendiente_pago') return '<p class="muted">Cuando se confirme el pago, vas a poder seguir tu pedido desde acá.</p>';
  if (t.status === 'entregado') return '<p class="track-line"><span class="track-ok">✓</span> Tu pedido fue entregado. ¡Que lo disfrutes! <span class="jp gold-text">乾杯</span></p>';
  if (t.status !== 'enviado' || !c?.startedAt) return `<p class="track-line">Estamos preparando tu pedido. Cuando ${c ? esc(c.name) : 'el repartidor'} salga, lo vas a ver moverse en el mapa.</p>`;
  if (!p) return `<p class="track-line"><span class="live-dot wait"></span>${esc(c.name)} ya salió en ${VEHICLE_LABEL[c.vehicle] || 'moto'}. Esperando su ubicación…</p>`;
  return `<p class="track-line"><span class="live-dot${p.stale ? ' wait' : ''}"></span>${esc(c.name)} te lleva tu pedido en ${VEHICLE_LABEL[c.vehicle] || 'moto'}</p>
    <p class="muted track-sub">Ubicación actualizada <span data-ago="${esc(p.at)}">${ago(p.at)}</span>${p.stale ? ' · puede estar sin señal o con el celular bloqueado' : ''}</p>`;
}

export async function trackingView({ params }) {
  if (!state.user) return needLogin();
  const code = params[0];
  let t = await api(`/orders/${encodeURIComponent(code)}/tracking`);
  if (t.delivery === 'retiro') return {
    title: 'Seguimiento', html: `<section class="section"><div class="container empty"><span class="kanji">蔵</span><h2>Retiro en la bodega</h2>
      <p class="muted">Este pedido es para retirar en Bodega Komatsu. Te avisamos cuando esté listo.</p><a class="btn" href="#/pedido/${esc(code)}">Ver el pedido</a></div></section>`,
  };
  return {
    title: 'Seguimiento del pedido',
    html: `<section class="section"><div class="container track">
      ${eyebrow('Seguimiento', '配送状況')}
      <h1>Tu pedido <span class="track-code">${esc(t.code)}</span></h1>
      ${stepsHtml(t.status)}
      <div class="track-map" id="track-map" role="region" aria-label="Mapa del recorrido"></div>
      <div class="track-info" id="track-info" aria-live="polite">${infoHtml(t)}</div>
      <div class="row track-actions">
        <a class="btn small" id="open-maps" target="_blank" rel="noopener" href="${esc(mapsSearch(t.position ? `${t.position.lat},${t.position.lng}` : t.destination || ''))}">Abrir en Google Maps</a>
        <a class="btn small ghost" href="#/pedido/${esc(t.code)}">Ver el pedido</a>
      </div>
      <p class="muted track-dest">Destino: ${esc(t.destination || '')}</p>
    </div></section>`,
    async mount(root) {
      const box = root.querySelector('#track-map'), info = root.querySelector('#track-info'), open = root.querySelector('#open-maps');
      let map = await createMap(box, t.mapsKey);
      map.show(t);
      const onFail = async () => { map = new EmbedMap(box); map.show(t); };
      window.addEventListener('komatsu:maps-failed', onFail, { once: true });
      const tick = setInterval(() => {
        if (!alive(box)) { clearInterval(tick); clearInterval(poll); window.removeEventListener('komatsu:maps-failed', onFail); return; }
        info.querySelectorAll('[data-ago]').forEach(el => { el.textContent = ago(el.dataset.ago); });
      }, 1000);
      const poll = setInterval(async () => {
        if (!alive(box) || document.hidden) return;
        try {
          const prev = t.status;
          t = await api(`/orders/${encodeURIComponent(code)}/tracking`);
          if (t.status !== prev) root.querySelector('.track-steps').outerHTML = stepsHtml(t.status);
          info.innerHTML = infoHtml(t);
          map.show(t);
          open.href = mapsSearch(t.position ? `${t.position.lat},${t.position.lng}` : t.destination || '');
          if (t.status === 'entregado' || t.status === 'cancelado') clearInterval(poll);
        } catch { /* sin conexión: reintenta en el próximo ciclo */ }
      }, 8000);
    },
  };
}

// ---------- repartidor ----------
const shareKey = token => 'komatsu.reparto.' + token.slice(0, 16);
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sin storage */ } },
};

export async function courierView({ params }) {
  const token = params[0];
  let data;
  try { data = await api('/delivery/' + encodeURIComponent(token)); }
  catch (e) {
    return { title: 'Reparto', html: `<section class="section"><div class="container empty"><span class="kanji">無</span><h2>Link de reparto no válido</h2><p class="muted">${esc(e.message)}</p></div></section>` };
  }
  const o = data.order, to = o.shipTo, done = !!data.finishedAt || o.status === 'entregado';
  return {
    title: 'Reparto ' + o.code,
    html: `<section class="section"><div class="container courier">
      ${eyebrow('Reparto', '配達')}
      <h1>${esc(o.code)}</h1>
      <p class="muted" style="margin-top:6px">Repartidor: ${esc(data.courier.name)} · ${esc(VEHICLE_LABEL[data.courier.vehicle] || '')}</p>
      <div class="panel courier-card">
        <p class="courier-name">${esc(to.name)}</p>
        <p class="courier-addr">${esc([to.address, to.city].filter(Boolean).join(', '))}<br><span class="muted">${esc([to.province, to.zip ? 'CP ' + to.zip : ''].filter(Boolean).join(' · '))}</span></p>
        ${o.notes ? `<p class="courier-notes">“${esc(o.notes)}”</p>` : ''}
        <ul class="courier-items">${o.items.map(i => `<li>${i.qty} × ${esc(i.name)}</li>`).join('')}</ul>
        <div class="row">
          <a class="btn small" href="${esc(mapsDirections(o.destination || '', data.courier.vehicle))}" target="_blank" rel="noopener">Cómo llegar</a>
          <a class="btn small ghost" href="tel:${esc(String(to.phone).replace(/[^\d+]/g, ''))}">Llamar a ${esc(to.name.split(' ')[0])}</a>
        </div>
      </div>
      ${done ? `<div class="panel gold courier-done"><span class="track-ok">✓</span> Pedido entregado. ¡Gracias!</div>` : `
      <div class="panel courier-share" id="share-panel">
        <div class="share-state" id="share-state" aria-live="polite"><span class="live-dot off"></span>Ubicación sin compartir</div>
        <button class="btn gold block" id="share-btn" type="button">Salir a entregar y compartir mi ubicación</button>
        <button class="btn block" id="pause-btn" type="button" hidden>Pausar ubicación</button>
        <p class="muted courier-tip">Dejá esta página abierta mientras manejás: el cliente te ve en el mapa en tiempo real. Si apagás la pantalla o cambiás a otra app, el celular puede dejar de mandar la ubicación hasta que vuelvas.</p>
      </div>
      <button class="btn red block courier-delivered" id="delivered-btn" type="button">Marcar como entregado</button>`}
    </div></section>`,
    mount(root) {
      if (done) { store.set(shareKey(token), null); return; }
      const btn = root.querySelector('#share-btn'), pause = root.querySelector('#pause-btn'), stateEl = root.querySelector('#share-state');
      let watchId = null, wake = null, lastSent = null, lastSentAt = 0, pending = null, sending = false, lastFix = null;
      const setState = (html) => { stateEl.innerHTML = html; };

      const keepAwake = async () => {
        try { if ('wakeLock' in navigator && !wake && !document.hidden) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch { /* opcional */ }
      };
      const send = async pos => {
        pending = pos;
        if (sending) return;
        sending = true;
        while (pending) {
          const p = pending; pending = null;
          try {
            await api(`/delivery/${encodeURIComponent(token)}/location`, { method: 'POST', body: p });
            lastSent = p; lastSentAt = Date.now();
          } catch (e) {
            if (e.status === 409 || e.status === 404) { stop(); setState(`<span class="live-dot off"></span>${esc(e.message)}`); break; }
          }
        }
        sending = false;
      };
      const onFix = ({ coords: c }) => {
        lastFix = Date.now();
        const p = { lat: c.latitude, lng: c.longitude, accuracy: Math.round(c.accuracy), heading: Number.isFinite(c.heading) ? Math.round(c.heading) : null, speed: Number.isFinite(c.speed) ? +c.speed.toFixed(1) : null };
        // Manda cada ~6 s, o antes si se movió más de 25 m; nunca más de una vez cada 2 s.
        const since = Date.now() - lastSentAt;
        if (!lastSent || since > 6000 || (since > 2000 && meters(lastSent, p) > 25)) send(p);
        setState(`<span class="live-dot"></span>Compartiendo ubicación · precisión ${p.accuracy} m`);
      };
      const onErr = e => {
        if (e.code === 1) { stop(); setState('<span class="live-dot off"></span>El celular no dio permiso de ubicación. Activá la ubicación para este sitio en el navegador y volvé a tocar el botón.'); }
        else setState('<span class="live-dot wait"></span>Buscando señal de GPS…');
      };
      function start() {
        if (!('geolocation' in navigator)) { setState('<span class="live-dot off"></span>Este navegador no permite compartir la ubicación.'); return; }
        watchId = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: true, maximumAge: 4000, timeout: 20000 });
        store.set(shareKey(token), 'on');
        keepAwake();
        btn.hidden = true; pause.hidden = false;
        setState('<span class="live-dot wait"></span>Buscando señal de GPS…');
      }
      function stop() {
        if (watchId != null) navigator.geolocation.clearWatch(watchId);
        watchId = null; wake?.release?.(); wake = null;
        btn.hidden = false; pause.hidden = true; btn.textContent = 'Reanudar y compartir mi ubicación';
      }
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try { await api(`/delivery/${encodeURIComponent(token)}/start`, { method: 'POST' }); start(); }
        catch (e) { toast(e.message, 'error'); }
        finally { btn.disabled = false; }
      });
      pause.addEventListener('click', () => { stop(); store.set(shareKey(token), null); setState('<span class="live-dot off"></span>Ubicación en pausa'); });
      root.querySelector('#delivered-btn').addEventListener('click', async () => {
        if (!confirm('¿Confirmás que entregaste el pedido?')) return;
        try {
          await api(`/delivery/${encodeURIComponent(token)}/delivered`, { method: 'POST' });
          stop(); store.set(shareKey(token), null);
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        } catch (e) { toast(e.message, 'error'); }
      });
      const onVisible = () => { if (!document.hidden && watchId != null) { keepAwake(); if (lastFix && Date.now() - lastFix > 30000) setState('<span class="live-dot wait"></span>Retomando la ubicación…'); } };
      document.addEventListener('visibilitychange', onVisible);
      // Si se recarga la página en medio del recorrido, sigue compartiendo.
      if (data.startedAt && store.get(shareKey(token)) === 'on') start();
      const guard = setInterval(() => { if (!alive(stateEl)) { stop(); clearInterval(guard); document.removeEventListener('visibilitychange', onVisible); } }, 2000);
    },
  };
}
