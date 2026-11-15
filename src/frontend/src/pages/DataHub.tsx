import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMapConfig } from '../AppContext';
import { Card, Chips, Notice, Panel, ReadField } from '../components/ui';
import { fetchClimate, fetchPredictionStatus, fetchSeries, fetchTable, type ModelInfo, type Series } from '../data';
import { cropLabel } from '../data/i18n';
import { useLayer, useRemote } from '../hooks';

const TABS = ['Economy', 'Climate', 'Models', 'Local practice'] as const;
type Tab = (typeof TABS)[number];
const num = (v: number | null, unit: string, digits = 1) => (v == null ? 'No data' : `${Number(v.toFixed(digits))}${unit}`);
const seriesLabel = (s: Series) => cropLabel(s.id.replace('market:', ''));
const pretty = (code: string) => cropLabel(code);

/** Everything the models know, grouped: money (prices, yield), climate, the models themselves, and what farmers do locally. */
export function Data() {
  const [tab, setTab] = useState<Tab>('Economy');
  return (
    <Panel title={`Data: ${tab}`}>
      <Chips options={TABS} value={tab} onChange={setTab} />
      {tab === 'Economy' && <Economy />}
      {tab === 'Climate' && <Climate />}
      {tab === 'Models' && <Models />}
      {tab === 'Local practice' && <Practice />}
    </Panel>
  );
}

/* ---------- Economy: prices (c10) and yield (c01) ---------- */

function Economy() {
  useMapConfig({ points: [] }, []);
  const market = useRemote(() => fetchSeries('market:'), []);
  const yields = useRemote(() => fetchTable('rendimiento'), []);
  const [picked, setPicked] = useState<string | null>(null);
  const series = market.data?.find((s) => s.id === picked) ?? market.data?.[0] ?? null;
  const chart = useMemo(() => {
    if (!series) return [];
    const lastActual = series.points.map((p) => p.forecast).lastIndexOf(false);
    return series.points.map((p, i) => ({
      label: p.label,
      actual: p.forecast ? null : p.a,
      forecast: p.forecast || i === lastActual ? p.a : null, // joins the dashed forecast to the last real price
    }));
  }, [series]);
  const base = (yields.data?.rows ?? []).filter((r) => r.rain_pct === 0 && r.temp_delta === 0);

  return (
    <>
      <Card className="chart-card">
        <h3>Price trend</h3>
        {market.error && <Notice kind="error">{market.error}</Notice>}
        {market.loading && !series && <Notice kind="loading">Loading prices…</Notice>}
        {series && (
          <>
            <div className="chips">
              {(market.data ?? []).map((s) => (
                <button key={s.id} type="button" className="chip" aria-pressed={s.id === series.id} onClick={() => setPicked(s.id)}>{seriesLabel(s)}</button>
              ))}
            </div>
            <small>{series.unit} · dashed = forecast, exploratory only · {series.source}</small>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={chart} margin={{ top: 12, right: 12, left: -14, bottom: 0 }}>
                <CartesianGrid stroke="#E6E9EE" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#697386' }} tickLine={false} axisLine={{ stroke: '#C9CBCD' }} minTickGap={24} />
                <YAxis tick={{ fontSize: 10, fill: '#697386' }} tickLine={false} axisLine={{ stroke: '#C9CBCD' }} domain={['auto', 'auto']} />
                <Tooltip />
                <Line isAnimationActive={false} dataKey="actual" name="Price" stroke="#4464E8" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
                <Line isAnimationActive={false} dataKey="forecast" name="Forecast" stroke="#4464E8" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
            <ul className="note-list">{series.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </>
        )}
      </Card>
      <Card title="Yield">
        {yields.error && <Notice kind="error">{yields.error}</Notice>}
        {yields.loading && !yields.data && <Notice kind="loading">Loading…</Notice>}
        {yields.data && (
          <>
            <table className="data-table">
              <thead><tr><th>Crop</th><th>Model estimate</th><th>Past average</th></tr></thead>
              <tbody>
                {base.map((r) => (
                  <tr key={String(r.crop)}><td>{pretty(String(r.crop))}</td><td>{r.predicted_t_ha} t/ha</td><td>{r.hist_yield_t_ha} t/ha</td></tr>
                ))}
              </tbody>
            </table>
            <ul className="note-list">{yields.data.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </>
        )}
      </Card>
    </>
  );
}

/* ---------- Climate: rain (c08) and heat waves (c05b) ---------- */

function Climate() {
  const [view, setView] = useState<'Temperature' | 'Rain'>('Temperature');
  const layer = useLayer(view === 'Rain' ? 'rain' : 'temperature');
  const climate = useRemote(fetchClimate, []);
  useMapConfig({ layer: layer.data, points: [] }, [layer.data]);
  const c = climate.data;
  return (
    <>
      <Chips options={['Temperature', 'Rain'] as const} value={view} onChange={setView} />
      {(climate.error || layer.error) && <Notice kind="error">{climate.error ?? layer.error}</Notice>}
      {climate.loading && !c && <Notice kind="loading">Loading…</Notice>}
      {c && (
        <Card className="grid-2">
          {view === 'Temperature' ? (
            <>
              <ReadField label="Typical highest temperature (next month)" value={num(c.tempMax, ' °C')} small />
              <ReadField label="Typical lowest temperature (next month)" value={num(c.tempMin, ' °C')} small />
              <ReadField label="Typical average temperature (next month)" value={num(c.tempMean, ' °C')} small />
            </>
          ) : (
            <>
              <ReadField label="Typical rain, next month" value={num(c.rainNextMonthMm, ' mm')} small />
              <ReadField label="Chance of rain tomorrow" value={num(c.rainNextDayPct, ' %')} small />
            </>
          )}
        </Card>
      )}
      {c && (
        <>
          <h2 className="section-title">Notes</h2>
          <Card className="recommendations"><ul>{[`Data up to ${c.asOf}.`, ...c.notes].map((x) => <li key={x}>{x}</li>)}</ul></Card>
        </>
      )}
      {layer.data && (
        <Card className="recommendations">
          <ul>
            <li>Map: {layer.data.title}. Source: {layer.data.source}.</li>
            {layer.data.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </Card>
      )}
    </>
  );
}

/* ---------- Models: what is behind every number ---------- */

const ROLE = (m: ModelInfo) => (m.role === 'modelo' ? 'Model' : 'Simple rule (no model beat it)');

function Models() {
  useMapConfig({ points: [] }, []);
  const status = useRemote(fetchPredictionStatus, []);
  const s = status.data;
  return (
    <>
      {status.error && <Notice kind="error">{status.error}</Notice>}
      {status.loading && !s && <Notice kind="loading">Loading…</Notice>}
      {s === null && !status.loading && !status.error && <Notice>No predictions are loaded on the server yet.</Notice>}
      {s && (
        <>
          <Notice>Version {s.version} · data up to {s.asOf}. Quality is measured on the most recent 20% of the data, which the model never saw while learning.</Notice>
          {s.models.map((m) => (
            <Card key={m.concept} className="model-card">
              <h3>{m.name} <small>{m.concept}</small></h3>
              <p className="model-role">{ROLE(m)} · {m.algorithm}</p>
              <p className="model-metric">
                <b>{m.metric.replace(/_/g, ' ')}</b>: {m.value == null ? 'n/a' : Number(m.value.toFixed(3))}
                {m.ciLow != null && m.ciHigh != null && <> (95%: {Number(m.ciLow.toFixed(2))} to {Number(m.ciHigh.toFixed(2))})</>}
              </p>
              {m.baseline && m.skill != null && (
                <p className="model-metric">Against the simple baseline “{m.baseline}”: {m.skill > 0 ? '+' : ''}{Number(m.skill.toFixed(2))} skill</p>
              )}
              {m.notes.length > 0 && <ul className="note-list">{m.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
            </Card>
          ))}
          <Card title="Limits of all of them">
            <ul className="note-list">{s.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
          </Card>
        </>
      )}
    </>
  );
}

/* ---------- Local practice: rotation (c02) and crop cycle (c07) ---------- */

function Practice() {
  useMapConfig({ points: [] }, []);
  const rotation = useRemote(() => fetchTable('rotacion'), []);
  const cycle = useRemote(() => fetchTable('ciclo'), []);
  const [prev, setPrev] = useState<string>('maiz');
  const prevCrops = useMemo(() => [...new Set((rotation.data?.rows ?? []).map((r) => String(r.prev_crop)))].sort(), [rotation.data]);
  const next = (rotation.data?.rows ?? [])
    .filter((r) => r.prev_crop === prev)
    .sort((a, b) => Number(b.probability_pct) - Number(a.probability_pct))
    .slice(0, 6);
  return (
    <>
      <Card title="What farmers plant next">
        {rotation.error && <Notice kind="error">{rotation.error}</Notice>}
        {rotation.loading && !rotation.data && <Notice kind="loading">Loading…</Notice>}
        {rotation.data && (
          <>
            <label className="label">After a crop of
              <select className="field-select" value={prev} onChange={(e) => setPrev(e.target.value)}>
                {prevCrops.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}
              </select>
            </label>
            <table className="data-table">
              <thead><tr><th>Next crop</th><th>Share of fields</th></tr></thead>
              <tbody>{next.map((r) => <tr key={String(r.next_crop)}><td>{pretty(String(r.next_crop))}</td><td>{r.probability_pct}%</td></tr>)}</tbody>
            </table>
            <ul className="note-list">{rotation.data.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </>
        )}
      </Card>
      <Card title="Days from planting to harvest">
        {cycle.error && <Notice kind="error">{cycle.error}</Notice>}
        {cycle.data && (
          <>
            <table className="data-table">
              <thead><tr><th>Crop</th><th>Typical (10 years)</th><th>Latest season</th></tr></thead>
              <tbody>
                {cycle.data.rows.map((r) => (
                  <tr key={`${r.crop}-${r.year}`}><td>{pretty(String(r.crop))}</td><td>{r.median_days_last_10y ?? '—'} days</td><td>{r.observed_days} days ({r.year})</td></tr>
                ))}
              </tbody>
            </table>
            <ul className="note-list">{cycle.data.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </>
        )}
      </Card>
    </>
  );
}
