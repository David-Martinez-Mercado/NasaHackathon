import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/config.service';

/** Respuesta del servicio de ml/ (`POST /predict`), ya validada. Los nombres vienen en snake_case de Python. */
export interface RespuestaConcepto {
  concept: string;
  title: string;
  unit: string;
  horizon: string;
  available: boolean;
  value: number | null;
  series: number[] | null;
  as_of: string | null;
  role: string;
  algorithm: string;
  scenario_applied: boolean;
  notes: string[];
  reason: string | null;
}

export interface RespuestaServicio {
  site_used: string;
  site_distance_km: number;
  latency_ms: number;
  data: { last_date: string; age_days: number; stale: boolean };
  results: RespuestaConcepto[];
  warnings: string[];
}

/** Por qué falló la llamada: sirve para decidir si se usa el respaldo del lote o se avisa al usuario. */
export class ErrorServicioMl extends Error {
  constructor(
    readonly tipo: 'red' | 'tiempo' | 'http' | 'respuesta',
    mensaje: string,
    readonly estado?: number,
  ) {
    super(mensaje);
  }
}

const esTexto = (v: unknown): v is string => typeof v === 'string';
const esNumeroONulo = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v));

/** No se confía en lo que llega por la red: la forma se comprueba antes de usarla. */
export function validarRespuesta(json: unknown): RespuestaServicio {
  const r = json as Record<string, any>;
  const malo = (donde: string) => new ErrorServicioMl('respuesta', `Respuesta del servicio de ML no válida (${donde})`);
  if (!r || typeof r !== 'object' || !Array.isArray(r.results) || !r.data || typeof r.data !== 'object') throw malo('estructura');
  if (!esTexto(r.data.last_date) || !Number.isFinite(r.data.age_days)) throw malo('data');
  for (const c of r.results) {
    if (!c || !esTexto(c.concept) || !esTexto(c.title) || typeof c.available !== 'boolean') throw malo('resultado');
    if (!esNumeroONulo(c.value ?? null) || (c.series != null && !Array.isArray(c.series))) throw malo(`valor de ${c.concept}`);
  }
  return {
    site_used: String(r.site_used ?? ''),
    site_distance_km: Number(r.site_distance_km ?? 0),
    latency_ms: Number(r.latency_ms ?? 0),
    data: { last_date: r.data.last_date, age_days: Number(r.data.age_days), stale: r.data.stale === true },
    warnings: Array.isArray(r.warnings) ? r.warnings.map(String) : [],
    results: r.results.map((c: Record<string, any>) => ({
      concept: c.concept, title: c.title, unit: String(c.unit ?? ''), horizon: String(c.horizon ?? ''), available: c.available,
      value: c.value ?? null, series: c.series ?? null, as_of: c.as_of ?? null, role: String(c.role ?? 'modelo'),
      algorithm: String(c.algorithm ?? ''), scenario_applied: c.scenario_applied === true,
      notes: Array.isArray(c.notes) ? c.notes.map(String) : [], reason: c.reason ?? null,
    })),
  };
}

@Injectable()
export class MlVivoCliente {
  constructor(private readonly config: AppConfig) {}

  get configurado(): boolean {
    return !!this.config.env.ML_SERVICE_URL;
  }

  private cabeceras(): Record<string, string> {
    const token = this.config.env.ML_SERVICE_TOKEN;
    return { 'content-type': 'application/json', ...(token ? { 'x-ml-token': token } : {}) };
  }

  private async pedir(ruta: string, init: RequestInit, tiempoMs: number): Promise<unknown> {
    const base = (this.config.env.ML_SERVICE_URL ?? '').replace(/\/+$/, '');
    const limite = AbortSignal.timeout(tiempoMs);
    let respuesta: Response;
    try {
      respuesta = await fetch(`${base}${ruta}`, { ...init, signal: limite });
    } catch {
      // fetch envuelve el motivo de la cancelación: se decide por el estado de la señal, no por el nombre del error
      const tiempo = limite.aborted;
      throw new ErrorServicioMl(tiempo ? 'tiempo' : 'red', tiempo ? `El servicio de ML no respondió en ${tiempoMs} ms` : 'No se pudo conectar con el servicio de ML');
    }
    if (!respuesta.ok) {
      let detalle = '';
      try {
        detalle = String(((await respuesta.json()) as { detail?: unknown }).detail ?? '');
      } catch {
        /* el cuerpo no era JSON */
      }
      throw new ErrorServicioMl('http', detalle || `El servicio de ML respondió ${respuesta.status}`, respuesta.status);
    }
    try {
      return await respuesta.json();
    } catch {
      throw new ErrorServicioMl('respuesta', 'El servicio de ML no devolvió JSON');
    }
  }

  async predecir(lat: number, lon: number, escenario?: { rain_pct: number; temp_delta: number }): Promise<RespuestaServicio> {
    const cuerpo = JSON.stringify({ lat, lon, ...(escenario ? { scenario: escenario } : {}) });
    return validarRespuesta(await this.pedir('/predict', { method: 'POST', headers: this.cabeceras(), body: cuerpo }, this.config.env.ML_SERVICE_TIMEOUT_MS));
  }

  /** Para /health: una consulta barata con tiempo límite corto. */
  async salud(): Promise<{ ok: boolean; detalle?: string }> {
    if (!this.configurado) return { ok: false, detalle: 'ML_SERVICE_URL no está definida: se usan las predicciones del último lote' };
    try {
      const r = (await this.pedir('/health', { method: 'GET' }, 1500)) as { estado?: string; modelos?: string[] };
      return r.estado === 'ok' ? { ok: true, detalle: `modelos: ${(r.modelos ?? []).join(', ')}` } : { ok: false, detalle: 'el servicio está degradado' };
    } catch (error) {
      return { ok: false, detalle: error instanceof Error ? error.message : 'no responde' };
    }
  }
}
