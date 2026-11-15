import { CircleCheck, CloudRain, Mountain, MountainSnow, OctagonAlert, Ruler, Sun, Thermometer, ThermometerSun, TriangleAlert, Droplet, type LucideIcon } from 'lucide-react';
import type { Risk, RiskKey, RiskLevel } from '../data';

/** Level = icon + word + color, never color alone (colorblind-safe, readable in the sun). */
const LEVEL: Record<RiskLevel, { label: string; icon: LucideIcon }> = {
  low: { label: 'Low', icon: CircleCheck },
  medium: { label: 'Medium', icon: TriangleAlert },
  high: { label: 'High', icon: OctagonAlert },
};

export function LevelPill({ level }: { level: RiskLevel | null }) {
  if (!level) return <span className="level level-none">No level</span>;
  const { label, icon: Icon } = LEVEL[level];
  return <span className={`level level-${level}`}><Icon size={14} strokeWidth={2.6} aria-hidden /> {label}</span>;
}

const n = (v: number | null, digits = 0) => (v == null ? '—' : String(Number(v.toFixed(digits))));

export const RISK_INFO: Record<RiskKey, { title: string; icon: LucideIcon; describe: (r: Risk) => string; model: string }> = {
  heat: {
    title: 'Heat waves', icon: Thermometer, model: 'Heat-wave classifier',
    describe: (r) => `${n(r.value)}% average chance that a heat wave starts within the next 7 days, over the latest summer season.`,
  },
  drought: {
    title: 'Drought', icon: Sun, model: 'Drought rule (persistence of the SPI index)',
    describe: (r) => `${n(r.value)}% chance of drought over the next 3 months in the ~25 km cell around the field.`,
  },
  moisture: {
    title: 'Soil moisture', icon: Droplet, model: 'Soil-moisture forecaster',
    describe: (r) => `Root-zone moisture is at percentile ${n(r.value)} for these days of the year (low = drier than usual).`,
  },
  stress: {
    title: 'Crop stress nearby', icon: ThermometerSun, model: 'Evaporative-stress (ESI) model',
    describe: (r) => `${n(r.criticalPoints)} critical of ${n(r.nearbyPoints)} sampled points within ${n(r.radiusKm)} km of the field.`,
  },
  vulnerability: {
    title: 'Land vulnerability', icon: Mountain, model: 'Vulnerability index (expert rules)',
    describe: (r) => (r.value == null ? 'No cropland was sampled at this spot.' : `${n(r.value)} out of 100: how fragile the land is here (soil, climate and crop history).`),
  },
  erosion: {
    title: 'Erosion potential', icon: Mountain, model: 'Soil × slope × rain index (RUSLE-style)',
    describe: (r) => `Higher than ${n(r.value)}% of the sampled cropland. It is the land's own exposure to water erosion, not measured soil loss.`,
  },
  slope: {
    title: 'Slope', icon: Ruler, model: 'NASADEM elevation (30 m)',
    describe: (r) => (r.value == null ? 'No elevation data here.' : `The ground rises about ${n(r.value, 1)} m for every 100 m around the field.`),
  },
  elevation: {
    title: 'Elevation', icon: MountainSnow, model: 'NASADEM elevation (30 m)',
    describe: (r) => (r.value == null ? 'No elevation data here.' : `About ${n(r.value)} m above sea level.`),
  },
  rain: {
    title: 'Rain outlook', icon: CloudRain, model: 'Monthly rain climatology',
    describe: (r) => `About ${n(r.value)} mm expected next month, based on the 1991–2020 average (not a forecast).`,
  },
};

/** What the sliders in "Risks" and "Crops" tell the farmer about each zone adjustment. */
export const ADJUSTMENT_TEXT: Record<string, string> = {
  water_risk: 'Water counts more because drought or soil dryness is elevated in your zone.',
  water_irrigation: 'Water counts less because the field has irrigation.',
  erosion_vulnerability: 'Erosion counts more because the land around the field is vulnerable.',
};
