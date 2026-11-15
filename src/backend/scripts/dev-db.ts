/**
 * Base de datos de desarrollo SIN Docker: PostgreSQL + PostGIS embebido (PGlite) con los datos guardados en .pglite/.
 *
 *   npm run dev:db        # deja corriendo el servidor en el puerto 5433 (Ctrl+C para detenerlo)
 *
 * Luego, en otra terminal:  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1&pgbouncer=true&sslmode=disable"
 * Solo atiende UNA conexión a la vez (por eso connection_limit=1): detén el backend antes de correr `import:predicciones` o `seed`.
 * Es para desarrollo y pruebas; el servidor real usa PostgreSQL 16 con docker compose.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const importar = new Function('nombre', 'return import(nombre)') as (nombre: string) => Promise<any>;

async function main() {
  const { PGlite } = await importar('@electric-sql/pglite');
  const { postgis } = await importar('@electric-sql/pglite-postgis');
  const { PGLiteSocketServer } = await importar('@electric-sql/pglite-socket');
  const puerto = Number(process.env.DEV_DB_PORT ?? 5433);
  const carpeta = resolve(process.cwd(), '.pglite');

  const db = await PGlite.create(carpeta, { extensions: { postgis } });
  const existe = await db.query(`SELECT to_regclass('public."Parcela"') AS t`);
  if (!existe.rows[0].t) {
    const migraciones = join(process.cwd(), 'prisma/migrations');
    for (const nombre of readdirSync(migraciones).filter((n) => /^\d+_/.test(n) && existsSync(join(migraciones, n, 'migration.sql'))).sort()) {
      await db.exec(readFileSync(join(migraciones, nombre, 'migration.sql'), 'utf8'));
      console.log(`migración aplicada: ${nombre}`);
    }
  }
  const servidor = new PGLiteSocketServer({ db, port: puerto, host: '127.0.0.1' });
  await servidor.start();
  console.log(`PostgreSQL + PostGIS de desarrollo en 127.0.0.1:${puerto} (datos en ${carpeta})`);
  console.log(`DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${puerto}/postgres?connection_limit=1&pgbouncer=true&sslmode=disable"`);
  const cerrar = async () => { await servidor.stop(); await db.close(); process.exit(0); };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}

main().catch((e) => { console.error(e); process.exit(1); });
