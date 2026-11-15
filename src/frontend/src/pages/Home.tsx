import { CloudDrizzle, Sun, TrendingUp, Triangle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp, useMapConfig } from '../AppContext';
import { CropSuggestions } from '../components/CropSuggestions';
import { Card, Notice, Panel, Slider } from '../components/ui';
import { LevelPill, RISK_INFO } from '../components/risk';
import { fetchAlerts, fetchErosionPoints, fetchRisks, fetchStressPoints, type AlertKind } from '../data';
import { useLayer, useRemote } from '../hooks';

const signed = (v: number, unit: string) => `${v > 0 ? '+' : ''}${v}${unit}`;

export function Home() {
  const { scenario, setScenario, fields, fieldsError, currentField, selectField } = useApp();
  const [params, setParams] = useSearchParams();
  const requested = params.get('alert');
  const alerts = useRemote(fetchAlerts, []);
  const list = alerts.data ?? [];
  const alert = list.some((a) => a.kind === requested && a.available) ? (requested as AlertKind) : null;
  const setAlert = (kind: AlertKind | null) => setParams(kind ? { alert: kind } : {}, { replace: true });

  const drought = useLayer('drought');
  const risks = useRemote(() => fetchRisks(currentField!.id), [currentField?.id], !!currentField);
  const stress = useRemote(fetchStressPoints, [], alert === 'stress');
  const erosion = useRemote(fetchErosionPoints, [], alert === 'erosion');
  const erosionLayer = useLayer('erosion', alert === 'erosion');

  useMapConfig(
    {
      layer: alert === 'drought' ? drought.data : alert === 'erosion' ? erosionLayer.data : null,
      points: alert === 'stress' ? stress.data ?? [] : alert === 'erosion' ? erosion.data ?? [] : [],
    },
    [alert, drought.data, stress.data, erosion.data, erosionLayer.data],
  );

  const icon = <CloudDrizzle size={20} />;
  const mapError = alert === 'drought' ? drought.error : alert === 'stress' ? stress.error : alert === 'erosion' ? erosion.error ?? erosionLayer.error : null;
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
          icon={icon} tone="rain" label="Rainfall change" min={-50} max={50} value={scenario.rainPct}
          display={signed(scenario.rainPct, '%')} marks={['-50% drought', '0% current', '+50%']}
          onChange={(rainPct) => setScenario({ ...scenario, rainPct })}
        />
        <Slider
          icon={icon} tone="heat" label="Temperature anomaly" min={-2} max={4} step={0.5} value={scenario.tempDelta}
          display={signed(scenario.tempDelta, ' °C')} marks={['-2 °C', '0 °C', '+4 °C']}
          onChange={(tempDelta) => setScenario({ ...scenario, tempDelta })}
        />
        <small className="note-list">
          The sliders repaint the heat-wave and rain layers. They show how the model reacts to a change; they are not a climate projection.
        </small>
      </Card>

      <Card title="Risks in your zone" className="risk-summary">
        {risks.error && <Notice kind="error">{risks.error}</Notice>}
        {!currentField && <p className="empty">Add a field to see the risks of its zone.</p>}
        <div className="risk-strip">
          {(risks.data ?? []).filter((r) => r.level).map((r) => (
            <span key={r.key} className="risk-chip">{RISK_INFO[r.key].title}<LevelPill level={r.level} /></span>
          ))}
        </div>
        {currentField && <Link className="see-all" to="/risks">See details and the map →</Link>}
      </Card>

      <CropSuggestions field={currentField} title="Crop suggestions" />

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
