import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useApp, useMapConfig, useSheet } from '../AppContext';
import { CropSuggestions } from '../components/CropSuggestions';
import { Card, Chips, Notice, Panel, ReadField } from '../components/ui';
import { fetchHumidity, fetchUnavailable, valueAt, type GridLayer } from '../data';
import { useLayer, useRemote } from '../hooks';

const INFO = {
  temperature: {
    title: 'Heat-wave risk',
    variable: 'Probability of a heat wave in the next 7 days (%)',
    description: 'Model estimate for the weather-station area (about 50 km), not a measurement taken in your field.',
  },
  vulnerability: {
    title: 'Vulnerability',
    variable: 'Zone vulnerability index (0–100)',
    description: 'How fragile each zone is, combining climate, soil and crop history. Only cropland has a value.',
  },
  rain: {
    title: 'Rain probability',
    variable: 'Chance of rain on a given day (%)',
    description: 'Model estimate for the weather-station area (about 50 km). It rises or falls with the "What if?" rain slider.',
  },
  drought: {
    title: 'Drought risk',
    variable: 'Chance of drought over the next 3 months (%)',
    description: 'Based on a drought index in cells of about 25 km. It does not change with the sliders.',
  },
} as const;

function layerValue(layer: GridLayer | null, at: [number, number] | undefined): string {
  if (!layer || !at) return '—';
  const v = valueAt(layer, at);
  return v == null ? 'No data at this place' : `${Math.round(v * 10) / 10}${layer.unit ? ` ${layer.unit}` : ''}`;
}

function VariableLayer({ kind }: { kind: 'temperature' | 'vulnerability' | 'rain' | 'drought' }) {
  const { currentField } = useApp();
  const layer = useLayer(kind);
  useMapConfig({ layer: layer.data, tool: kind, points: [] }, [layer.data]);
  const info = INFO[kind];
  return (
    <Panel title={info.title}>
      {layer.error && <Notice kind="error">{layer.error}</Notice>}
      {layer.loading && !layer.data && <Notice kind="loading">Loading layer…</Notice>}
      <Card>
        <ReadField label="Variable" value={info.variable} />
        <ReadField label="Description" value={info.description} />
        <ReadField
          label={currentField ? `Value at ${currentField.name}` : 'Value'}
          value={currentField ? layerValue(layer.data, currentField.center) : 'Add a field to see its value'}
          small
        />
      </Card>
      {layer.data && (
        <>
          <h2 className="section-title">About this layer</h2>
          <Card className="recommendations">
            <ul>
              <li>Source: {layer.data.source}</li>
              <li>Data up to {layer.data.dataAsOf}</li>
              {layer.data.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </Card>
        </>
      )}
    </Panel>
  );
}

function Humidity() {
  const { currentField } = useApp();
  const layer = useLayer('humidity');
  const summary = useRemote(fetchHumidity, []);
  const h = summary.data;
  useMapConfig({ layer: layer.data, tool: 'humidity', points: [] }, [layer.data]);
  return (
    <Panel title="Humidity">
      {(summary.error || layer.error) && <Notice kind="error">{summary.error ?? layer.error}</Notice>}
      {summary.loading && !h && <Notice kind="loading">Loading…</Notice>}
      {h && (
        <>
          <div className="stat-row">
            <div className="stat"><strong>Root</strong><b>{h.root}%</b></div>
            <div className="stat"><strong>Surface</strong><b>{h.surface}%</b></div>
            <div className="stat"><strong>Evaporation</strong><b>{h.evaporation}</b></div>
          </div>
          <Card className="moisture">
            <div className="moisture-head"><span>Root-zone moisture</span><em className="badge-warn">{h.status}</em></div>
            <div className="moisture-value"><b>{h.root}</b> % · percentile {h.percentile}</div>
            <div className="moisture-bar"><i style={{ left: `${h.root}%` }} /></div>
            <div className="moisture-scale"><span>0%</span><span>100%</span></div>
            <p>Water directly available to the roots, compared with the same days of earlier years.</p>
            <small>{h.source}</small>
            <small>Data up to {h.asOf}</small>
          </Card>
        </>
      )}
      <CropSuggestions field={currentField} title="Crops to consider" />
    </Panel>
  );
}

function Water() {
  const unavailable = useRemote(fetchUnavailable, []);
  useMapConfig({ tool: 'water', points: [] }, []);
  return (
    <Panel title="Water balance">
      <Notice>
        Water balance and water reserves are not available: there is no model or data for them yet, so nothing is shown rather than made-up numbers.
      </Notice>
      {unavailable.error && <Notice kind="error">{unavailable.error}</Notice>}
      {unavailable.data && unavailable.data.length > 0 && (
        <Card title="What the server does not have yet">
          <ul className="note-list">{unavailable.data.map((x) => <li key={x}>{x}</li>)}</ul>
        </Card>
      )}
    </Panel>
  );
}

const TERRAIN = {
  Elevation: { kind: 'elevation', variable: 'Height above sea level (m)', description: 'Measured by the SRTM mission in 2000 (NASADEM, 30 m cells). It does not change.' },
  Slope: { kind: 'slope', variable: 'Ground slope (%)', description: 'Metres of rise per 100 m, from the elevation data. Averaged per map cell, so small ditches and knolls are smoothed out.' },
  'Erosion potential': { kind: 'erosion', variable: 'Exposure to water erosion (0–100)', description: 'Soil erodibility × slope × rain, compared with the rest of the sampled cropland. Not measured soil loss.' },
} as const;
type TerrainName = keyof typeof TERRAIN;

function Terrain() {
  const { currentField } = useApp();
  const [view, setView] = useState<TerrainName>('Elevation');
  const { requestMapView } = useSheet();
  const info = TERRAIN[view];
  const layer = useLayer(info.kind);
  useMapConfig({ layer: layer.data, tool: 'terrain', points: [] }, [layer.data]);
  return (
    <Panel title="Terrain">
      <Chips
        options={Object.keys(TERRAIN) as TerrainName[]} value={view} labelledBy="panel-title"
        onChange={(v) => {
          setView(v);
          requestMapView();
        }}
      />
      {layer.error && <Notice kind="error">{layer.error}</Notice>}
      {layer.loading && !layer.data && <Notice kind="loading">Loading layer…</Notice>}
      <Card>
        <ReadField label="Variable" value={info.variable} />
        <ReadField label="Description" value={info.description} />
        <ReadField
          label={currentField ? `Value at ${currentField.name}` : 'Value'}
          value={currentField ? layerValue(layer.data, currentField.center) : 'Add a field to see its value'}
          small
        />
      </Card>
      {layer.data && (
        <Card className="recommendations">
          <ul>
            <li>Source: {layer.data.source}</li>
            {layer.data.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </Card>
      )}
    </Panel>
  );
}

export function LayerPage() {
  const { tool } = useParams();
  if (tool === 'temperature' || tool === 'vulnerability' || tool === 'rain' || tool === 'drought') return <VariableLayer key={tool} kind={tool} />;
  if (tool === 'humidity') return <Humidity />;
  if (tool === 'terrain') return <Terrain />;
  if (tool === 'water') return <Water />;
  return <Navigate to="/" replace />;
}
