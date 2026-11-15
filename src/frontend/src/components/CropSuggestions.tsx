import { useState } from 'react';
import { useApp } from '../AppContext';
import { errorMessage, fetchCrops, fetchSuggestions, setFieldCrop, type CropSuggestion, type Field } from '../data';
import { useRemote } from '../hooks';
import { Btn, Card, Notice } from './ui';

const signed = (v: number) => `${v > 0 ? '+' : ''}${Number(v.toFixed(1))}%`;

function reasons(s: CropSuggestion, baseName: string | null): string[] {
  const out: string[] = [];
  if (s.rotationPct != null && baseName) out.push(`${Number(s.rotationPct.toFixed(1))}% of Weld cropland that grew ${baseName} planted this next.`);
  if (s.priceChangePct != null) out.push(`Price outlook ${signed(s.priceChangePct)} over the next months${s.priceUnit ? ` (${s.priceUnit})` : ''}.`);
  if (s.otherFamily === true) out.push(`Different plant family${baseName ? ` than ${baseName}` : ''}: helps break pest and disease cycles.`);
  if (s.otherFamily === false) out.push(`Same plant family${baseName ? ` as ${baseName}` : ''}.`);
  return out.length ? out : ['Not enough data about this crop.'];
}

/**
 * Other crops the field could grow, ranked with data from the models (what farmers plant after the current crop, price outlook)
 * and a general rotation rule. "Switch" saves the new current crop on the field, so the farmer can change it in one click.
 */
export function CropSuggestions({ field, title = 'Suggested crops' }: { field: Field | null; title?: string }) {
  const { refreshFields } = useApp();
  const crops = useRemote(fetchCrops, []);
  const suggestions = useRemote(() => fetchSuggestions(field!.id), [field?.id, field?.version, field?.values.crop], !!field);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const nameOf = (code: string | null | undefined) => (code ? crops.data?.find((c) => c.code === code)?.name ?? code : null);

  if (!field) return <Notice>Add a field to get crop suggestions.</Notice>;
  const data = suggestions.data;
  const baseName = nameOf(data?.baseCrop);

  async function change(s: CropSuggestion) {
    setBusy(s.code);
    setMessage(null);
    try {
      await setFieldCrop(field!, s.code);
      await refreshFields();
      setMessage({ kind: 'info', text: `${field!.name} now lists ${s.name} as its crop. You can change it any time in My fields.` });
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title={title} className="suggestions">
      {suggestions.error && <Notice kind="error">{suggestions.error}</Notice>}
      {suggestions.loading && !data && <Notice kind="loading">Looking at the data…</Notice>}
      {data && (
        <>
          <p className="suggest-intro">
            {baseName
              ? <>Instead of <b>{baseName}</b>{data.baseFrom === 'history' ? ' (the last crop in the history)' : ''}, the data points to:</>
              : 'Set the current crop (or its history) to compare against it. For now, only prices are used.'}
          </p>
          {data.items.length === 0 && <p className="empty">No suggestions available.</p>}
          <ol className="suggest-list">
            {data.items.map((s) => (
              <li key={s.code} className="suggest">
                <div className="suggest-head">
                  <strong>{s.name}</strong>
                  <span className="suggest-score" title="Relative order between these options, not a chance of success">{s.score}/100</span>
                </div>
                <i className="suggest-bar"><i style={{ width: `${s.score}%` }} /></i>
                <ul className="note-list">{reasons(s, baseName).map((r) => <li key={r}>{r}</li>)}</ul>
                <Btn variant="secondary" disabled={busy !== null} onClick={() => change(s)}>
                  {busy === s.code ? 'Saving…' : `Switch to ${s.name}`}
                </Btn>
              </li>
            ))}
          </ol>
          {message && <Notice kind={message.kind}>{message.text}</Notice>}
          <small className="note-list">
            The order mixes how often farmers in Weld County planted this crop after yours, the price outlook, and a general rotation rule
            (changing plant family). It does not yet use your water, soil or equipment, and it does not replace your agronomist.
          </small>
        </>
      )}
    </Card>
  );
}
