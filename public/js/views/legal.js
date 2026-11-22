import { eyebrow, money } from '../ui.js';
export default async function legal() {
  return { title: 'Envíos y condiciones', html: `<section class="section"><div class="container prose">
    ${eyebrow('Envíos y condiciones', '規約')}
    <h1>Envíos, pagos y Club</h1><hr class="gold-rule">
    <h3>Envíos</h3><p>Enviamos a todo el país. Costo fijo de ${money(5000)}, sin cargo en compras desde ${money(60000)} y siempre sin cargo para socios del Club. También podés retirar sin cargo en la bodega.</p>
    <h3>Venta de alcohol</h3><p>La venta está prohibida a menores de 18 años. Al registrarte declarás tu fecha de nacimiento y al recibir el pedido se puede solicitar documento.</p>
    <h3>Club Member</h3><p>La membresía se cobra por mes adelantado y se renueva automáticamente. Podés pedir la baja en cualquier momento desde «Mi cuenta»: conservás los beneficios hasta el final del período pagado.</p>
    <h3>Tiradas limitadas</h3><p>Las ediciones exclusivas tienen un tope de unidades por socio. Las preventas son exclusivas del Club hasta la fecha indicada en cada producto.</p>
    <p class="muted">Beber con moderación. Prohibida su venta a menores de 18 años.</p>
  </div></section>` };
}
