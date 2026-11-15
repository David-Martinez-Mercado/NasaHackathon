import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp, useMapConfig } from '../AppContext';
import { Card, Chips, Panel, PriorityBar, ReadField } from '../components/ui';
import {
  climatePrediction, cropOptions, getLayer, marketPrices, plotHistory, sensors, statistics, type LngLat,
} from '../data';

/* ---------- Add field ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IRRIGATION = ['Rainfed', 'Gravity', 'Sprinkler', 'Drip'] as const;
const SOIL = ['Clay', 'Sandy', 'Loam', 'Use satellite data'] as const;
const EQUIPMENT = ['Seed drill', 'Row crop planter', 'No-till drill'] as const;
const PRIORITIES = ['Save water / drought tolerance', 'Improve fertility and soil', 'Stop soil erosion', 'Generate extra income'];

/** Polygon area in hectares (shoelace on a local flat projection). */
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
  const { draft, setDraft } = useApp();
  const [irrigation, setIrrigation] = useState<(typeof IRRIGATION)[number]>('Sprinkler');
  const [soil, setSoil] = useState<(typeof SOIL)[number]>('Use satellite data');
  const [equipment, setEquipment] = useState<string[]>([]);
  const [priorities, setPriorities] = useState([40, 80, 25, 90]);
  useMapConfig({ draw: true }, []);

  const toggle = (e: string) => setEquipment(equipment.includes(e) ? equipment.filter((x) => x !== e) : [...equipment, e]);
  return (
    <Panel title="Add a field">
      <Card className="form">
        <h3>General characteristics</h3>
        <label>Field name<input placeholder="Chili field" /></label>
        <label>Description<input placeholder="Description" /></label>
        <label>Crop type
          <select defaultValue=""><option value="" disabled>Crop type</option>{cropOptions.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <div className="label">Months the field stays empty</div>
        <div className="months">
          From <select defaultValue=""><option value="" disabled>month</option>{MONTHS.map((m) => <option key={m}>{m}</option>)}</select>
          To <select defaultValue=""><option value="" disabled>month</option>{MONTHS.map((m) => <option key={m}>{m}</option>)}</select>
        </div>
        <div className="label">Irrigation system</div>
        <Chips options={IRRIGATION} value={irrigation} onChange={setIrrigation} />
        <h3>Perceived soil type <small>satellite data recommended*</small></h3>
        <Chips options={SOIL} value={soil} onChange={setSoil} />
        <div className="label">Equipment available</div>
        <div className="chips">
          {EQUIPMENT.map((e) => <button key={e} type="button" className="chip" aria-pressed={equipment.includes(e)} onClick={() => toggle(e)}>{e}</button>)}
        </div>
        <div className="draw-status">
          {draft.length < 3
            ? 'Click on the map to mark the corners of your field.'
            : <>Calculated area: <b>{areaHa(draft).toFixed(1)} ha</b></>}
          {draft.length > 0 && <button type="button" className="link" onClick={() => setDraft([])}>Clear</button>}
        </div>
      </Card>
      <Card className="priorities">
        <h3>Farmer priorities</h3>
        <div className="priority-row">
          {PRIORITIES.map((p, i) => (
            <PriorityBar key={p} label={p} value={priorities[i]} onChange={(v) => setPriorities(priorities.map((x, j) => (j === i ? v : x)))} />
          ))}
        </div>
      </Card>
    </Panel>
  );
}

/* ---------- Plot history ---------- */

export function History() {
  const [year, setYear] = useState(2023);
  useMapConfig({ points: sensors, year: { value: year, onChange: setYear } }, [year]);
  const record = plotHistory.find((r) => r.year === year);
  return (
    <Panel title="HOME" brand>
      <Card title="Plot history">
        {record ? (
          <>
            <ReadField label="It was planted" value={record.crop} />
            <ReadField label="Planting date" value={record.plantedOn} />
            <ReadField label="Description" value={record.description || 'No description yet.'} />
          </>
        ) : <p className="empty">No record for {year}.</p>}
      </Card>
      <Card title="Add description">
        <textarea placeholder="Write..." rows={3} />
      </Card>
    </Panel>
  );
}

/* ---------- Data: climate prediction + market ---------- */

export function Data() {
  const { scenario } = useApp();
  const [view, setView] = useState<'Temperature' | 'Rain'>('Temperature');
  const layer = useMemo(() => getLayer(view === 'Rain' ? 'rain' : 'temperature', scenario), [view, scenario]);
  useMapConfig({ layer, points: view === 'Temperature' ? sensors : [] }, [layer]);
  const { temperature: t, rain: r } = climatePrediction;
  const recommendations = view === 'Temperature' ? t.recommendations : r.recommendations;
  return (
    <Panel title={`Climate prediction: ${view}`}>
      <Chips options={['Temperature', 'Rain'] as const} value={view} onChange={setView} />
      <Card className="grid-2">
        {view === 'Temperature' ? (
          <>
            <ReadField label="Highest temperature" value={t.highest} small />
            <ReadField label="Lowest temperature" value={t.lowest} small />
            <ReadField label="Average temperature" value={t.average} small />
          </>
        ) : (
          <>
            <ReadField label="Precipitation" value={r.precipitation} small />
            <ReadField label="Humidity" value={r.humidity} small />
            <ReadField label="Rain odds" value={r.odds} small />
            <ReadField label="Precipitation intensity" value={r.intensity} small />
          </>
        )}
      </Card>
      <h2 className="section-title">Recommendations</h2>
      <Card className="recommendations"><ul>{recommendations.map((x) => <li key={x}>{x}</li>)}</ul></Card>
      <Card className="chart-card">
        <h3>Price trend</h3>
        <small>January – December · Sample data</small>
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={marketPrices} margin={{ top: 12, right: 12, left: -14, bottom: 0 }}>
            <CartesianGrid stroke="#E6E9EE" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#697386' }} tickLine={false} axisLine={{ stroke: '#C9CBCD' }} />
            <YAxis tick={{ fontSize: 10, fill: '#697386' }} tickLine={false} axisLine={{ stroke: '#C9CBCD' }} />
            <Tooltip />
            <Line isAnimationActive={false} dataKey="a" name="Price" stroke="#4464E8" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </Panel>
  );
}

/* ---------- Statistics ---------- */

export function Statistics() {
  const [tab, setTab] = useState<'temperature' | 'humidity'>('temperature');
  useMapConfig({ hidden: true }, []);
  const unit = tab === 'temperature' ? '°' : '%';
  return (
    <Panel title="Statistics" wide>
      <div className="tabs">
        <button aria-pressed={tab === 'temperature'} onClick={() => setTab('temperature')}>Temperature</button>
        <button aria-pressed={tab === 'humidity'} onClick={() => setTab('humidity')}>Humidity</button>
      </div>
      <Card className="stats-card">
        <h2>Temperature and humidity over time</h2>
        <div className="series-legend"><span><i style={{ background: '#34B3F1' }} />This field</span><span><i style={{ background: '#292D30' }} />Region</span></div>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={statistics[tab]} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#C9CBCD" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 14, fill: '#474B4E', fontFamily: 'Poppins' }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(v) => `${v}${unit}`} tick={{ fontSize: 14, fill: '#474B4E', fontFamily: 'Poppins' }} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v) => `${v}${unit}`} />
            <Line isAnimationActive={false} type="monotone" dataKey="a" name="This field" stroke="#34B3F1" strokeWidth={5} dot={false} />
            <Line isAnimationActive={false} type="monotone" dataKey="b" name="Region" stroke="#292D30" strokeWidth={5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </Panel>
  );
}
