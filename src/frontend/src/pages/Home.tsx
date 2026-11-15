import { CloudDrizzle, Sun, TrendingUp, Triangle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApp, useMapConfig } from '../AppContext';
import { Card, Notice, Panel, Slider } from '../components/ui';
import { fetchAlerts, fetchStressPoints, type AlertKind } from '../data';
import { useLayer, useRemote } from '../hooks';

const signed = (v: number, unit: string) => `${v > 0 ? '+' : ''}${v}${unit}`;

export function Home() {
  const { scenario, setScenario, fields, fieldsError, currentField, selectField, status } = useApp();
  const [params, setParams] = useSearchParams();
  const requested = params.get('alert');
  const alerts = useRemote(fetchAlerts, []);
  const list = alerts.data ?? [];
  const alert = list.some((a) => a.kind === requested && a.available) ? (requested as AlertKind) : null;
  const setAlert = (kind: AlertKind | null) => setParams(kind ? { alert: kind } : {}, { replace: true });

  const drought = useLayer('drought');
  const stress = useRemote(fetchStressPoints, [], alert === 'stress');

  useMapConfig(
    {
      layer: alert === 'drought' ? drought.data : null,
      points: alert === 'stress' ? stress.data ?? [] : [],
    },
    [alert, drought.data, stress.data],
  );

  const icon = <CloudDrizzle size={20} />;
  const mapError = alert === 'drought' ? drought.error : alert === 'stress' ? stress.error : null;
  return (
    <Panel title="HOME" brand>
      {fieldsError && <Notice kind="error">{fieldsError}</Notice>}
      {fields && fields.length > 1 && (
        <Card title="Field">
          <select className="field-select" value={currentField?.id ?? ''} onChange={(e) => selectField(e.target.value)}>
            {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Card>
      )}
      {fields && fields.length === 0 && !fieldsError && (
        <Notice>You have no fields yet. Use "Add field" to draw your first one on the map.</Notice>
      )}
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
        <small className="note-list">
          The sliders repaint the heat-wave and rain layers. They show how the model reacts to a change; they are not a climate projection.
        </small>
        <hr />
        <div className="rotation">
          <div className="rotation-row"><strong>Impact and suggested rotation</strong><span>Next 3 seasons</span></div>
          {status?.motorAvailable
            ? <p>The rules engine is connected; rotation suggestions will appear here.</p>
            : <p>Rotation suggestions are not available yet: the rules engine is not connected to the server.</p>}
        </div>
      </Card>

      <Card title="Critical alerts" className="alerts">
        {alerts.error && <Notice kind="error">{alerts.error}</Notice>}
        {alerts.loading && !alerts.data && <Notice kind="loading">Loading alerts…</Notice>}
        <div className="alert-grid">
          {list.map((a) => (
            <button
              key={a.kind} className="alert" aria-pressed={alert === a.kind} data-unavailable={!a.available}
              disabled={!a.available} title={a.definition || undefined}
              onClick={() => setAlert(alert === a.kind ? null : a.kind)}
            >
              <strong>{a.title}</strong>
              <b>{a.value}</b>
              <span>{a.detail}</span>
              {a.kind === 'drought' && <><Sun className="alert-icon" size={24} color="#FF5A00" /><i className="alert-bar"><i /></i></>}
              {a.kind === 'stress' && <span className="alert-icon alert-trend"><TrendingUp size={16} /><Triangle size={16} /></span>}
            </button>
          ))}
        </div>
        {mapError && <Notice kind="error">{mapError}</Notice>}
      </Card>
    </Panel>
  );
}
