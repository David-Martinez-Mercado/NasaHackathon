import type maplibregl from 'maplibre-gl';
import { useEffect, useState } from 'react';
import { gql } from '../data/api';
import { ApiError, errorMessage } from '../data';
import type { GridLayer } from '../data';
import { renderGrid } from '../map/gridCanvas';
import { useApp } from '../AppContext';

interface Cell {
  latitud: number; longitud: number; tempMediaC: number | null; tempMaxC: number | null; lluvia7dMm: number | null;
  humedadRelativaPct: number | null; humedadSueloPct: number | null; datosAl: string;
}
interface Result { celdas: Cell[]; solicitadas: number; faltantes: number; muestreado: boolean; pasoLatitud: number; pasoLongitud: number; datosAl: string | null }

/** The SAME color ramps as the normal layers (temperature, humidity and rain), so a color means the same thing in both modes. */
const TEMP_RAMP = ['#2E86DE', '#F7DC6F', '#E74C3C'];
const MOISTURE_RAMP = ['#C0392B', '#F4D03F', '#2471A3'];
const RAIN_RAMP = ['#BFE3FF', '#4DB3F0', '#1B4FD0', '#0B2A8A'];
const VARS = {
  temperature: { key: 'tempMediaC', unit: '°C', min: -10, max: 40, ramp: TEMP_RAMP },
  rain: { key: 'lluvia7dMm', unit: 'mm', min: 0, max: 40, ramp: RAIN_RAMP },
  moisture: { key: 'humedadSueloPct', unit: '%', min: 0, max: 80, ramp: MOISTURE_RAMP },
} as const;
const TITLE = { temperature: 'Temperature', rain: 'Rain over 7 days', moisture: 'Soil moisture' } as const;

const spacing = (values: number[], fallback: number) => {
  const u = [...new Set(values)].sort((a, b) => a - b);
  const d = u.slice(1).map((v, i) => v - u[i]);
  return d.length ? Math.min(...d) : fallback;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** "Global mode": colours the map cells in view with the latest observed weather. Only what is on screen is requested. */
export function GlobalLayer({ map, ready }: { map: maplibregl.Map | null; ready: boolean }) {
  const { globalVar: name } = useApp();
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
    const cells = (data?.celdas ?? []).filter((c) => c[v.key] != null);
    const image = map.getSource('global-img') as maplibregl.ImageSource | undefined;
    if (!cells.length) {
      if (map.getLayer('global-img')) map.setLayoutProperty('global-img', 'visibility', 'none');
      return;
    }
    // A regular grid over the cells in view, painted with the same renderer as the normal layers (soft blend, same look)
    const dLat = spacing(cells.map((c) => c.latitud), data?.pasoLatitud ?? 0.5);
    const dLon = spacing(cells.map((c) => c.longitud), data?.pasoLongitud ?? 0.625);
    const lats = cells.map((c) => c.latitud);
    const lons = cells.map((c) => c.longitud);
    const [south, north] = [Math.min(...lats) - dLat / 2, Math.max(...lats) + dLat / 2];
    const [west, east] = [Math.min(...lons) - dLon / 2, Math.max(...lons) + dLon / 2];
    const cols = Math.max(1, Math.round((east - west) / dLon));
    const rows = Math.max(1, Math.round((north - south) / dLat));
    const values: (number | null)[] = new Array(cols * rows).fill(null);
    for (const c of cells) {
      const col = Math.min(cols - 1, Math.max(0, Math.floor((c.longitud - west) / dLon)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor((north - c.latitud) / dLat)));
      values[row * cols + col] = c[v.key];
    }
    const layer: GridLayer = {
      kind: 'temperature', title: TITLE[name], unit: v.unit, min: v.min, max: v.max,
      ramp: v.ramp.map((color, i, all) => ({ at: i / (all.length - 1), color })), legend: [], grid: { bbox: [west, south, east, north], cols, rows, values },
      clipToFields: false, fadeLow: false, source: 'NASA POWER', resolutionMeters: 50_000, interpolated: true, dataAsOf: data?.datosAl ?? '', notes: [], scenarioApplies: false,
    };
    const url = renderGrid(layer);
    const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [[west, north], [east, north], [east, south], [west, south]];
    if (image) image.updateImage({ url, coordinates });
    else {
      map.addSource('global-img', { type: 'image', url, coordinates });
      map.addLayer({ id: 'global-img', type: 'raster', source: 'global-img', paint: { 'raster-fade-duration': 0, 'raster-opacity': 0.72 } }, map.getLayer('field-line') ? 'field-line' : undefined);
    }
    map.setLayoutProperty('global-img', 'visibility', 'visible');
  }, [ready, map, data, name]);

  // turning global mode off removes the cells and the map goes back to how it was
  useEffect(() => () => {
    if (!map) return;
    if (map.getLayer('global-img')) map.removeLayer('global-img');
    if (map.getSource('global-img')) map.removeSource('global-img');
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
      <div className="global-title">Global mode · {TITLE[name]} · observed, last 7 days</div>
      <div className="global-legend">
        <span>{v.min}{v.unit}</span>
        <i style={{ background: `linear-gradient(90deg, ${v.ramp.join(', ')})` }} />
        <span>{v.max}{v.unit}</span>
      </div>
      <small className="global-note">{status} Observed data from NASA POWER, not forecasts: the models only apply to Weld County.</small>
    </div>
  );
}
