import {
  Archive, ChevronLeft, ChevronRight, CirclePlus, Cpu, Cylinder, Droplet, Droplets, Info, Mountain, Sun,
  Thermometer, ThermometerSun, TriangleAlert, ZoomIn, ZoomOut, type LucideIcon,
} from 'lucide-react';
import maplibregl, { type GeoJSONSource, type ImageSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../AppContext';
import { DEFAULT_CENTER, DEFAULT_ZOOM, type Field, type LngLat, type MapPoint, type MapTool } from '../data';
import { rampCss, renderGrid } from './gridCanvas';

const TILES = import.meta.env.VITE_BASEMAP_TILES_URL as string | undefined;
const ATTRIBUTION = (import.meta.env.VITE_BASEMAP_ATTRIBUTION as string | undefined) ?? '';

/** Fields with a drawn boundary are polygons; fields saved as a single point are shown as a dot. */
const fieldShapes = (fields: Field[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: fields.map((f) => ({
    type: 'Feature',
    properties: { id: f.id },
    geometry: f.boundary.length >= 3
      ? { type: 'Polygon', coordinates: [[...f.boundary, f.boundary[0]]] }
      : { type: 'Point', coordinates: f.center },
  })),
});

const draftShape = (points: LngLat[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    ...(points.length > 1
      ? [{
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: points.length > 2 ? [...points, points[0]] : points },
        }]
      : []),
    ...points.map((p) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: p } })),
  ],
});

const PIN_ICON: Record<MapPoint['kind'], LucideIcon> = {
  sensor: Cpu, drought: Sun, stress: ThermometerSun, erosion: Mountain,
  reservoir: Droplets, tank: Cylinder, groundwater: Droplet,
};

const TOOLS: { tool: MapTool; icon: LucideIcon; label: string }[] = [
  { tool: 'temperature', icon: Thermometer, label: 'Temperature layer' },
  { tool: 'humidity', icon: Droplet, label: 'Humidity layer' },
  { tool: 'water', icon: Archive, label: 'Water reserves layer' },
  { tool: 'vulnerability', icon: TriangleAlert, label: 'Vulnerability layer' },
];

export function FieldMap() {
  const { mapConfig: cfg, draft, setDraft, fields, currentField } = useApp();
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawing = useRef(false);
  const draftRef = useRef<LngLat[]>([]);
  const [ready, setReady] = useState(false);
  const [, repaint] = useState(0);
  const fieldsRef = useRef<Field[]>([]);
  fieldsRef.current = fields ?? [];

  drawing.current = !!cfg.draw;
  draftRef.current = draft;

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      center: currentField?.center ?? DEFAULT_CENTER,
      zoom: currentField?.zoom ?? DEFAULT_ZOOM,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: TILES ? { basemap: { type: 'raster', tiles: [TILES], tileSize: 256, maxzoom: 19, attribution: ATTRIBUTION } } : {},
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#2C4227' } },
          ...(TILES ? [{ id: 'basemap', type: 'raster' as const, source: 'basemap' }] : []),
        ],
      },
    });
    mapRef.current = map;
    map.on('style.load', () => {
      map.addSource('field', { type: 'geojson', data: fieldShapes(fieldsRef.current) });
      map.addSource('draft', { type: 'geojson', data: draftShape([]) });
      map.addLayer({ id: 'field-fill', type: 'fill', source: 'field', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#E8A531', 'fill-opacity': 0.6 } });
      map.addLayer({ id: 'field-line', type: 'line', source: 'field', filter: ['==', '$type', 'Polygon'], paint: { 'line-color': '#FFFFFF', 'line-width': 2.5, 'line-dasharray': [1.6, 1.6] } });
      map.addLayer({ id: 'field-point', type: 'circle', source: 'field', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#E8A531', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2.5 } });
      map.addLayer({ id: 'draft-line', type: 'line', source: 'draft', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#FFFFFF', 'line-width': 2.5, 'line-dasharray': [1.6, 1.6] } });
      map.addLayer({ id: 'draft-points', type: 'circle', source: 'draft', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 4, 'circle-color': '#FFFFFF', 'circle-stroke-color': '#474B4E', 'circle-stroke-width': 1.5 } });
      setReady(true);
    });
    map.on('move', () => repaint((n) => n + 1));
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current!);
    map.on('click', (e) => {
      if (drawing.current) setDraft([...draftRef.current, [e.lngLat.lng, e.lngLat.lat]]);
    });
    return () => {
      observer.disconnect();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Color layer
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const layer = cfg.layer;
    if (!layer) {
      if (map.getLayer('heat')) map.setLayoutProperty('heat', 'visibility', 'none');
      map.setPaintProperty('field-fill', 'fill-opacity', cfg.draw ? 0 : 0.6);
      map.setLayoutProperty('field-line', 'visibility', cfg.draw ? 'none' : 'visible');
      return;
    }
    const [w, s, e, n] = layer.grid.bbox;
    const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [[w, n], [e, n], [e, s], [w, s]];
    // Clip to the user's field outlines; with no outline drawn yet there is nothing to clip to, so paint the whole layer.
    const outlines = fieldsRef.current.filter((f) => f.boundary.length >= 3).map((f) => f.boundary);
    const url = renderGrid(layer, layer.clipToFields && outlines.length ? outlines : undefined);
    const source = map.getSource('heat') as ImageSource | undefined;
    if (source) source.updateImage({ url, coordinates });
    else {
      map.addSource('heat', { type: 'image', url, coordinates });
      map.addLayer({ id: 'heat', type: 'raster', source: 'heat', paint: { 'raster-fade-duration': 0 } }, 'field-fill');
    }
    map.setPaintProperty('heat', 'raster-opacity', layer.clipToFields ? 0.88 : 0.72);
    map.setLayoutProperty('heat', 'visibility', 'visible');
    map.setPaintProperty('field-fill', 'fill-opacity', 0); // the orange tint would change the layer colors
    map.setLayoutProperty('field-line', 'visibility', 'visible');
  }, [ready, cfg.layer, cfg.draw, fields]);

  // Field shapes from the server + fly to the selected field
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('field') as GeoJSONSource).setData(fieldShapes(fields ?? []));
  }, [ready, fields]);

  const currentId = currentField?.id;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !currentField) return;
    map.flyTo({ center: currentField.center, zoom: currentField.zoom, duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, currentId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('draft') as GeoJSONSource).setData(draftShape(cfg.draw ? draft : []));
    map.getCanvas().style.cursor = cfg.draw ? 'crosshair' : '';
  }, [ready, draft, cfg.draw]);

  const map = mapRef.current;
  const layer = cfg.layer;

  return (
    <section className="map" hidden={cfg.hidden} aria-label="Field map">
      <div ref={container} className="map-canvas" />

      {ready && map && (cfg.points ?? []).map((p) => {
        const { x, y } = map.project(p.position);
        const Icon = PIN_ICON[p.kind];
        return (
          <div key={p.id} className={`pin pin-${p.kind} ${p.severity === 'high' ? 'pin-high' : ''}`} style={{ transform: `translate(${x}px, ${y}px)` }}>
            <span className="pin-head"><Icon size={p.kind === 'sensor' ? 20 : 16} strokeWidth={2.2} /></span>
            {p.label && <span className="pin-label">{p.label}</span>}
          </div>
        );
      })}

      <button className="glass field-button" onClick={() => navigate('/fields/new')}>
        Field <CirclePlus size={30} strokeWidth={2.4} />
      </button>

      {layer && (
        <div className="glass legend">
          <div className="legend-title">{layer.title}{layer.unit && ` (${layer.unit})`}</div>
          <div className="legend-body">
            <div className="legend-bar" style={{ background: rampCss(layer.ramp) }} />
            <div className="legend-ticks">{layer.legend.map((t, i) => <span key={i}>{t}</span>)}</div>
          </div>
        </div>
      )}
      {!layer && cfg.pointLegend && (
        <div className="glass legend legend-list">
          <div className="legend-title">{cfg.pointLegend.title}</div>
          {cfg.pointLegend.items.map((item) => {
            const Icon = PIN_ICON[item.kind];
            return <div key={item.label} className="legend-item"><Icon size={18} /> {item.label}</div>;
          })}
        </div>
      )}

      <div className="glass zoom">
        <button aria-label="Zoom in" onClick={() => map?.zoomIn()}><ZoomIn size={24} /></button>
        <button aria-label="Zoom out" onClick={() => map?.zoomOut()}><ZoomOut size={24} /></button>
      </div>

      {layer?.interpolated && (
        <div className="glass map-note">
          <Info size={14} /> {layer.source}, ~{Math.round(layer.resolutionMeters / 1000)} km cells. Detail inside the field is interpolated.
        </div>
      )}

      {cfg.year ? (
        <div className="glass year-picker">
          <button aria-label="Previous year" onClick={() => cfg.year!.onChange(cfg.year!.value - 1)}><ChevronLeft size={22} strokeWidth={3} /></button>
          <span>{cfg.year.value}</span>
          <button aria-label="Next year" onClick={() => cfg.year!.onChange(cfg.year!.value + 1)}><ChevronRight size={22} strokeWidth={3} /></button>
        </div>
      ) : (
        <div className="glass toolbar">
          {TOOLS.map(({ tool, icon: Icon, label }) => (
            <button
              key={tool}
              aria-label={label}
              title={label}
              aria-pressed={cfg.tool === tool}
              onClick={() => navigate(cfg.tool === tool ? '/' : `/layers/${tool}`)}
            >
              <Icon size={34} strokeWidth={2.2} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
