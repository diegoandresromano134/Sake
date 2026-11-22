import { api } from '../api.js';
import { esc, eyebrow, formData, toast } from '../ui.js';
import { refreshUser, state } from '../store.js';
import { go } from '../app.js';

const safeNext = n => (n && /^[\w\-/?=&.%]*$/.test(n) && !n.startsWith('login') && !n.startsWith('registro')) ? n : 'cuenta';

function wire(root, endpoint, next) {
  const form = root.querySelector('form'), err = root.querySelector('.error-msg'), btn = form.querySelector('[type=submit]');
  form.addEventListener('submit', async e => {
    e.preventDefault(); err.hidden = true; btn.disabled = true;
    const d = formData(form);
    try {
      await api(endpoint, { method: 'POST', body: { ...d, remember: !!d.remember } });
      const u = await refreshUser();
      toast(`Hola, ${u.name.split(' ')[0]} · ようこそ`);
      go(next);
    } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
  });
}

export async function loginView({ query }) {
  const next = safeNext(query.next);
  if (state.user) { go(next); return null; }
  return {
    title: 'Ingresar',
    html: `<section class="section"><div class="container auth-wrap">
      ${eyebrow('Ingresar', 'ログイン')}<h1 style="margin-bottom:24px">Bienvenido de nuevo</h1>
      <form class="form panel" novalidate>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
        <label class="check"><input type="checkbox" name="remember" checked> Mantener la sesión iniciada</label>
        <p class="error-msg" hidden></p>
        <button class="btn gold block" type="submit">Ingresar</button>
      </form>
      <p class="muted" style="text-align:center;margin-top:18px">¿No tenés cuenta? <a class="gold-text" href="#/registro?next=${encodeURIComponent(next)}">Registrate</a></p>
    </div></section>`,
    mount: root => wire(root, '/auth/login', next),
  };
}

export async function registerView({ query }) {
  const next = safeNext(query.next);
  if (state.user) { go(next); return null; }
  const max = new Date(); max.setFullYear(max.getFullYear() - 18);
  return {
    title: 'Crear cuenta',
    html: `<section class="section"><div class="container auth-wrap">
      ${eyebrow('Crear cuenta', '新規登録')}<h1 style="margin-bottom:24px">Sumate a Komatsu</h1>
      <form class="form panel" novalidate>
        <div class="field"><label for="name">Nombre y apellido</label><input id="name" name="name" autocomplete="name" required minlength="2"></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="password">Contraseña (mín. 8 caracteres)</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required></div>
        <div class="field"><label for="birthdate">Fecha de nacimiento</label><input id="birthdate" name="birthdate" type="date" max="${max.toISOString().slice(0, 10)}" required></div>
        <label class="check"><input type="checkbox" name="remember" checked> Mantener la sesión iniciada</label>
        <p class="error-msg" hidden></p>
        <button class="btn gold block" type="submit">Crear cuenta</button>
      </form>
      <p class="muted" style="text-align:center;margin-top:18px">¿Ya tenés cuenta? <a class="gold-text" href="#/login?next=${encodeURIComponent(next)}">Ingresá</a></p>
    </div></section>`,
    mount: root => wire(root, '/auth/register', next),
  };
}
