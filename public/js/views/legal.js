import { eyebrow, money } from '../ui.js';
import { api } from '../api.js';
export default async function legal() {
  const s = await api('/settings');
  return { title: 'Envíos y condiciones', html: `<section class="section"><div class="container prose">
    ${eyebrow('Envíos y condiciones', '規約')}
    <h1>Envíos, pagos y Club</h1><hr class="gold-rule">
    <h3>Medios de pago</h3>
    <p><b>Mercado Pago:</b> tarjetas de crédito y débito, dinero en cuenta de Mercado Pago y cuotas según promociones vigentes. El pago se acredita al instante y te llevamos de vuelta a tu pedido.</p>
    <p><b>Transferencia bancaria:</b> al confirmar el pedido te mostramos el alias, el CBU y el monto exacto${s.transferDiscountPct ? `, con ${s.transferDiscountPct}% de descuento sobre los productos` : ''}. Reservamos tu pedido por ${s.transferExpiryHours} horas; si el pago no llega en ese plazo, se libera. Lo confirmamos apenas se acredita.</p>
    <p><b>Club:</b> la membresía se paga mes a mes con cualquiera de los dos medios. Desde 7 días antes del vencimiento podés pagar el mes siguiente en Mi cuenta → Membresía.</p>
    <h3>Envíos</h3><p>Enviamos a todo el país. Costo fijo de ${money(s.shippingFlat)}, sin cargo en compras desde ${money(s.freeShippingFrom)} y siempre sin cargo para socios del Club. También podés retirar sin cargo en la bodega.</p>
    <h3>Venta de alcohol</h3><p>La venta está prohibida a menores de 18 años. Al registrarte declarás tu fecha de nacimiento y al recibir el pedido se puede solicitar documento.</p>
    <h3>Club Member</h3><p>La membresía cuesta ${money(s.membershipPrice)} por mes y se paga por mes adelantado. No hay permanencia: si no pagás el mes siguiente, la membresía vence al final del período pagado.</p>
    <h3>Tiradas limitadas</h3><p>Las ediciones exclusivas tienen un tope de ${s.maxReserva} unidades por socio en cada pedido. Las preventas son exclusivas del Club hasta la fecha indicada en cada producto.</p>
    <p class="muted">Beber con moderación. Prohibida su venta a menores de 18 años.</p>
  </div></section>` };
}
