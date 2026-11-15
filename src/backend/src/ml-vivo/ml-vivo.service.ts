import { Injectable, Logger } from '@nestjs/common';
import { TipoCapa } from '@prisma/client';
import { AppError, CodigoError, noEncontrado } from '../common/errors';
import { AppConfig } from '../config/config.service';
import { PrediccionesService } from '../predicciones/predicciones.service';
import { valorEn } from '../predicciones/riesgos.service';
import { PrismaService } from '../prisma/prisma.service';
import { ErrorServicioMl, MlVivoCliente, RespuestaConcepto, RespuestaServicio } from './ml-vivo.cliente';
import { FuenteDato, PrediccionesVivas, ResultadoVivo } from './ml-vivo.model';

/** Rangos que acepta el servicio de ml/ (los de los sliders de la app). */
const LLUVIA_PCT = { min: -50, max: 50 };
const TEMP_C = { min: -2, max: 4 };
const limitar = (v: number, r: { min: number; max: number }) => Math.min(r.max, Math.max(r.min, v));
const dias = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(`${iso}T00:00:00Z`).getTime()) / 86_400_000));

@Injectable()
export class MlVivoService {
  private readonly log = new Logger(MlVivoService.name);
  private fallos = 0;
  private abiertoHasta = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cliente: MlVivoCliente,
    private readonly predicciones: PrediccionesService,
    private readonly config: AppConfig,
  ) {}

  /** Circuit breaker: tras varios fallos seguidos no se vuelve a llamar al servicio durante un rato (se usa el lote). */
  private get abierto(): boolean {
    return Date.now() < this.abiertoHasta;
  }

  private registrarFallo(): void {
    this.fallos += 1;
    if (this.fallos >= this.config.env.ML_SERVICE_BREAKER_FAILURES) {
      this.abiertoHasta = Date.now() + this.config.env.ML_SERVICE_BREAKER_RESET_MS;
      this.log.warn(`Servicio de ML fuera de línea tras ${this.fallos} fallos: se usará el lote ${this.config.env.ML_SERVICE_BREAKER_RESET_MS / 1000} s`);
    }
  }

  async predecir(parcelaId: string, escenario?: { lluviaPct: number; tempDeltaC: number }): Promise<PrediccionesVivas> {
    const parcela = await this.prisma.parcela.findUnique({ where: { id: parcelaId }, select: { centroideLat: true, centroideLon: true } });
    if (!parcela) throw noEncontrado('esa parcela');
    const advertencias: string[] = [];
    let enviado: { rain_pct: number; temp_delta: number } | undefined;
    if (escenario) {
      enviado = { rain_pct: limitar(escenario.lluviaPct, LLUVIA_PCT), temp_delta: limitar(escenario.tempDeltaC, TEMP_C) };
      if (enviado.rain_pct !== escenario.lluviaPct || enviado.temp_delta !== escenario.tempDeltaC) {
        advertencias.push('El escenario se ajustó a lo que calculan los modelos (lluvia de −50 a +50 %, temperatura de −2 a +4 °C).');
      }
    }

    if (this.cliente.configurado && !this.abierto) {
      try {
        const r = await this.cliente.predecir(parcela.centroideLat, parcela.centroideLon, enviado);
        this.fallos = 0;
        return this.desdeServicio(r, advertencias);
      } catch (error) {
        if (error instanceof ErrorServicioMl && error.tipo === 'http' && error.estado === 422) {
          // fuera de la zona de entrenamiento: el lote tampoco tendría un dato honesto para este punto
          return this.sinDato(error.message, advertencias);
        }
        this.registrarFallo();
        const motivo = error instanceof Error ? error.message : 'error desconocido';
        this.log.warn(`Servicio de ML: ${motivo}`);
        advertencias.push(
          error instanceof ErrorServicioMl && (error.estado === 401 || error.estado === 403)
            ? 'El backend no tiene un token válido para el servicio de ML: se muestran las predicciones del último lote.'
            : `No se pudo consultar los datos frescos (${motivo}): se muestran las predicciones del último lote.`,
        );
      }
    } else if (this.cliente.configurado) {
      advertencias.push('El servicio de predicciones en vivo está fuera de línea: se muestran las predicciones del último lote.');
    } else {
      advertencias.push('El servicio de predicciones en vivo no está configurado: se muestran las predicciones del último lote.');
    }
    return this.desdeLote(parcela.centroideLat, parcela.centroideLon, advertencias);
  }

  // -------------------------------------------------------------------------------------------- en vivo
  private desdeServicio(r: RespuestaServicio, advertencias: string[]): PrediccionesVivas {
    const resultados = r.results.map((c): ResultadoVivo => this.resultado(c, FuenteDato.VIVO));
    return {
      fuente: FuenteDato.VIVO, datosAl: r.data.last_date, antiguedadDias: r.data.age_days, obsoleto: r.data.stale,
      sitio: r.site_used, distanciaKm: r.site_distance_km, latenciaMs: r.latency_ms, generadoEn: new Date().toISOString(),
      resultados, advertencias: [...advertencias, ...r.warnings],
    };
  }

  private resultado(c: RespuestaConcepto, fuente: FuenteDato): ResultadoVivo {
    return {
      concepto: c.concept, titulo: c.title, unidad: c.unit, horizonte: c.horizon, disponible: c.available, valor: c.value,
      serie: c.series, datosAl: c.as_of, rol: c.role, algoritmo: c.algorithm, escenarioAplicado: c.scenario_applied, notas: c.notes,
      motivo: c.reason, fuente,
    };
  }

  private sinDato(motivo: string, advertencias: string[]): PrediccionesVivas {
    return {
      fuente: FuenteDato.NO_DISPONIBLE, datosAl: null, antiguedadDias: null, obsoleto: false, generadoEn: new Date().toISOString(),
      resultados: [], advertencias: [...advertencias, motivo],
    };
  }

  // ---------------------------------------------------------------------------- respaldo: el último lote
  /** Lo que ya está en PostgreSQL desde el export de ml/. Es otro cálculo (promedio de temporada, 2 puntos): se rotula como LOTE. */
  private async desdeLote(lat: number, lon: number, advertencias: string[]): Promise<PrediccionesVivas> {
    const version = await this.predicciones.versionActiva();
    if (!version) {
      throw new AppError(CodigoError.FUENTE_NO_DISPONIBLE, 'No hay predicciones en vivo ni de lote: el servicio de ML no responde y todavía no se importó ninguna versión.');
    }
    const defs: { concepto: string; tipo: TipoCapa; titulo: string; horizonte: string; nota: string }[] = [
      { concepto: 'c05b', tipo: TipoCapa.TEMPERATURA, titulo: 'Riesgo de ola de calor', horizonte: 'temporada de calor (promedio)',
        nota: 'Del lote: promedio de la temporada de calor más reciente, no el pronóstico de los próximos 7 días.' },
      { concepto: 'c08a', tipo: TipoCapa.LLUVIA, titulo: 'Probabilidad de lluvia mañana', horizonte: 'mañana',
        nota: 'Del lote: valor de la fecha del último export.' },
      { concepto: 'c04', tipo: TipoCapa.HUMEDAD, titulo: 'Humedad de la zona de raíces', horizonte: 'próximas 4 semanas',
        nota: 'Del lote: valor de la fecha del último export.' },
    ];
    const resultados: ResultadoVivo[] = [];
    for (const d of defs) {
      const capa = await this.predicciones.capa(d.tipo);
      const valor = capa ? valorEn(capa, lat, lon) : null;
      resultados.push({
        concepto: d.concepto, titulo: d.titulo, unidad: capa?.unidad ?? '%', horizonte: d.horizonte, disponible: valor != null, valor,
        serie: null, datosAl: capa?.datosAl ?? null, rol: 'modelo', algoritmo: capa?.concepto ?? d.concepto, escenarioAplicado: false,
        notas: [d.nota], motivo: valor == null ? 'La capa del lote no tiene valor en este punto.' : null, fuente: FuenteDato.LOTE,
      });
    }
    const clima = await this.predicciones.resumenClima();
    if (clima?.lluviaMensualMm?.length) {
      resultados.push({
        concepto: 'c08b', titulo: 'Lluvia mensual esperada', unidad: 'mm', horizonte: 'próximos 6 meses', disponible: true,
        valor: clima.lluviaMensualMm[0], serie: clima.lluviaMensualMm, datosAl: clima.datosAl, rol: 'regla-base', algoritmo: 'Climatología mensual',
        escenarioAplicado: false, notas: ['Del lote: climatología mensual.'], motivo: null, fuente: FuenteDato.LOTE,
      });
    }
    const fechas = resultados.map((r) => r.datosAl).filter((x): x is string => !!x).sort();
    const masViejo = fechas[0] ?? null;
    return {
      fuente: FuenteDato.LOTE, datosAl: masViejo, antiguedadDias: masViejo ? dias(masViejo) : null, obsoleto: true, sitio: null,
      distanciaKm: null, latenciaMs: null, generadoEn: new Date().toISOString(), resultados, advertencias,
    };
  }
}
