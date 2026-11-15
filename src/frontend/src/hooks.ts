import { useEffect, useState, type DependencyList } from 'react';
import { useApp } from './AppContext';
import { DEFAULT_SCENARIO, errorMessage, fetchLayer, SCENARIO_LAYERS, type GridLayer, type LayerKind } from './data';

export interface Remote<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/** Runs a query when `deps` change. Keeps the previous data while reloading so the screen does not flash. */
export function useRemote<T>(load: () => Promise<T>, deps: DependencyList, enabled = true): Remote<T> {
  const [state, setState] = useState<Remote<T>>({ data: null, error: null, loading: enabled });
  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    load().then(
      (data) => !cancelled && setState({ data, error: null, loading: false }),
      (error) => !cancelled && setState((s) => ({ data: s.data, error: errorMessage(error), loading: false })),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);
  return state;
}

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** A map layer for the current "What if?" sliders. Slider drags are debounced so the server is not hit on every pixel. */
export function useLayer(kind: LayerKind, enabled = true): Remote<GridLayer> {
  const { scenario } = useApp();
  const wanted = useDebounced(scenario, 300);
  const effective = SCENARIO_LAYERS.includes(kind) ? wanted : DEFAULT_SCENARIO;
  return useRemote(() => fetchLayer(kind, effective), [kind, effective.rainPct, effective.tempDelta], enabled);
}
