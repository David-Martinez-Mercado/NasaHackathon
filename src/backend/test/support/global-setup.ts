/**
 * Arranca UNA base PostgreSQL con PostGIS para todas las pruebas de integración (PGlite expuesto por socket), le aplica
 * las migraciones de prisma/migrations y publica su URL en TEST_DATABASE_URL. Prisma se conecta a ella como a cualquier
 * PostgreSQL, así las transacciones, los índices y las consultas PostGIS se prueban de verdad, sin Docker.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// pglite es solo ESM: se importa dinámicamente sin que TypeScript lo convierta en require()
const importar = new Function('nombre', 'return import(nombre)') as (nombre: string) => Promise<any>;

export default async function iniciarBase(): Promise<void> {
  const { PGlite } = await importar('@electric-sql/pglite');
  const { postgis } = await importar('@electric-sql/pglite-postgis');
  const { PGLiteSocketServer } = await importar('@electric-sql/pglite-socket');

  const db = await PGlite.create({ extensions: { postgis } });
  const carpeta = join(__dirname, '../../prisma/migrations');
  for (const nombre of readdirSync(carpeta).filter((n) => /^\d+_/.test(n)).sort()) {
    await db.exec(readFileSync(join(carpeta, nombre, 'migration.sql'), 'utf8'));
  }

  const servidor = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await servidor.start();
  const puerto = (servidor as any).server?.address?.().port ?? (servidor as any).port;
  // PGlite atiende una conexión a la vez: connection_limit=1 hace que Prisma use una sola.
  process.env.TEST_DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${puerto}/postgres?connection_limit=1&pgbouncer=true&sslmode=disable`;
  (globalThis as any).__BASE_EMBEBIDA__ = { db, servidor };
}
