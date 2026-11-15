import { useState } from 'react';
import { useApp, useMapConfig } from '../AppContext';
import { Card, Notice, Panel } from '../components/ui';
import { LevelPill, RISK_INFO } from '../components/risk';
import { fetchRisks, fetchStressPoints, type LayerKind, type RiskKey } from '../data';
import { useLayer, useRemote } from '../hooks';

/** Risk → what the map shows when the card is selected. */
const MAP_FOR: Record<RiskKey, LayerKind | 'points'> = {
  heat: 'temperature', drought: 'drought', moisture: 'humidity', stress: 'points', vulnerability: 'vulnerability', rain: 'rain',
};
const ORDER: RiskKey[] = ['heat', 'drought', 'moisture', 'stress', 'vulnerability', 'rain'];

/** Risks of the zone around the selected field, one card per model, in plain words. */
export function Risks() {
  const { currentField, fields, fieldsError } = useApp();
  const risks = useRemote(() => fetchRisks(currentField!.id), [currentField?.id], !!currentField);
  const [selected, setSelected] = useState<RiskKey>('heat');
  const target = MAP_FOR[selected];
  const layer = useLayer(target === 'points' ? 'temperature' : target, target !== 'points');
  const points = useRemote(fetchStressPoints, [], target === 'points');
  useMapConfig(
    { layer: target === 'points' ? null : layer.data, points: target === 'points' ? points.data ?? [] : [] },
    [target, layer.data, points.data],
  );

  const byKey = new Map((risks.data ?? []).map((r) => [r.key, r]));
  return (
    <Panel title="Zone risks">
      {fieldsError && <Notice kind="error">{fieldsError}</Notice>}
      {fields && !currentField && !fieldsError && <Notice>Add a field to see the risks of its zone.</Notice>}
      {currentField && (
        <>
          <p className="section-sub">Around <b>{currentField.name}</b>. Tap a card to see it on the map.</p>
          {risks.error && <Notice kind="error">{risks.error}</Notice>}
          {risks.loading && !risks.data && <Notice kind="loading">Evaluating the zone…</Notice>}
          <div className="risk-list">
            {ORDER.map((key) => {
              const r = byKey.get(key);
              if (!r) return null;
              const info = RISK_INFO[key];
              const Icon = info.icon;
              return (
                <button key={key} type="button" className="risk" aria-pressed={selected === key} onClick={() => setSelected(key)}>
                  <span className="risk-head"><Icon size={20} aria-hidden /><strong>{info.title}</strong><LevelPill level={r.level} /></span>
                  <span className="risk-text">{info.describe(r)}</span>
                  <small className="risk-source">
                    {info.model} · {r.model}{r.asOf ? ` · data up to ${r.asOf}` : ''}
                    {r.resolutionMeters ? ` · cells of ~${r.resolutionMeters >= 1000 ? `${Math.round(r.resolutionMeters / 1000)} km` : `${r.resolutionMeters} m`}` : ''}
                    {r.interpolated ? ' · detail inside the field is interpolated' : ''}
                  </small>
                </button>
              );
            })}
          </div>
          <Card className="recommendations">
            <ul>
              <li>Levels use provisional thresholds: they compare zones, they do not decide for you.</li>
              <li>The climate data comes from 2 weather points about 50 km apart; stress points are a sample of 2,499 pixels in Weld County.</li>
              <li>Erosion and water reserves have no model or data yet, so they are not shown.</li>
            </ul>
          </Card>
        </>
      )}
    </Panel>
  );
}
