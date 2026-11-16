import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, useMapConfig, useSheet } from '../AppContext';
import { CropSuggestions } from '../components/CropSuggestions';
import { EMPTY_VALUES, FieldForm, monthsIncomplete, sameValues } from '../components/FieldForm';
import { Btn, Card, Notice, Panel } from '../components/ui';
import { errorMessage, fetchCrops, updateField, type FieldValues } from '../data';
import { useRemote } from '../hooks';

/** "My fields": see every saved field and change what was captured, without drawing or typing everything again. */
export function Fields() {
  const { fields, fieldsError, currentField, selectField, refreshFields } = useApp();
  const { requestMapView } = useSheet();
  const crops = useRemote(fetchCrops, []);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<FieldValues>(EMPTY_VALUES);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  useMapConfig({ points: [] }, []);

  // Switching field, or the server data changing under us, leaves edit mode and shows the saved values.
  const saved = currentField?.values ?? EMPTY_VALUES;
  const version = currentField ? `${currentField.id}:${currentField.version}` : '';
  useEffect(() => {
    setEditing(false);
    setDraft(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const dirty = !sameValues(draft, saved);
  const canSave = editing && dirty && !monthsIncomplete(draft);

  function startEditing() {
    setDraft(saved);
    setMessage(null);
    setEditing(true);
  }
  function cancel() {
    setDraft(saved);
    setMessage(null);
    setEditing(false);
  }
  async function save() {
    if (!currentField) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateField(currentField, draft);
      await refreshFields();
      setMessage({ kind: 'info', text: 'Changes saved.' });
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="My fields">
      {fieldsError && <Notice kind="error">{fieldsError}</Notice>}
      {fields && fields.length === 0 && !fieldsError && (
        <Notice>
          You have no fields yet. <Link className="link" to="/fields/new">Add your first field</Link>
        </Notice>
      )}
      {fields && fields.length > 0 && (
        <Card title="Your fields">
          <ul className="field-list" aria-label="Your fields">
            {fields.map((f) => {
              const selected = f.id === currentField?.id;
              return (
                <li key={f.id}>
                  <button
                    type="button" aria-current={selected ? 'true' : undefined}
                    className="field-item" disabled={editing && !selected}
                    onClick={(e) => {
                      selectField(f.id);
                      requestMapView(e.currentTarget);
                    }}
                  >
                    <span className="item-title"><strong>{f.name}</strong>{selected && <Check className="item-check" size={16} strokeWidth={3} aria-hidden />}</span>
                    <span className="item-meta">{f.values.crop ? crops.data?.find((c) => c.code === f.values.crop)?.name ?? f.values.crop : 'No crop set'}{f.areaHa ? ` · ${f.areaHa.toFixed(1)} ha` : ''}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {currentField && (
        <>
          <div className="edit-bar" role="toolbar" aria-label="Edit field">
            <Btn variant="primary" disabled={editing} onClick={startEditing}>Modify</Btn>
            <Btn variant="save" disabled={!canSave} loading={saving} loadingLabel="Saving…" onClick={save}>Save</Btn>
            {editing && <Btn variant="secondary" disabled={saving} onClick={cancel}>Cancel</Btn>}
          </div>
          {editing && !dirty && <small className="note-list">Change something to enable Save.</small>}
          {message && <Notice kind={message.kind}>{message.text}</Notice>}
          <FieldForm
            values={editing ? draft : saved} onChange={setDraft}
            crops={crops.data} cropsError={crops.error} disabled={!editing}
            footer={<small className="note-list">
              {currentField.boundary.length >= 3
                ? `Outline: ${currentField.boundary.length} corners${currentField.areaHa ? `, ${currentField.areaHa.toFixed(1)} ha` : ''}. To redraw it, add the field again.`
                : 'This field was saved as a single point.'}
            </small>}
          />
          <CropSuggestions field={currentField} />
        </>
      )}
    </Panel>
  );
}
