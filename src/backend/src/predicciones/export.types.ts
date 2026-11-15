/** Forma del export de ml/ tal como se lee del disco (espejo de ml/fieldshift_ml/deploy/schema.py). */

export interface ExportLayer {
  kind: 'temperature' | 'humidity' | 'rain' | 'drought' | 'vulnerability' | 'elevation' | 'slope' | 'erosion';
  concept: string;
  title: string;
  variable: string;
  unit: string;
  min: number;
  max: number;
  ramp: { at: number; color: string }[];
  legend: string[];
  bbox: [number, number, number, number];
  cols: number;
  rows: number;
  scenarios: { rain_pct: number; temp_delta: number; values: (number | null)[] }[];
  scenario_applies: boolean;
  source: string;
  resolution_m: number;
  interpolated: boolean;
  as_of: string;
  notes: string[];
}

export interface ExportPoint {
  id: string;
  lat: number;
  lon: number;
  kind: 'stress' | 'erosion';
  label?: string | null;
  severity?: 'low' | 'medium' | 'high' | null;
  value?: number | null;
}

export interface ExportPointsFile {
  kind: 'stress' | 'erosion';
  concept: string;
  source: string;
  as_of: string;
  unit?: string | null;
  notes: string[];
  points: ExportPoint[];
}

export interface ExportSeries {
  id: string;
  title: string;
  unit: string;
  source: string;
  concept?: string | null;
  a_label?: string | null;
  b_label?: string | null;
  notes: string[];
  points: { label: string; a?: number | null; b?: number | null; forecast: boolean }[];
}

export interface ExportAlert {
  kind: 'drought' | 'stress' | 'erosion';
  title: string;
  value: number;
  unit: string;
  detail: string;
  definition: string;
  concept: string;
  as_of: string;
}

export interface ExportSummaries {
  alerts: ExportAlert[];
  humidity?: Record<string, unknown> | null;
  climate?: Record<string, unknown> | null;
  unavailable: string[];
}

export interface ExportTable {
  id: string;
  concept: string;
  title: string;
  unit?: string | null;
  as_of?: string | null;
  notes: string[];
  rows: Record<string, string | number | null>[];
}

export interface ExportManifest {
  schema_version: number;
  version: string;
  generated_at: string;
  zone: { name: string; fips: string; bbox: number[] };
  data_as_of: string;
  models: Record<string, unknown>[];
  files: { path: string; sha256: string; kind: 'layer' | 'points' | 'series' | 'summaries' | 'tables' }[];
  limitations: string[];
}
