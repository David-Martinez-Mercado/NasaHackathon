/**
 * Single entry point for data: every function here is one /graphql query or mutation against the backend
 * (docs/frontend-queries.graphql). Components import only from here and never build queries themselves.
 * Nothing is invented on the client: what the server does not have is reported as unavailable.
 */
import { ApiError, gql } from './api';
import { cropLabel, translateModelName, translateNote, translateSource, translateText } from './i18n';
import type {
  AlertSummary, ClimateSummary, ColorStop, Crop, Field, GridLayer, HumiditySummary, LayerKind, LngLat, MapPoint,
  CropSuggestion, CropSuggestions, FactorKey, FieldValues, Irrigation, ModelTable, NewField, PlotRecord, PredictionStatus, Priorities, Ring,
  DataSource, LiveForecast, Risk, RiskKey, RiskLevel, Scenario, Series, ServerStatus, Severity, Soil,
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
  preferencias: {
    sistemaRiego: string; tipoSuelo: string; aguaRiegoMm: number | null; mesesVaciosDesde: number | null; mesesVaciosHasta: number | null;
    maquinaria: string[]; cultivosPreferidos: string[]; cultivosExcluidos: string[];
    prioridades: { agua: number; suelo: number; erosion: number; ingreso: number };
  } | null;
}

const FIELD_FIELDS = `id version nombre descripcion cultivoActual areaHa latitud longitud geometria
  historial { anio cultivo fechaSiembra descripcion }
  preferencias { sistemaRiego tipoSuelo aguaRiegoMm mesesVaciosDesde mesesVaciosHasta maquinaria cultivosPreferidos cultivosExcluidos
    prioridades { agua suelo erosion ingreso } }`;

const IRRIGATION = { Rainfed: 'TEMPORAL', Gravity: 'GRAVEDAD', Sprinkler: 'ASPERSION', Drip: 'GOTEO' } as const;
const SOIL = { Clay: 'ARCILLOSO', Sandy: 'ARENOSO', Loam: 'FRANCO', 'Use satellite data': 'SATELITAL' } as const;
const EQUIPMENT_CODE: Record<string, string> = {
  'Seed drill': 'seed-drill', 'Row crop planter': 'row-crop-planter', 'No-till drill': 'no-till-drill',
};
const reverse = <T extends string>(map: Record<T, string>, code: string): T | undefined =>
  (Object.keys(map) as T[]).find((k) => map[k] === code);
const EQUIPMENT_LABEL = Object.fromEntries(Object.entries(EQUIPMENT_CODE).map(([label, code]) => [code, label]));

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
  const p = f.preferencias;
  return {
    id: f.id,
    version: f.version,
    name: translateText(f.nombre ?? 'Unnamed field'),
    description: f.descripcion ?? '',
    crop: f.cultivoActual ?? '',
    areaHa: f.areaHa,
    center: [f.longitud, f.latitud],
    zoom: boundary.length ? 15.6 : 13,
    boundary,
    history: f.historial
      .map((h): PlotRecord => ({ year: h.anio, crop: h.cultivo, plantedOn: h.fechaSiembra, description: h.descripcion ?? '' }))
      .sort((a, b) => b.year - a.year),
    values: {
      name: f.nombre ?? '',
      description: f.descripcion ?? '',
      crop: f.cultivoActual ?? '',
      monthsEmptyFrom: p?.mesesVaciosDesde ?? null,
      monthsEmptyTo: p?.mesesVaciosHasta ?? null,
      irrigation: (p && reverse<Irrigation>(IRRIGATION, p.sistemaRiego)) || 'Rainfed',
      soil: (p && reverse<Soil>(SOIL, p.tipoSuelo)) || 'Use satellite data',
      equipment: (p?.maquinaria ?? []).map((m) => EQUIPMENT_LABEL[m]).filter(Boolean),
      priorities: p ? [p.prioridades.agua, p.prioridades.suelo, p.prioridades.erosion, p.prioridades.ingreso] : [50, 50, 50, 50],
    },
    extras: {
      waterMm: p?.aguaRiegoMm ?? null,
      preferredCrops: p?.cultivosPreferidos ?? [],
      excludedCrops: p?.cultivosExcluidos ?? [],
      otherEquipment: (p?.maquinaria ?? []).filter((m) => !EQUIPMENT_LABEL[m]),
    },
  };
};

export async function fetchFields(): Promise<Field[]> {
  const data = await gql<{ parcelas: RawField[] }>(`query { parcelas(limite: 100) { ${FIELD_FIELDS} } }`);
  return data.parcelas.map(toField);
}

export async function fetchCrops(): Promise<Crop[]> {
  const data = await gql<{ cultivos: { codigo: string; nombre: string }[] }>('query { cultivos { codigo nombre } }');
  return data.cultivos.map((c) => ({ code: c.codigo, name: cropLabel(c.codigo, c.nombre) }));
}

function preferencesInput(v: FieldValues, extras: Field['extras']) {
  const [agua, suelo, erosion, ingreso] = v.priorities;
  const monthsSet = v.monthsEmptyFrom != null && v.monthsEmptyTo != null;
  return {
    sistemaRiego: IRRIGATION[v.irrigation],
    tipoSuelo: SOIL[v.soil],
    maquinaria: [...v.equipment.map((e) => EQUIPMENT_CODE[e]).filter(Boolean), ...extras.otherEquipment],
    ...(extras.waterMm != null && v.irrigation !== 'Rainfed' ? { aguaRiegoMm: extras.waterMm } : {}),
    cultivosPreferidos: extras.preferredCrops,
    cultivosExcluidos: extras.excludedCrops,
    ...(monthsSet ? { mesesVaciosDesde: v.monthsEmptyFrom, mesesVaciosHasta: v.monthsEmptyTo } : {}),
    prioridades: { agua, suelo, erosion, ingreso },
  };
}

const NO_EXTRAS: Field['extras'] = { waterMm: null, preferredCrops: [], excludedCrops: [], otherEquipment: [] };

/** One atomic mutation: field + preferences are saved together or not at all. `retryKey` makes a retry safe (no duplicates). */
export async function createField(f: NewField, retryKey: string): Promise<Field> {
  const ring = f.polygon.map(([lng, lat]) => [lng, lat]);
  const input = {
    claveIdempotencia: retryKey,
    nombre: f.name.trim() || undefined,
    descripcion: f.description.trim() || undefined,
    cultivoActual: f.crop || undefined,
    poligono: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
    preferencias: preferencesInput(f, NO_EXTRAS),
  };
  const data = await gql<{ crearParcela: RawField }>(
    `mutation($input: CrearParcelaInput!) { crearParcela(input: $input) { ${FIELD_FIELDS} } }`,
    { input },
  );
  return toField(data.crearParcela);
}

const UPDATE = `mutation($id: ID!, $input: ActualizarParcelaInput!) { actualizarParcela(id: $id, input: $input) { ${FIELD_FIELDS} } }`;

/**
 * Changes a saved field. Name, crop and preferences go in ONE transaction, and the server answers CONFLICTO_VERSION
 * if someone else changed the field since it was loaded.
 */
export async function updateField(field: Field, values: FieldValues): Promise<Field> {
  const input = {
    version: field.version,
    nombre: values.name.trim() || null,
    descripcion: values.description.trim() || null,
    cultivoActual: values.crop || null,
    preferencias: preferencesInput(values, field.extras),
  };
  return toField((await gql<{ actualizarParcela: RawField }>(UPDATE, { id: field.id, input })).actualizarParcela);
}

/** Changes only the current crop (used by "Switch to this crop"). */
export async function setFieldCrop(field: Field, crop: string): Promise<Field> {
  const input = { version: field.version, cultivoActual: crop };
  return toField((await gql<{ actualizarParcela: RawField }>(UPDATE, { id: field.id, input })).actualizarParcela);
}

const RISK_KEY: Record<string, RiskKey> = {
  calor: 'heat', sequia: 'drought', humedad: 'moisture', estres: 'stress', vulnerabilidad: 'vulnerability', lluvia: 'rain',
  erosion: 'erosion', pendiente: 'slope', elevacion: 'elevation',
};
const LEVEL: Record<string, RiskLevel> = { BAJO: 'low', MEDIO: 'medium', ALTO: 'high' };
const FACTOR: Record<string, FactorKey> = { ingreso: 'income', suelo: 'soil', agua: 'water', erosion: 'erosion', local: 'local' };
const TRAIT: Record<string, 'low' | 'medium' | 'high'> = { baja: 'low', media: 'medium', alta: 'high' };

interface RawRisk {
  clave: string; nivel: string | null; valor: number | null; unidad: string; modelo: string; datosAl: string | null;
  resolucionM: number | null; interpolada: boolean | null; puntosCercanos: number | null; puntosCriticos: number | null; radioKm: number | null;
}
const RISK_FIELDS = 'clave nivel valor unidad modelo datosAl resolucionM interpolada puntosCercanos puntosCriticos radioKm';
const toRisk = (r: RawRisk): Risk | null => {
  const key = RISK_KEY[r.clave];
  if (!key) return null;
  return {
    key, level: r.nivel ? LEVEL[r.nivel] ?? null : null, value: r.valor, unit: r.unidad, model: r.modelo, asOf: r.datosAl,
    resolutionMeters: r.resolucionM, interpolated: r.interpolada, nearbyPoints: r.puntosCercanos, criticalPoints: r.puntosCriticos, radiusKm: r.radioKm,
  };
};

export async function fetchRisks(fieldId: string): Promise<Risk[]> {
  const data = await gql<{ riesgosParcela: { riesgos: RawRisk[] } }>(
    `query($id: ID!) { riesgosParcela(parcelaId: $id) { riesgos { ${RISK_FIELDS} } } }`, { id: fieldId });
  return data.riesgosParcela.riesgos.map(toRisk).filter((r): r is Risk => r != null);
}

interface RawSuggestion {
  cultivo: string; nombre: string; puntaje: number; aportes: { factor: string; puntaje: number; peso: number; sinDato: boolean }[];
  probabilidadSiguientePct: number | null; cambioPrecioPct: number | null; unidadPrecio: string | null;
  rendimientoTHa: number | null; rendimientoHistoricoTHa: number | null; cicloDias: number | null; otraFamilia: boolean | null;
  fijaNitrogeno: boolean; demandaAgua: string; coberturaSuelo: string; preferido: boolean;
}
const SUGGESTION_FIELDS = `cultivo nombre puntaje aportes { factor puntaje peso sinDato } probabilidadSiguientePct cambioPrecioPct unidadPrecio
  rendimientoTHa rendimientoHistoricoTHa cicloDias otraFamilia fijaNitrogeno demandaAgua coberturaSuelo preferido`;
const toSuggestion = (x: RawSuggestion): CropSuggestion => ({
  code: x.cultivo, name: cropLabel(x.cultivo, x.nombre), score: x.puntaje,
  factors: x.aportes.map((a) => ({ key: FACTOR[a.factor], score: a.puntaje, weight: a.peso, noData: a.sinDato })).filter((f) => f.key),
  rotationPct: x.probabilidadSiguientePct, priceChangePct: x.cambioPrecioPct, priceUnit: x.unidadPrecio, otherFamily: x.otraFamilia,
  yieldTHa: x.rendimientoTHa, historicalYieldTHa: x.rendimientoHistoricoTHa, cycleDays: x.cicloDias, fixesNitrogen: x.fijaNitrogeno,
  waterDemand: TRAIT[x.demandaAgua] ?? 'medium', soilCover: TRAIT[x.coberturaSuelo] ?? 'medium', preferred: x.preferido,
});

/** Crops ranked for a field. `tryPriorities` previews other priorities without saving them. */
export async function fetchSuggestions(fieldId: string, tryPriorities?: Priorities): Promise<CropSuggestions> {
  const data = await gql<{
    sugerenciasCultivo: {
      cultivoBase: string | null; origenBase: string | null; actual: RawSuggestion | null; sugerencias: RawSuggestion[];
      prioridades: { agua: number; suelo: number; erosion: number; ingreso: number };
      pesos: { agua: number; suelo: number; erosion: number; ingreso: number; local: number };
      ajustes: string[]; riesgos: RawRisk[]; rasgosVerificados: boolean;
    };
  }>(
    `query($id: ID!, $p: PrioridadesInput) { sugerenciasCultivo(parcelaId: $id, prioridades: $p) {
        cultivoBase origenBase actual { ${SUGGESTION_FIELDS} } sugerencias { ${SUGGESTION_FIELDS} }
        prioridades { agua suelo erosion ingreso } pesos { agua suelo erosion ingreso local } ajustes rasgosVerificados
        riesgos { ${RISK_FIELDS} } } }`,
    {
      id: fieldId,
      p: tryPriorities ? { agua: tryPriorities.water, suelo: tryPriorities.soil, erosion: tryPriorities.erosion, ingreso: tryPriorities.income } : null,
    },
  );
  const s = data.sugerenciasCultivo;
  return {
    baseCrop: s.cultivoBase,
    baseFrom: s.origenBase === 'actual' ? 'current' : s.origenBase === 'historial' ? 'history' : null,
    current: s.actual ? toSuggestion(s.actual) : null,
    items: s.sugerencias.map(toSuggestion),
    priorities: { water: s.prioridades.agua, soil: s.prioridades.suelo, erosion: s.prioridades.erosion, income: s.prioridades.ingreso },
    weights: { water: s.pesos.agua, soil: s.pesos.suelo, erosion: s.pesos.erosion, income: s.pesos.ingreso, local: s.pesos.local } as Record<FactorKey, number>,
    adjustments: s.ajustes.map((a) => ({ agua_riesgo: 'water_risk', agua_riego: 'water_irrigation', erosion_vulnerabilidad: 'erosion_vulnerability' }[a] ?? a)),
    risks: s.riesgos.map(toRisk).filter((r): r is Risk => r != null),
    traitsVerified: s.rasgosVerificados,
  };
}

/** The models behind every number: what each one is, how well it did on held-out data, and its limits. */
export async function fetchPredictionStatus(): Promise<PredictionStatus | null> {
  const data = await gql<{
    estadoPredicciones: {
      version: string; datosAl: string; limitaciones: string[];
      modelos: {
        concepto: string; nombre: string; rol: string; algoritmo: string; filasEntrenamiento: number; metrica: string; valor: number | null;
        intervaloInf: number | null; intervaloSup: number | null; base: string | null; valorBase: number | null; skill: number | null; notas: string[];
      }[];
    } | null;
  }>(`query { estadoPredicciones { version datosAl limitaciones
      modelos { concepto nombre rol algoritmo filasEntrenamiento metrica valor intervaloInf intervaloSup base valorBase skill notas } } }`);
  const e = data.estadoPredicciones;
  if (!e) return null;
  return {
    version: e.version, asOf: e.datosAl, limitations: e.limitaciones.map(translateText),
    models: e.modelos.map((m) => ({
      concept: m.concepto, name: translateModelName(m.nombre), role: m.rol, algorithm: translateText(m.algoritmo), metric: m.metrica, value: m.valor, ciLow: m.intervaloInf,
      ciHigh: m.intervaloSup, baseline: m.base, baselineValue: m.valorBase, skill: m.skill, trainedRows: m.filasEntrenamiento, notes: m.notas.map(translateText),
    })),
  };
}

export async function fetchTable(key: 'rotacion' | 'rendimiento' | 'ciclo'): Promise<ModelTable | null> {
  const data = await gql<{ tablaModelo: { titulo: string; unidad: string | null; datosAl: string | null; notas: string[]; filas: Record<string, string | number | null>[] } | null }>(
    `query($k: String!) { tablaModelo(clave: $k) { titulo unidad datosAl notas filas } }`, { k: key });
  const t = data.tablaModelo;
  return t ? { title: translateText(t.titulo), unit: t.unidad ? translateText(t.unidad) : t.unidad, asOf: t.datosAl, notes: t.notas.map(translateText), rows: t.filas } : null;
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
  elevation: 'ELEVACION', slope: 'PENDIENTE', erosion: 'EROSION',
};
/**
 * Colors must match the legend exactly, so no layer fades its low values to transparent (that made dry soil look olive instead of
 * red). Rain uses the design's light-blue ramp because the server's ramp starts at white, which reads as a haze over the imagery.
 */
const RAIN_RAMP: ColorStop[] = [
  { at: 0, color: '#BFE3FF' }, { at: 0.34, color: '#4DB3F0' }, { at: 0.67, color: '#1B4FD0' }, { at: 1, color: '#0B2A8A' },
];
const LAYER_LOOK: Record<LayerKind, { title: string; clipToFields: boolean; fadeLow: boolean; ramp?: ColorStop[] }> = {
  temperature: { title: 'Heat-wave risk', clipToFields: false, fadeLow: false },
  humidity: { title: 'Soil moisture', clipToFields: false, fadeLow: false },
  rain: { title: 'Rain probability', clipToFields: false, fadeLow: false, ramp: RAIN_RAMP },
  drought: { title: 'Drought risk', clipToFields: false, fadeLow: false },
  vulnerability: { title: 'Vulnerability', clipToFields: true, fadeLow: false },
  elevation: { title: 'Elevation', clipToFields: false, fadeLow: false },
  slope: { title: 'Slope', clipToFields: false, fadeLow: false },
  erosion: { title: 'Erosion potential', clipToFields: true, fadeLow: false },
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
    ramp: look.ramp ?? c.rampa.map((p): ColorStop => ({ at: p.en, color: p.color })),
    legend: c.leyenda,
    grid: { bbox: c.rejilla.bbox, cols: c.rejilla.columnas, rows: c.rejilla.filas, values: c.rejilla.valores },
    clipToFields: look.clipToFields,
    fadeLow: look.fadeLow,
    source: translateSource(c.fuente),
    resolutionMeters: c.resolucionM,
    interpolated: c.interpolada,
    dataAsOf: c.datosAl,
    notes: c.notas.map(translateNote),
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

async function fetchPoints(type: 'ESTRES' | 'EROSION', kind: 'stress' | 'erosion', criticalLabel: string): Promise<MapPoint[]> {
  const data = await gql<{
    puntos: { puntos: { id: string; latitud: number; longitud: number; severidad: string | null; etiqueta: string | null }[] } | null;
  }>(`query($t: TipoPunto!) { puntos(tipo: $t) { puntos { id latitud longitud severidad etiqueta } } }`, { t: type });
  return (data.puntos?.puntos ?? []).map((p) => ({
    id: p.id,
    position: [p.longitud, p.latitud],
    kind,
    label: p.severidad === 'ALTA' ? criticalLabel : undefined,
    severity: p.severidad ? SEVERITY[p.severidad] : undefined,
  }));
}

export const fetchStressPoints = () => fetchPoints('ESTRES', 'stress', 'Critical stress point');
export const fetchErosionPoints = () => fetchPoints('EROSION', 'erosion', 'High erosion potential');

export async function fetchAlerts(): Promise<AlertSummary[]> {
  const data = await gql<{ alertas: { tipo: string; valor: number; unidad: string; detalle: string; definicion: string }[] }>(
    'query { alertas { tipo valor unidad detalle definicion } }',
  );
  const byKind = new Map(data.alertas.map((a) => [a.tipo, a]));
  const make = (kind: 'drought' | 'stress' | 'erosion', title: string): AlertSummary => {
    const a = byKind.get(kind);
    return a
      ? { kind, title, value: `${a.valor}${a.unidad}`, detail: translateText(a.detalle), definition: translateText(a.definicion), available: true }
      : { kind, title, value: 'N/A', detail: 'Not loaded on the server yet', definition: '', available: false };
  };
  return [
    make('erosion', 'Erosion points'),
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
    source: translateText(h.fuente),
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
    notes: c.notas.map(translateNote),
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
    title: translateText(s.titulo),
    unit: translateText(s.unidad),
    source: translateSource(s.fuente),
    labelA: s.etiquetaA ? translateText(s.etiquetaA) : s.etiquetaA,
    labelB: s.etiquetaB ? translateText(s.etiquetaB) : s.etiquetaB,
    notes: s.notas.map(translateText),
    points: s.puntos.map((p) => ({ label: p.etiqueta, a: p.a, b: p.b, forecast: p.pronostico })),
  }));
}

/** What the app asks for but has no model or data for (erosion, water reserves…). */
export async function fetchUnavailable(): Promise<string[]> {
  return (await gql<{ datosNoDisponibles: string[] }>('query { datosNoDisponibles }')).datosNoDisponibles.map(translateText);
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

/* ---------- live predictions (fresh weather from the APIs, with the last batch as a fallback) ---------- */

const SOURCE: Record<string, DataSource> = { VIVO: 'live', LOTE: 'batch', NO_DISPONIBLE: 'none' };

export async function fetchLive(fieldId: string, scenario?: Scenario): Promise<LiveForecast> {
  const data = await gql<{
    prediccionesEnVivo: {
      fuente: string; datosAl: string | null; antiguedadDias: number | null; obsoleto: boolean; sitio: string | null;
      distanciaKm: number | null; latenciaMs: number | null; generadoEn: string; advertencias: string[];
      resultados: {
        concepto: string; titulo: string; unidad: string; horizonte: string; disponible: boolean; valor: number | null;
        serie: number[] | null; datosAl: string | null; rol: string; algoritmo: string; escenarioAplicado: boolean; notas: string[];
        motivo: string | null; fuente: string;
      }[];
    };
  }>(
    `query($id: ID!, $e: EscenarioInput) { prediccionesEnVivo(parcelaId: $id, escenario: $e) {
        fuente datosAl antiguedadDias obsoleto sitio distanciaKm latenciaMs generadoEn advertencias
        resultados { concepto titulo unidad horizonte disponible valor serie datosAl rol algoritmo escenarioAplicado notas motivo fuente } } }`,
    {
      id: fieldId,
      e: scenario && (scenario.rainPct !== 0 || scenario.tempDelta !== 0)
        ? { lluviaPct: Math.round(scenario.rainPct), tempDeltaC: scenario.tempDelta } : null,
    },
  );
  const p = data.prediccionesEnVivo;
  return {
    source: SOURCE[p.fuente] ?? 'none', asOf: p.datosAl, ageDays: p.antiguedadDias, outdated: p.obsoleto, site: p.sitio,
    distanceKm: p.distanciaKm, latencyMs: p.latenciaMs, generatedAt: p.generadoEn, warnings: p.advertencias,
    results: p.resultados.map((r) => ({
      concept: r.concepto, title: r.titulo, unit: r.unidad, horizon: r.horizonte, available: r.disponible, value: r.valor,
      series: r.serie, asOf: r.datosAl, source: SOURCE[r.fuente] ?? 'none', role: r.rol, algorithm: r.algoritmo,
      scenarioApplied: r.escenarioAplicado, notes: r.notas, reason: r.motivo,
    })),
  };
}
