/**
 * PLACEHOLDER DATA. Every value in this file is sample data so the screens can be built.
 * None of it is a measurement. The backend will send the real values through /graphql;
 * when that happens only `data/index.ts` changes, not the components.
 */
import type {
  AlertSummary,
  ClimatePrediction,
  ColorStop,
  Field,
  GridLayer,
  HumiditySummary,
  LayerInfo,
  LayerKind,
  LngLat,
  MapPoint,
  PlotRecord,
  Ring,
  RotationImpact,
  Scenario,
  SeriesPoint,
  WaterBalance,
} from './types';

/** Sample location on farmland east of Greeley, Weld County, CO (data zone, see docs/decisiones.md). */
const ORIGIN: LngLat = [-104.61835, 40.46];
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((ORIGIN[1] * Math.PI) / 180);

/** Meters east / north of ORIGIN to [lng, lat]. */
const at = (east: number, north: number): LngLat => [
  ORIGIN[0] + east / M_PER_DEG_LNG,
  ORIGIN[1] + north / M_PER_DEG_LAT,
];
const ring = (points: [number, number][]): Ring => points.map(([e, n]) => at(e, n));

export const field: Field = {
  id: 'field-1',
  name: 'Chili field',
  description: '',
  crop: '',
  center: at(0, 0),
  zoom: 15.6,
  boundary: ring([[-160, 40], [-110, 130], [-20, 110], [150, -10], [40, -140], [-120, -60]]),
};

export const neighbors: Ring[] = [
  ring([[-110, 130], [-60, 330], [170, 300], [230, 120], [-20, 110]]),
  ring([[-20, 110], [230, 120], [420, 20], [150, -10]]),
  ring([[150, -10], [420, 20], [470, -220], [200, -300], [40, -140]]),
  ring([[40, -140], [200, -300], [60, -430], [-190, -330], [-120, -60]]),
  ring([[-120, -60], [-190, -330], [-470, -250], [-420, 10], [-160, 40]]),
  ring([[-160, 40], [-420, 10], [-450, 260], [-60, 330], [-110, 130]]),
  ring([[170, 300], [480, 330], [520, 60], [420, 20], [230, 120]]),
  ring([[-450, 260], [-520, 520], [-40, 560], [-60, 330]]),
  ring([[-60, 330], [-40, 560], [480, 560], [480, 330], [170, 300]]),
];

export const sensors: MapPoint[] = [
  { id: 's1', position: at(60, 70), kind: 'sensor', severity: 'high' },
  { id: 's2', position: at(0, -40), kind: 'sensor' },
  { id: 's3', position: at(45, -60), kind: 'sensor' },
];

export const alertPoints: Record<'drought' | 'stress' | 'erosion', MapPoint[]> = {
  drought: [
    { id: 'd1', position: at(-150, 150), kind: 'drought', label: 'Drought point' },
    { id: 'd2', position: at(140, 60), kind: 'drought', label: 'Water stress - High', severity: 'high' },
    { id: 'd3', position: at(340, 30), kind: 'drought' },
    { id: 'd4', position: at(420, -110), kind: 'drought' },
    { id: 'd5', position: at(-70, -300), kind: 'drought', label: 'Drought point' },
  ],
  stress: [
    { id: 't1', position: at(-90, 120), kind: 'stress', label: 'Stress point' },
    { id: 't2', position: at(-165, 45), kind: 'stress', label: 'Water stress - High', severity: 'high' },
    { id: 't3', position: at(150, -10), kind: 'stress', label: 'Stress point' },
    { id: 't4', position: at(10, -130), kind: 'stress', label: 'Critical stress point', severity: 'high' },
    { id: 't5', position: at(-300, 330), kind: 'stress', label: 'Stress point' },
    { id: 't6', position: at(210, 250), kind: 'stress', label: 'Stress point', severity: 'high' },
    { id: 't7', position: at(-80, -260), kind: 'stress', label: 'Critical stress point', severity: 'high' },
    { id: 't8', position: at(-400, 90), kind: 'stress', label: 'Stress point' },
    { id: 't9', position: at(110, 480), kind: 'stress', label: 'Stress point' },
  ],
  erosion: [
    { id: 'e1', position: at(-90, 125), kind: 'erosion', label: 'Erosion point' },
    { id: 'e2', position: at(-160, 45), kind: 'erosion', label: 'Erosion risk - High', severity: 'high' },
    { id: 'e3', position: at(150, -5), kind: 'erosion', label: 'Erosion point' },
    { id: 'e4', position: at(15, -125), kind: 'erosion', label: 'Critical erosion point', severity: 'high' },
  ],
};

export const waterPoints: MapPoint[] = [
  { id: 'w1', position: at(-520, 420), kind: 'tank', label: 'Reservoir / Dam' },
  { id: 'w2', position: at(-400, 300), kind: 'groundwater', label: 'Water level - High', severity: 'high' },
  { id: 'w3', position: at(260, 440), kind: 'tank' },
  { id: 'w4', position: at(-130, 60), kind: 'groundwater', label: 'Groundwater reserves' },
  { id: 'w5', position: at(-90, -50), kind: 'reservoir', label: 'Reservoir / Dam' },
  { id: 'w6', position: at(120, -45), kind: 'tank', label: 'Water tank' },
  { id: 'w7', position: at(-80, -210), kind: 'tank', label: 'Water level' },
  { id: 'w8', position: at(-150, -350), kind: 'reservoir', label: 'Groundwater reserves' },
  { id: 'w9', position: at(480, -330), kind: 'tank', label: 'Water tank' },
];

export const alerts: AlertSummary[] = [
  { kind: 'erosion', title: 'Erosion points', value: '85%', detail: '14 zones' },
  { kind: 'drought', title: 'Droughts', value: '85%', detail: '14 zones' },
  { kind: 'stress', title: 'Stress points', value: 'High', detail: '18 critical points' },
];

export const rotationImpact: RotationImpact = {
  title: 'Impact and suggested rotation',
  context: 'Next 3 seasons',
  currentRotation: 'Corn → Corn → Corn',
  risk: 'High risk',
  metric: 'Evapotranspiration above rainfall',
  suggestion: 'Suggested: Pinto bean → Sorghum → Oats. Uses less water and gives the soil a rest.',
};

export const layerInfo: Record<'temperature' | 'vulnerability', LayerInfo> = {
  temperature: {
    title: 'Temperature',
    variable: 'Temperature in Celsius',
    description: 'Temperature registered in Celsius degrees',
    value: '27',
    recommendations: [
      'Irrigate early in the morning or at dusk on the hottest days.',
      'Keep crop residue on the soil to lower surface temperature.',
    ],
  },
  vulnerability: {
    title: 'Vulnerability',
    variable: 'Zone vulnerability index',
    description: 'How fragile each zone is, combining climate, soil and crop history',
    value: '0.6',
    recommendations: [
      'Start soil conservation work in the red zones.',
      'Avoid leaving the red zones bare between seasons.',
    ],
  },
};

export const humiditySummary: HumiditySummary = {
  root: 24,
  surface: 15,
  evaporation: 4.8,
  percentile: 18,
  status: 'Below normal',
  description: 'Water directly available to the roots in the first 100 cm of depth.',
  source: 'SMAP L4 · 0 to 100 cm',
  diagnosis:
    'Quick diagnosis. The surface layer is dry, but there is still a moderate reserve at the root. High loss from evaporation.',
  crops: [
    { crop: 'Pinto bean', reason: 'Uses the moisture without needing constant irrigation', verdict: 'recommended' },
    { crop: 'Sorghum', reason: 'Tolerates dry surface soil and uses the root reserve', verdict: 'recommended' },
    { crop: 'Long-cycle corn', reason: 'Needs constant irrigation', verdict: 'avoid' },
  ],
  tips: [
    'Direct seeding over stubble to keep moisture',
    'Check moisture at 10 cm in the field',
    'Avoid shallow-germinating crops without backup irrigation',
  ],
};

export const waterBalance: WaterBalance = {
  available: '320 mm',
  demand: '410 mm',
  rainfall: '180 mm',
  deficit: '90 mm',
  status: 'limited',
};

export const climatePrediction: ClimatePrediction = {
  temperature: {
    highest: '34 °C',
    lowest: '9 °C',
    average: '22 °C',
    recommendations: ['Plan sowing after the last expected frost.'],
  },
  rain: {
    precipitation: '42 mm',
    humidity: '38 %',
    odds: '35 %',
    intensity: 'Light',
    recommendations: ['Rain alone will not cover a long-cycle crop this season.'],
  },
};

export const marketPrices: SeriesPoint[] = [
  ['Jan', 180], ['Feb', 210], ['Mar', 195], ['Apr', 260], ['May', 245], ['Jun', 290],
  ['Jul', 320], ['Aug', 305], ['Sep', 365], ['Oct', 350], ['Nov', 410], ['Dec', 450],
].map(([label, a]) => ({ label: String(label), a: Number(a), b: 0 }));

export const plotHistory: PlotRecord[] = [
  { year: 2021, crop: 'Pinto bean', plantedOn: '02-JUN-2021', description: 'Short season; harvest slightly below expectations.' },
  {
    year: 2022,
    crop: 'Corn',
    plantedOn: '20-AUG-2022',
    description: 'The cultivation went perfectly; it was completed within the estimated timeframe and met all requirements.',
  },
  { year: 2023, crop: 'Corn', plantedOn: '14-MAY-2023', description: '' },
];

const YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
export const statistics: Record<'temperature' | 'humidity', SeriesPoint[]> = {
  temperature: YEARS.map((y, i) => ({
    label: String(y),
    a: [-7, -3, 24, 22, -2, -4, 0, -3, 0, -8, -6, -9][i],
    b: [-2, 6, 3, -4, 0, 6, 9, 2, -8, -6, 8, 12][i],
  })),
  humidity: YEARS.map((y, i) => ({
    label: String(y),
    a: [25, 33, 82, 78, 36, 33, 39, 32, 44, 21, 26, 17][i],
    b: [36, 54, 46, 33, 38, 47, 57, 40, 20, 24, 48, 62][i],
  })),
};

export const cropOptions = ['Pinto bean', 'Corn', 'Oats', 'Sorghum', 'Chili', 'Alfalfa'];

/* ---------- map layers ---------- */

const GRID = { cols: 36, rows: 28, halfWidth: 900, halfHeight: 700 };
const BBOX: GridLayer['grid']['bbox'] = [
  at(-GRID.halfWidth, 0)[0],
  at(0, -GRID.halfHeight)[1],
  at(GRID.halfWidth, 0)[0],
  at(0, GRID.halfHeight)[1],
];

type Bump = [x: number, y: number, radius: number, weight: number];

function surface(bumps: Bump[]): number[] {
  const values: number[] = [];
  for (let row = 0; row < GRID.rows; row++) {
    for (let col = 0; col < GRID.cols; col++) {
      const x = col / (GRID.cols - 1);
      const y = row / (GRID.rows - 1);
      let v = 0;
      for (const [bx, by, r, w] of bumps) v += w * Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (r * r));
      values.push(v);
    }
  }
  return values;
}

const HOT: Bump[] = [[0.58, 0.55, 0.22, 1], [0.8, 0.75, 0.2, 0.7], [0.3, 0.2, 0.25, 0.45], [0.15, 0.8, 0.2, 0.5]];
const DRY: Bump[] = [[0.3, 0.22, 0.12, 1], [0.62, 0.12, 0.13, 0.75], [0.72, 0.52, 0.16, 1], [0.2, 0.78, 0.16, 0.8], [0.5, 0.55, 0.14, 0.45], [0.92, 0.7, 0.1, 0.7]];
const WET: Bump[] = [[0.55, 0.62, 0.16, 1], [0.75, 0.82, 0.14, 0.8], [0.35, 0.8, 0.1, 0.6], [0.92, 0.4, 0.09, 0.6], [0.2, 0.45, 0.12, 0.35]];
const FRAGILE: Bump[] = [[0.42, 0.42, 0.1, 1], [0.6, 0.6, 0.12, 0.9], [0.3, 0.7, 0.12, 0.8], [0.75, 0.3, 0.12, 0.8], [0.5, 0.15, 0.1, 0.7]];

const ramp = (...colors: string[]): ColorStop[] => colors.map((color, i) => ({ at: i / (colors.length - 1), color }));
const ticks = (min: number, max: number, n = 8) =>
  Array.from({ length: n }, (_, i) => String(Math.round(max - (i * (max - min)) / (n - 1))));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Sample layer. `scenario` shifts the values so the "What if?" sliders repaint the map. */
export function buildLayer(kind: LayerKind, s: Scenario): GridLayer {
  const grid = (values: number[]) => ({ bbox: BBOX, cols: GRID.cols, rows: GRID.rows, values });
  const dryness = -s.rainPct / 100 + s.tempDelta * 0.06 - (s.soilMoisture - 50) / 250;

  switch (kind) {
    case 'temperature':
      return {
        kind, title: 'Temperature', unit: '°C', min: 0, max: 40,
        ramp: ramp('#6FFF00', '#F2EC36', '#FF8A00', '#FF0000'), legend: ticks(0, 40),
        grid: grid(surface(HOT).map((v) => clamp(18 + v * 16 + s.tempDelta * 2.5, 0, 40))),
        clipToFields: false, fadeLow: false,
        source: 'NASA POWER', resolutionMeters: 50_000, interpolated: true,
      };
    case 'humidity':
      return {
        kind, title: 'Humidity', unit: '%', min: 0, max: 100,
        ramp: ramp('#19E3D2', '#1E9BE0', '#1B4FD0', '#0B2A8A'), legend: ticks(0, 100),
        grid: grid(surface(WET).map((v) => clamp(v * 80 + (s.soilMoisture - 50) * 0.5 + s.rainPct * 0.4, 0, 100))),
        clipToFields: false, fadeLow: true,
        source: 'NASA POWER GWETROOT', resolutionMeters: 50_000, interpolated: true,
      };
    case 'rain':
      return {
        kind, title: 'Rain', unit: 'mm', min: 0, max: 80,
        ramp: ramp('#8FD3FF', '#1E9BE0', '#1B4FD0', '#0B2A8A'), legend: ticks(0, 80),
        grid: grid(surface(WET).map((v) => clamp(v * 60 * (1 + s.rainPct / 100), 0, 80))),
        clipToFields: false, fadeLow: true,
        source: 'NASA POWER', resolutionMeters: 50_000, interpolated: true,
      };
    case 'drought':
      return {
        kind, title: 'Drought zones', unit: '', min: 0, max: 1,
        ramp: ramp('#F2EC36', '#FFAE00', '#FF5A00', '#D20000'), legend: ['Extreme', 'Normal', 'Moderate'],
        grid: grid(surface(DRY).map((v) => clamp(v * 0.85 + dryness * 0.6, 0, 1))),
        clipToFields: false, fadeLow: true,
        source: 'ERA5', resolutionMeters: 30_000, interpolated: true,
      };
    case 'vulnerability':
      return {
        kind, title: 'Vulnerability', unit: '', min: 0, max: 1,
        ramp: ramp('#3DE000', '#C8F000', '#FFD000', '#FF6A00', '#FF0000'), legend: ['High', '', '', 'Medium', '', '', 'Low'],
        grid: grid(surface(FRAGILE).map((v) => clamp(v * 0.9 + dryness * 0.25, 0, 1))),
        clipToFields: true, fadeLow: false,
        source: 'SSURGO + CDL', resolutionMeters: 30, interpolated: false,
      };
  }
}

/** Polygons that receive color when a layer is clipped to fields. */
export const paintedFields: Ring[] = [field.boundary, neighbors[0], neighbors[2], neighbors[4], neighbors[7]];
