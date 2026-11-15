import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppError, CodigoError, noEncontrado } from '../common/errors';
import { esLlaveDuplicada, Tx, TransaccionService } from '../common/transaccion.service';
import { CultivosService } from '../cultivos/cultivos.service';
import { HistorialService } from '../historial/historial.service';
import { RegistroHistorial } from '../historial/historial.model';
import { Preferencias } from '../preferencias/preferencias.model';
import { aPreferencias, PreferenciasService } from '../preferencias/preferencias.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeometriaGeoJSON, punto, validarGeometria } from './geojson';
import { ActualizarParcelaInput, CrearParcelaInput } from './parcela.model';
import { aRegistro } from '../historial/historial.service';

export interface ParcelaFila {
  id: string;
  nombre: string | null;
  descripcion: string | null;
  cultivoActual: string | null;
  latitud: number;
  longitud: number;
  areaHa: number | null;
  geometria: GeometriaGeoJSON;
  version: number;
  creadaEn: Date;
  actualizadaEn: Date;
  /** Si el que listó ya las cargó, los resolvers no vuelven a consultar (evita N+1). */
  preferencias?: Preferencias | null;
  historial?: RegistroHistorial[];
}

interface FilaSql {
  id: string;
  nombre: string | null;
  descripcion: string | null;
  cultivoActual: string | null;
  centroideLat: number;
  centroideLon: number;
  areaHa: number | null;
  version: number;
  creadaEn: Date;
  actualizadaEn: Date;
  geometria: string;
}

const COLUMNAS = Prisma.sql`"id", "nombre", "descripcion", "cultivoActual", "centroideLat", "centroideLon", "areaHa",
  "version", "creadaEn", "actualizadaEn", ST_AsGeoJSON("geom") AS geometria`;

const aFila = (fila: FilaSql): ParcelaFila => ({
  id: fila.id,
  nombre: fila.nombre,
  descripcion: fila.descripcion,
  cultivoActual: fila.cultivoActual,
  latitud: fila.centroideLat,
  longitud: fila.centroideLon,
  areaHa: fila.areaHa,
  geometria: JSON.parse(fila.geometria) as GeometriaGeoJSON,
  version: fila.version,
  creadaEn: fila.creadaEn,
  actualizadaEn: fila.actualizadaEn,
});

/** La forma pedida: un punto o un polígono, nunca los dos. `requerida` = la creación necesita una de las dos. */
function geometriaDe(
  entrada: { punto?: { latitud: number; longitud: number } | null; poligono?: unknown },
  requerida: boolean,
): GeometriaGeoJSON | undefined {
  const hayPunto = entrada.punto != null;
  const hayPoligono = entrada.poligono != null;
  if (hayPunto && hayPoligono) {
    throw new AppError(CodigoError.VALIDACION_FALLIDA, 'Indica el punto o el polígono de la parcela (solo uno de los dos).');
  }
  if (!hayPunto && !hayPoligono) {
    if (requerida) throw new AppError(CodigoError.VALIDACION_FALLIDA, 'Indica el punto o el polígono de la parcela (solo uno de los dos).');
    return undefined;
  }
  return hayPunto ? punto(entrada.punto!.latitud, entrada.punto!.longitud) : validarGeometria(entrada.poligono);
}

@Injectable()
export class ParcelasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transaccion: TransaccionService,
    private readonly cultivos: CultivosService,
    private readonly preferencias: PreferenciasService,
    private readonly historial: HistorialService,
  ) {}

  // ----------------------------------------------------------------------------------- lecturas
  async buscar(id: string, tx?: Tx): Promise<ParcelaFila | null> {
    const filas = await (tx ?? this.prisma).$queryRaw<FilaSql[]>(Prisma.sql`
      SELECT ${COLUMNAS} FROM "Parcela" WHERE "id" = ${id}::uuid
    `);
    return filas.length ? aFila(filas[0]) : null;
  }

  async obtener(id: string, tx?: Tx): Promise<ParcelaFila> {
    const parcela = await this.buscar(id, tx);
    if (!parcela) throw noEncontrado('esa parcela');
    return parcela;
  }

  /** Las más recientes primero, con sus preferencias e historial en 2 consultas más (no una por parcela). */
  async listar(limite = 50, desplazamiento = 0): Promise<ParcelaFila[]> {
    const filas = await this.prisma.$queryRaw<FilaSql[]>(Prisma.sql`
      SELECT ${COLUMNAS} FROM "Parcela" ORDER BY "creadaEn" DESC, "id" LIMIT ${limite} OFFSET ${desplazamiento}
    `);
    const parcelas = filas.map(aFila);
    const ids = parcelas.map((p) => p.id);
    const [prefs, hist] = await Promise.all([
      this.prisma.preferencias.findMany({ where: { parcelaId: { in: ids } } }),
      this.prisma.historialParcela.findMany({ where: { parcelaId: { in: ids } }, orderBy: { anio: 'desc' } }),
    ]);
    return parcelas.map((p) => ({
      ...p,
      preferencias: (() => {
        const fila = prefs.find((x) => x.parcelaId === p.id);
        return fila ? aPreferencias(fila) : null;
      })(),
      historial: hist.filter((h) => h.parcelaId === p.id).map(aRegistro),
    }));
  }

  // ----------------------------------------------------------------------------------- escrituras
  /**
   * Crea la parcela con sus preferencias y su historial en UNA transacción: si cualquier paso falla (un cultivo que
   * no existe, un año repetido, una forma inválida) no queda nada guardado. Con `claveIdempotencia`, repetir la
   * llamada devuelve la parcela ya creada en lugar de duplicarla.
   */
  async crear(input: CrearParcelaInput): Promise<ParcelaFila> {
    const geometria = geometriaDe(input, true)!;
    const clave = input.claveIdempotencia ?? null;
    try {
      return await this.transaccion.ejecutar(async (tx) => {
        if (clave) {
          const previa = await this.buscarPorClave(tx, clave);
          if (previa) return previa;
        }
        if (input.cultivoActual) await this.cultivos.validarCodigos(tx, [input.cultivoActual]);
        const creada = await this.insertar(tx, input, geometria, clave);
        if (input.preferencias) await this.preferencias.guardarEn(tx, creada.id, input.preferencias);
        if (input.historial?.length) await this.historial.guardarVarios(tx, creada.id, input.historial);
        return this.obtener(creada.id, tx);
      });
    } catch (error) {
      // Dos peticiones con la misma clave a la vez: una gana, la otra cae aquí y devuelve la ganadora.
      if (clave && esLlaveDuplicada(error)) {
        const ganadora = await this.buscarPorClave(this.prisma, clave);
        if (ganadora) return ganadora;
      }
      throw error;
    }
  }

  private async buscarPorClave(cliente: Tx | PrismaService, clave: string): Promise<ParcelaFila | null> {
    const filas = await cliente.$queryRaw<FilaSql[]>(Prisma.sql`
      SELECT ${COLUMNAS} FROM "Parcela" WHERE "claveIdempotencia" = ${clave}::text
    `);
    return filas.length ? aFila(filas[0]) : null;
  }

  private async insertar(tx: Tx, input: CrearParcelaInput, geometria: GeometriaGeoJSON, clave: string | null) {
    const geojson = JSON.stringify(geometria);
    const filas = await tx.$queryRaw<FilaSql[]>(Prisma.sql`
      WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geojson}::text), 4326) AS geom)
      INSERT INTO "Parcela" ("id", "nombre", "descripcion", "cultivoActual", "claveIdempotencia", "geom",
                             "centroideLat", "centroideLon", "areaHa")
      SELECT ${randomUUID()}::uuid, ${input.nombre ?? null}::text, ${input.descripcion ?? null}::text,
             ${input.cultivoActual ?? null}::text, ${clave}::text, g.geom,
             ST_Y(ST_Centroid(g.geom)), ST_X(ST_Centroid(g.geom)),
             CASE WHEN GeometryType(g.geom) = 'POLYGON' THEN ST_Area(g.geom::geography) / 10000 END
      FROM g
      WHERE ST_IsValid(g.geom)
      RETURNING ${COLUMNAS}
    `);
    if (filas.length === 0) {
      throw new AppError(CodigoError.GEOMETRIA_INVALIDA, 'La forma de la parcela no es válida: el polígono se cruza consigo mismo.');
    }
    return aFila(filas[0]);
  }

  /**
   * Cambia campos de la parcela con bloqueo optimista: el cliente manda la versión que leyó. Si alguien más la
   * cambió mientras tanto, se rechaza (CONFLICTO_VERSION) en vez de pisar sus cambios sin avisar.
   */
  async actualizar(id: string, input: ActualizarParcelaInput): Promise<ParcelaFila> {
    const geometria = geometriaDe(input, false);
    const cambios: Prisma.Sql[] = [];
    if (input.nombre !== undefined) cambios.push(Prisma.sql`"nombre" = ${input.nombre}::text`);
    if (input.descripcion !== undefined) cambios.push(Prisma.sql`"descripcion" = ${input.descripcion}::text`);
    if (input.cultivoActual !== undefined) cambios.push(Prisma.sql`"cultivoActual" = ${input.cultivoActual}::text`);
    if (geometria) {
      const geojson = JSON.stringify(geometria);
      cambios.push(
        Prisma.sql`"geom" = ST_SetSRID(ST_GeomFromGeoJSON(${geojson}::text), 4326)`,
        Prisma.sql`"centroideLat" = ST_Y(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON(${geojson}::text), 4326)))`,
        Prisma.sql`"centroideLon" = ST_X(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON(${geojson}::text), 4326)))`,
        Prisma.sql`"areaHa" = CASE WHEN GeometryType(ST_SetSRID(ST_GeomFromGeoJSON(${geojson}::text), 4326)) = 'POLYGON'
                   THEN ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(${geojson}::text), 4326)::geography) / 10000 END`,
      );
    }
    if (!cambios.length) throw new AppError(CodigoError.VALIDACION_FALLIDA, 'No indicaste ningún cambio para la parcela.');

    return this.transaccion.ejecutar(async (tx) => {
      if (input.cultivoActual) await this.cultivos.validarCodigos(tx, [input.cultivoActual]);
      const filas = await tx.$queryRaw<FilaSql[]>(Prisma.sql`
        UPDATE "Parcela"
        SET ${Prisma.join(cambios, ', ')}, "version" = "version" + 1, "actualizadaEn" = now()
        WHERE "id" = ${id}::uuid AND "version" = ${input.version}
          ${geometria ? Prisma.sql`AND ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometria)}::text), 4326))` : Prisma.empty}
        RETURNING ${COLUMNAS}
      `);
      if (filas.length) return aFila(filas[0]);
      // No se actualizó nada: ¿no existe, la versión cambió o la forma era inválida?
      const actual = await this.buscar(id, tx);
      if (!actual) throw noEncontrado('esa parcela');
      if (actual.version !== input.version) {
        throw new AppError(
          CodigoError.CONFLICTO_VERSION,
          'La parcela cambió mientras la editabas. Vuelve a cargarla y repite tu cambio.',
        );
      }
      throw new AppError(CodigoError.GEOMETRIA_INVALIDA, 'La forma de la parcela no es válida: el polígono se cruza consigo mismo.');
    });
  }

  /** Borra la parcela (y en cascada sus preferencias, historial y escenarios) si la versión sigue siendo la que el cliente vio. */
  async eliminar(id: string, version: number): Promise<boolean> {
    return this.transaccion.ejecutar(async (tx) => {
      const borradas = await tx.$executeRaw`DELETE FROM "Parcela" WHERE "id" = ${id}::uuid AND "version" = ${version}`;
      if (borradas > 0) return true;
      const actual = await this.buscar(id, tx);
      if (!actual) throw noEncontrado('esa parcela');
      throw new AppError(CodigoError.CONFLICTO_VERSION, 'La parcela cambió mientras la editabas. Vuelve a cargarla antes de eliminarla.');
    });
  }
}
