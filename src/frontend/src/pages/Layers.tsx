import { useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useApp, useMapConfig } from '../AppContext';
import { Card, Panel, ReadField } from '../components/ui';
import { getLayer, humiditySummary as h, layerInfo, sensors, waterBalance, waterPoints } from '../data';

function VariableLayer({ kind }: { kind: 'temperature' | 'vulnerability' }) {
  const { scenario } = useApp();
  const layer = useMemo(() => getLayer(kind, scenario), [kind, scenario]);
  useMapConfig({ layer, tool: kind, points: sensors }, [layer]);
  const info = layerInfo[kind];
  return (
    <Panel title={info.title}>
      <Card>
        <ReadField label="Variable" value={info.variable} />
        <ReadField label="Description" value={info.description} />
        <ReadField label="Value" value={info.value} small />
      </Card>
      <h2 className="section-title">Recommendations</h2>
      <Card className="recommendations">
        <ul>{info.recommendations.map((r) => <li key={r}>{r}</li>)}</ul>
      </Card>
    </Panel>
  );
}

function Humidity() {
  const { scenario } = useApp();
  const layer = useMemo(() => getLayer('humidity', scenario), [scenario]);
  useMapConfig({ layer, tool: 'humidity' }, [layer]);
  return (
    <Panel title="Humidity">
      <div className="stat-row">
        <div className="stat"><strong>Root</strong><b>{h.root}%</b></div>
        <div className="stat"><strong>Surface</strong><b>{h.surface}%</b></div>
        <div className="stat"><strong>Evaporation</strong><b>{h.evaporation}%</b></div>
      </div>
      <Card className="moisture">
        <div className="moisture-head"><span>Root-zone moisture</span><em className="badge-warn">{h.status}</em></div>
        <div className="moisture-value"><b>{h.root}</b> % · percentile {h.percentile}</div>
        <div className="moisture-bar"><i style={{ left: `${h.root}%` }} /></div>
        <div className="moisture-scale"><span>0%</span><span>100%</span></div>
        <p>{h.description}</p>
        <small>{h.source}</small>
      </Card>
      <div className="note-box">{h.diagnosis}</div>
      <h2 className="section-title">Recommendations</h2>
      <p className="section-sub">Crops for your moisture</p>
      <div className="crop-list">
        {h.crops.map((c) => (
          <div key={c.crop} className="crop">
            <strong>{c.crop}</strong>
            <span>{c.reason}</span>
            <em className={c.verdict}>{c.verdict === 'recommended' ? 'Recommended' : 'Avoid without irrigation'}</em>
          </div>
        ))}
      </div>
      <div className="tip-row">{h.tips.map((t) => <div key={t} className="tip">{t}</div>)}</div>
    </Panel>
  );
}

const LIGHTS = [
  { status: 'sufficient', label: 'Sufficient availability' },
  { status: 'limited', label: 'Limited availability' },
  { status: 'deficit', label: 'Water deficit' },
] as const;

function Water() {
  useMapConfig(
    {
      tool: 'water',
      points: waterPoints,
      pointLegend: {
        title: 'Water reserves',
        items: [
          { kind: 'reservoir', label: 'Dam' },
          { kind: 'tank', label: 'Water tank' },
          { kind: 'groundwater', label: 'Groundwater' },
        ],
      },
    },
    [],
  );
  return (
    <Panel title="Water balance">
      <Card className="grid-2">
        <ReadField label="Available water" value={waterBalance.available} />
        <ReadField label="Water demand" value={waterBalance.demand} />
        <ReadField label="Rainfall contribution" value={waterBalance.rainfall} />
        <ReadField label="Water deficit" value={waterBalance.deficit} />
      </Card>
      <h2 className="section-title">Water traffic light</h2>
      <Card className="traffic">
        <div className="traffic-lamp">
          {LIGHTS.map((l) => <i key={l.status} className={`lamp lamp-${l.status} ${waterBalance.status === l.status ? 'on' : ''}`} />)}
        </div>
        <div className="traffic-labels">
          {LIGHTS.map((l) => <span key={l.status} className={waterBalance.status === l.status ? 'on' : ''}>{l.label}</span>)}
        </div>
      </Card>
    </Panel>
  );
}

export function LayerPage() {
  const { tool } = useParams();
  if (tool === 'temperature' || tool === 'vulnerability') return <VariableLayer key={tool} kind={tool} />;
  if (tool === 'humidity') return <Humidity />;
  if (tool === 'water') return <Water />;
  return <Navigate to="/" replace />;
}
