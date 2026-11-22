import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './src/db.js';
import { createApp } from './src/app.js';
import { renewDue } from './src/membership.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const db = openDb(process.env.DB_FILE || path.join(here, 'data', 'komatsu.db'));
const app = createApp(db);
const port = Number(process.env.PORT || 3000);

// Renovación mensual de membresías y limpieza de sesiones vencidas, cada hora.
const housekeeping = async () => {
  try {
    const n = await renewDue(db);
    if (n) console.log(`Membresías renovadas: ${n}`);
    db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(new Date().toISOString());
  } catch (e) { console.error('housekeeping', e); }
};
housekeeping();
setInterval(housekeeping, 60 * 60e3).unref();

app.listen(port, () => console.log(`Sake Komatsu en http://localhost:${port}`));
