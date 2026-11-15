import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Severidad, TipoCapa, TipoPunto } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { AppError, CodigoError } from '../common/errors';
import { Tx, TransaccionService } from '../common/transaccion.service';
import {
  ExportLayer,
  ExportManifest,
  ExportPointsFile,
  ExportSeries,
  ExportSummaries,
  ExportTable,
} from './export.types';
import { TipoArchivoExport, ValidadorExport, VERSION_ESQUEMA_SOPORTADA } from './export-validator';

const TIPO_CAPA: Record<ExportLayer['kind'], TipoCapa> = {
  temperature: TipoCapa.TEMPERATURA,
  humidity: TipoCapa.HUMEDAD,
  rain: TipoCapa.LLUVIA,
  drought: TipoCapa.SEQUIA,
  vulnerability: TipoCapa.VULNERABILIDAD,
  elevation: TipoCapa.ELEVACION,
  slope: TipoCapa.PENDIENTE,
  erosion: TipoCapa.EROSION,
};
const TIPO_PUNTO: Record<ExportPointsFile['kind'], TipoPunto> = { stress: TipoPunto.ESTRES, erosion: TipoPunto.EROSION };
const SEVERIDAD: Record<'low' | 'medium' | 'high', Severidad> = { low: Severidad.BAJA, medium: Severidad.MEDIA, high: Severidad.ALTA };

const fecha = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const sha256 = (datos: Buffer | string) => createHash('sha256').update(datos).digest('hex');

export interface ResultadoImportacion {
  version: string;
  estado: 'importada' | 'ya-importada';
  activa: boolean;
  capas: number;
  puntos: number;
  series: number;
  tablas: number;
  alertas: number;
}

/** Todo lo que contiene un export, ya leído y validado, listo para guardarse. */
interface ExportLeido {
  manifest: ExportManifest;
  huella: string;
  capas: ExportLayer[];
  conjuntos: ExportPointsFile[];
  series: ExportSeries[];
  summaries: ExportSummaries | null;
  tablas: ExportTable[];
}

@Injectable()
export class ImportacionService {
  private readonly logger = new Logger(ImportacionService.name);

  constructor(private readonly transaccion: TransaccionService) {}

  /**
   * Lee y valida el export COMPLETO antes de tocar la base de datos (hashes, esquema, tamaño de cada rejilla) y luego lo
   * guarda en una sola transacción: o queda toda la versión nueva o queda exactamente lo que había.
   */
  async importar(directorio: string, opciones: { activar?: boolean; validador?: ValidadorExport } = {}): Promise<ResultadoImportacion> {
    const leido = this.leer(resolve(directorio), opciones.validador ?? ValidadorExport.desdeArchivo());
    return this.transaccion.ejecutar((tx) => this.guardar(tx, leido, opciones.activar ?? true), { timeoutMs: 120_000 });
  }

  // ------------------------------------------------------------------------------------- lectura y validación
  private leer(directorio: string, validador: ValidadorExport): ExportLeido {
    const problemas: string[] = [];
    const bytesManifest = readFileSync(join(directorio, 'manifest.json'));
    const manifest = JSON.parse(bytesManifest.toString('utf8')) as ExportManifest;
    problemas.push(...validador.validar('manifest', manifest).map((p) => `manifest.json: ${p}`));
    if (manifest.schema_version !== VERSION_ESQUEMA_SOPORTADA) {
      problemas.push(`schema_version ${manifest.schema_version}: este backend lee la ${VERSION_ESQUEMA_SOPORTADA}`);
    }
    const leido: ExportLeido = {
      manifest, huella: sha256(bytesManifest), capas: [], conjuntos: [], series: [], summaries: null, tablas: [],
    };
    if (problemas.length) throw this.invalido(problemas);

    const vistos = new Set<string>();
    for (const entrada of manifest.files) {
      const ruta = resolve(directorio, entrada.path);
      if (!ruta.startsWith(directorio + sep)) {
        problemas.push(`${entrada.path}: la ruta sale de la carpeta del export`);
        continue;
      }
      if (vistos.has(entrada.path)) {
        problemas.push(`${entrada.path}: aparece dos veces en el manifiesto`);
        continue;
      }
      vistos.add(entrada.path);
      let bytes: Buffer;
      try {
        bytes = readFileSync(ruta);
      } catch {
        problemas.push(`${entrada.path}: no existe`);
        continue;
      }
      if (sha256(bytes) !== entrada.sha256) {
        problemas.push(`${entrada.path}: el hash no coincide (archivo modificado o dañado)`);
        continue;
      }
      const dato: unknown = JSON.parse(bytes.toString('utf8'));
      const errores = validador.validar(entrada.kind as TipoArchivoExport, dato);
      if (errores.length) {
        problemas.push(...errores.map((e) => `${entrada.path}: ${e}`));
        continue;
      }
      switch (entrada.kind) {
        case 'layer':
          problemas.push(...this.revisarCapa(entrada.path, dato as ExportLayer));
          leido.capas.push(dato as ExportLayer);
          break;
        case 'points':
          leido.conjuntos.push(dato as ExportPointsFile);
          break;
        case 'series':
          leido.series.push(...(dato as { series: ExportSeries[] }).series);
          break;
        case 'summaries':
          leido.summaries = dato as ExportSummaries;
          break;
        case 'tables':
          leido.tablas.push(...(dato as { tables: ExportTable[] }).tables);
          break;
      }
    }
    const tipos = leido.capas.map((c) => c.kind);
    if (new Set(tipos).size !== tipos.length) problemas.push('hay dos capas del mismo tipo');
    if (!manifest.files.length) problemas.push('el manifiesto no lista archivos');
    if (problemas.length) throw this.invalido(problemas);
    return leido;
  }

  private revisarCapa(ruta: string, capa: ExportLayer): string[] {
    const fallos: string[] = [];
    const tamano = capa.cols * capa.rows;
    for (const escenario of capa.scenarios) {
      if (escenario.values.length !== tamano) {
        fallos.push(`${ruta}: un escenario trae ${escenario.values.length} valores y la rejilla es ${capa.cols}x${capa.rows}`);
        break;
      }
    }
    if (capa.min >= capa.max) fallos.push(`${ruta}: min >= max`);
    if (!capa.scenarios.some((s) => s.rain_pct === 0 && s.temp_delta === 0)) fallos.push(`${ruta}: falta el escenario base`);
    const claves = capa.scenarios.map((s) => `${s.rain_pct}|${s.temp_delta}`);
    if (new Set(claves).size !== claves.length) fallos.push(`${ruta}: escenarios repetidos`);
    return fallos;
  }

  private invalido(problemas: string[]): AppError {
    return new AppError(CodigoError.VALIDACION_FALLIDA, `El export no se puede importar: ${problemas.join('; ')}`);
  }

  // ------------------------------------------------------------------------------------- escritura (una transacción)
  private async guardar(tx: Tx, leido: ExportLeido, activar: boolean): Promise<ResultadoImportacion> {
    const { manifest } = leido;
    const existente = await tx.versionPrediccion.findUnique({ where: { version: manifest.version } });
    if (existente) {
      if (existente.huella !== leido.huella) {
        throw new AppError(
          CodigoError.VALIDACION_FALLIDA,
          `La versión ${manifest.version} ya está importada con otro contenido: genera el export con otra versión.`,
        );
      }
      if (activar && !existente.activa) await this.activar(tx, existente.id);
      return { version: manifest.version, estado: 'ya-importada', activa: activar || existente.activa, capas: 0, puntos: 0, series: 0, tablas: 0, alertas: 0 };
    }

    const version = await tx.versionPrediccion.create({
      data: {
        version: manifest.version,
        activa: false,
        generadaEn: new Date(manifest.generated_at),
        datosAl: fecha(manifest.data_as_of),
        zona: manifest.zone as unknown as Prisma.InputJsonValue,
        modelos: manifest.models as unknown as Prisma.InputJsonValue,
        limitaciones: manifest.limitations,
        huella: leido.huella,
      },
    });

    for (const capa of leido.capas) {
      await tx.capaMapa.create({
        data: {
          versionId: version.id, tipo: TIPO_CAPA[capa.kind], concepto: capa.concept, titulo: capa.title,
          variable: capa.variable, unidad: capa.unit, min: capa.min, max: capa.max,
          rampa: capa.ramp as unknown as Prisma.InputJsonValue, leyenda: capa.legend,
          bboxOeste: capa.bbox[0], bboxSur: capa.bbox[1], bboxEste: capa.bbox[2], bboxNorte: capa.bbox[3],
          columnas: capa.cols, filas: capa.rows, escenarioAplica: capa.scenario_applies, fuente: capa.source,
          resolucionM: capa.resolution_m, interpolada: capa.interpolated, datosAl: fecha(capa.as_of), notas: capa.notes,
          escenarios: {
            create: capa.scenarios.map((s) => ({
              lluviaPct: s.rain_pct, tempDeltaC: s.temp_delta, valores: s.values as Prisma.InputJsonValue,
            })),
          },
        },
      });
    }

    let puntos = 0;
    for (const conjunto of leido.conjuntos) {
      await tx.conjuntoPuntos.create({
        data: {
          versionId: version.id, tipo: TIPO_PUNTO[conjunto.kind], concepto: conjunto.concept, fuente: conjunto.source,
          datosAl: fecha(conjunto.as_of), unidad: conjunto.unit ?? null, notas: conjunto.notes,
        },
      });
      puntos += await this.insertarPuntos(tx, version.id, conjunto);
    }

    if (leido.series.length) {
      await tx.serieDato.createMany({
        data: leido.series.map((s) => ({
          versionId: version.id, clave: s.id, titulo: s.title, unidad: s.unit, fuente: s.source,
          concepto: s.concept ?? null, etiquetaA: s.a_label ?? null, etiquetaB: s.b_label ?? null, notas: s.notes,
          puntos: s.points as unknown as Prisma.InputJsonValue,
        })),
      });
    }
    if (leido.tablas.length) {
      await tx.tablaModelo.createMany({
        data: leido.tablas.map((t) => ({
          versionId: version.id, clave: t.id, concepto: t.concept, titulo: t.title, unidad: t.unit ?? null,
          datosAl: t.as_of ? fecha(t.as_of) : null, notas: t.notes, filas: t.rows as unknown as Prisma.InputJsonValue,
        })),
      });
    }
    const resumen = leido.summaries;
    if (resumen) {
      if (resumen.alerts.length) {
        await tx.alertaMapa.createMany({
          data: resumen.alerts.map((a) => ({
            versionId: version.id, tipo: a.kind, titulo: a.title, valor: a.value, unidad: a.unit, detalle: a.detail,
            definicion: a.definition, concepto: a.concept, datosAl: fecha(a.as_of),
          })),
        });
      }
      await tx.resumenModelo.create({
        data: {
          versionId: version.id,
          humedad: (resumen.humidity ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          clima: (resumen.climate ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          noDisponible: resumen.unavailable,
        },
      });
    }
    if (activar) await this.activar(tx, version.id);
    this.logger.log(`Predicciones ${manifest.version} importadas (${leido.capas.length} capas, ${puntos} puntos)`);
    return {
      version: manifest.version, estado: 'importada', activa: activar, capas: leido.capas.length, puntos,
      series: leido.series.length, tablas: leido.tablas.length, alertas: resumen?.alerts.length ?? 0,
    };
  }

  /** Dos pasos dentro de la misma transacción: el índice único parcial nunca ve dos versiones activas. */
  private async activar(tx: Tx, id: string): Promise<void> {
    await tx.$executeRaw`UPDATE "VersionPrediccion" SET "activa" = false WHERE "activa"`;
    await tx.$executeRaw`UPDATE "VersionPrediccion" SET "activa" = true WHERE "id" = ${id}::uuid`;
  }

  /**
   * Prisma no escribe columnas PostGIS: se insertan por lotes con SQL parametrizado. El lote viaja como un solo
   * parámetro JSON (jsonb_to_recordset), que maneja bien los valores nulos.
   */
  private async insertarPuntos(tx: Tx, versionId: string, conjunto: ExportPointsFile): Promise<number> {
    const LOTE = 500;
    for (let i = 0; i < conjunto.points.length; i += LOTE) {
      const filas = conjunto.points.slice(i, i + LOTE).map((p) => ({
        clave: p.id, lon: p.lon, lat: p.lat, etiqueta: p.label ?? null,
        severidad: p.severity ? SEVERIDAD[p.severity] : null, valor: p.value ?? null,
      }));
      await tx.$executeRaw`
        INSERT INTO "PuntoMapa" ("id", "versionId", "clave", "tipo", "geom", "etiqueta", "severidad", "valor")
        SELECT gen_random_uuid(), ${versionId}::uuid, p.clave, ${TIPO_PUNTO[conjunto.kind]}::"TipoPunto",
               ST_SetSRID(ST_MakePoint(p.lon, p.lat), 4326), p.etiqueta, p.severidad::"Severidad", p.valor
        FROM jsonb_to_recordset(${JSON.stringify(filas)}::jsonb)
             AS p(clave text, lon float8, lat float8, etiqueta text, severidad text, valor float8)
      `;
    }
    return conjunto.points.length;
  }
}
