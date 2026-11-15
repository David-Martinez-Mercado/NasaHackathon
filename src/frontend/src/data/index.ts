/**
 * Single entry point for data: every function here is one /graphql query or mutation against the backend
 * (docs/frontend-queries.graphql). Components import only from here and never build queries themselves.
 * Nothing is invented on the client: what the server does not have is reported as unavailable.
 */
import { ApiError, gql } from './api';
import type {
  AlertSummary, ClimateSummary, ColorStop, Crop, Field, GridLayer, HumiditySummary, LayerKind, LngLat, MapPoint,
  NewField, PlotRecord, Ring, Scenario, Series, ServerStatus, Severity,
} from './types';

export * from './types';
export { ApiError, errorMessage } from './api';

export const DEFAULT_SCENARIO: Scenario = { rainPct: 0, tempDelta: 0 };
/** Used until the first field exists (Weld County, CO: the area the data covers). */
export const DEFAULT_CENTER: LngLat = [-104.71, 40.42];
export const DEFAULT_ZOOM = 11;

/* ---------- fields ---------- */

interface RawField {
  id: string;
  version: number;
  nombre: string | null;
  descripcion: string | null;
  cultivoActual: string | null;
  areaHa: number | null;
  latitud: number;
  longitud: number;
  geometria: { type: string; coordinates: unknown } | null;
  historial: { anio: number; cultivo: string; fechaSiembra: string | null; descripcion: string | null }[];
}

const FIELD_FIELDS = `id version nombre descripcion cultivoActual areaHa latitud longitud geometria
  historial { anio cultivo fechaSiembra descripcion }`;

function toBoundary(geometry: RawField['geometria']): Ring {
  if (geometry?.type !== 'Polygon') return [];
  const ring = (geometry.coordinates as number[][][])[0] ?? [];
  const points = ring.map(([lng, lat]) => [lng, lat] as LngLat);
  const first = points[0];
  const last = points[points.length - 1];
  return points.length > 1 && first[0] === last[0] && first[1] === last[1] ? points.slice(0, -1) : points;
}

const toField = (f: RawField): Field => {
  const boundary = toBoundary(f.geometria);
  return {
    id: f.id,
    version: f.version,
    name: f.nombre ?? 'Unnamed field',
    description: f.descripcion ?? '',
    crop: f.cultivoActual ?? '',
    areaHa: f.areaHa,
    center: [f.longitud, f.latitud],
    zoom: boundary.length ? 15.6 : 13,
    boundary,
    history: f.historial
      .map((h): PlotRecord => ({ year: h.anio, crop: h.cultivo, plantedOn: h.fechaSiembra, description: h.descripcion ?? '' }))
      .sort((a, b) => b.year - a.year),
  };
};

export async function fetchFields(): Promise<Field[]> {
  const data = await gql<{ parcelas: RawField[] }>(`query { parcelas(limite: 100) { ${FIELD_FIELDS} } }`);
  return data.parcelas.map(toField);
}

export async function fetchCrops(): Promise<Crop[]> {
  const data = await gql<{ cultivos: { codigo: string; nombre: string }[] }>('query { cultivos { codigo nombre } }');
  return data.cultivos.map((c) => ({ code: c.codigo, name: c.nombre }));
}

const IRRIGATION = { Rainfed: 'TEMPORAL', Gravity: 'GRAVEDAD', Sprinkler: 'ASPERSION', Drip: 'GOTEO' } as const;
const SOIL = { Clay: 'ARCILLOSO', Sandy: 'ARENOSO', Loam: 'FRANCO', 'Use satellite data': 'SATELITAL' } as const;
const EQUIPMENT_CODE: Record<string, string> = {
  'Seed drill': 'seed-drill', 'Row crop planter': 'row-crop-planter', 'No-till drill': 'no-till-drill',
};

/** One atomic mutation: field + preferences are saved together or not at all. `retryKey` makes a retry safe (no duplicates). */
export async function createField(f: NewField, retryKey: string): Promise<Field> {
  const [agua, suelo, erosion, ingreso] = f.priorities;
  const monthsSet = f.monthsEmptyFrom != null && f.monthsEmptyTo != null;
  const ring = f.polygon.map(([lng, lat]) => [lng, lat]);
  const input = {
    claveIdempotencia: retryKey,
    nombre: f.name.trim() || undefined,
    descripcion: f.description.trim() || undefined,
    cultivoActual: f.crop || undefined,
    poligono: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
    preferencias: {
      sistemaRiego: IRRIGATION[f.irrigation],
      tipoSuelo: SOIL[f.soil],
      maquinaria: f.equipment.map((e) => EQUIPMENT_CODE[e]).filter(Boolean),
      ...(monthsSet ? { mesesVaciosDesde: f.monthsEmptyFrom, mesesVaciosHasta: f.monthsEmptyTo } : {}),
      prioridades: { agua, suelo, erosion, ingreso },
    },
  };
  const data = await gql<{ crearParcela: RawField }>(
    `mutation($input: CrearParcelaInput!) { crearParcela(input: $input) { ${FIELD_FIELDS} } }`,
    { input },
  );
  return toField(data.crearParcela);
}

export async function saveHistory(fieldId: string, record: { year: number; crop: string; plantedOn: string | null; description: string }) {
  await gql(
    `mutation($id: ID!, $input: HistorialInput!) { guardarHistorial(parcelaId: $id, input: $input) { anio } }`,
    {
      id: fieldId,
      input: {
        anio: record.year,
        cultivo: record.crop,
        descripcion: record.description.trim() || null,
        ...(record.plantedOn ? { fechaSiembra: record.plantedOn } : {}),
      },
    },
  );
}

/* ---------- map layers ---------- */

const LAYER_TYPE: Record<LayerKind, string> = {
  temperature: 'TEMPERATURA', humidity: 'HUMEDAD', rain: 'LLUVIA', drought: 'SEQUIA', vulnerability: 'VULNERABILIDAD',
};
const LAYER_LOOK: Record<LayerKind, { title: string; clipToFields: boolean; fadeLow: boolean }> = {
  temperature: { title: 'Heat-wave risk', clipToFields: false, fadeLow: false },
  humidity: { title: 'Soil moisture', clipToFields: false, fadeLow: true },
  rain: { title: 'Rain probability', clipToFields: false, fadeLow: true },
  drought: { title: 'Drought risk', clipToFields: false, fadeLow: true },
  vulnerability: { title: 'Vulnerability', clipToFields: true, fadeLow: false },
};
/** Layers the "What if?" sliders change (the model's sensitivity, not a climate projection). */
export const SCENARIO_LAYERS: readonly LayerKind[] = ['temperature', 'rain'];

export async function fetchLayer(kind: LayerKind, scenario: Scenario): Promise<GridLayer> {
  const data = await gql<{ capa: RawLayer | null }>(
    `query($tipo: TipoCapa!, $escenario: EscenarioInput) { capa(tipo: $tipo, escenario: $escenario) {
        unidad min max leyenda fuente resolucionM interpolada datosAl notas
        rampa { en color } rejilla { bbox columnas filas valores } escenario { aplica } } }`,
    {
      tipo: LAYER_TYPE[kind],
      escenario: SCENARIO_LAYERS.includes(kind) ? { lluviaPct: Math.round(scenario.rainPct), tempDeltaC: scenario.tempDelta } : null,
    },
  );
  const c = data.capa;
  if (!c) throw new ApiError('This layer is not loaded on the server yet.', 'SIN_CAPA');
  const look = LAYER_LOOK[kind];
  return {
    kind,
    title: look.title,
    unit: c.unidad,
    min: c.min,
    max: c.max,
    ramp: c.rampa.map((p): ColorStop => ({ at: p.en, color: p.color })),
    legend: c.leyenda,
    grid: { bbox: c.rejilla.bbox, cols: c.rejilla.columnas, rows: c.rejilla.filas, values: c.rejilla.valores },
    clipToFields: look.clipToFields,
    fadeLow: look.fadeLow,
    source: c.fuente,
    resolutionMeters: c.resolucionM,
    interpolated: c.interpolada,
    dataAsOf: c.datosAl,
    notes: c.notas,
    scenarioApplies: c.escenario.aplica,
  };
}

interface RawLayer {
  unidad: string;
  min: number;
  max: number;
  leyenda: string[];
  fuente: string;
  resolucionM: number;
  interpolada: boolean;
  datosAl: string;
  notas: string[];
  rampa: { en: number; color: string }[];
  rejilla: { bbox: [number, number, number, number]; columnas: number; filas: number; valores: (number | null)[] };
  escenario: { aplica: boolean };
}

/** Value of a layer at a place (nearest cell); null when the cell has no data or the place is outside the grid. */
export function valueAt(layer: GridLayer, at: LngLat): number | null {
  const [w, s, e, n] = layer.grid.bbox;
  const [lng, lat] = at;
  if (lng < w || lng > e || lat < s || lat > n) return null;
  const col = Math.min(layer.grid.cols - 1, Math.floor(((lng - w) / (e - w)) * layer.grid.cols));
  const row = Math.min(layer.grid.rows - 1, Math.floor(((n - lat) / (n - s)) * layer.grid.rows));
  return layer.grid.values[row * layer.grid.cols + col] ?? null;
}

/* ---------- points, alerts, summaries ---------- */

const SEVERITY: Record<string, Severity> = { ALTA: 'high', MEDIA: 'medium', BAJA: 'low' };

export async function fetchStressPoints(): Promise<MapPoint[]> {
  const data = await gql<{
    puntos: { puntos: { id: string; latitud: number; longitud: number; severidad: string | null; etiqueta: string | null }[] } | null;
  }>('query { puntos(tipo: ESTRES) { puntos { id latitud longitud severidad etiqueta } } }');
  return (data.puntos?.puntos ?? []).map((p) => ({
    id: p.id,
    position: [p.longitud, p.latitud],
    kind: 'stress',
    label: p.severidad === 'ALTA' ? 'Critical stress point' : undefined,
    severity: p.severidad ? SEVERITY[p.severidad] : undefined,
  }));
}

export async function fetchAlerts(): Promise<AlertSummary[]> {
  const data = await gql<{ alertas: { tipo: string; valor: number; unidad: string; detalle: string; definicion: string }[] }>(
    'query { alertas { tipo valor unidad detalle definicion } }',
  );
  const byKind = new Map(data.alertas.map((a) => [a.tipo, a]));
  const make = (kind: 'drought' | 'stress', title: string): AlertSummary => {
    const a = byKind.get(kind);
    return a
      ? { kind, title, value: `${a.valor}${a.unidad}`, detail: a.detalle, definition: a.definicion, available: true }
      : { kind, title, value: 'N/A', detail: 'Not loaded on the server yet', definition: '', available: false };
  };
  return [
    { kind: 'erosion', title: 'Erosion points', value: 'N/A', detail: 'No erosion data or model yet', definition: '', available: false },
    make('drought', 'Droughts'),
    make('stress', 'Stress points'),
  ];
}

export async function fetchHumidity(): Promise<HumiditySummary | null> {
  const data = await gql<{
    resumenHumedad: { raiz: number; superficie: number; evaporacion: number; percentil: number; datosAl: string; fuente: string } | null;
  }>('query { resumenHumedad { raiz superficie evaporacion percentil datosAl fuente } }');
  const h = data.resumenHumedad;
  if (!h) return null;
  return {
    root: h.raiz,
    surface: h.superficie,
    evaporation: h.evaporacion,
    percentile: h.percentil,
    status: h.percentil < 25 ? 'Below normal' : h.percentil > 75 ? 'Above normal' : 'Normal',
    source: h.fuente,
    asOf: h.datosAl,
  };
}

export async function fetchClimate(): Promise<ClimateSummary | null> {
  const data = await gql<{
    resumenClima: {
      lluviaMananaPct: number | null; lluviaMensualMm: number[]; temperaturaMaxC: number | null;
      temperaturaMinC: number | null; temperaturaMediaC: number | null; datosAl: string; notas: string[];
    } | null;
  }>(`query { resumenClima { lluviaMananaPct lluviaMensualMm temperaturaMaxC temperaturaMinC temperaturaMediaC datosAl notas } }`);
  const c = data.resumenClima;
  if (!c) return null;
  return {
    tempMax: c.temperaturaMaxC,
    tempMin: c.temperaturaMinC,
    tempMean: c.temperaturaMediaC,
    rainNextMonthMm: c.lluviaMensualMm[0] ?? null,
    rainNextDayPct: c.lluviaMananaPct,
    asOf: c.datosAl,
    notes: c.notas,
  };
}

export async function fetchSeries(prefix: 'market:' | 'statistics:'): Promise<Series[]> {
  const data = await gql<{
    series: {
      clave: string; titulo: string; unidad: string; fuente: string; etiquetaA: string | null; etiquetaB: string | null;
      notas: string[]; puntos: { etiqueta: string; a: number | null; b: number | null; pronostico: boolean }[];
    }[];
  }>(
    `query($p: String) { series(prefijo: $p) { clave titulo unidad fuente etiquetaA etiquetaB notas puntos { etiqueta a b pronostico } } }`,
    { p: prefix },
  );
  return data.series.map((s) => ({
    id: s.clave,
    title: s.titulo,
    unit: s.unidad,
    source: s.fuente,
    labelA: s.etiquetaA,
    labelB: s.etiquetaB,
    notes: s.notas,
    points: s.puntos.map((p) => ({ label: p.etiqueta, a: p.a, b: p.b, forecast: p.pronostico })),
  }));
}

/** What the app asks for but has no model or data for (erosion, water reserves…). */
export async function fetchUnavailable(): Promise<string[]> {
  return (await gql<{ datosNoDisponibles: string[] }>('query { datosNoDisponibles }')).datosNoDisponibles;
}

export async function fetchStatus(): Promise<ServerStatus> {
  const data = await gql<{
    salud: { fuentes: { nombre: string; estado: string }[] };
    estadoPredicciones: { version: string } | null;
  }>('query { salud { fuentes { nombre estado } } estadoPredicciones { version } }');
  return {
    motorAvailable: data.salud.fuentes.find((f) => f.nombre === 'motor de reglas')?.estado === 'OK',
    predictionsVersion: data.estadoPredicciones?.version ?? null,
  };
}
