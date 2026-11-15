import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp, useMapConfig } from '../AppContext';
import { EMPTY_VALUES, FieldForm, monthsIncomplete } from '../components/FieldForm';
import { Btn, Card, Notice, Panel, ReadField } from '../components/ui';
import {
  createField, errorMessage, fetchCrops, fetchSeries, saveHistory, type Crop, type Field, type FieldValues,
  type LngLat, type PlotRecord,
} from '../data';
import { useRemote } from '../hooks';

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

  const canSave = draft.length >= 3 && !monthsIncomplete(values) && !saving;

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
    <Panel title="Add a field">
      <FieldForm
        values={values} onChange={setValues} crops={crops.data} cropsError={crops.error}
        footer={
          <div className="draw-status">
            {draft.length < 3
              ? 'Click on the map to mark the corners of your field.'
              : <>Calculated area: <b>{areaHa(draft).toFixed(1)} ha</b></>}
            {draft.length > 0 && <button type="button" className="link" onClick={() => setDraft([])}>Clear</button>}
          </div>
        }
      />
      {error && <Notice kind="error">{error}</Notice>}
      <div className="form-actions">
        <Btn variant="save" disabled={!canSave} onClick={save}>{saving ? 'Saving…' : 'Save field'}</Btn>
        {draft.length < 3 && <small>Draw the field on the map first.</small>}
      </div>
    </Panel>
  );
}

/* ---------- Plot history ---------- */

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
    <Card title={needsCrop ? `Add the ${year} record` : 'Add description'}>
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
      <textarea placeholder="Write..." rows={3} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} />
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
      <div className="form-actions">
        <Btn variant="save" disabled={saving || (needsCrop && !crop)} onClick={save}>{saving ? 'Saving…' : 'Save'}</Btn>
      </div>
    </Card>
  );
}

export function History() {
  const { currentField, fields, fieldsError } = useApp();
  const crops = useRemote(fetchCrops, []);
  const [picked, setPicked] = useState<number | null>(null);
  const year = picked ?? currentField?.history[0]?.year ?? new Date().getFullYear();
  useMapConfig({ points: [], year: { value: year, onChange: setPicked } }, [year]);
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

export function Statistics() {
  const [tab, setTab] = useState<'temperature' | 'humidity'>('temperature');
  const stats = useRemote(() => fetchSeries('statistics:'), []);
  useMapConfig({ hidden: true }, []);
  const series = stats.data?.find((s) => s.id === `statistics:${tab}`) ?? null;
  const unit = series?.unit === '%' ? '%' : '°';
  return (
    <Panel title="Statistics" wide>
      <div className="tabs">
        <button aria-pressed={tab === 'temperature'} onClick={() => setTab('temperature')}>Temperature</button>
        <button aria-pressed={tab === 'humidity'} onClick={() => setTab('humidity')}>Humidity</button>
      </div>
      <Card className="stats-card">
        <h2>{series?.title ?? 'Temperature and humidity over time'}</h2>
        {stats.error && <Notice kind="error">{stats.error}</Notice>}
        {stats.loading && !series && <Notice kind="loading">Loading…</Notice>}
        {series && (
          <>
            <div className="series-legend">
              <span><i style={{ background: '#34B3F1' }} />{series.labelA ?? 'A'}</span>
              <span><i style={{ background: '#292D30' }} />{series.labelB ?? 'B'}</span>
            </div>
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={series.points} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#C9CBCD" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 14, fill: '#474B4E', fontFamily: 'Poppins' }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v) => `${v}${unit}`} tick={{ fontSize: 14, fill: '#474B4E', fontFamily: 'Poppins' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                <Tooltip formatter={(v) => `${v}${unit}`} />
                <Line isAnimationActive={false} type="monotone" dataKey="a" name={series.labelA ?? 'A'} stroke="#34B3F1" strokeWidth={5} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="b" name={series.labelB ?? 'B'} stroke="#292D30" strokeWidth={5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <ul className="note-list">{[series.source, ...series.notes].map((n) => <li key={n}>{n}</li>)}</ul>
          </>
        )}
      </Card>
    </Panel>
  );
}
