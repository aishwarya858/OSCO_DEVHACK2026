import { useMemo, useState } from 'react';
import { CalendarX2, ChevronDown, FileText, Stethoscope, TriangleAlert, Users } from 'lucide-react';
import { useDoctorRecords } from './useDoctorRecords';
import { doctorReviewApi } from '../../api/doctorApi.js';
import { AccessPill, DoctorPageShell, EmptyNote, FilterChip, Pill, StatTile, TabStatus } from '../../components/brief/DoctorPageShell';
import { ProvenanceTag } from '../../components/brief/ProvenanceTag';
import { SourceChip } from '../../components/brief/SourceChip';
import { FindingsReview } from '../../components/patient/FindingsReview';
import { LazySourceViewer } from '../../components/records/LazySourceViewer';
import { buildTimeline } from '../../records/timeline';
import { findingDetail, formatRecordDate } from '../../records/format';
import { documentTypeLabel, openFlags, provenanceKind, sourceOf } from '../../records/doctorView';
import { sourceTargetFor } from '../../records/source';

const GROUPS = [
  { category: 'condition', label: 'Diagnoses and conditions' },
  { category: 'medication', label: 'Medicines' },
  { category: 'investigation', label: 'Tests and results' },
  { category: 'allergy', label: 'Allergies' },
  { category: 'event', label: 'Events' },
];

const QUALIFIER = {
  absent: { text: 'Documented as absent', tone: 'slate' },
  possible: { text: 'Possible, unconfirmed', tone: 'ochre' },
  historical: { text: 'Past history', tone: 'neutral' },
};

const ACTION = { start: 'Started', change: 'Dose changed', stop: 'Stopped', continue: 'Continued' };

// The medical history does not show "possibly outdated" medicine alerts.
const historyFlags = (records) => openFlags(records).filter((flag) => flag.type !== 'stale_medication');

/**
 * Medical History tab (MVP document 6.2.5): the complete timeline, newest first
 * by the date written in each record, with a medical summary of every visit and
 * document. With "view and correct" consent the doctor can review and correct
 * the findings of each document (the same review component the patient uses).
 */
export default function DoctorTimeline({ patient, onAccessLost, onNavigate }) {
  const { state, reload } = useDoctorRecords(patient.id, onAccessLost);
  const [filter, setFilter] = useState('all');
  const [target, setTarget] = useState(null);
  const api = useMemo(() => doctorReviewApi(patient.id), [patient.id]);

  const view = useMemo(() => {
    if (state.status !== 'ready') return null;
    const timeline = buildTimeline(state.records);
    const flagged = new Map();
    for (const flag of historyFlags(state.records)) for (const id of flag.findingIds) flagged.set(id, (flagged.get(id) ?? 0) + 1);
    return { ...timeline, flagged };
  }, [state]);

  if (state.status !== 'ready') return <TabStatus title="Medical History" state={state} />;
  const { records, access } = state;
  const canEdit = access.level === 'edit';

  const typeOf = (entry) => (entry.document.kind === 'clinical_record' ? 'visit' : entry.document.documentType);
  const all = [...view.dated, ...view.undated];
  const types = [...new Set(all.map(typeOf))];
  const matches = (entry) => filter === 'all' || typeOf(entry) === filter;
  const dated = view.dated.filter(matches);
  const undated = view.undated.filter(matches);
  const verified = records.findings.filter((f) => ['doctor', 'doctor-entered'].includes(provenanceKind(f))).length;
  const alerts = historyFlags(records).length;

  // After a correction the server re-runs reconciliation; refresh now and once it has finished.
  const afterChange = () => {
    reload();
    window.setTimeout(reload, 2500);
  };
  const openSource = (source) => {
    if (source.findingId) setTarget(sourceTargetFor(records, source.findingId));
  };

  return (
    <DoctorPageShell
      title="Medical History"
      patient={{ name: records.patientName || patient.name, publicId: records.patientId || patient.id }}
      meta={[
        <span key="e">{all.length} records</span>,
        <span key="u">
          Updated <span className="font-jetbrains text-[12.5px]">{formatRecordDate(records.builtAt)}</span>
        </span>,
      ]}
      aside={
        <>
          <AccessPill level={access.level} />
          <p className="text-xs text-ink-muted">Newest first, by the date written in each record.</p>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Visits and documents" value={all.length} unit="records" />
        <StatTile label="Confirmed findings" value={records.findings.length} unit="in history" />
        <StatTile label="Doctor-verified" value={verified} unit="findings" tone="sage" />
        <StatTile label="Open alerts" value={alerts} unit="to review" tone={alerts ? 'dark' : 'plum'} onClick={() => onNavigate('review-verification')} note="Open Alert and Reviews" />
      </div>

      {all.length > 0 && (
        <div className="mt-6 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by record type">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} count={all.length}>
            All records
          </FilterChip>
          {types.map((type) => (
            <FilterChip key={type} active={filter === type} onClick={() => setFilter(type)} count={all.filter((e) => typeOf(e) === type).length}>
              {type === 'visit' ? 'Doctor visits' : documentTypeLabel({ documentType: type })}
            </FilterChip>
          ))}
        </div>
      )}

      {all.length === 0 ? (
        <div className="mt-6 rounded-3xl bg-chalk p-6">
          <EmptyNote>Nothing is in this patient’s medical history yet. Findings appear after the patient reviews and adds them, or when a doctor adds a record.</EmptyNote>
        </div>
      ) : (
        <>
          <ol className="relative mt-8 space-y-6 before:absolute before:bottom-4 before:left-[11px] before:top-4 before:w-px before:bg-aubergine/15">
            {dated.map((entry) => (
              <TimelineEntry
                key={entry.document.id}
                entry={entry}
                records={records}
                flagged={view.flagged}
                api={api}
                canEdit={canEdit}
                onOpenSource={openSource}
                onChanged={afterChange}
                onOpenAlerts={() => onNavigate('review-verification')}
              />
            ))}
          </ol>
          {dated.length === 0 && undated.length === 0 && (
            <div className="mt-6 rounded-3xl bg-chalk p-6">
              <EmptyNote>No records of this type.</EmptyNote>
            </div>
          )}

          {undated.length > 0 && (
            <section className="mt-10 border-t border-hairline pt-6" aria-labelledby="undated-heading">
              <h2 id="undated-heading" className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-aubergine">
                <CalendarX2 size={16} className="text-ochre" /> Undated / needs review
              </h2>
              <ol className="space-y-6">
                {undated.map((entry) => (
                  <TimelineEntry
                    key={entry.document.id}
                    entry={entry}
                    records={records}
                    flagged={view.flagged}
                    api={api}
                    canEdit={canEdit}
                    onOpenSource={openSource}
                    onChanged={afterChange}
                    onOpenAlerts={() => onNavigate('review-verification')}
                    undated
                  />
                ))}
              </ol>
            </section>
          )}

          {view.familyHistory.length > 0 && filter === 'all' && (
            <details className="mt-10 rounded-3xl bg-chalk p-5 sm:p-6">
              <summary className="flex cursor-pointer items-center gap-2 text-[15px] font-semibold">
                <Users size={16} /> Family history <span className="font-jetbrains text-[11px] text-ink-muted">{view.familyHistory.length}</span>
              </summary>
              <p className="mt-2 text-xs text-ink-muted">About relatives, never the patient’s own conditions.</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {view.familyHistory.map((f) => (
                  <li key={f.id}>
                    {f.subjectRelation ? `${f.subjectRelation}: ` : ''}
                    {f.name}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <LazySourceViewer target={target} onClose={() => setTarget(null)} />
    </DoctorPageShell>
  );
}

function TimelineEntry({ entry, records, flagged, api, canEdit, onOpenSource, onChanged, onOpenAlerts, undated = false }) {
  const [open, setOpen] = useState(false);
  const doc = entry.document;
  const visit = doc.kind === 'clinical_record';
  const alerts = entry.findings.reduce((n, f) => n + (flagged.get(f.id) ? 1 : 0), 0);
  const firstWithQuote = entry.findings.find((f) => f.quote);

  return (
    <li className={undated ? '' : 'relative pl-9'}>
      {!undated && (
        <span
          className={`absolute left-[5px] top-6 h-3.5 w-3.5 rounded-full border-2 ${visit ? 'border-moss bg-sage' : 'border-aubergine bg-bone'}`}
          aria-hidden="true"
        />
      )}
      <article className={`rounded-3xl p-5 sm:p-6 ${visit ? 'bg-sage/45' : 'bg-chalk'}`}>
        <header className="flex flex-col gap-3 border-b border-hairline pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <time className="font-jetbrains text-[13px] font-medium text-aubergine">{entry.date ? formatRecordDate(entry.date) : 'Date not established'}</time>
              <Pill tone={visit ? 'moss' : 'neutral'}>{documentTypeLabel(doc)}</Pill>
              {alerts > 0 && (
                <button type="button" onClick={onOpenAlerts} className="inline-flex items-center gap-1 rounded-full bg-brick-soft px-2 py-0.5 text-[10.5px] font-semibold text-brick hover:bg-brick/15">
                  <TriangleAlert size={11} /> {alerts} alert{alerts === 1 ? '' : 's'}
                </button>
              )}
            </div>
            <h3 className="mt-2 flex items-center gap-2 text-[15px] font-semibold text-aubergine">
              {visit ? <Stethoscope size={16} className="shrink-0 text-moss" /> : <FileText size={16} className="shrink-0 text-ink-muted" />}
              <span className="truncate">{visit ? `Consultation · ${doc.clinicalRecord.doctorName}` : doc.name}</span>
            </h3>
            {visit && doc.clinicalRecord.facility && <p className="mt-0.5 text-xs text-ink-muted">{doc.clinicalRecord.facility}</p>}
            {entry.reviewReason && <p className="mt-2 rounded-lg bg-ochre-soft px-2.5 py-1.5 text-xs text-[#7A5A16]">{entry.reviewReason}</p>}
          </div>
          {firstWithQuote && <SourceChip source={{ ...sourceOf(records, firstWithQuote), name: 'Open document' }} onOpen={onOpenSource} />}
        </header>

        {/* Medical summary: what this record says, grouped, values exactly as written. */}
        <div className="mt-5 grid gap-x-10 gap-y-6 md:grid-cols-2">
          {GROUPS.map(({ category, label }) => {
            const items = entry.findings.filter((f) => f.category === category);
            if (!items.length) return null;
            return (
              <section key={category}>
                <h4 className="mb-1 border-b border-hairline pb-2 font-inter text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  {label} <span className="font-jetbrains font-normal normal-case tracking-normal">· {items.length}</span>
                </h4>
                <ul className="divide-y divide-aubergine/8">
                  {items.map((f) => (
                    <li key={f.id} className="py-2.5 text-sm">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold">
                          {category === 'medication' && f.action && ACTION[f.action] ? `${ACTION[f.action]}: ` : ''}
                          {f.name}
                        </span>
                        {QUALIFIER[f.assertion] && <Pill tone={QUALIFIER[f.assertion].tone}>{QUALIFIER[f.assertion].text}</Pill>}
                        {flagged.get(f.id) && <Pill tone="brick">Flagged</Pill>}
                      </div>
                      {findingDetail(f) && <p className="mt-0.5 font-jetbrains text-[12px] text-ink-muted">{findingDetail(f)}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {/* No "AI-extracted" tag: only labels that add information (doctor-verified, doctor-entered, edited). */}
                        {provenanceKind(f) !== 'ai' && <ProvenanceTag kind={provenanceKind(f)} />}
                        {f.eventDate && f.eventDate !== entry.date && (
                          <span className="font-jetbrains text-[10.5px] text-ink-muted">dated {formatRecordDate(f.eventDate)}</span>
                        )}
                        {f.quote && <SourceChip source={sourceOf(records, f)} onOpen={onOpenSource} />}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        {visit && doc.clinicalRecord.observations && (
          <div className="mt-5 rounded-2xl bg-white/60 p-4">
            <h4 className="mb-1.5 font-inter text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Observations</h4>
            <p className="whitespace-pre-line text-sm leading-6">{doc.clinicalRecord.observations}</p>
          </div>
        )}

        {/* Corrections for document findings, with the same rules as the patient's review. */}
        {!visit && (
          <div className="mt-5 border-t border-hairline pt-4">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-aubergine hover:underline"
            >
              {canEdit ? 'Review & correct' : 'View findings and sources'}
              <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
              <div className="theme-doctor mt-3">
                <FindingsReview document={doc} api={api} viewer="doctor" canEdit={canEdit} onDocumentChange={onChanged} />
              </div>
            )}
          </div>
        )}
      </article>
    </li>
  );
}
