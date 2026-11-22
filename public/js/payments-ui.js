// Piezas de interfaz de pagos: selector de medio de pago y datos para transferir.
import { esc, money, toast } from './ui.js';

export const STATUS_LABEL = {
  pendiente_pago: 'Pendiente de pago', pagado: 'Pagado', preparando: 'Preparando', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado',
};
export const METHOD_LABEL = { mercadopago: 'Mercado Pago', transferencia: 'Transferencia', prueba: 'Pago de prueba' };

export function methodPicker(methods, selected) {
  if (!methods.length) return '<p class="error-msg">Los pagos online todavía no están habilitados. Escribinos y coordinamos tu compra.</p>';
  return `<div class="pay-methods" role="radiogroup" aria-label="Medio de pago">
    ${methods.map(m => `<label class="pay-method${m.id === selected ? ' on' : ''}">
      <input type="radio" name="paymentMethod" value="${esc(m.id)}" ${m.id === selected ? 'checked' : ''}>
      <span class="pay-body"><span class="pay-title"><b>${esc(m.label)}</b>${m.discountPct ? `<span class="badge gold">${m.discountPct}% off</span>` : ''}</span><span class="muted">${esc(m.detail)}</span></span>
    </label>`).join('')}
  </div>`;
}

export function wireMethodPicker(root, onChange) {
  root.querySelectorAll('input[name=paymentMethod]').forEach(r => r.addEventListener('change', () => {
    root.querySelectorAll('.pay-method').forEach(l => l.classList.toggle('on', l.contains(r) && r.checked));
    onChange(r.value);
  }));
}

export function bankBox({ bank, amount, reference, expiresAt }) {
  const row = (label, value) => value ? `<div class="bank-row"><span class="label">${label}</span><span class="bank-val">${esc(value)}</span><button type="button" class="link" data-copy="${esc(value)}">Copiar</button></div>` : '';
  return `<div class="panel gold bank-box">
    <p class="label" style="margin:0">Transferí exactamente</p>
    <p class="bank-amount">${money(amount)}</p>
    ${row('Alias', bank.alias)}${row('CBU / CVU', bank.cbu)}${row('Titular', bank.holder)}${row('Banco', bank.bank)}${row('CUIT', bank.cuit)}${row('Referencia', reference)}
    <p class="muted" style="font-size:14px;margin:12px 0 0">Poné la referencia en el concepto de la transferencia${bank.contact ? ` y mandá el comprobante a <b>${esc(bank.contact)}</b>` : ''}.
    ${expiresAt ? `Reservamos tu pedido hasta el ${new Date(expiresAt).toLocaleString('es-AR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.` : ''} Lo confirmamos apenas se acredite.</p>
  </div>`;
}

export function wireCopy(root) {
  root.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copiado'); }
    catch { toast('Seleccioná el texto para copiarlo', 'error'); }
  }));
}
