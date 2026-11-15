import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, useMapConfig } from '../AppContext';
import { CropSuggestions } from '../components/CropSuggestions';
import { EMPTY_VALUES, FieldForm, monthsIncomplete, sameValues } from '../components/FieldForm';
import { Btn, Card, Notice, Panel } from '../components/ui';
import { errorMessage, fetchCrops, updateField, type FieldValues } from '../data';
import { useRemote } from '../hooks';

/** "My fields": see every saved field and change what was captured, without drawing or typing everything again. */
export function Fields() {
  const { fields, fieldsError, currentField, selectField, refreshFields } = useApp();
  const navigate = useNavigate();
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
  const canSave = editing && dirty && !monthsIncomplete(draft) && !saving;

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
          You have no fields yet. <button type="button" className="link" onClick={() => navigate('/fields/new')}>Add your first field</button>
        </Notice>
      )}
      {fields && fields.length > 0 && (
        <Card title="Your fields">
          <div className="field-list" role="listbox" aria-label="Your fields">
            {fields.map((f) => (
              <button
                key={f.id} type="button" role="option" aria-selected={f.id === currentField?.id}
                className="field-item" disabled={editing && f.id !== currentField?.id}
                onClick={() => selectField(f.id)}
              >
                <strong>{f.name}</strong>
                <span>{f.values.crop ? crops.data?.find((c) => c.code === f.values.crop)?.name ?? f.values.crop : 'No crop set'}{f.areaHa ? ` · ${f.areaHa.toFixed(1)} ha` : ''}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {currentField && (
        <>
          <div className="edit-bar" role="toolbar" aria-label="Edit field">
            <Btn variant="primary" disabled={editing} onClick={startEditing}>Modify</Btn>
            <Btn variant="save" disabled={!canSave} onClick={save}>{saving ? 'Saving…' : 'Save'}</Btn>
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
