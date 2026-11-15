import type maplibregl from 'maplibre-gl';
import { useEffect, useState } from 'react';
import { gql } from '../data/api';
import { ApiError, errorMessage } from '../data';
import { Chips } from './ui';

interface Cell {
  latitud: number; longitud: number; tempMediaC: number | null; tempMaxC: number | null; lluvia7dMm: number | null;
  humedadRelativaPct: number | null; humedadSueloPct: number | null; datosAl: string;
}
interface Result { celdas: Cell[]; solicitadas: number; faltantes: number; muestreado: boolean; pasoLatitud: number; pasoLongitud: number; datosAl: string | null }

const VARS = {
  Temperature: { key: 'tempMediaC', unit: '°C', min: -10, max: 40, ramp: ['#2E86DE', '#6FFF00', '#F2EC36', '#FF8A00', '#FF0000'] },
  'Rain (7 days)': { key: 'lluvia7dMm', unit: 'mm', min: 0, max: 40, ramp: ['#FFFFE0', '#8FD3FF', '#1E9BE0', '#1B4FD0', '#0B2A8A'] },
  'Soil moisture': { key: 'humedadSueloPct', unit: '%', min: 0, max: 80, ramp: ['#C0392B', '#F4D03F', '#19E3D2', '#1B4FD0'] },
  Humidity: { key: 'humedadRelativaPct', unit: '%', min: 0, max: 100, ramp: ['#F4D03F', '#19E3D2', '#0B2A8A'] },
} as const;
type VarName = keyof typeof VARS;

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
function colorAt(ramp: readonly string[], t: number): string {
  const x = Math.min(1, Math.max(0, t)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const a = hex(ramp[i]);
  const b = hex(ramp[i + 1]);
  const k = x - i;
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * k)).join(',')})`;
}
const spacing = (values: number[], fallback: number) => {
  const u = [...new Set(values)].sort((a, b) => a - b);
  const d = u.slice(1).map((v, i) => v - u[i]);
  return d.length ? Math.min(...d) : fallback;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** "Global mode": colours the map cells in view with the latest observed weather. Only what is on screen is requested. */
export function GlobalLayer({ map, ready }: { map: maplibregl.Map | null; ready: boolean }) {
  const [name, setName] = useState<VarName>('Temperature');
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState(0);

  useEffect(() => {
    if (!ready || !map) return;
    const bump = () => setView((n) => n + 1);
    map.on('moveend', bump);
    bump();
    return () => { map.off('moveend', bump); };
  }, [ready, map]);

  useEffect(() => {
    if (!ready || !map || view === 0) return;
    const id = setTimeout(async () => {
      const b = map.getBounds();
      setLoading(true);
      try {
        const r = await gql<{ climaGlobal: Result }>(
          `query($c: CajaMundoInput!) { climaGlobal(caja: $c) { solicitadas faltantes muestreado pasoLatitud pasoLongitud datosAl
             celdas { latitud longitud tempMediaC tempMaxC lluvia7dMm humedadRelativaPct humedadSueloPct datosAl } } }`,
          { c: { oeste: clamp(b.getWest(), -180, 179), sur: clamp(b.getSouth(), -89, 89), este: clamp(b.getEast(), -179, 180), norte: clamp(b.getNorth(), -88, 90) } },
        );
        setData(r.climaGlobal);
        setError(null);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : errorMessage(e));
      } finally {
        setLoading(false);
      }
    }, 500);
    return () => clearTimeout(id);
  }, [ready, map, view]);

  useEffect(() => {
    if (!ready || !map) return;
    const v = VARS[name];
    const dLat = spacing((data?.celdas ?? []).map((c) => c.latitud), data?.pasoLatitud ?? 0.5);
    const dLon = spacing((data?.celdas ?? []).map((c) => c.longitud), data?.pasoLongitud ?? 0.625);
    const features = (data?.celdas ?? []).flatMap((c) => {
      const value = c[v.key];
      if (value == null) return [];
      const [w, e, s, n] = [c.longitud - dLon / 2, c.longitud + dLon / 2, c.latitud - dLat / 2, c.latitud + dLat / 2];
      return [{
        type: 'Feature' as const, properties: { color: colorAt(v.ramp, (value - v.min) / (v.max - v.min)), value },
        geometry: { type: 'Polygon' as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
      }];
    });
    const collection = { type: 'FeatureCollection' as const, features };
    const source = map.getSource('global-cells') as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(collection);
    else {
      map.addSource('global-cells', { type: 'geojson', data: collection });
      map.addLayer({ id: 'global-fill', type: 'fill', source: 'global-cells', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.62 } });
      map.addLayer({ id: 'global-line', type: 'line', source: 'global-cells', paint: { 'line-color': '#ffffff', 'line-width': 0.5, 'line-opacity': 0.5 } });
    }
  }, [ready, map, data, name]);

  // turning global mode off removes the cells and the map goes back to how it was
  useEffect(() => () => {
    if (!map) return;
    for (const id of ['global-fill', 'global-line']) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource('global-cells')) map.removeSource('global-cells');
  }, [map]);

  const v = VARS[name];
  const status = loading
    ? 'Loading the cells in view…'
    : error
      ? error
      : data
        ? `${data.celdas.length} cells${data.datosAl ? ` · data up to ${data.datosAl}` : ''}${data.muestreado ? ' · zoom in for more detail' : ''}${data.faltantes ? ` · ${data.faltantes} without data` : ''}`
        : '';
  return (
    <div className="glass global-panel">
      <div className="global-title">Global mode · observed weather, last 7 days</div>
      <Chips options={Object.keys(VARS) as VarName[]} value={name} onChange={setName} />
      <div className="global-legend">
        <span>{v.min}{v.unit}</span>
        <i style={{ background: `linear-gradient(90deg, ${v.ramp.join(', ')})` }} />
        <span>{v.max}{v.unit}</span>
      </div>
      <small className="global-note">{status} Observed data from NASA POWER, not forecasts: the models only apply to Weld County.</small>
    </div>
  );
}
