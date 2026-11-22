// Barra de la demo: accesos rápidos para ver la tienda como socio o como administrador.
import { demoLogin, resetDemo } from './api-mock-entry.js';
import { refreshUser, clearCart } from './store.js';
import { go } from './app.js';
import { toast } from './ui.js';

const bar = document.createElement('div');
bar.className = 'demo-bar';
bar.innerHTML = `<span><b>Demo</b> · los datos quedan sólo en este navegador. Ver como:</span>
  <button type="button" data-as="socio@komatsu.demo">Socio</button>
  <button type="button" data-as="admin@komatsu.local">Admin</button>
  <button type="button" data-as="">Visitante</button>
  <button type="button" data-reset>Reiniciar demo</button>`;
document.body.prepend(bar);
bar.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-reset')) {
    await resetDemo(); clearCart(); await refreshUser(); toast('Demo reiniciada'); go(''); return;
  }
  await demoLogin(b.dataset.as);
  const u = await refreshUser();
  toast(u ? `Viendo como ${u.name}` : 'Viendo como visitante');
  go(b.dataset.as.startsWith('admin') ? 'admin' : b.dataset.as ? 'club/socios' : '');
});
