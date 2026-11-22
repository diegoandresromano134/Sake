import { api } from '../api.js';
import { esc, eyebrow, productArt, priceBlock, flags, formatLabel, dateFmt } from '../ui.js';
import { isMember, state } from '../store.js';

export function productCard(p, member) {
  return `<a class="card" href="#/producto/${esc(p.slug)}">
    <div class="card-art">${productArt(p)}<div class="card-flags">${flags(p)}</div></div>
    <div class="card-body">
      <span class="jp">${esc(p.nameJp)}</span>
      <h3>${esc(p.name)}</h3>
      <span class="card-meta">${formatLabel(p)} · ${p.volumeMl} ml · Cosecha ${p.vintage}</span>
      ${priceBlock(p, member)}
    </div></a>`;
}

export default async function home() {
  const [{ products }, { news }] = await Promise.all([api('/products'), api('/news')]);
  const member = isMember();
  return {
    html: `
    <section class="hero">
      <div class="container hero-grid">
        <div class="hero-copy">
          ${eyebrow('Sake Junmai Argentino', '純米酒')}
          <h1>El arte japonés del sake,<br>nacido en Argentina.<span class="title-jp">小さな松 · 長寿と忍耐</span></h1>
          <hr class="gold-rule">
          <p class="lead">Komatsu significa <em>pequeño pino</em>: longevidad, resistencia y constancia. Elaboramos sake Junmai con arroz orgánico Koshihikari, koji y agua pura, fermentado lentamente en frío.</p>
          <div class="badges"><span class="badge gold">Junmai 純米</span><span class="badge">Sin TACC</span><span class="badge">Tiradas limitadas</span></div>
          <div class="row">
            <a class="btn gold" href="#/shop">Comprar · 購入</a>
            <a class="btn" href="#/club">Club Member · 会員</a>
          </div>
        </div>
        <div class="hero-art"><img src="/img/botella-720.jpg" alt="Botella de Sake Komatsu Junmai, negro mate con etiqueta dorada" width="1312" height="865"></div>
      </div>
    </section>
    ${state.user ? '' : `<section class="account-band"><div class="container account-band-inner">
      <div><p class="eyebrow" style="margin:0 0 6px"><span>Tu cuenta</span><span class="jp">会員登録</span></p>
        <p style="margin:0">Creá tu cuenta gratis para comprar, seguir tus pedidos y registrar tus botellas numeradas.</p></div>
      <div class="row"><a class="btn gold" href="#/registro">Crear cuenta</a><a class="btn" href="#/login">Ingresar</a></div>
    </div></section>`}

    <section class="section"><div class="container">
      <div class="grid-3">
        <div class="pillar"><span class="kanji">職人</span><h3>Shokunin</h3><p>Rigor artesanal japonés: cada lote se elabora con paciencia y oficio.</p></div>
        <div class="pillar"><span class="kanji">米</span><h3>Koshihikari orgánico</h3><p>Arroz, koji, levaduras seleccionadas y agua pura. Nada más.</p></div>
        <div class="pillar"><span class="kanji">冷</span><h3>Fermentación en frío</h3><p>Tanques cilindrocónicos de acero inoxidable con chiller y control térmico.</p></div>
      </div>
    </div></section>

    <section class="section"><div class="container">
      <div class="shop-head">
        <div>${eyebrow('Cosecha actual', '今年の酒')}<h2>Nuestros sakes</h2></div>
        <a class="btn small" href="#/shop">Ver todo el catálogo</a>
      </div>
      <div class="products">${products.slice(0, 4).map(p => productCard(p, member)).join('')}</div>
    </div></section>

    <section class="section"><div class="container grid-2">
      <div>
        ${eyebrow('Club Member', '会員クラブ')}
        <h2>Prioridad en cada cosecha.</h2>
        <hr class="gold-rule">
        <p class="lead">Precios de socio, preventa de tiradas limitadas, la Reserva Shokunin numerada y degustaciones en la bodega.</p>
        <a class="btn gold" href="#/club">Conocer el Club</a>
      </div>
      <div>
        ${news.map(n => `<article class="feed-item"><span class="kind ${esc(n.kind)}">${esc(n.kind)} ${n.titleJp ? `· <span class="jp">${esc(n.titleJp)}</span>` : ''}</span><h3>${esc(n.title)}</h3><p class="muted">${esc(n.body)}</p><small class="muted">${dateFmt(n.createdAt)}</small></article>`).join('')}
      </div>
    </div></section>

    <section class="section"><div class="container grid-2">
      <img src="/img/logo-komatsu.jpg" alt="Logo Komatsu: bonsái dorado y caligrafía 小松" width="900" height="1198" loading="lazy" style="max-height:640px;width:auto;margin:auto">
      <div>
        ${eyebrow('La Bodega', '酒蔵')}
        <h2>Una historia de familia.</h2>
        <hr class="gold-rule">
        <p class="lead">Un homenaje a la familia Komatsu y a la formación japonesa recibida en el Seibu de Morón. Tradición, oficio y materia prima local.</p>
        <a class="btn" href="#/bodega">Conocer la bodega</a>
      </div>
    </div></section>`,
  };
}
