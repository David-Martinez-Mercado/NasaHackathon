import { createContext, useContext, useEffect, useMemo, useState, type DependencyList, type ReactNode } from 'react';
import { DEFAULT_SCENARIO, type GridLayer, type LngLat, type MapPoint, type MapTool, type Scenario } from './data';

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
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState(DEFAULT_SCENARIO);
  const [mapConfig, setMapConfig] = useState<MapConfig>({});
  const [draft, setDraft] = useState<LngLat[]>([]);
  const value = useMemo(
    () => ({ scenario, setScenario, mapConfig, setMapConfig, draft, setDraft }),
    [scenario, mapConfig, draft],
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
