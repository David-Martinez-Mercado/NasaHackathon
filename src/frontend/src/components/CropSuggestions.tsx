import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../AppContext';
import {
  errorMessage, fetchCrops, fetchSuggestions, setFieldCrop, type CropSuggestion, type Factor, type FactorKey, type Field,
} from '../data';
import { useRemote } from '../hooks';
import { Btn, Card, Notice } from './ui';

export const FACTOR_LABEL: Record<FactorKey, string> = {
  income: 'Income', soil: 'Soil health', water: 'Water saving', erosion: 'Erosion control', local: 'Local practice',
};
const LEVEL_WORD = { low: 'low', medium: 'medium', high: 'high' } as const;
const signed = (v: number) => `${v > 0 ? '+' : ''}${Number(v.toFixed(1))}%`;
const tone = (score: number) => (score >= 70 ? 'good' : score >= 40 ? 'fair' : 'poor');
const toneWord = (score: number) => (score >= 70 ? 'Good' : score >= 40 ? 'Fair' : 'Poor');

/** One bar per criterion, with the number and a word: green ≥ 70, amber 40–69, red < 40. */
function FactorBars({ factors }: { factors: Factor[] }) {
  return (
    <div className="factors">
      {factors.map((f) => (
        <div key={f.key} className="factor" title={f.noData ? 'No data for this crop: counted as neutral' : `Weight ${f.weight}: how much this criterion counts for you`}>
          <span className="factor-name">{FACTOR_LABEL[f.key]}</span>
          <i className={`factor-bar ${f.noData ? 'factor-none' : `factor-${tone(f.score)}`}`}><i style={{ width: `${f.score}%` }} /></i>
          <span className="factor-score">{f.noData ? 'No data' : `${f.score} · ${toneWord(f.score)}`}</span>
        </div>
      ))}
    </div>
  );
}

/** The data behind a score, in plain words. */
export function reasons(s: CropSuggestion, baseName: string | null): string[] {
  const out: string[] = [];
  if (s.rotationPct != null && baseName) out.push(`${Number(s.rotationPct.toFixed(1))}% of Weld cropland that grew ${baseName} planted this next.`);
  if (s.priceChangePct != null) out.push(`Price outlook ${signed(s.priceChangePct)} over the next months${s.priceUnit ? ` (${s.priceUnit})` : ''}.`);
  if (s.yieldTHa != null && s.historicalYieldTHa != null) out.push(`County yield estimate ${s.yieldTHa} t/ha, against ${s.historicalYieldTHa} t/ha in the past.`);
  if (s.cycleDays != null) out.push(`About ${s.cycleDays} days from planting to harvest.`);
  out.push(s.fixesNitrogen ? 'Legume: adds nitrogen to the soil.' : 'Does not add nitrogen to the soil.');
  if (s.otherFamily === true) out.push(`Different plant family${baseName ? ` than ${baseName}` : ''}: helps break pest and disease cycles.`);
  if (s.otherFamily === false) out.push(`Same plant family${baseName ? ` as ${baseName}` : ''}.`);
  out.push(`Water need: ${LEVEL_WORD[s.waterDemand]}. Ground cover against erosion: ${LEVEL_WORD[s.soilCover]}.`);
  if (s.preferred) out.push('You marked it as a preferred crop.');
  return out;
}

interface CardProps {
  s: CropSuggestion;
  baseName: string | null;
  action?: { label: string; busy: boolean; disabled: boolean; onClick: () => void };
  /** The farmer's current crop, shown for comparison (no switch button). */
  current?: boolean;
}

export function SuggestionCard({ s, baseName, action, current }: CardProps) {
  return (
    <li className={`suggest ${current ? 'suggest-current' : ''}`}>
      <div className="suggest-head">
        <strong>{s.name}{current && <em className="tag">current</em>}</strong>
        <span className={`suggest-score score-${tone(s.score)}`} title="Relative order between these options, not a chance of success">{s.score}/100 · {toneWord(s.score)}</span>
      </div>
      <FactorBars factors={s.factors} />
      <details className="why">
        <summary><ChevronRight className="chev" size={16} strokeWidth={2.6} aria-hidden />Why?</summary>
        <ul className="note-list">{reasons(s, baseName).map((r) => <li key={r}>{r}</li>)}</ul>
      </details>
      {action && (
        <Btn variant="secondary" size="sm" disabled={action.disabled} loading={action.busy} loadingLabel="Saving…" onClick={action.onClick}>
          {action.label}
        </Btn>
      )}
    </li>
  );
}

/** Switching the field's crop saves it on the field: a one-click change the farmer can undo any time in My fields. */
export function useSwitchCrop(field: Field | null) {
  const { refreshFields } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  async function change(code: string, name: string) {
    if (!field) return;
    setBusy(code);
    setMessage(null);
    try {
      await setFieldCrop(field, code);
      await refreshFields();
      setMessage({ kind: 'info', text: `${field.name} now lists ${name} as its crop. You can change it any time in My fields.` });
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }
  return { busy, message, change };
}

/** Top crop options for the field, ranked with the models, the zone's risks and the farmer's priorities. Full view: Crops page. */
export function CropSuggestions({ field, title = 'Suggested crops', limit = 3 }: { field: Field | null; title?: string; limit?: number }) {
  const crops = useRemote(fetchCrops, []);
  const suggestions = useRemote(() => fetchSuggestions(field!.id), [field?.id, field?.version, field?.values.crop], !!field);
  const { busy, message, change } = useSwitchCrop(field);
  const nameOf = (code: string | null | undefined) => (code ? crops.data?.find((c) => c.code === code)?.name ?? code : null);

  if (!field) return <Notice>Add a field to get crop suggestions.</Notice>;
  const data = suggestions.data;
  const baseName = nameOf(data?.baseCrop);

  return (
    <Card title={title} className="suggestions" busy={suggestions.loading && !!data}>
      {suggestions.error && <Notice kind="error">{suggestions.error}</Notice>}
      {suggestions.loading && !data && <Notice kind="loading">Looking at the data…</Notice>}
      {data && (
        <>
          <p className="suggest-intro">
            {baseName
              ? <>Instead of <b>{baseName}</b>{data.baseFrom === 'history' ? ' (the last crop in the history)' : ''}, using your priorities and your zone's risks:</>
              : 'Set the current crop (or its history) to compare against it.'}
          </p>
          {data.items.length === 0 && <p className="empty">No suggestions available.</p>}
          <ol className="suggest-list">
            {data.items.slice(0, limit).map((s) => (
              <SuggestionCard
                key={s.code} s={s} baseName={baseName}
                action={{ label: `Switch to ${s.name}`, busy: busy === s.code, disabled: busy !== null, onClick: () => change(s.code, s.name) }}
              />
            ))}
          </ol>
          {message && <Notice kind={message.kind}>{message.text}</Notice>}
          <Link className="see-all" to="/crops">See all options and change my priorities →</Link>
          <small className="note-list">
            Not a decision: it orders options with model data and general crop traits that are not yet verified locally. Check with your agronomist.
          </small>
        </>
      )}
    </Card>
  );
}
