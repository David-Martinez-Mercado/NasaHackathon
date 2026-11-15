/**
 * Comprueba el SQL contra PostgreSQL + PostGIS reales (PGlite con la extensión PostGIS, sin Docker):
 *  1. la migración inicial se aplica completa,
 *  2. el SQL de ParcelasService (insertar y leer parcelas) funciona con geometrías de verdad,
 *  3. las parcelas inválidas se rechazan en la base de datos.
 * Uso: npm run verify:sql
 */
import './schema-env';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ParcelasService } from '../src/parcelas/parcelas.service';
import { SaludService } from '../src/salud/salud.service';

type Consulta = { text: string; values: unknown[] };

/** Convierte lo que recibe $queryRaw (template tag o Prisma.sql) en texto SQL con $1, $2... y sus valores. */
function aConsulta(arg: any, values: unknown[]): Consulta {
  if (Array.isArray(arg)) {
    return { text: arg.reduce((texto: string, parte: string, i: number) => texto + parte + (i < values.length ? `$${i + 1}` : ''), ''), values };
  }
  return { text: arg.text, values: arg.values };
}

async function main() {
  // pglite es solo ESM: se importa de forma dinámica sin que TypeScript lo convierta en require()
  const importar = new Function('nombre', 'return import(nombre)') as (n: string) => Promise<any>;
  const { PGlite } = await importar('@electric-sql/pglite');
  const { postgis } = await importar('@electric-sql/pglite-postgis');
  const db = new PGlite({ extensions: { postgis } });

  const prisma = {
    $queryRaw: async (arg: unknown, ...values: unknown[]) => {
      const q = aConsulta(arg, values);
      return (await db.query(q.text, q.values)).rows;
    },
  };

  // 1. migraciones
  const carpeta = join(__dirname, '../prisma/migrations');
  for (const nombre of readdirSync(carpeta).filter((n) => /^\d+_/.test(n)).sort()) {
    await db.exec(readFileSync(join(carpeta, nombre, 'migration.sql'), 'utf8'));
    console.log(`ok  migración ${nombre}`);
  }
  const tablas = (await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`)).rows.map((r: any) => r.table_name);
  assert.deepEqual(tablas.filter((t: string) => !t.startsWith('spatial') && !['geography_columns', 'geometry_columns'].includes(t)), ['CacheDatos', 'Cultivo', 'Escenario', 'Parcela', 'Preferencias']);
  const indice = (await db.query(`SELECT indexdef FROM pg_indexes WHERE indexname = 'Parcela_geom_idx'`)).rows[0] as any;
  assert.match(indice.indexdef, /USING gist/i);
  console.log('ok  tablas e índice GIST');

  const parcelas = new ParcelasService(prisma as any);

  // 2. punto
  const punto = await parcelas.crear({ nombre: 'Greeley (riego)', punto: { latitud: 40.42, longitud: -104.71 } });
  assert.equal(punto.nombre, 'Greeley (riego)');
  assert.ok(Math.abs(punto.latitud - 40.42) < 1e-9 && Math.abs(punto.longitud + 104.71) < 1e-9);
  assert.equal(punto.geometria.type, 'Point');
  assert.match(punto.id, /^[0-9a-f-]{36}$/);
  console.log('ok  crear parcela desde un punto');

  // 3. polígono: el centroide cae dentro del cuadro
  const poligono = await parcelas.crear({
    poligono: { type: 'Polygon', coordinates: [[[-104.72, 40.41], [-104.70, 40.41], [-104.70, 40.43], [-104.72, 40.43], [-104.72, 40.41]]] },
  });
  assert.equal(poligono.geometria.type, 'Polygon');
  assert.ok(Math.abs(poligono.latitud - 40.42) < 1e-6 && Math.abs(poligono.longitud + 104.71) < 1e-6);
  console.log('ok  crear parcela desde un polígono y calcular su centroide');

  // 4. leer
  const leida = await parcelas.obtener(poligono.id);
  assert.deepEqual(leida.geometria, poligono.geometria);
  assert.ok(leida.creadaEn instanceof Date);
  assert.equal(await parcelas.buscar('99999999-9999-4999-8999-999999999999'), null);
  await assert.rejects(() => parcelas.obtener('99999999-9999-4999-8999-999999999999'), /No encontramos/);
  console.log('ok  leer parcelas y parcela inexistente');

  // 5. polígono que se cruza consigo mismo (corbata): PostGIS lo rechaza
  await assert.rejects(
    () => parcelas.crear({ poligono: { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] } }),
    (error: any) => error.codigo === 'GEOMETRIA_INVALIDA',
  );
  console.log('ok  rechaza un polígono que se cruza (ST_IsValid)');

  // 6. un valor malicioso viaja como dato, no como SQL
  const nombre = `x'); DROP TABLE "Parcela"; --`;
  const segura = await parcelas.crear({ nombre, punto: { latitud: 1, longitud: 1 } });
  assert.equal(segura.nombre, nombre);
  assert.equal(((await db.query(`SELECT count(*)::int AS n FROM "Parcela"`)).rows[0] as any).n, 3);
  console.log('ok  el nombre con comillas se guarda como texto (sin inyección)');

  // 7. consulta de PostGIS que usa /health
  const salud = new SaludService(prisma as any, { env: { NODE_ENV: 'test', DEMO_OFFLINE: true } } as any, { disponible: false } as any, { disponible: false } as any);
  const fuentes = await salud.baseDeDatos();
  assert.equal(fuentes.find((f) => f.nombre === 'PostGIS')?.estado, 'OK');
  console.log('ok  salud detecta PostGIS');

  // 8. consulta espacial con el índice (la que usará el motor para buscar parcelas cercanas)
  const cerca = (await db.query(`SELECT count(*)::int AS n FROM "Parcela" WHERE ST_DWithin("geom"::geography, ST_SetSRID(ST_MakePoint(-104.71, 40.42), 4326)::geography, 5000)`)).rows[0] as any;
  assert.equal(cerca.n, 2);
  console.log('ok  consulta espacial ST_DWithin');

  await db.close();
  console.log('\nTodo el SQL verificado contra PostGIS.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
