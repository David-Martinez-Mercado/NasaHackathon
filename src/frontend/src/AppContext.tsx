import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type DependencyList, type MutableRefObject,
  type ReactNode,
} from 'react';
import {
  DEFAULT_SCENARIO, errorMessage, fetchFields, fetchStatus, type Field, type GridLayer, type LngLat, type MapPoint, type MapTool,
  type Scenario, type ServerStatus,
} from './data';
import { useMatchMedia } from './hooks';
import { prefersReducedMotion, Q_SHEET } from './layout';
import type { SheetController, Snap, SnapSource } from './sheet';

/** Variable shown by global mode; chosen with the same bottom buttons as the normal layers. */
export type GlobalVar = 'temperature' | 'moisture' | 'rain';

export interface LegendItem {
  kind: MapPoint['kind'];
  label: string;
}

/** What the current page wants the shared map to show. */
export interface MapConfig {
  layer?: GridLayer | null;
  points?: MapPoint[];
  pointLegend?: { title: string; items: LegendItem[] };
  tool?: MapTool | null;
  draw?: boolean;
  /** Year picker over the map. `min`/`max` are optional limits (not set by any page yet). */
  year?: { value: number; onChange: (year: number) => void; min?: number; max?: number };
  hidden?: boolean;
}

interface AppState {
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  mapConfig: MapConfig;
  setMapConfig: (c: MapConfig) => void;
  draft: LngLat[];
  setDraft: (d: LngLat[]) => void;
  /** Fields from the server. `null` until the first load finishes. */
  fields: Field[] | null;
  fieldsError: string | null;
  refreshFields: () => Promise<Field[]>;
  currentField: Field | null;
  selectField: (id: string) => void;
  status: ServerStatus | null;
  globalMode: boolean;
  globalVar: GlobalVar;
  setGlobalVar: (v: GlobalVar) => void;
  setGlobalMode: (on: boolean) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState(DEFAULT_SCENARIO);
  const [mapConfig, setMapConfig] = useState<MapConfig>({});
  const [draft, setDraft] = useState<LngLat[]>([]);
  const [fields, setFields] = useState<Field[] | null>(null);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [globalMode, setGlobalMode] = useState(false);
  const [globalVar, setGlobalVar] = useState<GlobalVar>('temperature');

  const refreshFields = useCallback(async () => {
    try {
      const list = await fetchFields();
      setFields(list);
      setFieldsError(null);
      return list;
    } catch (error) {
      setFieldsError(errorMessage(error));
      setFields((current) => current ?? []);
      return [];
    }
  }, []);

  useEffect(() => {
    void refreshFields();
    fetchStatus().then(setStatus, () => setStatus(null));
  }, [refreshFields]);

  const currentField = useMemo(
    () => fields?.find((f) => f.id === selectedId) ?? fields?.[0] ?? null,
    [fields, selectedId],
  );
  const value = useMemo(
    () => ({
      scenario, setScenario, mapConfig, setMapConfig, draft, setDraft,
      fields, fieldsError, refreshFields, currentField, selectField: setSelectedId, status, globalMode, setGlobalMode, globalVar, setGlobalVar,
    }),
    [scenario, mapConfig, draft, fields, fieldsError, refreshFields, currentField, status, globalMode, globalVar],
  );
  return (
    <Ctx.Provider value={value}>
      <SheetProvider>{children}</SheetProvider>
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

/** Pages call this to tell the shared map what to draw. */
export function useMapConfig(config: MapConfig, deps: DependencyList) {
  const { setMapConfig } = useApp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setMapConfig(config), deps);
}

/* ---------- bottom sheet (sheet mode only) ---------- */

interface SheetState {
  /** True when the layout is in sheet mode (phones, narrow portrait tablets). */
  isSheet: boolean;
  snap: Snap;
  /** Moves the sheet to a snap; a no-op outside sheet mode. */
  snapTo: (snap: Snap, source?: SnapSource) => void;
  /** Runs `fn` once the current or next snap finishes (immediately if nothing is moving). */
  afterSettle: (fn: () => void) => void;
  /**
   * A control whose effect is on the map was used: in sheet mode an expanded sheet drops to half so the map shows,
   * then the control is scrolled back into view.
   */
  requestMapView: (control?: Element | null) => void;
  /* wiring between the Panel (owns the controller) and the FieldMap (eases its padding) */
  snapRef: MutableRefObject<Snap>;
  /** Desktop and tablet: the panel column can be hidden to give the map the whole width. */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  /** True for a moment after the panel is shown again: the only time its entry animates. */
  panelReveal: boolean;
  endPanelReveal: () => void;
  controllerRef: MutableRefObject<SheetController | null>;
  mapTargetRef: MutableRefObject<((heightPx: number, ms: number) => void) | null>;
  onSettled: (snap: Snap) => void;
}

const SheetCtx = createContext<SheetState | null>(null);

function SheetProvider({ children }: { children: ReactNode }) {
  const isSheet = useMatchMedia(Q_SHEET);
  const [snap, setSnap] = useState<Snap>('half');
  const [panelOpen, setPanelOpenState] = useState(true);
  const [panelReveal, setPanelReveal] = useState(false);
  const panelOpenRef = useRef(true);
  // Both states change in the same render, so the reveal attribute is there when the panel goes from hidden to shown.
  const setPanelOpen = useCallback((open: boolean) => {
    if (open && !panelOpenRef.current) setPanelReveal(true);
    panelOpenRef.current = open;
    setPanelOpenState(open);
  }, []);
  const endPanelReveal = useCallback(() => setPanelReveal(false), []);
  const snapRef = useRef<Snap>('half');
  const controllerRef = useRef<SheetController | null>(null);
  const mapTargetRef = useRef<((heightPx: number, ms: number) => void) | null>(null);
  const pending = useRef<(() => void)[]>([]);

  const flush = useCallback(() => {
    const queued = pending.current;
    pending.current = [];
    queued.forEach((fn) => fn());
  }, []);

  const onSettled = useCallback((next: Snap) => {
    snapRef.current = next;
    setSnap(next);
    flush();
  }, [flush]);

  const snapTo = useCallback((next: Snap, source: SnapSource = 'auto') => {
    const controller = controllerRef.current;
    if (!controller) {
      flush();
      return;
    }
    controller.snapTo(next, { source });
  }, [flush]);

  const afterSettle = useCallback((fn: () => void) => {
    pending.current.push(fn);
  }, []);

  const requestMapView = useCallback((control?: Element | null) => {
    const reveal = () => control?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    if (controllerRef.current && snapRef.current === 'expanded') {
      pending.current.push(reveal);
      controllerRef.current.snapTo('half', { source: 'auto' });
    }
  }, []);

  const value = useMemo(
    () => ({
      isSheet, snap, snapTo, afterSettle, requestMapView, snapRef, panelOpen, setPanelOpen, panelReveal, endPanelReveal,
      controllerRef, mapTargetRef, onSettled,
    }),
    [isSheet, snap, snapTo, afterSettle, requestMapView, panelOpen, setPanelOpen, panelReveal, endPanelReveal, onSettled],
  );
  return <SheetCtx.Provider value={value}>{children}</SheetCtx.Provider>;
}

export function useSheet(): SheetState {
  const ctx = useContext(SheetCtx);
  if (!ctx) throw new Error('useSheet must be used inside AppProvider');
  return ctx;
}
