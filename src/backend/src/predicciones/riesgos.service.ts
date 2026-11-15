import { Injectable } from '@nestjs/common';
import { Prisma, TipoCapa } from '@prisma/client';
import { noEncontrado } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { CapaMapaTipo } from './predicciones.model';
import { PrediccionesService } from './predicciones.service';
import { RiesgosParcelaTipo, RiesgoZonaTipo } from './sugerencias.model';

export type Nivel = 'BAJO' | 'MEDIO' | 'ALTO';
export const NIVEL_NUM: Record<Nivel, number> = { BAJO: 0, MEDIO: 0.5, ALTO: 1 };

/** Umbrales PROVISIONALES de cada riesgo ([POR VERIFICAR] con el agrónomo): hasta `bajo` es BAJO, hasta `medio` es MEDIO, más es ALTO. */
const UMBRALES = {
  calor: { bajo: 20, medio: 40 }, // % de probabilidad de ola de calor (exposición media de verano)
  sequia: { bajo: 25, medio: 50 }, // % de riesgo de sequía a 3 meses
  vulnerabilidad: { bajo: 33, medio: 66 }, // índice relativo 0–100
  erosion: { bajo: 33, medio: 66 }, // percentil del potencial de erosión entre los píxeles de cultivo
} as const;
const RADIO_ESTRES_KM = 10;

const nivelPor = (valor: number, u: { bajo: number; medio: number }): Nivel => (valor < u.bajo ? 'BAJO' : valor < u.medio ? 'MEDIO' : 'ALTO');
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** Valor de una capa en un punto (celda más cercana); null si cae fuera de la rejilla o la celda no tiene dato. */
export function valorEn(capa: CapaMapaTipo, lat: number, lon: number): number | null {
  const [oeste, sur, este, norte] = capa.rejilla.bbox;
  if (lon < oeste || lon > este || lat < sur || lat > norte) return null;
  const { columnas, filas, valores } = capa.rejilla;
  const col = Math.min(columnas - 1, Math.floor(((lon - oeste) / (este - oeste)) * columnas));
  const fila = Math.min(filas - 1, Math.floor(((norte - lat) / (norte - sur)) * filas));
  return valores[fila * columnas + col] ?? null;
}

@Injectable()
export class RiesgosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly predicciones: PrediccionesService,
  ) {}

  async paraParcela(parcelaId: string): Promise<RiesgosParcelaTipo> {
    const parcela = await this.prisma.parcela.findUnique({ where: { id: parcelaId }, select: { centroideLat: true, centroideLon: true } });
    if (!parcela) throw noEncontrado('That field');
    return this.enPunto(parcela.centroideLat, parcela.centroideLon);
  }

  async enPunto(lat: number, lon: number): Promise<RiesgosParcelaTipo> {
    const version = await this.predicciones.versionActiva();
    if (!version) await this.predicciones.capa(TipoCapa.TEMPERATURA); // lanza SIN_PREDICCIONES con su mensaje
    const [calor, sequia, vulnerabilidad, erosion, elevacion, pendiente, humedad, clima, estres] = await Promise.all([
      this.predicciones.capa(TipoCapa.TEMPERATURA),
      this.predicciones.capa(TipoCapa.SEQUIA),
      this.predicciones.capa(TipoCapa.VULNERABILIDAD),
      this.predicciones.capa(TipoCapa.EROSION),
      this.predicciones.capa(TipoCapa.ELEVACION),
      this.predicciones.capa(TipoCapa.PENDIENTE),
      this.predicciones.resumenHumedad(),
      this.predicciones.resumenClima(),
      this.estresCerca(version?.id, lat, lon),
    ]);

    const deCapa = (clave: string, capa: CapaMapaTipo | null, modelo: string, u: { bajo: number; medio: number }): RiesgoZonaTipo => {
      const valor = capa ? valorEn(capa, lat, lon) : null;
      return {
        clave, valor, nivel: valor == null ? null : nivelPor(valor, u), unidad: capa?.unidad ?? '%', modelo,
        datosAl: capa?.datosAl ?? null, resolucionM: capa?.resolucionM ?? null, interpolada: capa?.interpolada ?? null,
      };
    };

    const riesgos: RiesgoZonaTipo[] = [
      deCapa('calor', calor, 'c05b', UMBRALES.calor),
      deCapa('sequia', sequia, 'c05a', UMBRALES.sequia),
      {
        // Percentil de humedad de la raíz contra los mismos días de años anteriores: bajo = suelo seco
        clave: 'humedad', valor: humedad?.percentil ?? null, unidad: 'percentil', modelo: 'c04', datosAl: humedad?.datosAl ?? null,
        nivel: humedad == null ? null : humedad.percentil <= 25 ? 'ALTO' : humedad.percentil <= 50 ? 'MEDIO' : 'BAJO',
        resolucionM: 50_000, interpolada: true,
      },
      {
        clave: 'estres', valor: estres.criticos, unidad: 'critical points', modelo: 'c03', datosAl: iso(version?.datosAl) ?? null,
        nivel: estres.total === 0 ? 'BAJO' : estres.criticos > 0 ? 'ALTO' : 'MEDIO',
        puntosCercanos: estres.total, puntosCriticos: estres.criticos, radioKm: RADIO_ESTRES_KM, resolucionM: 70, interpolada: false,
      },
      deCapa('vulnerabilidad', vulnerabilidad, 'c06', UMBRALES.vulnerabilidad),
      deCapa('erosion', erosion, 'erosion', UMBRALES.erosion),
      { ...deCapa('pendiente', pendiente, 'dem', UMBRALES.vulnerabilidad), nivel: null },
      { ...deCapa('elevacion', elevacion, 'dem', UMBRALES.vulnerabilidad), nivel: null, unidad: 'm' },
      {
        clave: 'lluvia', valor: clima?.lluviaMensualMm?.[0] ?? null, unidad: 'mm (next month, climatology)', modelo: 'c08b',
        datosAl: clima?.datosAl ?? null, nivel: null, resolucionM: 50_000, interpolada: true,
      },
    ];
    return {
      riesgos,
      advertencias: [
        'The levels use provisional thresholds and reanalysis data of ~25–50 km: they are for comparing areas, not for deciding.',
        'The stress points are a sample of 2,499 pixels in Weld, CO, not a walk through your field.',
        'Erosion is a relative potential (soil × slope × rain), not measured erosion or tons of soil.',
      ],
    };
  }

  /** Puntos de estrés evaluados (c03) dentro del radio, y cuántos son críticos. */
  private async estresCerca(versionId: string | undefined, lat: number, lon: number): Promise<{ total: number; criticos: number }> {
    if (!versionId) return { total: 0, criticos: 0 };
    const filas = await this.prisma.$queryRaw<{ total: number; criticos: number }[]>(Prisma.sql`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE "severidad" = 'ALTA')::int AS criticos
      FROM "PuntoMapa"
      WHERE "versionId" = ${versionId}::uuid AND "tipo" = 'ESTRES'::"TipoPunto"
        AND ST_DWithin("geom"::geography, ST_SetSRID(ST_MakePoint(${lon}::float8, ${lat}::float8), 4326)::geography, ${RADIO_ESTRES_KM * 1000}::float8)
    `);
    return filas[0] ?? { total: 0, criticos: 0 };
  }
}
