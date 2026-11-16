import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Series } from '../data';
import { useMatchMedia } from '../hooks';
import { Q_WIDE } from '../layout';

/*
 * Every recharts chart lives here and is loaded on demand (React.lazy in Other.tsx and DataHub.tsx), so the chart library
 * is not downloaded or evaluated on Home or on the map pages. Colors, data and options are the same as before.
 */

/** Recharts tooltip in the app's control style (radius, border, type size). */
const TOOLTIP_STYLE = { borderRadius: 10, border: '1px solid #80878F', fontSize: 13, padding: '6px 10px' };

/** Statistics: two series over time (temperature or humidity). */
export function StatsChart({ series, unit }: { series: Series; unit: string }) {
  const wideScreen = useMatchMedia(Q_WIDE);
  const tick = { fontSize: wideScreen ? 14 : 12, fill: '#474B4E', fontFamily: 'Poppins' };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={series.points} margin={{ top: 8, right: wideScreen ? 30 : 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#C9CBCD" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
        <YAxis width={44} tickFormatter={(v) => `${v}${unit}`} tick={tick} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
        <Tooltip formatter={(v) => `${v}${unit}`} contentStyle={TOOLTIP_STYLE} wrapperStyle={{ pointerEvents: 'none' }} />
        <Line isAnimationActive={false} type="monotone" dataKey="a" name={series.labelA ?? 'A'} stroke="#34B3F1" strokeWidth={wideScreen ? 5 : 3} dot={false} />
        <Line isAnimationActive={false} type="monotone" dataKey="b" name={series.labelB ?? 'B'} stroke="#292D30" strokeWidth={wideScreen ? 5 : 3} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export interface PricePoint {
  label: string;
  actual: number | null;
  forecast: number | null;
}

/** Data → Economy: price history (solid) joined to the forecast (dashed). */
export function PriceChart({ data }: { data: PricePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#E6E9EE" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#697386' }} tickLine={false} axisLine={{ stroke: '#C9CBCD' }} minTickGap={24} />
        <YAxis width={44} tick={{ fontSize: 12, fill: '#697386' }} tickLine={false} axisLine={{ stroke: '#C9CBCD' }} domain={['auto', 'auto']} />
        <Tooltip contentStyle={TOOLTIP_STYLE} wrapperStyle={{ pointerEvents: 'none' }} />
        <Line isAnimationActive={false} dataKey="actual" name="Price" stroke="#4464E8" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
        <Line isAnimationActive={false} dataKey="forecast" name="Forecast" stroke="#4464E8" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

