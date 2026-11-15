import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { DATOS } from '../src/datos/datos.port';
import { PrismaService } from '../src/prisma/prisma.service';

/** Texto SQL de una llamada a $queryRaw (con template tag o con Prisma.sql). */
export const sqlText = (arg: unknown): string => {
  if (Array.isArray(arg)) return arg.join('?');
  const sql = arg as { strings?: string[] };
  return sql.strings ? sql.strings.join('?') : String(arg);
};

export const PARCELA_ID = '11111111-1111-4111-8111-111111111111';

/** Base de datos simulada: las pruebas e2e no necesitan PostgreSQL. */
export function fakePrisma() {
  const parcela = {
    id: PARCELA_ID,
    nombre: 'Greeley (riego)',
    centroideLat: 40.42,
    centroideLon: -104.71,
    creadaEn: new Date('2026-11-15T00:00:00Z'),
    geometria: JSON.stringify({ type: 'Point', coordinates: [-104.71, 40.42] }),
  };
  const prefs = {
    id: '22222222-2222-4222-8222-222222222222',
    parcelaId: PARCELA_ID,
    riego: true,
    aguaRiegoMm: 400,
    maquinaria: [],
    cultivosPreferidos: [],
    cultivosExcluidos: [],
    prioridad: 'BALANCE',
    actualizadaEn: new Date('2026-11-15T00:00:00Z'),
  };
  return {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn(async (arg: unknown) => {
      const sql = sqlText(arg);
      if (sql.includes('pg_extension')) return [{ postgis: '3.4.2' }];
      if (sql.includes('INSERT INTO "Parcela"')) return [parcela];
      if (sql.includes('EXISTS')) return [{ existe: true }];
      if (sql.includes('FROM "Parcela"')) return [parcela];
      return [];
    }),
    cultivo: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'c1', codigo: 'frijol', nombre: 'Frijol', familiaBotanica: 'Fabaceae', verificado: false },
        { id: 'c2', codigo: 'maiz', nombre: 'Maíz', familiaBotanica: 'Poaceae', verificado: false },
      ]),
    },
    preferencias: {
      findUnique: jest.fn().mockResolvedValue(prefs),
      upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => ({ ...prefs, ...create })),
    },
    escenario: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  };
}

export type FakePrisma = ReturnType<typeof fakePrisma>;

/** Fuente de datos simulada que sí responde (para probar lo que viene después de los datos). */
export const datosFalsos = { disponible: true, contexto: async () => ({ fixture: true }) };

export async function crearApp(
  prisma: FakePrisma = fakePrisma(),
  opciones: { datos?: boolean } = {},
): Promise<{ app: INestApplication; prisma: FakePrisma }> {
  let builder = Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(prisma);
  if (opciones.datos) builder = builder.overrideProvider(DATOS).useValue(datosFalsos);
  const modulo = await builder.compile();
  const app = modulo.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return { app, prisma };
}

/** Envía una consulta o mutación GraphQL como lo haría el frontend. */
export function gql(app: INestApplication, query: string, variables?: Record<string, unknown>) {
  return request(app.getHttpServer()).post('/graphql').set('Content-Type', 'application/json').send({ query, variables });
}

export const codigo = (res: request.Response): string | undefined => res.body.errors?.[0]?.extensions?.codigo;
