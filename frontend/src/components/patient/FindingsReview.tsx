import React, { useEffect, useId, useState } from 'react';
import { CheckCircle2, LoaderCircle, Lock, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import type { ExtractedFinding, FindingEdit, ProcessedDocument, ReviewResponse } from '../../api/queries.js';
import { patientReviewApi, type ReviewApi } from './reviewApi';

const CATEGORY_LABELS: Record<ExtractedFinding['category'], string> = {
  condition: 'Condition',
  medication: 'Medicine',
  allergy: 'Allergy',
  investigation: 'Test result',
  event: 'Event',
};

const ASSERTION_OPTIONS: { value: ExtractedFinding['assertion']; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Not present (document says no)' },
  { value: 'possible', label: 'Possible, not confirmed' },
  { value: 'historical', label: 'Past history' },
];

const QUALIFIERS: Record<ExtractedFinding['assertion'], string | null> = {
  present: null,
  absent: 'Documented as absent',
  possible: 'Possible - unconfirmed',
  historical: 'Past history',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatDate = (iso: string | null) => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return d ? `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}` : m ? `${MONTHS[Number(m) - 1]} ${y}` : y;
};
const formatWhen = (iso: string | null | undefined) => (iso ? formatDate(iso.slice(0, 10)) : null);

const detailOf = (f: ExtractedFinding) =>
  f.category === 'medication'
    ? [f.dose, f.frequency].filter(Boolean).join(' ')
    : [f.value && [f.value, f.unit].filter(Boolean).join(' '), !f.value && f.unit ? `no result printed (${f.unit})` : null, f.refRange && `lab's range ${f.refRange}`]
        .filter(Boolean)
        .join(' · ');

type Viewer = 'patient' | 'doctor';

/** "Edited by you", "Edited by patient", "Corrected by Dr X": who made this version. */
const editedLabel = (finding: ExtractedFinding, viewer: Viewer): { text: string; tone: 'patient' | 'doctor' } | null => {
  const by = finding.editedBy;
  if (!by) return null;
  const when = formatWhen(by.at);
  if (by.type === 'doctor') return { text: `Corrected by ${by.name ?? 'a doctor'}${when ? ` · ${when}` : ''}`, tone: 'doctor' };
  return { text: `${viewer === 'patient' ? 'Edited by you' : 'Edited by patient'}${when ? ` · ${when}` : ''}`, tone: 'patient' };
};

const removedLabel = (finding: ExtractedFinding, viewer: Viewer) => {
  const by = finding.reviewedBy;
  if (by?.type === 'doctor') return `Removed by ${by.name ?? 'a doctor'}`;
  if (by?.type === 'patient') return viewer === 'patient' ? 'Removed by you' : 'Removed by patient';
  return 'Removed';
};

export interface FindingsReviewProps {
  document: Pick<ProcessedDocument, 'id'>;
  /** Called with the updated document after any review action */
  onDocumentChange?: (document: ProcessedDocument) => void;
  /** Where to send the actions; defaults to the logged-in patient */
  api?: ReviewApi;
  viewer?: Viewer;
  /** False under view-only consent: findings are shown without edit controls */
  canEdit?: boolean;
}

/**
 * Review the findings read from one document: edit what is wrong, remove what
 * does not belong, and (patients) add the rest to the medical history. Used by
 * the patient's Upload page and the doctor's Medical History tab. Edits are
 * saved as new versions attributed to whoever made them; the document's own
 * wording stays attached and visible.
 */
export const FindingsReview: React.FC<FindingsReviewProps> = ({
  document,
  onDocumentChange,
  api = patientReviewApi,
  viewer = 'patient',
  canEdit = true,
}) => {
  const [findings, setFindings] = useState<ExtractedFinding[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .load(document.id)
      .then(({ data }) => {
        if (active) setFindings(data.findings);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load findings.');
      });
    return () => {
      active = false;
    };
  }, [api, document.id]);

  /** Run one review action and take the server's updated list. */
  const run = async (key: string, action: () => Promise<ReviewResponse>) => {
    setBusy(key);
    setError('');
    try {
      const { data } = await action();
      setFindings(data.findings);
      onDocumentChange?.(data.document);
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'That did not work. Try again.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (error && findings === null) return <p className="text-sm text-warning">{error}</p>;
  if (findings === null) return <p className="text-sm text-text-secondary">Loading findings…</p>;
  if (findings.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        {viewer === 'doctor'
          ? 'No findings from this document are in the medical history.'
          : 'No findings could be verified in this document. A finding is only shown when its exact wording, values and units are found in the document. Clearer photos give better results.'}
      </p>
    );
  }

  const pending = findings.filter((f) => f.reviewStatus === 'pending');
  const confirmed = findings.filter((f) => f.reviewStatus === 'confirmed');

  return (
    <div className="space-y-3">
      {viewer === 'doctor' ? (
        canEdit ? (
          <p className="text-sm text-text-secondary">
            Corrections are saved as new versions under your name; the original and the document’s wording stay viewable.
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-text-secondary">
            <Lock size={14} /> View-only access. Ask the patient for “view and correct” access to make changes.
          </p>
        )
      ) : pending.length > 0 ? (
        <p className="text-sm text-text-secondary">
          Check what was read from this document. <span className="font-medium text-text-main">Remove</span> anything that is not yours,
          then add the rest to your medical history.
        </p>
      ) : confirmed.length > 0 ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-forest">
          <CheckCircle2 size={15} /> Added to your medical history. You can still remove findings here.
        </p>
      ) : (
        <p className="text-sm text-text-secondary">All findings from this document were removed, so nothing was added to your history.</p>
      )}

      <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle bg-white">
        {findings.map((finding) => (
          <li key={finding.id} className={`px-3 py-3 ${finding.reviewStatus === 'dismissed' ? 'bg-osco-bg/60' : ''}`}>
            {editingId === finding.id ? (
              <EditFindingForm
                finding={finding}
                saving={busy === finding.id}
                onCancel={() => setEditingId(null)}
                onSave={async (changes) => {
                  const ok = await run(finding.id, () => api.edit!(document.id, finding.id, changes));
                  if (ok) setEditingId(null);
                }}
              />
            ) : (
              <FindingSummary
                finding={finding}
                viewer={viewer}
                canEdit={canEdit}
                showEdit={api.edit !== null}
                busy={busy === finding.id}
                disabled={busy !== null}
                onEdit={() => setEditingId(finding.id)}
                onDismiss={() => void run(finding.id, () => api.dismiss(document.id, finding.id))}
                onRestore={() => void run(finding.id, () => api.restore(document.id, finding.id))}
              />
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="text-sm text-warning">
          {error}
        </p>
      )}

      {api.confirm && pending.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">Nothing goes into your medical history until you add it.</p>
          <button
            type="button"
            disabled={busy !== null || editingId !== null}
            onClick={() => void run('confirm', () => api.confirm!(document.id))}
            className="inline-flex items-center gap-2 rounded-lg bg-forest px-4 py-2.5 text-sm font-semibold text-white hover:bg-forest-dark disabled:opacity-60"
          >
            {busy === 'confirm' && <LoaderCircle size={15} className="animate-spin" />}
            Add {pending.length} finding{pending.length === 1 ? '' : 's'} to my medical history
          </button>
        </div>
      )}
    </div>
  );
};

const FindingSummary: React.FC<{
  finding: ExtractedFinding;
  viewer: Viewer;
  canEdit: boolean;
  /** False for patients: they can view (and remove) findings but not edit them */
  showEdit: boolean;
  busy: boolean;
  disabled: boolean;
  onEdit: () => void;
  onDismiss: () => void;
  onRestore: () => void;
}> = ({ finding, viewer, canEdit, showEdit, busy, disabled, onEdit, onDismiss, onRestore }) => {
  const dismissed = finding.reviewStatus === 'dismissed';
  const self = viewer === 'patient';
  const qualifier = finding.subject !== 'patient' ? `${finding.subjectRelation ?? 'Family'} (not ${self ? 'you' : 'the patient'})` : QUALIFIERS[finding.assertion];
  const detail = detailOf(finding);
  const date = formatDate(finding.eventDate);
  const edited = editedLabel(finding, viewer);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className={`min-w-0 ${dismissed ? 'opacity-60' : ''}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-text-muted">{CATEGORY_LABELS[finding.category]}</span>
          <span className={`text-sm font-medium text-text-main ${dismissed ? 'line-through' : ''}`}>{finding.name}</span>
          {detail && <span className="text-xs text-text-secondary">{detail}</span>}
          {qualifier && <span className="rounded bg-osco-bg px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">{qualifier}</span>}
          {date && <span className="font-mono text-[10px] text-text-muted">{date}</span>}
          {edited && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${edited.tone === 'doctor' ? 'bg-eucalyptus-subtle text-forest' : 'bg-warning-subtle text-warning'}`}
            >
              {edited.text}
            </span>
          )}
          {finding.reviewStatus === 'confirmed' && self && (
            <span className="rounded bg-eucalyptus-subtle px-1.5 py-0.5 text-[10px] font-semibold text-forest">In your history</span>
          )}
          {dismissed && <span className="rounded bg-border-subtle px-1.5 py-0.5 text-[10px] font-semibold text-text-secondary">{removedLabel(finding, viewer)}</span>}
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          Document says: “{finding.quote}” <span className="font-mono text-[10px] text-text-muted">· p.{finding.page}</span>
        </p>
      </div>
      {canEdit && (
        <div className="flex shrink-0 gap-1.5">
          {busy && <LoaderCircle size={15} className="mt-1.5 animate-spin text-text-muted" />}
          {dismissed ? (
            <button type="button" disabled={disabled} onClick={onRestore} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-forest hover:bg-eucalyptus-subtle disabled:opacity-50">
              <RotateCcw size={13} /> Restore
            </button>
          ) : (
            <>
              {showEdit && (
                <button type="button" disabled={disabled} onClick={onEdit} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-forest hover:bg-eucalyptus-subtle disabled:opacity-50">
                  <Pencil size={13} /> Edit
                </button>
              )}
              <button type="button" disabled={disabled} onClick={onDismiss} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-warning hover:bg-warning-subtle disabled:opacity-50">
                <Trash2 size={13} /> {self ? 'Remove' : 'Delete'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

/** The correction form, also used inline by the doctor's Alert and Reviews tab. */
export const EditFindingForm: React.FC<{
  finding: ExtractedFinding;
  saving: boolean;
  onCancel: () => void;
  onSave: (changes: FindingEdit) => void;
}> = ({ finding, saving, onCancel, onSave }) => {
  const id = useId();
  const isMedicine = finding.category === 'medication';
  const [name, setName] = useState(finding.name);
  const [dose, setDose] = useState(finding.dose ?? '');
  const [frequency, setFrequency] = useState(finding.frequency ?? '');
  const [value, setValue] = useState(finding.value ?? '');
  const [unit, setUnit] = useState(finding.unit ?? '');
  const [refRange, setRefRange] = useState(finding.refRange ?? '');
  const [date, setDate] = useState(finding.eventDate && /^\d{4}-\d{2}-\d{2}$/.test(finding.eventDate) ? finding.eventDate : '');
  const [assertion, setAssertion] = useState(finding.assertion);
  const [formError, setFormError] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setFormError('Name cannot be empty.');
      return;
    }
    // Send only what changed.
    const changes: FindingEdit = {};
    const differs = (next: string, prev: string | null) => next.trim() !== (prev ?? '');
    if (differs(name, finding.name)) changes.name = name.trim();
    if (isMedicine) {
      if (differs(dose, finding.dose)) changes.dose = dose.trim() || null;
      if (differs(frequency, finding.frequency)) changes.frequency = frequency.trim() || null;
    } else {
      if (differs(value, finding.value)) changes.value = value.trim() || null;
      if (differs(unit, finding.unit)) changes.unit = unit.trim() || null;
      if (differs(refRange, finding.refRange)) changes.refRange = refRange.trim() || null;
    }
    if (date !== (finding.eventDate ?? '')) changes.date = date || null;
    if (assertion !== finding.assertion) changes.assertion = assertion;
    if (!Object.keys(changes).length) {
      onCancel();
      return;
    }
    setFormError('');
    onSave(changes);
  };

  const field = 'w-full rounded-md border border-border-medium bg-white px-2.5 py-1.5 text-sm focus:border-forest focus:outline-none';
  const label = 'mb-1 block text-xs font-medium text-text-secondary';

  return (
    <form onSubmit={submit} className="space-y-3" aria-label={`Edit ${finding.name}`}>
      <p className="text-xs text-text-secondary">
        Document says: “{finding.quote}”. The change is saved as a new version under your name; the document’s wording is kept.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-name`} className={label}>
            {CATEGORY_LABELS[finding.category]} name
          </label>
          <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} className={field} maxLength={200} />
        </div>
        {isMedicine ? (
          <>
            <div>
              <label htmlFor={`${id}-dose`} className={label}>Dose</label>
              <input id={`${id}-dose`} value={dose} onChange={(e) => setDose(e.target.value)} placeholder="e.g. 500 mg" className={field} maxLength={200} />
            </div>
            <div>
              <label htmlFor={`${id}-freq`} className={label}>How often</label>
              <input id={`${id}-freq`} value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="e.g. twice daily" className={field} maxLength={200} />
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor={`${id}-value`} className={label}>Result</label>
              <input id={`${id}-value`} value={value} onChange={(e) => setValue(e.target.value)} className={field} maxLength={200} />
            </div>
            <div>
              <label htmlFor={`${id}-unit`} className={label}>Unit</label>
              <input id={`${id}-unit`} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. mg/dL" className={field} maxLength={200} />
            </div>
            <div>
              <label htmlFor={`${id}-range`} className={label}>Lab's range</label>
              <input id={`${id}-range`} value={refRange} onChange={(e) => setRefRange(e.target.value)} className={field} maxLength={200} />
            </div>
          </>
        )}
        <div>
          <label htmlFor={`${id}-date`} className={label}>Date</label>
          <input id={`${id}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor={`${id}-assertion`} className={label}>Status</label>
          <select id={`${id}-assertion`} value={assertion} onChange={(e) => setAssertion(e.target.value as ExtractedFinding['assertion'])} className={field}>
            {ASSERTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {formError && <p className="text-sm text-warning">{formError}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-osco-bg">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-forest px-3 py-1.5 text-sm font-semibold text-white hover:bg-forest-dark disabled:opacity-60">
          {saving && <LoaderCircle size={14} className="animate-spin" />}
          Save correction
        </button>
      </div>
    </form>
  );
};
