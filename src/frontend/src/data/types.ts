/** Shapes the backend (/graphql) will send. Components depend only on these types. */

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
  /** Soil moisture, 0..100 */
  soilMoisture: number;
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
  /** Row 0 is the northern edge; values are row-major. */
  grid: { bbox: [west: number, south: number, east: number, north: number]; cols: number; rows: number; values: number[] };
  /** Paint only inside field polygons (true) or as a soft patch over the whole view (false). */
  clipToFields: boolean;
  /** Low values fade to transparent (heat-patch look). */
  fadeLow: boolean;
  source: string;
  resolutionMeters: number;
  /** True when detail inside the field is interpolated from coarser data. */
  interpolated: boolean;
}

export type PointKind = 'sensor' | 'drought' | 'stress' | 'erosion' | 'reservoir' | 'tank' | 'groundwater';

export interface MapPoint {
  id: string;
  position: LngLat;
  kind: PointKind;
  label?: string;
  severity?: Severity;
}

export interface Field {
  id: string;
  name: string;
  description: string;
  crop: string;
  center: LngLat;
  zoom: number;
  boundary: Ring;
}

export interface AlertSummary {
  kind: AlertKind;
  title: string;
  value: string;
  detail: string;
}

export interface LayerInfo {
  title: string;
  variable: string;
  description: string;
  value: string;
  recommendations: string[];
}

export interface CropAdvice {
  crop: string;
  reason: string;
  verdict: 'recommended' | 'avoid';
}

export interface HumiditySummary {
  root: number;
  surface: number;
  evaporation: number;
  percentile: number;
  status: string;
  description: string;
  source: string;
  diagnosis: string;
  crops: CropAdvice[];
  tips: string[];
}

export interface WaterBalance {
  available: string;
  demand: string;
  rainfall: string;
  deficit: string;
  status: 'sufficient' | 'limited' | 'deficit';
}

export interface RotationImpact {
  title: string;
  context: string;
  currentRotation: string;
  risk: string;
  metric: string;
  suggestion: string;
}

export interface ClimatePrediction {
  temperature: { highest: string; lowest: string; average: string; recommendations: string[] };
  rain: { precipitation: string; humidity: string; odds: string; intensity: string; recommendations: string[] };
}

export interface PlotRecord {
  year: number;
  crop: string;
  plantedOn: string;
  description: string;
}

export interface SeriesPoint {
  label: string;
  a: number;
  b: number;
}
