import { useEffect, useState } from 'react';
import { useApp, useMapConfig } from '../AppContext';
import { FACTOR_LABEL, SuggestionCard, useSwitchCrop } from '../components/CropSuggestions';
import { LevelPill, RISK_INFO, ADJUSTMENT_TEXT } from '../components/risk';
import { Btn, Card, Chips, Notice, Panel, Slider } from '../components/ui';
import { errorMessage, fetchCrops, fetchSuggestions, updateField, type Priorities } from '../data';
import { useDebounced, useRemote } from '../hooks';

const PRESETS: Record<string, Priorities> = {
  Balanced: { water: 50, soil: 50, erosion: 50, income: 50 },
  'Protect the soil': { water: 40, soil: 100, erosion: 90, income: 20 },
  'Maximize income': { water: 30, soil: 20, erosion: 20, income: 100 },
  'Save water': { water: 100, soil: 40, erosion: 40, income: 30 },
};
const PRESET_NAMES = Object.keys(PRESETS) as (keyof typeof PRESETS & string)[];
const SLIDERS: { key: keyof Priorities; label: string; marks: [string, string, string] }[] = [
  { key: 'income', label: 'Generate extra income', marks: ['Not a priority', '', 'Top priority'] },
  { key: 'soil', label: 'Improve fertility and soil', marks: ['Not a priority', '', 'Top priority'] },
  { key: 'erosion', label: 'Stop soil erosion', marks: ['Not a priority', '', 'Top priority'] },
  { key: 'water', label: 'Save water / drought tolerance', marks: ['Not a priority', '', 'Top priority'] },
];
const same = (a: Priorities, b: Priorities) => a.water === b.water && a.soil === b.soil && a.erosion === b.erosion && a.income === b.income;

/** Compare crops for the field. Moving a priority re-ranks the options live; saving keeps it as the field's priorities. */
export function Crops() {
  const { currentField, fields, fieldsError, refreshFields } = useApp();
  const crops = useRemote(fetchCrops, []);
  const saved = currentField ? toPriorities(currentField.values.priorities) : PRESETS.Balanced;
  const [prio, setPrio] = useState<Priorities>(saved);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const { busy, message, change } = useSwitchCrop(currentField);
  useMapConfig({ points: [] }, []);

  // Another field, or the saved priorities changing, resets the sliders to what is saved.
  const savedKey = `${currentField?.id}:${saved.water}:${saved.soil}:${saved.erosion}:${saved.income}`;
  useEffect(() => setPrio(saved), [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !same(prio, saved);
  const tried = useDebounced(prio, 300);
  const result = useRemote(
    () => fetchSuggestions(currentField!.id, same(tried, saved) ? undefined : tried),
    [currentField?.id, currentField?.version, currentField?.values.crop, tried.water, tried.soil, tried.erosion, tried.income],
    !!currentField,
  );
  const data = result.data;
  const nameOf = (code: string | null | undefined) => (code ? crops.data?.find((c) => c.code === code)?.name ?? code : null);
  const baseName = nameOf(data?.baseCrop);

  async function save() {
    if (!currentField) return;
    setSaving(true);
    setNote(null);
    try {
      const p = prio;
      await updateField(currentField, { ...currentField.values, priorities: [p.water, p.soil, p.erosion, p.income] });
      await refreshFields();
      setNote({ kind: 'info', text: 'Priorities saved for this field.' });
    } catch (e) {
      setNote({ kind: 'error', text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  const activePreset = PRESET_NAMES.find((n) => same(PRESETS[n], prio)) ?? null;
  return (
    <Panel title="Crops for my field">
      {fieldsError && <Notice kind="error">{fieldsError}</Notice>}
      {fields && !currentField && !fieldsError && <Notice>Add a field to compare crops.</Notice>}
      {currentField && (
        <>
          <Card title="What matters most to you?" titleId="crops-priorities-title">
            <Chips
              options={PRESET_NAMES as readonly string[]} value={activePreset ?? ''}
              onChange={(n) => setPrio(PRESETS[n])} labelledBy="crops-priorities-title"
            />
            {SLIDERS.map(({ key, label, marks }) => (
              <Slider
                key={key} label={label} min={0} max={100} step={5} value={prio[key]}
                display={`${prio[key]}`} marks={marks} onChange={(v) => setPrio({ ...prio, [key]: v })}
              />
            ))}
            <div className="edit-bar">
              <Btn variant="save" disabled={!dirty} loading={saving} loadingLabel="Saving…" onClick={save}>Save as my priorities</Btn>
              <Btn variant="secondary" disabled={!dirty || saving} onClick={() => setPrio(saved)}>Reset</Btn>
            </div>
            {dirty && <small className="note-list">Trying these priorities. Nothing is saved until you press Save.</small>}
            {note && <Notice kind={note.kind}>{note.text}</Notice>}
          </Card>

          {data && (
            <Card title="Risks in your zone">
              <div className="risk-strip">
                {data.risks.filter((r) => r.level).map((r) => (
                  <span key={r.key} className="risk-chip">{RISK_INFO[r.key].title}<LevelPill level={r.level} /></span>
                ))}
              </div>
              <ul className="note-list">
                {data.adjustments.map((a) => <li key={a}>{ADJUSTMENT_TEXT[a] ?? a}</li>)}
                {data.adjustments.length === 0 && <li>No zone risk changes how much each priority counts.</li>}
              </ul>
              <small className="note-list">Weights now: {(Object.keys(FACTOR_LABEL) as (keyof typeof FACTOR_LABEL)[]).map((k) => `${FACTOR_LABEL[k]} ${Number(data.weights[k].toFixed(2))}`).join(' · ')}</small>
            </Card>
          )}

          {result.error && <Notice kind="error">{result.error}</Notice>}
          {result.loading && !data && <Notice kind="loading">Comparing crops…</Notice>}
          {data && (
            <Card title="Options" busy={result.loading}>
              {data.current && (
                <>
                  <p className="suggest-intro">Your {data.baseFrom === 'history' ? 'last crop' : 'current crop'}, scored the same way:</p>
                  <ol className="suggest-list"><SuggestionCard s={data.current} baseName={baseName} current /></ol>
                </>
              )}
              <p className="suggest-intro">{baseName ? <>Instead of <b>{baseName}</b>, in order for your priorities:</> : 'Options in order for your priorities:'}</p>
              {data.items.length === 0 && <p className="empty">No options available.</p>}
              <ol className="suggest-list">
                {data.items.map((s) => (
                  <SuggestionCard
                    key={s.code} s={s} baseName={baseName}
                    action={{ label: `Switch to ${s.name}`, busy: busy === s.code, disabled: busy !== null, onClick: () => change(s.code, s.name) }}
                  />
                ))}
              </ol>
              {message && <Notice kind={message.kind}>{message.text}</Notice>}
              {!data.traitsVerified && (
                <small className="note-list">
                  Water need, nitrogen and ground cover per crop are general categories that have not been checked against local sources yet.
                </small>
              )}
              <small className="note-list">
                Scores order the options; they are not a chance of success. Rotation, price, yield and risk numbers come from models trained on Weld County, CO data. Check with your agronomist.
              </small>
            </Card>
          )}
        </>
      )}
    </Panel>
  );
}

const toPriorities = (p: [number, number, number, number]): Priorities => ({ water: p[0], soil: p[1], erosion: p[2], income: p[3] });
