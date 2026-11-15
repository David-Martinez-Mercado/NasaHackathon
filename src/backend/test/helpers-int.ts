import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { DATOS } from '../src/datos/datos.port';
import { PrismaService } from '../src/prisma/prisma.service';
import { datosFalsos } from './helpers';

export { codigo, gql } from './helpers';

export const CULTIVOS = [
  { codigo: 'maiz', nombre: 'Maíz', familiaBotanica: 'Poaceae' },
  { codigo: 'frijol', nombre: 'Frijol', familiaBotanica: 'Fabaceae' },
  { codigo: 'avena', nombre: 'Avena', familiaBotanica: 'Poaceae' },
  { codigo: 'sorgo', nombre: 'Sorgo', familiaBotanica: 'Poaceae' },
  { codigo: 'barbecho', nombre: 'Barbecho', familiaBotanica: 'Ninguna' },
];

/** Una app de Nest completa contra la base PostgreSQL/PostGIS de las pruebas de integración. */
export async function crearAppReal(
  opciones: { datos?: boolean } = {},
): Promise<{ app: INestApplication; prisma: PrismaService }> {
  let constructor = Test.createTestingModule({ imports: [AppModule] });
  if (opciones.datos) constructor = constructor.overrideProvider(DATOS).useValue(datosFalsos); // clima simulado
  const modulo = await constructor.compile();
  const app = modulo.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

/** Deja las tablas vacías (menos las de PostGIS) y siembra el catálogo mínimo de cultivos. */
export async function reiniciarBase(prisma: PrismaService, sembrar = true): Promise<void> {
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'spatial_ref_sys'
  `;
  const lista = tablas.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
  if (sembrar) await prisma.cultivo.createMany({ data: CULTIVOS });
}

export const PUNTO = { latitud: 40.42, longitud: -104.71 };
export const POLIGONO = {
  type: 'Polygon',
  coordinates: [[[-104.72, 40.41], [-104.7, 40.41], [-104.7, 40.43], [-104.72, 40.43], [-104.72, 40.41]]],
};

/** Carpeta del export real de ml/ que se versiona en el repo (la misma que importará el servidor). */
export const EXPORT_V1 = resolve(__dirname, '../../../ml/deploy/exports/v1');
export const ESQUEMA_EXPORT = resolve(__dirname, '../../../ml/deploy/export.schema.json');

const sha = (datos: Buffer | string) => createHash('sha256').update(datos).digest('hex');

/**
 * Copia el export a una carpeta temporal y lo deja con otra versión. `cambiar` puede modificar archivos antes de
 * recalcular los hashes del manifiesto (para fabricar exports válidos pero con otro contenido).
 */
export function copiarExport(version: string, cambiar?: (carpeta: string) => void): string {
  const destino = mkdtempSync(join(tmpdir(), 'export-'));
  cpSync(EXPORT_V1, destino, { recursive: true });
  cambiar?.(destino);
  const manifestPath = join(destino, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.version = version;
  for (const archivo of manifest.files as { path: string; sha256: string }[]) {
    archivo.sha256 = sha(readFileSync(join(destino, archivo.path)));
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return destino;
}
