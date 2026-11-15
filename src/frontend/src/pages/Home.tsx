import { CloudDrizzle, Sun, TrendingUp, Triangle } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp, useMapConfig } from '../AppContext';
import { Card, Panel, Slider } from '../components/ui';
import { alertPoints, alerts, getLayer, rotationImpact, sensors, type AlertKind } from '../data';

const signed = (v: number, unit: string) => `${v > 0 ? '+' : ''}${v}${unit}`;

export function Home() {
  const { scenario, setScenario } = useApp();
  const [params, setParams] = useSearchParams();
  const requested = params.get('alert');
  const alert = alerts.some((a) => a.kind === requested) ? (requested as AlertKind) : null;
  const setAlert = (kind: AlertKind | null) => setParams(kind ? { alert: kind } : {}, { replace: true });
  const drought = useMemo(() => getLayer('drought', scenario), [scenario]);

  useMapConfig(
    {
      layer: alert === 'drought' ? drought : null,
      points: alert ? alertPoints[alert] : sensors,
    },
    [alert, drought],
  );

  const icon = <CloudDrizzle size={20} />;
  return (
    <Panel title="HOME" brand>
      <Card title="What if?" className="whatif">
        <Slider
          icon={icon} label="Rainfall change" min={-50} max={50} value={scenario.rainPct}
          display={signed(scenario.rainPct, '%')} marks={['-50% drought', '0% current', '+50%']}
          onChange={(rainPct) => setScenario({ ...scenario, rainPct })}
        />
        <Slider
          icon={icon} label="Temperature anomaly" min={-2} max={4} step={0.5} value={scenario.tempDelta}
          display={signed(scenario.tempDelta, ' °C')} marks={['-2 °C', '0 °C', '+4 °C']}
          onChange={(tempDelta) => setScenario({ ...scenario, tempDelta })}
        />
        <Slider
          icon={icon} label="Soil moisture" min={0} max={100} value={scenario.soilMoisture}
          display={`${scenario.soilMoisture}%`} marks={['Critical', 'Normal', 'Optimal']}
          onChange={(soilMoisture) => setScenario({ ...scenario, soilMoisture })}
        />
        <hr />
        <div className="rotation">
          <div className="rotation-row"><strong>{rotationImpact.title}</strong><span>{rotationImpact.context}</span></div>
          <div className="rotation-row">
            <b>{rotationImpact.currentRotation}</b>
            <em className="risk">{rotationImpact.risk}</em>
            <span className="metric">{rotationImpact.metric}</span>
          </div>
          <p>{rotationImpact.suggestion}</p>
        </div>
      </Card>

      <Card title="Critical alerts" className="alerts">
        <div className="alert-grid">
          {alerts.map((a) => (
            <button key={a.kind} className="alert" aria-pressed={alert === a.kind} onClick={() => setAlert(alert === a.kind ? null : a.kind)}>
              <strong>{a.title}</strong>
              <b>{a.value}</b>
              <span>{a.detail}</span>
              {a.kind === 'drought' && <><Sun className="alert-icon" size={24} color="#FF5A00" /><i className="alert-bar"><i /></i></>}
              {a.kind === 'stress' && <span className="alert-icon alert-trend"><TrendingUp size={16} /><Triangle size={16} /></span>}
            </button>
          ))}
        </div>
      </Card>
    </Panel>
  );
}
