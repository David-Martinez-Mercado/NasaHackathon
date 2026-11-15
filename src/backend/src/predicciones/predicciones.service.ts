import { Injectable } from '@nestjs/common';
import { Prisma, Severidad, TipoCapa, TipoPunto, VersionPrediccion } from '@prisma/client';
import { AppError, CodigoError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { elegirEscenario, RejillaEscenario } from './escenario';
import {
  AlertaResumenTipo,
  CapaMapaTipo,
  ConjuntoPuntosTipo,
  EstadoPrediccionesTipo,
  InfoModeloTipo,
  ResumenClima,
  ResumenHumedad,
  SerieDatosTipo,
  TablaModeloTipo,
} from './predicciones.model';

const iso = (d: Date | null | undefined): string => (d ? d.toISOString().slice(0, 10) : '');
const numero = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** Lo que las consultas de los sliders piden una y otra vez no cambia mientras la versión sea la misma: se guarda en memoria. */
const MAX_REJILLAS_EN_MEMORIA = 24;

@Injectable()
export class PrediccionesService {
  private readonly rejillas = new Map<string, RejillaEscenario[]>();

  constructor(private readonly prisma: PrismaService) {}

  async versionActiva(): Promise<VersionPrediccion | null> {
    return this.prisma.versionPrediccion.findFirst({ where: { activa: true } });
  }

  private async requerirVersion(): Promise<VersionPrediccion> {
    const version = await this.versionActiva();
    if (!version) {
      throw new AppError(
        CodigoError.SIN_PREDICCIONES,
        'There are no predictions loaded yet. Import an ml/ export with "npm run import:predicciones".',
      );
    }
    return version;
  }

  // ------------------------------------------------------------------------------------------------ capas
  async capa(tipo: TipoCapa, escenario?: { lluviaPct: number; tempDeltaC: number }): Promise<CapaMapaTipo | null> {
    const version = await this.requerirVersion();
    const capa = await this.prisma.capaMapa.findUnique({ where: { versionId_tipo: { versionId: version.id, tipo } } });
    if (!capa) return null;
    const clave = `${capa.id}`;
    let rejillas = this.rejillas.get(clave);
    if (!rejillas) {
      const filas = await this.prisma.escenarioCapa.findMany({ where: { capaId: capa.id } });
      rejillas = filas.map((f) => ({ lluviaPct: f.lluviaPct, tempDeltaC: f.tempDeltaC, valores: f.valores as (number | null)[] }));
      if (this.rejillas.size >= MAX_REJILLAS_EN_MEMORIA) this.rejillas.delete(this.rejillas.keys().next().value as string);
      this.rejillas.set(clave, rejillas);
    }
    // Una capa que no usa los sliders siempre devuelve su escenario base, pidan lo que pidan.
    const pedido = capa.escenarioAplica ? (escenario ?? { lluviaPct: 0, tempDeltaC: 0 }) : { lluviaPct: 0, tempDeltaC: 0 };
    const elegido = elegirEscenario(rejillas, pedido.lluviaPct, pedido.tempDeltaC);
    return {
      tipo: capa.tipo, concepto: capa.concepto, titulo: capa.titulo, variable: capa.variable, unidad: capa.unidad,
      min: capa.min, max: capa.max,
      rampa: (capa.rampa as { at: number; color: string }[]).map((p) => ({ en: p.at, color: p.color })),
      leyenda: capa.leyenda,
      rejilla: { bbox: [capa.bboxOeste, capa.bboxSur, capa.bboxEste, capa.bboxNorte], columnas: capa.columnas, filas: capa.filas, valores: elegido.valores },
      escenario: {
        lluviaPct: elegido.lluviaPct, tempDeltaC: elegido.tempDeltaC, aplica: capa.escenarioAplica,
        interpolado: capa.escenarioAplica && elegido.interpolado, recortado: capa.escenarioAplica && elegido.recortado,
      },
      fuente: capa.fuente, resolucionM: capa.resolucionM, interpolada: capa.interpolada, datosAl: iso(capa.datosAl),
      notas: capa.notas, version: version.version,
    };
  }

  // ------------------------------------------------------------------------------------------------ puntos
  async puntos(tipo: TipoPunto, bbox?: number[]): Promise<ConjuntoPuntosTipo | null> {
    const version = await this.requerirVersion();
    const conjunto = await this.prisma.conjuntoPuntos.findUnique({ where: { versionId_tipo: { versionId: version.id, tipo } } });
    if (!conjunto) return null;
    const dentro = bbox
      ? Prisma.sql`AND "geom" && ST_MakeEnvelope(${bbox[0]}::float8, ${bbox[1]}::float8, ${bbox[2]}::float8, ${bbox[3]}::float8, 4326)`
      : Prisma.empty;
    const filas = await this.prisma.$queryRaw<
      { clave: string; lat: number; lon: number; etiqueta: string | null; severidad: Severidad | null; valor: number | null }[]
    >(Prisma.sql`
      SELECT "clave", ST_Y("geom") AS lat, ST_X("geom") AS lon, "etiqueta", "severidad"::text AS severidad, "valor"
      FROM "PuntoMapa"
      WHERE "versionId" = ${version.id}::uuid AND "tipo" = ${tipo}::"TipoPunto" ${dentro}
      ORDER BY "PuntoMapa"."severidad" DESC NULLS LAST, "valor" ASC NULLS LAST, "clave"
    `);
    return {
      tipo: conjunto.tipo, concepto: conjunto.concepto, fuente: conjunto.fuente, datosAl: iso(conjunto.datosAl),
      unidad: conjunto.unidad, notas: conjunto.notas,
      puntos: filas.map((f) => ({
        id: f.clave, latitud: f.lat, longitud: f.lon, tipo, etiqueta: f.etiqueta, severidad: f.severidad, valor: f.valor,
      })),
    };
  }

  // ------------------------------------------------------------------------------------------------ series y tablas
  async series(prefijo?: string): Promise<SerieDatosTipo[]> {
    const version = await this.requerirVersion();
    const filas = await this.prisma.serieDato.findMany({
      where: { versionId: version.id, ...(prefijo ? { clave: { startsWith: prefijo } } : {}) },
      orderBy: { clave: 'asc' },
    });
    return filas.map((s) => ({
      clave: s.clave, titulo: s.titulo, unidad: s.unidad, fuente: s.fuente, concepto: s.concepto,
      etiquetaA: s.etiquetaA, etiquetaB: s.etiquetaB, notas: s.notas,
      puntos: (s.puntos as { label: string; a?: number | null; b?: number | null; forecast: boolean }[]).map((p) => ({
        etiqueta: p.label, a: p.a ?? null, b: p.b ?? null, pronostico: p.forecast,
      })),
    }));
  }

  async tabla(clave: string): Promise<TablaModeloTipo | null> {
    const version = await this.requerirVersion();
    const t = await this.prisma.tablaModelo.findUnique({ where: { versionId_clave: { versionId: version.id, clave } } });
    if (!t) return null;
    return { clave: t.clave, concepto: t.concepto, titulo: t.titulo, unidad: t.unidad, datosAl: t.datosAl ? iso(t.datosAl) : null, notas: t.notas, filas: t.filas };
  }

  // ------------------------------------------------------------------------------------------------ resúmenes
  async alertas(): Promise<AlertaResumenTipo[]> {
    const version = await this.requerirVersion();
    const filas = await this.prisma.alertaMapa.findMany({ where: { versionId: version.id }, orderBy: { tipo: 'asc' } });
    return filas.map((a) => ({
      tipo: a.tipo, titulo: a.titulo, valor: a.valor, unidad: a.unidad, detalle: a.detalle, definicion: a.definicion,
      concepto: a.concepto, datosAl: iso(a.datosAl),
    }));
  }

  private async resumen() {
    const version = await this.requerirVersion();
    return this.prisma.resumenModelo.findUnique({ where: { versionId: version.id } });
  }

  async resumenHumedad(): Promise<ResumenHumedad | null> {
    const h = (await this.resumen())?.humedad as Record<string, unknown> | null | undefined;
    if (!h) return null;
    return {
      raiz: h.root as number, superficie: h.surface as number, evaporacion: h.evaporation as number,
      percentil: h.percentile as number, datosAl: String(h.as_of), fuente: String(h.source),
    };
  }

  async resumenClima(): Promise<ResumenClima | null> {
    const c = (await this.resumen())?.clima as Record<string, unknown> | null | undefined;
    if (!c) return null;
    return {
      lluviaMananaPct: numero(c.rain_next_day_pct), lluviaMensualMm: (c.rain_next_months_mm as number[]) ?? [],
      olaDeCalor7DiasPct: numero(c.heatwave_next7_pct), temperaturaMaxC: numero(c.temperature_max_c),
      temperaturaMinC: numero(c.temperature_min_c), temperaturaMediaC: numero(c.temperature_mean_c),
      datosAl: String(c.as_of), notas: (c.notes as string[]) ?? [],
    };
  }

  async noDisponible(): Promise<string[]> {
    return (await this.resumen())?.noDisponible ?? [];
  }

  // ------------------------------------------------------------------------------------------------ estado
  async estado(): Promise<EstadoPrediccionesTipo | null> {
    const v = await this.versionActiva();
    if (!v) return null;
    const modelos = (v.modelos as Record<string, unknown>[]).map(
      (m): InfoModeloTipo => ({
        concepto: String(m.concept), nombre: String(m.name), rol: String(m.role), algoritmo: String(m.algorithm),
        filasEntrenamiento: Number(m.trained_rows), metrica: String(m.metric), valor: numero(m.value),
        intervaloInf: numero(m.ci_lo), intervaloSup: numero(m.ci_hi), base: (m.baseline as string | null) ?? null,
        valorBase: numero(m.baseline_value), skill: numero(m.skill), notas: (m.notes as string[]) ?? [],
      }),
    );
    return { version: v.version, datosAl: iso(v.datosAl), generadaEn: v.generadaEn, importadaEn: v.importadaEn, modelos, limitaciones: v.limitaciones };
  }
}
