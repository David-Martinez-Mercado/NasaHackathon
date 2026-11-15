/**
 * Single entry point for data. Today it re-exports placeholder variables from `mock.ts`;
 * later each export is replaced by the matching /graphql query. Components import only from here.
 */
import { buildLayer } from './mock';
import type { GridLayer, LayerKind, Scenario } from './types';

export * from './types';
export {
  alertPoints,
  alerts,
  climatePrediction,
  cropOptions,
  field,
  humiditySummary,
  layerInfo,
  marketPrices,
  neighbors,
  paintedFields,
  plotHistory,
  rotationImpact,
  sensors,
  statistics,
  waterBalance,
  waterPoints,
} from './mock';

export const DEFAULT_SCENARIO: Scenario = { rainPct: 0, tempDelta: 0, soilMoisture: 50 };

export function getLayer(kind: LayerKind, scenario: Scenario): GridLayer {
  return buildLayer(kind, scenario);
}
