import { CircleAlert } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import type { Crop, FieldValues, Irrigation, Soil } from '../data';
import { Card, Chips, Notice, PriorityBar, ToggleChip } from './ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IRRIGATION: readonly Irrigation[] = ['Rainfed', 'Gravity', 'Sprinkler', 'Drip'];
const SOIL: readonly Soil[] = ['Clay', 'Sandy', 'Loam', 'Use satellite data'];
const EQUIPMENT = ['Seed drill', 'Row crop planter', 'No-till drill'] as const;
const PRIORITIES = ['Save water / drought tolerance', 'Improve fertility and soil', 'Stop soil erosion', 'Generate extra income'];

export const EMPTY_VALUES: FieldValues = {
  name: '', description: '', crop: '', monthsEmptyFrom: null, monthsEmptyTo: null,
  irrigation: 'Sprinkler', soil: 'Use satellite data', equipment: [], priorities: [40, 80, 25, 90],
};

export const sameValues = (a: FieldValues, b: FieldValues) =>
  a.name === b.name && a.description === b.description && a.crop === b.crop &&
  a.monthsEmptyFrom === b.monthsEmptyFrom && a.monthsEmptyTo === b.monthsEmptyTo &&
  a.irrigation === b.irrigation && a.soil === b.soil &&
  [...a.equipment].sort().join('|') === [...b.equipment].sort().join('|') &&
  a.priorities.every((p, i) => p === b.priorities[i]);

/** One month chosen without the other cannot be saved. */
export const monthsIncomplete = (v: FieldValues) => (v.monthsEmptyFrom == null) !== (v.monthsEmptyTo == null);

interface Props {
  values: FieldValues;
  onChange: (values: FieldValues) => void;
  crops: Crop[] | null;
  cropsError?: string | null;
  /** Read-only view of the same form (the "Modify" button turns it on). */
  disabled?: boolean;
  /** Shown at the end of the first card. */
  footer?: ReactNode;
}

/** The field form, shared by "Add a field" and "My fields" so both capture exactly the same values. */
export function FieldForm({ values: v, onChange, crops, cropsError, disabled, footer }: Props) {
  const id = useId();
  const set = <K extends keyof FieldValues>(key: K, value: FieldValues[K]) => onChange({ ...v, [key]: value });
  const month = (value: number | null) => (value == null ? '' : String(value));
  const toggle = (e: string) => set('equipment', v.equipment.includes(e) ? v.equipment.filter((x) => x !== e) : [...v.equipment, e]);
  const incomplete = monthsIncomplete(v);
  const hintId = `${id}-months-hint`;
  return (
    <fieldset className="form-set" disabled={disabled}>
      <Card className="form">
        <h2 className="h3">General characteristics</h2>
        <label>Field name<input placeholder="Chili field" value={v.name} maxLength={120} onChange={(e) => set('name', e.target.value)} /></label>
        <label>Description<input placeholder="Description" value={v.description} maxLength={500} onChange={(e) => set('description', e.target.value)} /></label>
        <label>Crop type
          <select value={v.crop} onChange={(e) => set('crop', e.target.value)}>
            <option value="">Crop type</option>
            {(crops ?? []).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </label>
        {cropsError && <Notice kind="error">{cropsError}</Notice>}
        <fieldset className="group">
          <legend className="label">Months the field stays empty</legend>
          <div className="months">
            <label htmlFor={`${id}-from`}>From</label>
            <select
              id={`${id}-from`} value={month(v.monthsEmptyFrom)} aria-describedby={incomplete ? hintId : undefined}
              aria-invalid={(incomplete && v.monthsEmptyFrom == null) || undefined}
              onChange={(e) => set('monthsEmptyFrom', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">month</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <label htmlFor={`${id}-to`}>To</label>
            <select
              id={`${id}-to`} value={month(v.monthsEmptyTo)} aria-describedby={incomplete ? hintId : undefined}
              aria-invalid={(incomplete && v.monthsEmptyTo == null) || undefined}
              onChange={(e) => set('monthsEmptyTo', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">month</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div aria-live="polite">
            {incomplete && (
              <small id={hintId} className="field-hint"><CircleAlert size={16} aria-hidden />Choose both months, or leave both empty.</small>
            )}
          </div>
        </fieldset>
        <fieldset className="group">
          <legend className="label" id={`${id}-irrigation`}>Irrigation system</legend>
          <Chips options={IRRIGATION} value={v.irrigation} onChange={(x) => set('irrigation', x)} labelledBy={`${id}-irrigation`} />
        </fieldset>
        <fieldset className="group">
          <legend className="legend-h3" id={`${id}-soil`}>Perceived soil type <small>satellite data recommended*</small></legend>
          <Chips options={SOIL} value={v.soil} onChange={(x) => set('soil', x)} labelledBy={`${id}-soil`} />
        </fieldset>
        <fieldset className="group">
          <legend className="label">Equipment available</legend>
          <div className="chips">
            {EQUIPMENT.map((e) => <ToggleChip key={e} label={e} pressed={v.equipment.includes(e)} onToggle={() => toggle(e)} />)}
          </div>
        </fieldset>
        {footer}
      </Card>
      <Card className="priorities">
        <h2 className="h3">Farmer priorities</h2>
        <div className="priority-row">
          {PRIORITIES.map((p, i) => (
            <PriorityBar
              key={p} label={p} value={v.priorities[i]}
              onChange={(x) => set('priorities', v.priorities.map((y, j) => (j === i ? x : y)) as FieldValues['priorities'])}
            />
          ))}
        </div>
      </Card>
    </fieldset>
  );
}
