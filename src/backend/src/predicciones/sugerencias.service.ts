import { Injectable } from '@nestjs/common';
import { SistemaRiego } from '@prisma/client';
import { noEncontrado } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { PrediccionesService } from './predicciones.service';
import rasgosJson from './rasgos-cultivo.json';
import { NIVEL_NUM, Nivel, RiesgosService } from './riesgos.service';
import { AporteCultivoTipo, PesosEvaluacionTipo, SugerenciaCultivoTipo, SugerenciasCultivoTipo } from './sugerencias.model';

interface Rasgos { demandaAgua: string; nitrogeno: string; coberturaSuelo: string }
const RASGOS = rasgosJson.cultivos as Record<string, Rasgos>;
const ESCALAS = rasgosJson.escalas as Record<string, Record<string, number>>;

/** Cultivos de la tabla de rotación (CDL) que existen en el catálogo; los demás (mijo, triticale, "otro"…) no se pueden elegir. */
const CDL_A_CATALOGO: Record<string, string> = {
  alfalfa: 'alfalfa', avena: 'avena', cebada: 'cebada', maiz: 'maiz', remolacha: 'remolacha', sorgo: 'sorgo', trigo_invierno: 'trigo',
};
const CATALOGO_A_CDL = Object.fromEntries(Object.entries(CDL_A_CATALOGO).map(([cdl, cat]) => [cat, cdl]));
const REND_A_CATALOGO: Record<string, string> = { maiz_grano: 'maiz', trigo_invierno: 'trigo' };

const PESO_LOCAL = 0.15; // la práctica local observada (c02) pesa poco: no es lo que mejora la parcela
const MAX_SUGERENCIAS = 5;
const limitar = (v: number) => Math.min(1, Math.max(0, v));
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

@Injectable()
export class SugerenciasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly predicciones: PrediccionesService,
    private readonly riesgos: RiesgosService,
  ) {}

  async sugerir(parcelaId: string, probar?: { agua: number; suelo: number; erosion: number; ingreso: number }): Promise<SugerenciasCultivoTipo> {
    const parcela = await this.prisma.parcela.findUnique({
      where: { id: parcelaId },
      select: {
        cultivoActual: true, centroideLat: true, centroideLon: true, preferencias: true,
        historial: { orderBy: { anio: 'desc' }, take: 1, select: { cultivo: true } },
      },
    });
    if (!parcela) throw noEncontrado('esa parcela');
    const prefs = parcela.preferencias;
    const prioridades = probar ?? {
      agua: prefs?.prioridadAgua ?? 50, suelo: prefs?.prioridadSuelo ?? 50, erosion: prefs?.prioridadErosion ?? 50, ingreso: prefs?.prioridadIngreso ?? 50,
    };
    const base = parcela.cultivoActual ?? parcela.historial[0]?.cultivo ?? null;
    const origenBase = parcela.cultivoActual ? 'actual' : base ? 'historial' : null;
    const excluidos = new Set(prefs?.cultivosExcluidos ?? []);
    const preferidos = new Set(prefs?.cultivosPreferidos ?? []);

    const [catalogo, rotacion, rendimiento, ciclo, series, zona] = await Promise.all([
      this.prisma.cultivo.findMany(),
      this.predicciones.tabla('rotacion'),
      this.predicciones.tabla('rendimiento'),
      this.predicciones.tabla('ciclo'),
      this.predicciones.series('market:'),
      this.riesgos.enPunto(parcela.centroideLat, parcela.centroideLon),
    ]);

    // ---- datos de los modelos, por cultivo del catálogo
    const prob = new Map<string, number>();
    const baseCdl = base ? CATALOGO_A_CDL[base] : undefined;
    for (const f of (rotacion?.filas ?? []) as { prev_crop: string; next_crop: string; probability_pct: number }[]) {
      if (baseCdl && f.prev_crop === baseCdl && CDL_A_CATALOGO[f.next_crop]) prob.set(CDL_A_CATALOGO[f.next_crop], f.probability_pct);
    }
    const precio = new Map<string, { cambioPct: number; unidad: string }>();
    for (const s of series) {
      const reales = s.puntos.filter((p) => !p.pronostico && p.a != null);
      const pronos = s.puntos.filter((p) => p.pronostico && p.a != null);
      const ultimo = reales[reales.length - 1]?.a;
      const final = pronos[pronos.length - 1]?.a;
      if (ultimo && final != null) precio.set(s.clave.replace('market:', ''), { cambioPct: ((final - ultimo) / ultimo) * 100, unidad: s.unidad });
    }
    const rend = new Map<string, { estimado: number; historico: number }>();
    for (const f of (rendimiento?.filas ?? []) as { crop: string; rain_pct: number; temp_delta: number; predicted_t_ha: number; hist_yield_t_ha: number }[]) {
      const cod = REND_A_CATALOGO[f.crop];
      if (cod && f.rain_pct === 0 && f.temp_delta === 0) rend.set(cod, { estimado: f.predicted_t_ha, historico: f.hist_yield_t_ha });
    }
    const cicloDias = new Map<string, number>();
    for (const f of (ciclo?.filas ?? []) as { crop: string; year: number; median_days_last_10y: number | null }[]) {
      if (f.median_days_last_10y != null) cicloDias.set(f.crop, Math.round(f.median_days_last_10y));
    }

    // ---- pesos: prioridades del agricultor × riesgos de la zona
    const nivel = (clave: string) => NIVEL_NUM[(zona.riesgos.find((r) => r.clave === clave)?.nivel as Nivel | null) ?? 'BAJO'];
    const riesgoAgua = Math.max(nivel('sequia'), nivel('humedad'));
    const vulnerabilidad = Math.max(nivel('vulnerabilidad'), nivel('erosion')); // tierra frágil o con alto potencial de erosión
    const conRiego = !!prefs && prefs.sistemaRiego !== SistemaRiego.TEMPORAL;
    const ajustes: string[] = [];
    if (riesgoAgua > 0) ajustes.push('agua_riesgo');
    if (conRiego) ajustes.push('agua_riego');
    if (vulnerabilidad > 0) ajustes.push('erosion_vulnerabilidad');
    const pesos: PesosEvaluacionTipo = {
      agua: (prioridades.agua / 100) * (conRiego ? 0.6 : 1) * (1 + 0.5 * riesgoAgua),
      suelo: prioridades.suelo / 100,
      erosion: (prioridades.erosion / 100) * (1 + 0.5 * vulnerabilidad),
      ingreso: prioridades.ingreso / 100,
      local: PESO_LOCAL,
    };

    const familiaBase = catalogo.find((c) => c.codigo === base)?.familiaBotanica ?? null;
    const evaluar = (codigo: string): SugerenciaCultivoTipo | null => {
      const c = catalogo.find((x) => x.codigo === codigo);
      const r = RASGOS[codigo];
      if (!c || !r) return null;
      const p = prob.get(codigo) ?? null;
      const pr = precio.get(codigo) ?? null;
      const rd = rend.get(codigo) ?? null;
      const otraFamilia = familiaBase && c.familiaBotanica ? familiaBase !== c.familiaBotanica : null;

      const ingresoPartes = [pr ? limitar((pr.cambioPct + 10) / 30) : null, rd ? limitar(0.5 + (rd.estimado / rd.historico - 1) / 0.4) : null]
        .filter((x): x is number => x != null);
      const puntajes: Record<string, number | null> = {
        ingreso: media(ingresoPartes),
        suelo: media([ESCALAS.nitrogeno[r.nitrogeno], ...(otraFamilia == null ? [] : [otraFamilia ? 1 : 0])]),
        agua: ESCALAS.demandaAgua[r.demandaAgua],
        erosion: ESCALAS.coberturaSuelo[r.coberturaSuelo],
        local: p == null ? null : limitar(p / 20), // 20 % o más = puntaje completo
      };
      let suma = 0;
      let total = 0;
      const aportes: AporteCultivoTipo[] = [];
      for (const [factor, peso] of Object.entries(pesos) as [keyof PesosEvaluacionTipo, number][]) {
        // Sin dato el criterio cuenta como neutro (50): omitirlo inflaría el puntaje de los cultivos de los que se sabe menos.
        const v = puntajes[factor] ?? 0.5;
        aportes.push({ factor, puntaje: Math.round(v * 100), peso: Math.round(peso * 100) / 100, sinDato: puntajes[factor] == null });
        suma += peso * v;
        total += peso;
      }
      const preferido = preferidos.has(codigo);
      const bruto = total > 0 ? (100 * suma) / total : 0;
      return {
        cultivo: codigo, nombre: c.nombre, puntaje: Math.min(100, Math.round(bruto + (preferido ? 10 : 0))), aportes,
        probabilidadSiguientePct: p, cambioPrecioPct: pr ? Math.round(pr.cambioPct * 10) / 10 : null, unidadPrecio: pr?.unidad ?? null,
        rendimientoTHa: rd ? Math.round(rd.estimado * 10) / 10 : null, rendimientoHistoricoTHa: rd ? Math.round(rd.historico * 10) / 10 : null,
        cicloDias: cicloDias.get(codigo) ?? null, otraFamilia, fijaNitrogeno: r.nitrogeno === 'fija',
        demandaAgua: r.demandaAgua, coberturaSuelo: r.coberturaSuelo, preferido,
      };
    };

    const sugerencias = catalogo
      .filter((c) => c.codigo !== base && c.codigo !== 'barbecho' && !excluidos.has(c.codigo))
      .map((c) => evaluar(c.codigo))
      .filter((s): s is SugerenciaCultivoTipo => s != null)
      .sort((a, b) => b.puntaje - a.puntaje || a.nombre.localeCompare(b.nombre))
      .slice(0, MAX_SUGERENCIAS);

    const advertencias = [
      'Es un orden de opciones calculado con datos de Weld, CO; no sustituye la opinión de tu técnico ni de productores de tu zona.',
      'La clasificación de cada cultivo (agua, nitrógeno, cobertura del suelo) es general y no está verificada con una fuente local.',
      'La probabilidad de siembra describe lo que otros productores hicieron (clasificación satelital CDL), no lo que mejora tu suelo.',
      'El precio es nacional y su pronóstico es solo exploratorio. El rendimiento (c01) existe solo para maíz y trigo de invierno.',
    ];
    if (!base) advertencias.unshift('Indica el cultivo actual o su historial para usar la rotación y el cambio de familia.');
    return {
      cultivoBase: base, origenBase, actual: base ? evaluar(base) : null, sugerencias, prioridades, pesos, ajustes, riesgos: zona.riesgos,
      metodo:
        'Puntaje 0–100 = promedio ponderado de ingreso (precio c10 y rendimiento c01), suelo (nitrógeno y cambio de familia), agua, erosión ' +
        'y práctica local (c02). Los pesos son tus prioridades, ajustadas por los riesgos de la zona (sequía, humedad, vulnerabilidad) y el riego.',
      rasgosVerificados: rasgosJson.verificado,
      advertencias,
    };
  }
}
