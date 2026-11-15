import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type DependencyList, type ReactNode,
} from 'react';
import {
  DEFAULT_SCENARIO, errorMessage, fetchFields, fetchStatus, type Field, type GridLayer, type LngLat, type MapPoint, type MapTool,
  type Scenario, type ServerStatus,
} from './data';

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
  year?: { value: number; onChange: (year: number) => void };
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
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
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
