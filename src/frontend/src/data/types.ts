/** Shapes the app uses. They are filled from the backend (/graphql) in `data/index.ts`; components depend only on these types. */

export type LngLat = [number, number];
export type Ring = LngLat[];

export type LayerKind = 'temperature' | 'humidity' | 'rain' | 'drought' | 'vulnerability';
export type MapTool = 'temperature' | 'humidity' | 'water' | 'vulnerability';
export type AlertKind = 'erosion' | 'drought' | 'stress';
export type Severity = 'low' | 'medium' | 'high';

export interface Scenario {
  /** Rainfall change in percent, -50..50 */
  rainPct: number;
  /** Temperature anomaly in °C, -2..4 */
  tempDelta: number;
}

export interface ColorStop {
  at: number; // 0..1
  color: string; // #RRGGBB
}

export interface GridLayer {
  kind: LayerKind;
  title: string;
  unit: string;
  min: number;
  max: number;
  ramp: ColorStop[];
  /** Legend labels from top (max) to bottom (min). */
  legend: string[];
  /** Row 0 is the northern edge; values are row-major; null = no data in that cell. */
  grid: { bbox: [west: number, south: number, east: number, north: number]; cols: number; rows: number; values: (number | null)[] };
  /** Paint only inside field polygons (true) or as a soft patch over the whole view (false). */
  clipToFields: boolean;
  /** Low values fade to transparent (heat-patch look). */
  fadeLow: boolean;
  source: string;
  resolutionMeters: number;
  /** True when detail inside the field is interpolated from coarser data. */
  interpolated: boolean;
  /** Date of the newest data behind the layer (YYYY-MM-DD). */
  dataAsOf: string;
  /** Limits and caveats the backend attaches to the layer. */
  notes: string[];
  /** False when the sliders do not change this layer. */
  scenarioApplies: boolean;
}

export type PointKind = 'sensor' | 'drought' | 'stress' | 'erosion' | 'reservoir' | 'tank' | 'groundwater';

export interface MapPoint {
  id: string;
  position: LngLat;
  kind: PointKind;
  label?: string;
  severity?: Severity;
}

export interface PlotRecord {
  year: number;
  crop: string;
  plantedOn: string | null;
  description: string;
}

export type Irrigation = 'Rainfed' | 'Gravity' | 'Sprinkler' | 'Drip';
export type Soil = 'Clay' | 'Sandy' | 'Loam' | 'Use satellite data';

/** What the farmer captured about the field (everything the "Add a field" form asks, except the outline). */
export interface FieldValues {
  name: string;
  description: string;
  /** Crop code, or '' */
  crop: string;
  monthsEmptyFrom: number | null;
  monthsEmptyTo: number | null;
  irrigation: Irrigation;
  soil: Soil;
  equipment: string[];
  /** water, soil, erosion, income (0–100) */
  priorities: [number, number, number, number];
}

/** Saved preferences that the form does not edit but that must be sent back unchanged on a save. */
export interface FieldExtras {
  waterMm: number | null;
  preferredCrops: string[];
  excludedCrops: string[];
  /** Equipment codes the form has no button for. */
  otherEquipment: string[];
}

export interface Field {
  id: string;
  /** Optimistic-lock version the server expects back on edits. */
  version: number;
  name: string;
  description: string;
  /** Crop code (see `Crop`), or '' */
  crop: string;
  areaHa: number | null;
  center: LngLat;
  zoom: number;
  /** Empty when the field was saved as a single point. */
  boundary: Ring;
  history: PlotRecord[];
  values: FieldValues;
  extras: FieldExtras;
}

export interface Crop {
  code: string;
  name: string;
}

export interface AlertSummary {
  kind: AlertKind;
  title: string;
  value: string;
  detail: string;
  definition: string;
  /** False when there is no model or data behind it (shown as "not available", never invented). */
  available: boolean;
}

export interface HumiditySummary {
  root: number;
  surface: number;
  evaporation: number;
  percentile: number;
  status: string;
  source: string;
  asOf: string;
}

export interface ClimateSummary {
  tempMax: number | null;
  tempMin: number | null;
  tempMean: number | null;
  rainNextMonthMm: number | null;
  rainNextDayPct: number | null;
  asOf: string;
  notes: string[];
}

export interface SeriesPoint {
  label: string;
  a: number | null;
  b: number | null;
  forecast: boolean;
}

export interface Series {
  id: string;
  title: string;
  unit: string;
  source: string;
  labelA: string | null;
  labelB: string | null;
  notes: string[];
  points: SeriesPoint[];
}

export interface ServerStatus {
  /** True when the rules engine (rotation suggestions) is connected to the server. */
  motorAvailable: boolean;
  predictionsVersion: string | null;
}

/** Everything the "Add a field" form sends. */
export interface NewField extends FieldValues {
  polygon: Ring;
}

export interface CropSuggestion {
  code: string;
  name: string;
  /** 0–100, relative order between the options (not a chance of success). */
  score: number;
  /** % of Weld cropland that grew the base crop one year and this crop the next. */
  rotationPct: number | null;
  /** Expected price change over the forecast months (%). */
  priceChangePct: number | null;
  priceUnit: string | null;
  /** True when it is a different botanical family than the base crop. */
  otherFamily: boolean | null;
}

export interface CropSuggestions {
  baseCrop: string | null;
  baseFrom: 'current' | 'history' | null;
  items: CropSuggestion[];
}
