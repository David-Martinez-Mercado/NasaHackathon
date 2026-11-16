import {
  Archive, ChevronLeft, ChevronRight, CirclePlus, CloudRain, Cpu, Cylinder, Droplet, Droplets, Globe, Info, Mountain,
  PanelLeftOpen, Sun, Thermometer, ThermometerSun, TriangleAlert, ZoomIn, ZoomOut, type LucideIcon,
} from 'lucide-react';
import maplibregl, { type GeoJSONSource, type ImageSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useApp, useSheet, type GlobalVar } from '../AppContext';
import { DEFAULT_CENTER, DEFAULT_ZOOM, type Field, type LngLat, type MapPoint, type MapTool } from '../data';
import { GlobalLayer } from '../components/GlobalLayer';
import { Spinner } from '../components/ui';
import { useMatchMedia } from '../hooks';
import { MOTION, Q_REDUCED_MOTION } from '../layout';
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

const GLOBAL_TOOLS: { id: GlobalVar; icon: LucideIcon; label: string }[] = [
  { id: 'temperature', icon: Thermometer, label: 'Temperature (observed)' },
  { id: 'moisture', icon: Droplet, label: 'Soil moisture (observed)' },
  { id: 'rain', icon: CloudRain, label: 'Rain over 7 days (observed)' },
];

const TOOLS: { tool: MapTool; icon: LucideIcon; label: string }[] = [
  { tool: 'temperature', icon: Thermometer, label: 'Temperature layer' },
  { tool: 'humidity', icon: Droplet, label: 'Humidity layer' },
  { tool: 'water', icon: Archive, label: 'Water reserves layer' },
  { tool: 'vulnerability', icon: TriangleAlert, label: 'Vulnerability layer' },
  { tool: 'rain', icon: CloudRain, label: 'Rain layer' },
  { tool: 'drought', icon: Sun, label: 'Drought layer' },
  { tool: 'terrain', icon: Mountain, label: 'Elevation, slope and erosion layers' },
];

const NO_PADDING: maplibregl.PaddingOptions = { top: 0, right: 0, bottom: 0, left: 0 };
/** JS approximation of cubic-bezier(.32,.72,0,1), close enough for the camera that follows the sheet. */
const drawerEase = (t: number) => 1 - Math.pow(1 - t, 3.2);

export function FieldMap() {
  const { mapConfig: cfg, draft, setDraft, fields, currentField, globalMode, setGlobalMode, globalVar, setGlobalVar } = useApp();
  const sheet = useSheet();
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const reduced = useMatchMedia(Q_REDUCED_MOTION);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const container = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const showPanelRef = useRef<HTMLButtonElement>(null);
  const panelWasOpen = useRef(sheet.panelOpen);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const paddingRef = useRef<maplibregl.PaddingOptions>(NO_PADDING);
  const heatUrl = useRef<string | null>(null);
  const drawing = useRef(false);
  const draftRef = useRef<LngLat[]>([]);
  const [ready, setReady] = useState(false);
  const [, repaint] = useState(0);
  const [globalBusy, setGlobalBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
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
    // A layer replaced before its image finished loading makes maplibre abort the previous load: expected, not an error.
    map.on('error', (e) => {
      if ((e.error as { name?: string } | undefined)?.name === 'AbortError') return;
      console.error(e.error);
    });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current!);
    map.on('click', (e) => {
      if (drawing.current) {
        setDraft([...draftRef.current, [e.lngLat.lng, e.lngLat.lat]]);
        return;
      }
      // Sheet mode: tapping the strip of map above an expanded sheet brings the map back (sheet to half).
      const s = sheetRef.current;
      if (s.isSheet && s.snapRef.current === 'expanded') s.snapTo('half', 'tap');
    });
    return () => {
      observer.disconnect();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The sheet tells the map where it is going: the visible area is above it, so the camera eases its padding along.
  useEffect(() => {
    const target = sheet.mapTargetRef;
    target.current = (sheetH, ms) => {
      paddingRef.current = { ...NO_PADDING, bottom: sheetH, top: topRef.current?.offsetHeight ?? 0 };
      const map = mapRef.current;
      if (!map) return;
      if (ms === 0) map.jumpTo({ padding: paddingRef.current });
      else map.easeTo({ padding: paddingRef.current, duration: ms, easing: drawerEase });
    };
    return () => {
      target.current = null;
    };
  }, [sheet.mapTargetRef]);

  // Hide / show panel: focus follows the control that replaced the one just used.
  useEffect(() => {
    if (panelWasOpen.current === sheet.panelOpen) return;
    panelWasOpen.current = sheet.panelOpen;
    if (sheet.panelOpen) document.getElementById('panel')?.focus();
    else showPanelRef.current?.focus();
  }, [sheet.panelOpen]);

  // Outside sheet mode nothing covers the map.
  useEffect(() => {
    if (sheet.isSheet) return;
    paddingRef.current = NO_PADDING;
    mapRef.current?.jumpTo({ padding: NO_PADDING });
  }, [sheet.isSheet]);

  // Color layer
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const layer = globalMode ? null : cfg.layer; // global mode shows only its own colors: no field layer or orange tint under them
    if (globalMode) {
      if (map.getLayer('heat')) map.setLayoutProperty('heat', 'visibility', 'none');
      map.setPaintProperty('field-fill', 'fill-opacity', 0);
      map.setLayoutProperty('field-line', 'visibility', 'visible');
      return;
    }
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
    if (source) {
      if (heatUrl.current !== url) source.updateImage({ url, coordinates });
    }
    else {
      map.addSource('heat', { type: 'image', url, coordinates });
      map.addLayer({ id: 'heat', type: 'raster', source: 'heat', paint: { 'raster-fade-duration': 0 } }, 'field-fill');
    }
    heatUrl.current = url;
    map.setPaintProperty('heat', 'raster-opacity', layer.clipToFields ? 0.88 : 0.72);
    map.setLayoutProperty('heat', 'visibility', 'visible');
    map.setPaintProperty('field-fill', 'fill-opacity', 0); // the orange tint would change the layer colors
    map.setLayoutProperty('field-line', 'visibility', 'visible');
  }, [ready, cfg.layer, cfg.draw, fields, globalMode]);

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
    const camera = { center: currentField.center, zoom: currentField.zoom, padding: paddingRef.current };
    if (reducedRef.current) map.jumpTo(camera);
    else map.flyTo({ ...camera, duration: MOTION.flyMs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, currentId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('draft') as GeoJSONSource).setData(draftShape(cfg.draw ? draft : []));
    map.getCanvas().style.cursor = cfg.draw ? 'crosshair' : '';
  }, [ready, draft, cfg.draw]);

  // Toolbar: edge fade only when it really scrolls; the active layer is kept in view.
  const showYear = !!cfg.year;
  useEffect(() => {
    const bar = toolbarRef.current;
    if (!bar) return;
    const check = () => setOverflowing(bar.scrollWidth > bar.clientWidth + 1);
    const observer = new ResizeObserver(check);
    observer.observe(bar);
    check();
    return () => observer.disconnect();
  }, [showYear, globalMode]);
  useEffect(() => {
    const bar = toolbarRef.current;
    const active = bar?.querySelector<HTMLElement>('[aria-current="page"], [aria-pressed="true"]');
    if (!overflowing || !bar || !active) return;
    const left = active.offsetLeft - (bar.clientWidth - active.offsetWidth) / 2;
    bar.scrollTo({ left, behavior: reducedRef.current ? 'auto' : 'smooth' });
  }, [overflowing, cfg.tool, globalVar, globalMode]);

  const map = mapRef.current;
  const layer = cfg.layer;
  const mapReady = ready && !!map;
  const year = cfg.year;

  return (
    <section className="map" hidden={cfg.hidden} aria-label="Field map">
      <div ref={container} className="map-canvas" />

      {ready && map && (cfg.points ?? []).map((p) => {
        const { x, y } = map.project(p.position);
        const Icon = PIN_ICON[p.kind];
        return (
          <div key={p.id} className={`pin pin-${p.kind} ${p.severity === 'high' ? 'pin-high' : ''}`} style={{ transform: `translate(${x}px, ${y}px)` }}>
            <span className="pin-head"><Icon size={p.kind === 'sensor' ? 20 : 16} strokeWidth={2.2} aria-hidden /></span>
            {p.label && <span className="pin-label">{p.label}</span>}
          </div>
        );
      })}

      <div className="map-ui">
        <div ref={topRef} className="map-area map-area-tl">
          {!sheet.isSheet && !sheet.panelOpen && (
            <button
              type="button" className="map-btn map-icon-btn show-panel" aria-label="Show panel" title="Show panel"
              ref={showPanelRef} onClick={() => sheet.setPanelOpen(true)}
            >
              <PanelLeftOpen size={20} aria-hidden />
            </button>
          )}
          <Link to="/fields/new" className="map-btn field-button">
            Field <CirclePlus className="field-button-icon" strokeWidth={2.4} aria-hidden />
          </Link>
          <button
            type="button" className="map-btn global-button" aria-pressed={globalMode} aria-busy={(globalMode && globalBusy) || undefined}
            onClick={() => setGlobalMode(!globalMode)} title="Show observed weather for any place in the world"
          >
            {globalMode && globalBusy ? <Spinner /> : <Globe size={20} aria-hidden />}
            <span className="global-label">Global mode</span>
            <i className="switch" aria-hidden />
          </button>
        </div>

        <div className="map-area map-area-tr">
          {layer && (
            <div
              className="map-panel legend"
              style={{ '--ramp-v': rampCss(layer.ramp), '--ramp-h': rampCss(layer.ramp, '90deg') } as CSSProperties}
            >
              <div className="legend-title">{layer.title}{layer.unit && ` (${layer.unit})`}</div>
              <div className="legend-body">
                <div className="legend-bar" />
                <div className="legend-ticks">{layer.legend.map((t, i) => <span key={i}>{t}</span>)}</div>
              </div>
            </div>
          )}
        </div>

        <div className="map-area map-area-info">
          {layer?.interpolated && (
            <div className="map-note" data-open={noteOpen}>
              <button
                type="button" className="map-btn map-icon-btn map-note-toggle" aria-label="About this layer"
                aria-expanded={noteOpen} aria-controls="map-note-body" onClick={() => setNoteOpen(!noteOpen)}
              >
                <Info size={20} aria-hidden />
              </button>
              <div id="map-note-body" className="map-panel map-note-body">
                <Info size={14} aria-hidden /> {layer.source}, ~{Math.round(layer.resolutionMeters / 1000)} km cells. Detail inside the field is interpolated.
              </div>
            </div>
          )}
          {globalMode && <GlobalLayer map={mapRef.current} ready={ready} onBusy={setGlobalBusy} />}
        </div>

        <div className="map-area map-area-side" data-sheet-follow="0.5">
          <div className="zoom">
            <button
              type="button" className="map-btn map-icon-btn" aria-label="Zoom in" disabled={!mapReady}
              onClick={() => map?.zoomIn({ animate: !reducedRef.current })}
            >
              <ZoomIn size={20} aria-hidden />
            </button>
            <button
              type="button" className="map-btn map-icon-btn" aria-label="Zoom out" disabled={!mapReady}
              onClick={() => map?.zoomOut({ animate: !reducedRef.current })}
            >
              <ZoomOut size={20} aria-hidden />
            </button>
          </div>
        </div>

        <div className="map-area map-area-bar" data-sheet-follow="1">
          {year ? (
            <div className="map-panel year-picker">
              <button
                type="button" className="map-btn map-icon-btn" aria-label="Previous year"
                disabled={year.min != null && year.value <= year.min} onClick={() => year.onChange(year.value - 1)}
              >
                <ChevronLeft size={22} strokeWidth={3} aria-hidden />
              </button>
              <output aria-live="polite">{year.value}</output>
              <button
                type="button" className="map-btn map-icon-btn" aria-label="Next year"
                disabled={year.max != null && year.value >= year.max} onClick={() => year.onChange(year.value + 1)}
              >
                <ChevronRight size={22} strokeWidth={3} aria-hidden />
              </button>
            </div>
          ) : (
            <div ref={toolbarRef} className={`toolbar ${overflowing ? 'is-overflowing' : ''}`}>
              {globalMode && GLOBAL_TOOLS.map(({ id, icon: Icon, label }) => (
                <button
                  key={id} type="button" className="map-tool" aria-label={label} title={label}
                  aria-pressed={globalVar === id} onClick={() => setGlobalVar(id)}
                >
                  <Icon strokeWidth={2.2} aria-hidden />
                </button>
              ))}
              {!globalMode && TOOLS.map(({ tool, icon: Icon, label }) => {
                const active = cfg.tool === tool;
                return (
                  <Link
                    key={tool} to={active ? '/' : `/layers/${tool}`} className="map-tool" title={label}
                    aria-label={active ? `Hide ${label.charAt(0).toLowerCase()}${label.slice(1)}` : label}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon strokeWidth={2.2} aria-hidden />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
