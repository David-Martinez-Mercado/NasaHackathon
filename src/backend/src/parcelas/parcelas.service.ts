import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppError, CodigoError, noEncontrado } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { GeometriaGeoJSON, punto, validarGeometria } from './geojson';
import { CrearParcelaInput } from './parcela.model';

export interface ParcelaFila {
  id: string;
  nombre: string | null;
  latitud: number;
  longitud: number;
  geometria: GeometriaGeoJSON;
  creadaEn: Date;
}

interface FilaSql {
  id: string;
  nombre: string | null;
  centroideLat: number;
  centroideLon: number;
  creadaEn: Date;
  geometria: string;
}

const aFila = (fila: FilaSql): ParcelaFila => ({
  id: fila.id,
  nombre: fila.nombre,
  latitud: fila.centroideLat,
  longitud: fila.centroideLon,
  geometria: JSON.parse(fila.geometria) as GeometriaGeoJSON,
  creadaEn: fila.creadaEn,
});

@Injectable()
export class ParcelasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crea una parcela desde un punto o un polígono. El SQL va parametrizado (nunca se concatena texto). */
  async crear(input: CrearParcelaInput): Promise<ParcelaFila> {
    if (!!input.punto === !!input.poligono) {
      throw new AppError(CodigoError.VALIDACION_FALLIDA, 'Indica el punto o el polígono de la parcela (solo uno de los dos).');
    }
    const geometria = input.punto
      ? punto(input.punto.latitud, input.punto.longitud)
      : validarGeometria(input.poligono);
    const geojson = JSON.stringify(geometria);
    const id = randomUUID();

    const filas = await this.prisma.$queryRaw<FilaSql[]>(Prisma.sql`
      WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geojson}::text), 4326) AS geom)
      INSERT INTO "Parcela" ("id", "nombre", "geom", "centroideLat", "centroideLon")
      SELECT ${id}::uuid, ${input.nombre ?? null}::text, g.geom,
             ST_Y(ST_Centroid(g.geom)), ST_X(ST_Centroid(g.geom))
      FROM g
      WHERE ST_IsValid(g.geom)
      RETURNING "id", "nombre", "centroideLat", "centroideLon", "creadaEn", ST_AsGeoJSON("geom") AS geometria
    `);
    if (filas.length === 0) {
      throw new AppError(CodigoError.GEOMETRIA_INVALIDA, 'La forma de la parcela no es válida: el polígono se cruza consigo mismo.');
    }
    return aFila(filas[0]);
  }

  async buscar(id: string): Promise<ParcelaFila | null> {
    const filas = await this.prisma.$queryRaw<FilaSql[]>(Prisma.sql`
      SELECT "id", "nombre", "centroideLat", "centroideLon", "creadaEn", ST_AsGeoJSON("geom") AS geometria
      FROM "Parcela" WHERE "id" = ${id}::uuid
    `);
    return filas.length ? aFila(filas[0]) : null;
  }

  async obtener(id: string): Promise<ParcelaFila> {
    const parcela = await this.buscar(id);
    if (!parcela) throw noEncontrado('esa parcela');
    return parcela;
  }
}
