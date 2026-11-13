import React, { useMemo, useState } from 'react';
import { Activity, AlertTriangle, CalendarX, FileText, Pill, Users } from 'lucide-react';
import type { DocumentType, Finding, FindingCategory, MedicationHistory, PatientRecords } from '../../types/records';
import { buildTimeline, type TimelineEntry } from '../../records/timeline';
import {
  ASSERTION_LABELS,
  CATEGORY_LABELS,
  DOCUMENT_TYPE_LABELS,
  findingDetail,
  formatRecordDate,
  medicationActionLabel,
  provenanceLabel,
} from '../../records/format';

export interface MedicalHistoryTimelineProps {
  records: PatientRecords;
  /** Open the Source Viewer at this finding's highlighted quote */
  onOpenSource: (findingId: string) => void;
  /** Heading context, e.g. "Your health record" or the patient's name */
  eyebrow?: string;
  /** Shown above the timeline when the records are the synthetic demo set */
  notice?: string;
  /** Findings extracted but not yet confirmed by the patient (not shown in the history) */
  pendingReview?: { documents: number; findings: number };
  /** Open the review screen (Upload Documents) */
  onOpenReview?: () => void;
  /** Records are still loading */
  loading?: boolean;
}

const CATEGORIES: (FindingCategory | 'all')[] = ['all', 'medication', 'condition', 'allergy', 'investigation', 'event'];

const QUALIFIER_STYLES: Record<string, string> = {
  'Possible - unconfirmed': 'bg-citron-subtle text-forest',
  'Past history': 'bg-osco-bg text-text-secondary',
  'Documented as absent': 'bg-eucalyptus-subtle text-eucalyptus-dark',
};

const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors ${
      active ? 'bg-forest text-white' : 'bg-white text-text-secondary hover:bg-eucalyptus-subtle'
    }`}
  >
    {children}
  </button>
);

const FindingRow: React.FC<{ finding: Finding; entryDate: string | null; onOpenSource: (id: string) => void }> = ({
  finding,
  entryDate,
  onOpenSource,
}) => {
  const qualifier = ASSERTION_LABELS[finding.assertion];
  const action = finding.category === 'medication' ? medicationActionLabel(finding.action) : null;
  const detail = findingDetail(finding);
  const ownDate = finding.eventDate && finding.eventDate !== entryDate ? formatRecordDate(finding.eventDate) : null;
  // Only labels that say something beyond the default are shown (no "AI-extracted" tag).
  const provenance = provenanceLabel(finding);
  const source = provenance === 'AI-extracted' ? null : provenance;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpenSource(finding.id)}
        className="group flex w-full flex-col gap-1.5 rounded-lg px-3 py-3 text-left hover:bg-eucalyptus-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest sm:flex-row sm:items-start sm:gap-4"
      >
        <span className="shrink-0 pt-0.5 font-mono text-[10px] uppercase tracking-wide text-text-muted sm:w-24">{CATEGORY_LABELS[finding.category]}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-text-main group-hover:text-forest">
              {action ? `${action}: ` : ''}
              {finding.name}
            </span>
            {qualifier && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${QUALIFIER_STYLES[qualifier]}`}>{qualifier}</span>
            )}
          </span>
          {(detail || ownDate) && (
            <span className="mt-1 block text-xs leading-5 text-text-secondary">
              {detail}
              {detail && ownDate ? ' · ' : ''}
              {ownDate ? `dated ${ownDate}` : ''}
            </span>
          )}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 pt-0.5 font-mono text-[10px] text-forest">
          {finding.page != null && (
            <>
              <FileText size={11} /> p.{finding.page}
            </>
          )}
          {source && <span className="rounded bg-eucalyptus-subtle px-1.5 py-0.5 font-body font-medium">{source}</span>}
        </span>
      </button>
    </li>
  );
};

const EntryCard: React.FC<{ entry: TimelineEntry; onOpenSource: (id: string) => void }> = ({ entry, onOpenSource }) => (
  <article className="rounded-xl border border-border-subtle bg-white px-5 py-4 shadow-xs">
    <header className="mb-1 flex flex-wrap items-start justify-between gap-2 border-b border-border-subtle pb-3">
      <div className="min-w-0">
        <h3 className="font-heading text-[15px] font-semibold text-text-main">{entry.document.name}</h3>
        <p className="mt-0.5 text-xs text-text-secondary">
          {entry.date ? `Documented on ${formatRecordDate(entry.date)}` : 'Date not established'} ·{' '}
          {DOCUMENT_TYPE_LABELS[entry.document.documentType]}
        </p>
      </div>
      <span className="rounded-full bg-osco-bg px-2 py-0.5 font-mono text-[10px] text-text-muted">{entry.findings.length} verified finding{entry.findings.length === 1 ? '' : 's'}</span>
    </header>
    {entry.reviewReason && (
      <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-warning-subtle px-3 py-2 text-xs text-warning">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {entry.reviewReason} It is not placed on the timeline until this is resolved.
      </p>
    )}
    <ul className="-mx-3 divide-y divide-border-subtle">
      {entry.findings.map((finding) => (
        <FindingRow key={finding.id} finding={finding} entryDate={entry.date} onOpenSource={onOpenSource} />
      ))}
    </ul>
  </article>
);

const MedicationCard: React.FC<{ history: MedicationHistory; records: PatientRecords; onOpenSource: (id: string) => void }> = ({
  history,
  records,
  onOpenSource,
}) => {
  const written = [
    ...new Set(
      records.findings
        .filter((f) => f.category === 'medication' && f.nameNormalised === history.drug && f.name.toLowerCase() !== history.drug)
        .map((f) => f.name),
    ),
  ];
  const steps = history.episodes.flatMap((episode) => [
    ...episode.segments.map((segment, index) => ({
      key: `${segment.from.claimId}-${index}`,
      date: segment.from.date,
      text: `${index === 0 ? (episode.start ? 'Started' : 'First documented') : 'Dose changed to'} ${[segment.dose ?? 'dose not documented', segment.frequency].filter(Boolean).join(' ')}`,
      claimId: segment.from.claimId,
    })),
    ...(episode.end ? [{ key: `${episode.end.claimId}-end`, date: episode.end.date, text: 'Stopped', claimId: episode.end.claimId }] : []),
  ]);
  const { status } = history;

  return (
    <article className="rounded-xl border border-border-subtle bg-white px-5 py-4 shadow-xs">
      <h3 className="font-heading text-[15px] font-semibold text-text-main">
        {history.drug.charAt(0).toUpperCase() + history.drug.slice(1)}
        {written.length > 0 && <span className="font-body font-normal text-text-secondary"> (written as {written.join(', ')})</span>}
      </h3>
      <ol className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.key} className="flex items-baseline justify-between gap-3 text-xs">
            <span>
              <time className="mr-2 font-mono text-text-muted">{formatRecordDate(step.date)}</time>
              <span className="text-text-main">{step.text}</span>
            </span>
            {step.claimId && (
              <button type="button" onClick={() => onOpenSource(step.claimId!)} className="shrink-0 font-mono text-[10px] text-forest hover:underline">
                source
              </button>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-4 border-t border-border-subtle pt-3 text-xs text-text-main">
        <span className="font-medium">Status: </span>
        {status.state === 'stopped'
          ? `Stopped on ${formatRecordDate(status.date)}`
          : status.state === 'last_documented_active'
            ? `Last documented active on ${formatRecordDate(status.date)}; no later record found.`
            : 'Mentioned without a date.'}
        {status.possiblyOutdated && (
          <span className="ml-2 rounded bg-warning-subtle px-1.5 py-0.5 text-[10px] font-medium text-warning">May be outdated</span>
        )}
      </p>
      {status.state === 'last_documented_active' && (
        <p className="mt-1 text-[11px] text-text-secondary">The records cannot show whether it is still being taken.</p>
      )}
    </article>
  );
};

/**
 * Medical history timeline (MVP document section 6.1.5): latest first, by the
 * date written in each document. Undated or ambiguously dated documents are
 * grouped for review instead of being guessed into place. Every finding opens
 * its source with the verified quote highlighted.
 */
export const MedicalHistoryTimeline: React.FC<MedicalHistoryTimelineProps> = ({
  records,
  onOpenSource,
  eyebrow = 'Your health record',
  notice,
  pendingReview,
  onOpenReview,
  loading = false,
}) => {
  const [documentType, setDocumentType] = useState<DocumentType | 'all'>('all');
  const [category, setCategory] = useState<FindingCategory | 'all'>('all');

  const timeline = useMemo(() => buildTimeline(records, { documentType, category }), [records, documentType, category]);
  const documentTypes = useMemo(
    () => [...new Set(records.documents.filter((d) => d.status === 'ready').map((d) => d.documentType))],
    [records.documents],
  );
  const showMedicines = (category === 'all' || category === 'medication') && documentType === 'all' && records.medicationHistories.length > 0;
  const hasDocuments = records.findings.length > 0;
  const nothingMatches = timeline.dated.length === 0 && timeline.undated.length === 0;
  const stats = records.extractionStats;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="border-b border-border-subtle pb-6">
        <p className="mb-2 text-sm text-text-secondary">{eyebrow}</p>
        <h1 className="font-heading text-3xl font-semibold text-forest">Medical history</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Latest first, by the date written in each document (not the upload date). Select any finding to see it highlighted in the
          original.
        </p>
        {stats.returned > 0 && (
          <p className="mt-3 inline-flex rounded-lg bg-white px-3 py-1.5 font-mono text-[11px] text-text-secondary">
            {stats.returned} findings extracted · {stats.accepted} verified · {stats.rejected} rejected because the quote or its details were
            not in the document
          </p>
        )}
        {notice && <p className="mt-3 rounded-lg bg-citron-subtle px-3 py-2 text-xs text-forest">{notice}</p>}
        {pendingReview && pendingReview.findings > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-citron-subtle px-3 py-2.5">
            <p className="text-sm text-forest">
              <span className="font-semibold">
                {pendingReview.findings} finding{pendingReview.findings === 1 ? '' : 's'}
              </span>{' '}
              from {pendingReview.documents} document{pendingReview.documents === 1 ? '' : 's'} {pendingReview.findings === 1 ? 'is' : 'are'} waiting for your
              review. They are added here once you confirm them.
            </p>
            {onOpenReview && (
              <button type="button" onClick={onOpenReview} className="rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-white hover:bg-forest-dark">
                Review now
              </button>
            )}
          </div>
        )}
      </header>

      {loading ? (
        <p className="border-y border-border-subtle py-10 text-center text-sm text-text-secondary">Loading your medical history…</p>
      ) : !hasDocuments ? (
        <div className="border-y border-border-subtle py-10 text-center">
          <Activity size={20} className="mx-auto text-eucalyptus-dark" />
          <p className="mt-3 text-sm font-medium text-text-main">Nothing in your medical history yet.</p>
          <p className="mt-1 text-xs text-text-secondary">Upload documents, check the findings read from them, and confirm them to add them here.</p>
        </div>
      ) : (
        <>
          <section aria-label="Timeline filters" className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Document type">
              <Chip active={documentType === 'all'} onClick={() => setDocumentType('all')}>All documents</Chip>
              {documentTypes.map((type) => (
                <Chip key={type} active={documentType === type} onClick={() => setDocumentType(type)}>
                  {DOCUMENT_TYPE_LABELS[type]}
                </Chip>
              ))}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Category">
              {CATEGORIES.map((value) => (
                <Chip key={value} active={category === value} onClick={() => setCategory(value)}>
                  {value === 'all' ? 'All categories' : CATEGORY_LABELS[value]}
                </Chip>
              ))}
            </div>
          </section>

          {showMedicines && (
            <section aria-labelledby="medicines-heading" className="space-y-4">
              <h2 id="medicines-heading" className="flex items-center gap-2 font-heading text-base font-semibold text-forest">
                <Pill size={16} /> Medicines
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {records.medicationHistories.map((history) => (
                  <MedicationCard key={history.drug} history={history} records={records} onOpenSource={onOpenSource} />
                ))}
              </div>
            </section>
          )}

          {nothingMatches ? (
            <div className="border-y border-border-subtle py-8 text-center">
              <p className="text-sm font-medium text-text-main">No entries match these filters.</p>
              <p className="mt-1 text-xs text-text-secondary">Try another document type or category.</p>
            </div>
          ) : (
            <section aria-labelledby="timeline-heading" className="space-y-4">
              <h2 id="timeline-heading" className="font-heading text-base font-semibold text-forest">
                Timeline
              </h2>
              <ol className="ml-3 border-l border-border-medium">
                {timeline.dated.map((entry) => (
                  <li key={entry.document.id} className="relative pb-8 pl-7 last:pb-0">
                    <span className="absolute -left-[6px] top-1 h-3 w-3 rounded-full border-2 border-white bg-forest ring-1 ring-forest" aria-hidden="true" />
                    <time className="mb-2.5 block text-sm font-semibold text-forest">{formatRecordDate(entry.date)}</time>
                    <EntryCard entry={entry} onOpenSource={onOpenSource} />
                  </li>
                ))}
              </ol>

              {timeline.undated.length > 0 && (
                <div className="space-y-4 border-t border-border-subtle pt-6">
                  <h3 className="flex items-center gap-2 font-heading text-sm font-semibold text-warning">
                    <CalendarX size={15} /> Undated / needs review
                  </h3>
                  {timeline.undated.map((entry) => (
                    <EntryCard key={entry.document.id} entry={entry} onOpenSource={onOpenSource} />
                  ))}
                </div>
              )}
            </section>
          )}

          {timeline.familyHistory.length > 0 && category === 'all' && documentType === 'all' && (
            <details className="rounded-xl border border-border-subtle bg-white px-5 py-4">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-text-main">
                <Users size={15} /> Family history ({timeline.familyHistory.length})
              </summary>
              <p className="mt-2 text-xs text-text-secondary">Kept separate. These are about relatives, never the patient's own conditions.</p>
              <ul className="-mx-2 mt-2">
                {timeline.familyHistory.map((finding) => (
                  <li key={finding.id}>
                    <button type="button" onClick={() => onOpenSource(finding.id)} className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-eucalyptus-subtle">
                      {finding.subjectRelation ? `${finding.subjectRelation}: ` : ''}
                      {finding.name}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
};
