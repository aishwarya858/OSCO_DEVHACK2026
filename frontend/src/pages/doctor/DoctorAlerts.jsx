import { useMemo, useState } from 'react';
import { BadgeCheck, CalendarX2, CheckCircle2, Copy, FileText, LoaderCircle, Lock, Pencil, SearchCheck, TriangleAlert, UserRoundX } from 'lucide-react';
import { useDoctorRecords } from './useDoctorRecords';
import { doctorReviewApi, resolveFlag, verifyFinding } from '../../api/doctorApi.js';
import { BriefCard } from '../../components/brief/BriefCard';
import { AccessPill, DoctorPageShell, EmptyNote, Pill, StatTile, TabStatus } from '../../components/brief/DoctorPageShell';
import { ProvenanceTag } from '../../components/brief/ProvenanceTag';
import { SourceChip } from '../../components/brief/SourceChip';
import { EditFindingForm } from '../../components/patient/FindingsReview';
import { LazySourceViewer } from '../../components/records/LazySourceViewer';
import { findingDetail, formatRecordDate } from '../../records/format';
import { documentDateLabel, documentOf, findingIndex, provenanceKind, sourceOf } from '../../records/doctorView';
import { sourceTargetFor } from '../../records/source';

const CONFLICT_TYPES = ['contradiction', 'active_after_stop'];
const VERIFY_TYPES = ['needs_verification', 'unverified_finding'];
const GAP_TYPES = ['missing_field', 'ambiguous_date', 'orphan_reference', 'stale_medication'];
const TYPE_LABEL = {
  contradiction: 'Contradiction',
  active_after_stop: 'Restart or conflict',
  duplicate: 'Possible duplicate',
  missing_field: 'Missing information',
  ambiguous_date: 'Ambiguous date',
  orphan_reference: 'No earlier record',
  stale_medication: 'May be outdated',
  inconsistent_detail: 'Inconsistent detail',
  needs_verification: 'Needs verification',
  unverified_finding: 'Unconfirmed finding',
};
const AMBER_TYPES = ['duplicate', ...GAP_TYPES, ...VERIFY_TYPES];

/**
 * Alert and Reviews tab (MVP document 6.2.7): the review list for flags raised
 * by fixed reconciliation rules across the whole history (contradictions,
 * inconsistent patient details / dates / units, results and findings needing
 * verification, possible duplicates, missing information). Each flag says what
 * was found, which records are involved, and why it needs attention. Flags are never resolved automatically: with "view and correct"
 * consent the doctor compares the sources side by side, verifies or corrects a
 * version, and marks the flag reviewed with a note. Everything is audited.
 */
export default function DoctorAlerts({ patient, onAccessLost }) {
  const { state, reload } = useDoctorRecords(patient.id, onAccessLost);
  const [target, setTarget] = useState(null);
  const api = useMemo(() => doctorReviewApi(patient.id), [patient.id]);

  if (state.status !== 'ready') return <TabStatus title="Alert and Reviews" state={state} />;
  const { records, access } = state;
  const canEdit = access.level === 'edit';
  const open = records.flags.filter((f) => f.status === 'open');
  const resolved = records.flags.filter((f) => f.status === 'resolved');
  const conflicts = open.filter((f) => CONFLICT_TYPES.includes(f.type));
  const inconsistencies = open.filter((f) => f.type === 'inconsistent_detail');
  const verification = open.filter((f) => VERIFY_TYPES.includes(f.type));
  const duplicates = open.filter((f) => f.type === 'duplicate');
  const gaps = open.filter((f) => GAP_TYPES.includes(f.type));
  const byId = findingIndex(records);
  const currentIds = new Set(records.findings.map((f) => f.id));

  // Corrections re-run reconciliation on the server, which may clear the flag: refresh now and once it has finished.
  const afterChange = () => {
    reload();
    window.setTimeout(reload, 2500);
  };
  const openSource = (source) => {
    if (source.findingId) setTarget(sourceTargetFor(records, source.findingId));
  };
  const itemProps = { records, byId, currentIds, canEdit, api, publicId: patient.id, onChanged: afterChange, onOpenSource: openSource, onOpenTarget: setTarget };

  return (
    <DoctorPageShell
      title="Alert and Reviews"
      patient={{ name: records.patientName || patient.name, publicId: records.patientId || patient.id }}
      meta={[<span key="o">{open.length} open</span>, <span key="r">{resolved.length} reviewed</span>]}
      aside={
        <>
          <AccessPill level={access.level} />
          <p className="text-xs text-ink-muted">Raised by fixed rules from the confirmed history. Never resolved automatically.</p>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Contradictions" value={conflicts.length} unit="open" tone={conflicts.length ? 'dark' : 'chalk'} />
        <StatTile label="Inconsistent details" value={inconsistencies.length} unit="open" />
        <StatTile label="Needs verification" value={verification.length} unit="open" />
        <StatTile label="Possible duplicates" value={duplicates.length} unit="open" />
        <StatTile label="Missing information" value={gaps.length} unit="open" tone="plum" />
        <StatTile label="Reviewed" value={resolved.length} unit="by a doctor" tone="sage" />
      </div>

      {!canEdit && (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-slate-soft px-4 py-3 text-sm text-slate">
          <Lock size={15} /> View-only access: you can compare sources, but verifying, correcting and marking reviewed need the patient’s “view and correct” approval.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <BriefCard title="Contradictions" icon={TriangleAlert} tone="dark" className="border-l-4 border-brick lg:col-span-12" meta={<span className="hidden text-[11px] text-white/60 sm:inline">Not resolved by AI. Doctor review required.</span>}>
          {conflicts.length ? (
            <ul className="space-y-4">
              {conflicts.map((flag) => (
                <FlagItem key={flag.id} flag={flag} onDark {...itemProps} />
              ))}
            </ul>
          ) : (
            <EmptyNote onDark>No open contradiction. Records that disagree appear here with both versions side by side.</EmptyNote>
          )}
        </BriefCard>

        <BriefCard title="Inconsistent details" icon={UserRoundX} className="border-l-4 border-brick lg:col-span-6">
          {inconsistencies.length ? (
            <ul className="space-y-4">
              {inconsistencies.map((flag) => (
                <FlagItem key={flag.id} flag={flag} {...itemProps} />
              ))}
            </ul>
          ) : (
            <EmptyNote>No open inconsistency. Different patient names, dates of birth, ages, units or impossible dates between records appear here.</EmptyNote>
          )}
        </BriefCard>

        <BriefCard title="Needs verification" icon={SearchCheck} className="border-l-4 border-ochre lg:col-span-6">
          {verification.length ? (
            <ul className="space-y-4">
              {verification.map((flag) => (
                <FlagItem key={flag.id} flag={flag} compact {...itemProps} />
              ))}
            </ul>
          ) : (
            <EmptyNote>Nothing to verify. Results outside the report’s own range, suspected or unconfirmed findings, and unverified edits appear here.</EmptyNote>
          )}
        </BriefCard>

        <BriefCard title="Possible duplicates" icon={Copy} className="border-l-4 border-ochre lg:col-span-6">
          {duplicates.length ? (
            <ul className="space-y-4">
              {duplicates.map((flag) => (
                <FlagItem key={flag.id} flag={flag} {...itemProps} />
              ))}
            </ul>
          ) : (
            <EmptyNote>No possible duplicate. A document uploaded twice, or the same result, diagnosis or prescription on the same date in two documents, appears here.</EmptyNote>
          )}
        </BriefCard>

        <BriefCard title="Missing information" icon={CalendarX2} tone="plum" className="lg:col-span-6">
          {gaps.length ? (
            <ul className="space-y-4">
              {gaps.map((flag) => (
                <FlagItem key={flag.id} flag={flag} compact {...itemProps} />
              ))}
            </ul>
          ) : (
            <EmptyNote>No open gap. Missing doses, units, reference ranges, dates, patient names and results appear here. This does not mean the record is complete.</EmptyNote>
          )}
        </BriefCard>

        <BriefCard title="Reviewed" icon={CheckCircle2} tone="sage" className="lg:col-span-12" meta={<span className="rounded-full bg-white/50 px-2 py-0.5 font-jetbrains text-[10.5px]">{resolved.length}</span>}>
          {resolved.length ? (
            <ul className="divide-y divide-aubergine/10">
              {resolved.map((flag) => (
                <li key={flag.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="moss">{TYPE_LABEL[flag.type] ?? flag.type}</Pill>
                    <span className="text-[13px] font-medium">{flag.message}</span>
                  </div>
                  <p className="mt-1 text-[13px] text-aubergine/80">
                    “{flag.resolution?.note}” <span className="text-ink-muted">· {flag.resolution?.by ?? 'A doctor'}</span>
                    {flag.resolution?.at && <span className="font-jetbrains text-[11px] text-ink-muted"> · {formatRecordDate(flag.resolution.at.slice(0, 10))}</span>}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>Nothing has been reviewed yet. Reviewed flags stay here with the doctor’s note.</EmptyNote>
          )}
        </BriefCard>
      </div>
      <LazySourceViewer target={target} onClose={() => setTarget(null)} />
    </DoctorPageShell>
  );
}

/** One flag: the versions involved side by side, plus verify / correct / mark reviewed. */
function FlagItem({ flag, records, byId, currentIds, canEdit, api, publicId, onChanged, onOpenSource, onOpenTarget, onDark = false, compact = false }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState('');
  const findings = flag.findingIds.map((id) => byId.get(id)).filter(Boolean);
  // Page evidence (flags read from page text), resolved to the documents the viewer can open.
  const evidence = (flag.evidence ?? [])
    .map((e) => ({ ...e, document: records.documents.find((d) => d.id === e.documentId) }))
    .filter((e) => e.document && e.document.pages?.some((p) => p.pageNumber === e.page));
  const docsOnly = flag.documentIds
    .filter((id) => !findings.some((f) => f.documentId === id) && !evidence.some((e) => e.documentId === id))
    .map((id) => records.documents.find((d) => d.id === id))
    .filter(Boolean);

  const run = async (key, action) => {
    setBusy(key);
    setError('');
    try {
      await action();
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const panel = onDark ? 'bg-aubergine-raised text-white' : 'bg-white/70 text-aubergine';
  const muted = onDark ? 'text-white/55' : 'text-ink-muted';
  const ghost = onDark ? 'border-apricot text-apricot hover:bg-apricot/10' : 'border-aubergine/30 text-aubergine hover:bg-aubergine/5';

  return (
    <li className={`rounded-2xl ${onDark ? 'border border-aubergine-line' : 'bg-white/40'} p-3 sm:p-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={AMBER_TYPES.includes(flag.type) ? 'ochre' : 'brick'} onDark={onDark}>
          {TYPE_LABEL[flag.type] ?? flag.type}
        </Pill>
        <span className={`text-[13px] font-medium ${onDark ? 'text-white/90' : ''}`}>{flag.message}</span>
      </div>
      {flag.reason && (
        <p className={`mt-1.5 text-[12.5px] leading-5 ${muted}`}>
          <span className="font-semibold">Why it needs attention: </span>
          {flag.reason}
        </p>
      )}
      {evidence.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {evidence.map((e, i) => (
            <div key={`${e.documentId}-${e.page}-${i}`} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 ${panel}`}>
              <div className="min-w-0">
                <p className={`text-[11px] ${muted}`}>
                  {e.document.name}, <span className="font-jetbrains">{documentDateLabel(e.document)}</span> · page {e.page}
                </p>
                <p className="text-sm font-medium">“{e.quote.replace(/\s+/g, ' ')}”</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenTarget({ document: e.document, page: e.page, quoteStart: e.quoteStart, quoteEnd: e.quoteEnd, quote: e.quote })}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${ghost}`}
              >
                <FileText size={12} /> Open source
              </button>
            </div>
          ))}
        </div>
      )}

      {findings.length > 0 && (
        <div className={`mt-3 grid gap-2 ${compact || findings.length === 1 ? '' : 'sm:grid-cols-2'}`}>
          {findings.map((f, i) => {
            const doc = documentOf(records, f);
            const current = currentIds.has(f.id);
            const verified = f.verificationStatus === 'doctor_verified' || f.sourceType === 'doctor_entered';
            const correctable = canEdit && current && doc?.kind !== 'clinical_record';
            return (
              <div key={f.id} className={`flex flex-col gap-2 rounded-xl p-3 ${panel}`}>
                <p className={`text-[11px] ${muted}`}>
                  {!compact && findings.length > 1 && <span className="font-semibold">Version {String.fromCharCode(65 + i)} · </span>}
                  {doc?.name ?? 'Unknown document'}, <span className="font-jetbrains">{documentDateLabel(doc)}</span>
                </p>
                <p className="text-sm font-medium">{f.quote ? `“${f.quote}”` : f.name}</p>
                {findingDetail(f) && <p className={`font-jetbrains text-[11.5px] ${muted}`}>{f.name} · {findingDetail(f)}</p>}
                {!current && <p className={`text-[11px] ${muted}`}>This version has since been corrected.</p>}
                <div className="mt-auto flex flex-wrap items-center gap-1.5">
                  <ProvenanceTag kind={provenanceKind(f)} onDark={onDark} />
                  {f.quote && <SourceChip source={sourceOf(records, f)} onDark={onDark} onOpen={onOpenSource} />}
                </div>
                {canEdit && current && (
                  <div className="flex flex-wrap gap-2">
                    {!verified && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => run(`verify-${f.id}`, () => verifyFinding(publicId, f.id))}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50 ${ghost}`}
                      >
                        {busy === `verify-${f.id}` ? <LoaderCircle size={12} className="animate-spin" /> : <BadgeCheck size={12} />} Verify
                      </button>
                    )}
                    {verified && <Pill tone="moss" onDark={onDark}>Doctor-verified</Pill>}
                    {correctable && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => setEditing(editing === f.id ? null : f.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50 ${ghost}`}
                      >
                        <Pencil size={12} /> Correct
                      </button>
                    )}
                  </div>
                )}
                {editing === f.id && (
                  <div className="theme-doctor rounded-xl bg-chalk p-3 text-aubergine">
                    <EditFindingForm
                      finding={f}
                      saving={busy === `edit-${f.id}`}
                      onCancel={() => setEditing(null)}
                      onSave={async (changes) => {
                        const ok = await run(`edit-${f.id}`, () => api.edit(f.documentId, f.id, changes));
                        if (ok) setEditing(null);
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {docsOnly.length > 0 && (
        <p className={`mt-2 text-xs ${muted}`}>Document: {docsOnly.map((d) => `${d.name} (${documentDateLabel(d)})`).join(', ')}</p>
      )}

      {error && <p role="alert" className={`mt-2 text-sm ${onDark ? 'text-apricot' : 'text-brick'}`}>{error}</p>}

      {canEdit && (
        <div className="mt-3">
          {resolving ? (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (!note.trim()) {
                  setError('Add a short note saying how this was reviewed.');
                  return;
                }
                const ok = await run('resolve', () => resolveFlag(publicId, flag.id, note.trim()));
                if (ok) setResolving(false);
              }}
              className="space-y-2"
            >
              <label className={`block text-xs font-semibold ${muted}`}>
                Review note (saved with your name)
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder="e.g. Confirmed with the patient: penicillin rash in 2018."
                  className="mt-1 w-full rounded-xl border border-hairline bg-white px-3 py-2 text-sm font-normal text-aubergine outline-none focus:border-aubergine"
                />
              </label>
              <div className="flex gap-2">
                <button type="submit" disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-full bg-apricot px-4 py-1.5 text-xs font-semibold text-aubergine hover:brightness-95 disabled:opacity-50">
                  {busy === 'resolve' && <LoaderCircle size={12} className="animate-spin" />} Mark reviewed
                </button>
                <button type="button" onClick={() => setResolving(false)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${muted} hover:underline`}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setResolving(true)} className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-semibold ${ghost}`}>
              <CheckCircle2 size={12} /> Mark reviewed
            </button>
          )}
        </div>
      )}
    </li>
  );
}
