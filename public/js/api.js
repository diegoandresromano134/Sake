// Cliente de la API: siempre JSON, con cookie de sesión.
export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  let data = {};
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) throw new ApiError(res.status, data.error || 'Ocurrió un error.', data.code);
  return data;
}
