import { ChevronUp } from 'lucide-react';
import { lazy, Suspense, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, useMapConfig, useSheet } from '../AppContext';
import { EMPTY_VALUES, FieldForm, monthsIncomplete } from '../components/FieldForm';
import { Btn, Card, Notice, Panel, ReadField, Tabs, tabId } from '../components/ui';
import {
  createField, errorMessage, fetchCrops, fetchSeries, saveHistory, type Crop, type Field, type FieldValues,
  type LngLat, type PlotRecord,
} from '../data';
import { useRemote } from '../hooks';

/** recharts is only downloaded when a chart is shown (it is not needed on Home or the map pages). */
const StatsChart = lazy(() => import('./charts').then((m) => ({ default: m.StatsChart })));

const cropName = (crops: Crop[] | null, code: string) => crops?.find((c) => c.code === code)?.name ?? code;

/* ---------- Add field ---------- */

/** Polygon area in hectares (shoelace on a local flat projection). Preview only: the server computes the saved area. */
function areaHa(points: LngLat[]): number {
  if (points.length < 3) return 0;
  const lat0 = (points[0][1] * Math.PI) / 180;
  const xy = points.map(([lng, lat]) => [lng * 111_320 * Math.cos(lat0), lat * 111_320]);
  const sum = xy.reduce((acc, [x, y], i) => {
    const [nx, ny] = xy[(i + 1) % xy.length];
    return acc + x * ny - nx * y;
  }, 0);
  return Math.abs(sum) / 2 / 10_000;
}

export function AddField() {
  const { draft, setDraft, refreshFields, selectField } = useApp();
  const navigate = useNavigate();
  const crops = useRemote(fetchCrops, []);
  const [values, setValues] = useState<FieldValues>(EMPTY_VALUES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per form: if the request is repeated (double click, bad connection) the server does not create a second field.
  const retryKey = useRef(crypto.randomUUID());
  useMapConfig({ draw: true }, []);

  const canSave = draft.length >= 3 && !monthsIncomplete(values);
  const sheet = useSheet();
  // Sheet mode: the drawing starts with the sheet collapsed; this opens the form once there is an outline.
  const openDetails = () => {
    sheet.afterSettle(() => document.querySelector<HTMLElement>('#panel-body input, #panel-body select')?.focus());
    sheet.snapTo('expanded', 'tap');
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const created: Field = await createField({ ...values, polygon: draft }, retryKey.current);
      retryKey.current = crypto.randomUUID();
      await refreshFields();
      selectField(created.id);
      setDraft([]);
      navigate('/fields');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title="Add a field"
      status={
        <div className="draw-status">
          <span className="draw-text">
            {draft.length < 3
              ? 'Click on the map to mark the corners of your field.'
              : <>Calculated area: <b>{areaHa(draft).toFixed(1)} ha</b></>}
          </span>
          {draft.length > 0 && <button type="button" className="link" onClick={() => setDraft([])}>Clear</button>}
          {sheet.isSheet && draft.length >= 3 && sheet.snap !== 'expanded' && (
            <Btn variant="secondary" size="sm" icon={<ChevronUp size={16} aria-hidden />} onClick={openDetails}>Field details</Btn>
          )}
        </div>
      }
    >
      <FieldForm values={values} onChange={setValues} crops={crops.data} cropsError={crops.error} />
      {error && <Notice kind="error">{error}</Notice>}
      <div className="form-actions">
        <Btn variant="save" disabled={!canSave} loading={saving} loadingLabel="Saving…" onClick={save}>Save field</Btn>
        {draft.length < 3 && <small>Draw the field on the map first.</small>}
      </div>
    </Panel>
  );
}

/* ---------- Plot history ---------- */

/** Earliest year the server accepts for a history record (backend HistorialInput, @Min(1950)). */
const HISTORY_MIN_YEAR = 1950;

const dateLabel = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase() : 'Not recorded';

function DescriptionEditor({ field, year, record, crops }: { field: Field; year: number; record: PlotRecord | undefined; crops: Crop[] | null }) {
  const { refreshFields } = useApp();
  const [text, setText] = useState(record?.description ?? '');
  const [crop, setCrop] = useState('');
  const [planted, setPlanted] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const needsCrop = !record;
  const titleId = useId();
  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await saveHistory(field.id, {
        year,
        crop: record?.crop ?? crop,
        plantedOn: record ? record.plantedOn : planted || null,
        description: text,
      });
      await refreshFields();
      setMessage({ kind: 'info', text: 'Saved.' });
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card title={needsCrop ? `Add the ${year} record` : 'Add description'} titleId={titleId} className="form">
      {needsCrop && (
        <>
          <label className="label">What was planted
            <select value={crop} onChange={(e) => setCrop(e.target.value)}>
              <option value="">Crop type</option>
              {(crops ?? []).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
          <label className="label">Planting date<input type="date" value={planted} onChange={(e) => setPlanted(e.target.value)} /></label>
        </>
      )}
      <textarea placeholder="Write..." rows={3} value={text} maxLength={500} aria-labelledby={titleId} onChange={(e) => setText(e.target.value)} />
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
      <div className="form-actions">
        <Btn variant="save" disabled={needsCrop && !crop} loading={saving} loadingLabel="Saving…" onClick={save}>Save</Btn>
      </div>
    </Card>
  );
}

export function History() {
  const { currentField, fields, fieldsError } = useApp();
  const crops = useRemote(fetchCrops, []);
  const [picked, setPicked] = useState<number | null>(null);
  const thisYear = new Date().getFullYear();
  const year = picked ?? currentField?.history[0]?.year ?? thisYear;
  // Year picker limits: from the earliest year the server accepts (HistorialInput: 1950) to the current year, widened if
  // the field already has records outside that range. A history is about past seasons, so no future years.
  const recorded = currentField?.history.map((r) => r.year) ?? [];
  const minYear = Math.min(HISTORY_MIN_YEAR, ...recorded);
  const maxYear = Math.max(thisYear, ...recorded);
  useMapConfig({ points: [], year: { value: year, onChange: setPicked, min: minYear, max: maxYear } }, [year, minYear, maxYear]);
  const record = currentField?.history.find((r) => r.year === year);
  return (
    <Panel title="HOME" brand>
      {fieldsError && <Notice kind="error">{fieldsError}</Notice>}
      {fields && !currentField && !fieldsError && <Notice>Add a field first to keep its history.</Notice>}
      {currentField && (
        <>
          <Card title={`Plot history · ${currentField.name}`}>
            {record ? (
              <>
                <ReadField label="It was planted" value={cropName(crops.data, record.crop)} />
                <ReadField label="Planting date" value={dateLabel(record.plantedOn)} />
                <ReadField label="Description" value={record.description || 'No description yet.'} />
              </>
            ) : <p className="empty">No record for {year}.</p>}
          </Card>
          <DescriptionEditor key={`${currentField.id}-${year}-${record?.description ?? ''}`} field={currentField} year={year} record={record} crops={crops.data} />
        </>
      )}
    </Panel>
  );
}

/* ---------- Statistics ---------- */

const STAT_TABS = [
  { id: 'temperature', label: 'Temperature' },
  { id: 'humidity', label: 'Humidity' },
] as const;

export function Statistics() {
  const [tab, setTab] = useState<'temperature' | 'humidity'>('temperature');
  const stats = useRemote(() => fetchSeries('statistics:'), []);
  useMapConfig({ hidden: true }, []);
  const series = stats.data?.find((s) => s.id === `statistics:${tab}`) ?? null;
  const unit = series?.unit === '%' ? '%' : '°';
  return (
    <Panel title="Statistics" wide>
      <Tabs tabs={STAT_TABS} value={tab} onChange={setTab} panelId="stats-panel" />
      <Card className="stats-card" role="tabpanel" id="stats-panel" aria-labelledby={tabId('stats-panel', tab)} busy={stats.loading && !!series}>
        <h2>{series?.title ?? 'Temperature and humidity over time'}</h2>
        {stats.error && <Notice kind="error">{stats.error}</Notice>}
        {stats.loading && !series && <Notice kind="loading">Loading…</Notice>}
        {series && (
          <>
            <div className="series-legend">
              <span><i style={{ background: '#34B3F1' }} />{series.labelA ?? 'A'}</span>
              <span><i style={{ background: '#292D30' }} />{series.labelB ?? 'B'}</span>
            </div>
            <div className="chart-box chart-box-stats">
              <Suspense fallback={null}><StatsChart series={series} unit={unit} /></Suspense>
            </div>
            <ul className="note-list">{[series.source, ...series.notes].map((n) => <li key={n}>{n}</li>)}</ul>
          </>
        )}
      </Card>
    </Panel>
  );
}
