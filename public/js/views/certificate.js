// Certificado digital de botella numerada: verificación pública y registro a nombre del dueño.
import { api } from '../api.js';
import { esc, eyebrow, dateFmt, toast, hanko, productArt } from '../ui.js';
import { state } from '../store.js';
import { go, currentPath } from '../app.js';

const pad = (n, size) => String(n).padStart(String(size).length, '0');

export function certificateCard(c, { compact = false } = {}) {
  return `<article class="cert${compact ? ' compact' : ''}">
    <div class="cert-art">${productArt({ ...c.product, vintage: c.vintage })}</div>
    <div class="cert-body">
      <div class="cert-top"><span class="cert-brand">小松 <small>KOMATSU</small></span>${hanko()}</div>
      <p class="cert-eyebrow">Certificado de autenticidad · 真正証明書</p>
      <p class="cert-num">Nº ${pad(c.number, c.size)} <span>/ ${c.size}</span></p>
      <h2 class="cert-name">${esc(c.product.name)}</h2>
      <p class="jp gold-text">${esc(c.product.nameJp)}</p>
      <dl class="spec cert-spec">
        <dt>Cosecha</dt><dd>${c.vintage}</dd>
        ${c.edition ? `<dt>Edición</dt><dd>${esc(c.edition)}</dd>` : ''}
        <dt>Código</dt><dd class="mono">${esc(c.code)}</dd>
        <dt>Propietario</dt><dd>${c.claimed ? `${esc(c.owner)}${c.mine ? ' <span class="badge gold">Vos</span>' : ''}<br><small class="muted">desde el ${dateFmt(c.claimedAt)}</small>` : '<span class="muted">Sin registrar</span>'}</dd>
      </dl>
    </div>
  </article>`;
}

export default async function certificateView({ params }) {
  const code = params[0];
  if (!code) {
    return {
      title: 'Verificar botella',
      html: `<section class="section"><div class="container auth-wrap">
        ${eyebrow('Botellas numeradas', '真正証明書')}
        <h1 style="margin-bottom:16px">Verificá tu botella</h1>
        <p class="muted">Cada botella Komatsu es numerada y trae un código único en la etiqueta (o en su QR). Ingresalo para ver su certificado y registrarla a tu nombre.</p>
        <form class="form panel" id="lookup" novalidate>
          <div class="field"><label for="code">Código de la botella</label><input id="code" name="code" placeholder="ABCDE-12345" autocomplete="off" autocapitalize="characters" required></div>
          <p class="error-msg" hidden></p>
          <button class="btn gold block" type="submit">Ver certificado</button>
        </form>
      </div></section>`,
      mount(root) {
        root.querySelector('#lookup').addEventListener('submit', e => {
          e.preventDefault();
          const v = root.querySelector('#code').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
          const err = root.querySelector('.error-msg');
          if (v.length !== 10) { err.textContent = 'El código tiene 10 letras y números, por ejemplo ABCDE-12345.'; err.hidden = false; return; }
          go(`certificado/${v.slice(0, 5)}-${v.slice(5)}`);
        });
      },
    };
  }

  let cert;
  try { ({ certificate: cert } = await api('/certificates/' + encodeURIComponent(code))); }
  catch (ex) {
    return { title: 'Código no encontrado', html: `<div class="container empty"><span class="kanji">偽</span><h2>No encontramos ese código</h2><p class="muted">${esc(ex.message)}</p><a class="btn" href="#/certificado">Probar otro código</a></div>` };
  }
  const canClaim = !cert.claimed;
  return {
    title: `Nº ${cert.number} · ${cert.product.name}`,
    html: `<section class="section"><div class="container" style="max-width:980px">
      ${eyebrow('Botella auténtica', '本物')}
      ${certificateCard(cert)}
      <div class="row" style="margin-top:28px">
        ${canClaim ? (state.user ? '<button class="btn gold" id="claim">Registrar a mi nombre</button>' : `<a class="btn gold" href="#/login?next=${encodeURIComponent(currentPath())}">Ingresá para registrarla a tu nombre</a>`) : ''}
        ${cert.mine ? '<a class="btn" href="#/cuenta?tab=botellas">Ver mis botellas</a>' : ''}
        <a class="btn ghost" href="#/producto/${esc(cert.product.slug)}">Ver el sake</a>
      </div>
      ${canClaim ? '<p class="muted" style="margin-top:16px;font-size:14px">Al registrarla, la botella queda asociada a tu cuenta: sirve como prueba de autenticidad si la regalás, la guardás o la vendés como pieza de colección.</p>' : ''}
    </div></section>`,
    mount(root) {
      root.querySelector('#claim')?.addEventListener('click', async ev => {
        ev.currentTarget.disabled = true;
        try {
          await api(`/certificates/${encodeURIComponent(cert.code)}/claim`, { method: 'POST' });
          toast('Botella registrada a tu nombre · 登録完了');
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        } catch (ex) { toast(ex.message, 'error'); ev.currentTarget.disabled = false; }
      });
    },
  };
}
