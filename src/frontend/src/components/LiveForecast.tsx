import { CloudLightning, DatabaseZap, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../AppContext';
import { fetchLive, type DataSource, type LiveForecast as Live, type LiveResult } from '../data';
import { useDebounced, useRemote } from '../hooks';
import { Btn, Card, Notice } from './ui';

const SOURCE_LABEL: Record<DataSource, string> = { live: 'Live', batch: 'Saved batch', none: 'Not available' };

const translateWarning = (w: string): string => {
  const site = w.match(/«(.+?)» como referencia \((\d+) km\)/);
  if (w.startsWith('Los modelos se entrenaron con 2 puntos') && site)
    return `The models were trained on 2 points in Weld County; “${site[1]}” (${site[2]} km away) is used as the reference. For other places this is a soft extrapolation.`;
  if (w.includes('último lote')) return 'Fresh data could not be queried, so the last saved batch is shown.';
  if (w.includes('no está configurado')) return 'The live service is not set up: the last saved batch is shown.';
  if (w.includes('fuera de línea')) return 'The live service is offline: the last saved batch is shown.';
  if (w.includes('se ajustó')) return 'The scenario was adjusted to what the models calculate (rain −50 to +50 %, temperature −2 to +4 °C).';
  if (w.includes('Fuera de la zona')) return 'This place is outside the area the models were trained on (Weld County, Colorado and its surroundings): no forecast.';
  return w;
};

/** Live or batch, plus the date of the data: the farmer always sees how fresh a number is (icon + word, not color alone). */
export function SourceBadge({ source, asOf }: { source: DataSource; asOf: string | null }) {
  const Icon = source === 'live' ? CloudLightning : DatabaseZap;
  return (
    <span className={`source source-${source}`} title={source === 'live' ? 'Queried from the weather API a moment ago' : 'From the last saved export, not refreshed'}>
      <Icon size={12} aria-hidden /> {SOURCE_LABEL[source]}{asOf ? ` · data up to ${asOf}` : ''}
    </span>
  );
}

/** The service answers in Spanish; the screen is English, so the known texts are translated here (the numbers are never touched). */
const TEXT: Record<string, { title: string; horizon: string; note: string }> = {
  c05b: { title: 'Heat-wave risk', horizon: 'next 7 days', note: 'Chance that a heat wave (3 or more days above this place’s 90th percentile) starts within 7 days.' },
  c08a: { title: 'Chance of rain tomorrow', horizon: 'tomorrow', note: 'Chance of 1 mm of rain or more tomorrow.' },
  c08b: { title: 'Expected monthly rain', horizon: 'next 6 months', note: 'Rain for each of the next 6 months. It is the monthly average for this place, not a weather forecast.' },
  c04: { title: 'Root-zone soil moisture', horizon: 'next 4 weeks', note: 'Expected moisture in the root zone, averaged over the next 4 weeks (weekly values above).' },
};
const reasonText = (r: LiveResult): string | null => {
  if (!r.reason) return null;
  const season = r.reason.match(/último dato: ([\d-]+)/);
  if (r.concept === 'c05b' && r.reason.includes('mayo a septiembre')) return `The heat-wave model only runs from May to September (latest data: ${season?.[1] ?? 'n/a'}).`;
  if (r.reason.includes('no está cargado')) return 'This model is not loaded on the server.';
  return r.reason;
};

function value(r: LiveResult): string {
  if (!r.available || r.value == null) return '—';
  return `${Number(r.value.toFixed(1))}${r.unit ? ` ${r.unit}` : ''}`;
}

function Row({ r }: { r: LiveResult }) {
  return (
    <div className="live-row">
      <div className="live-head">
        <strong>{TEXT[r.concept]?.title ?? r.title}</strong>
        <SourceBadge source={r.source} asOf={r.asOf} />
      </div>
      <div className="live-body">
        <b className="live-value">{value(r)}</b>
        <span className="live-horizon">{TEXT[r.concept]?.horizon ?? r.horizon}</span>
        {r.scenarioApplied && <em className="tag">with your sliders</em>}
      </div>
      {r.series && r.series.length > 1 && (
        <span className="live-series">{r.series.map((v) => Number(v.toFixed(0))).join(' · ')} {r.unit}</span>
      )}
      {!r.available && r.reason && <small className="live-reason">{reasonText(r)}</small>}
      {r.available && <small className="live-reason">{r.source === 'batch' ? 'From the last saved export: a different calculation (see the date). ' : ''}{TEXT[r.concept]?.note ?? r.notes[0]}</small>}
    </div>
  );
}

/**
 * Predictions for the selected field computed with fresh weather data. The "What if?" sliders change the heat-wave and
 * rain results live. If the live service is down the last saved batch is shown and clearly labelled, never silently.
 */
export function LiveForecast({ withSliders = false, title = 'Forecast for your field' }: { withSliders?: boolean; title?: string }) {
  const { currentField, scenario } = useApp();
  const wanted = useDebounced(scenario, 600);
  const [tick, setTick] = useState(0);
  const live = useRemote<Live>(
    () => fetchLive(currentField!.id, withSliders ? wanted : undefined),
    [currentField?.id, withSliders ? wanted.rainPct : 0, withSliders ? wanted.tempDelta : 0, tick],
    !!currentField,
  );
  const data = live.data;
  if (!currentField) return <Notice>Add a field to see live forecasts.</Notice>;
  return (
    <Card title={title} className="live" busy={live.loading && !!data}>
      {live.error && <Notice kind="error">{live.error}</Notice>}
      {live.loading && !data && <Notice kind="loading">Asking the weather API…</Notice>}
      {data && (
        <>
          {data.outdated && (
            <Notice kind="error">These numbers could not be refreshed{data.asOf ? ` (data up to ${data.asOf})` : ''}. Treat them as older information.</Notice>
          )}
          {data.results.map((r) => <Row key={r.concept} r={r} />)}
          {data.results.length === 0 && <p className="empty">No forecast is available for this place.</p>}
          <ul className="note-list">{data.warnings.map((w) => <li key={w}>{translateWarning(w)}</li>)}</ul>
          <div className="live-foot">
            <Btn
              variant="secondary" size="sm" icon={<RefreshCw size={16} aria-hidden />}
              loading={live.loading} loadingLabel="Updating…" onClick={() => setTick(tick + 1)}
            >
              Update
            </Btn>
            {data.latencyMs != null && <small>Answered in {Math.round(data.latencyMs)} ms</small>}
          </div>
        </>
      )}
    </Card>
  );
}
