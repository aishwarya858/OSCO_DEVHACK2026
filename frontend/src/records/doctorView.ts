import type { Finding, PatientRecords, RecordFlag, SourceDocument } from '../types/records';
import { DOCUMENT_TYPE_LABELS, findingDate, findingDetail, formatRecordDate, isShownFinding } from './format';

/**
 * Shared view helpers for the doctor's four record tabs (Report, Medical
 * History, Alert and Reviews, Add Changes), so every tab labels provenance,
 * sources and dates the same way. Recorded facts only: no interpretation.
 */

export type ProvenanceKind = 'ai' | 'doctor' | 'doctor-entered' | 'patient-edited' | 'computed';

/** Which provenance pill a finding carries. */
export const provenanceKind = (f: Finding): ProvenanceKind => {
  if (f.sourceType === 'doctor_entered') return 'doctor-entered';
  if (f.sourceType === 'patient_corrected') return 'patient-edited';
  if (f.sourceType === 'doctor_corrected' || f.verificationStatus === 'doctor_verified') return 'doctor';
  return 'ai';
};

/** What a SourceChip shows and opens: document name + date, and the finding to highlight. */
export interface ChipSource {
  id: string;
  name: string;
  date: string;
  findingId: string | null;
}

export const documentOf = (records: PatientRecords, f: Finding): SourceDocument | undefined =>
  records.documents.find((d) => d.id === f.documentId);

export const documentDateLabel = (doc: SourceDocument | undefined) =>
  doc?.documentDate ? formatRecordDate(doc.documentDate) : 'date unclear';

export const sourceOf = (records: PatientRecords, f: Finding): ChipSource => {
  const doc = documentOf(records, f);
  return {
    id: `${doc?.id ?? 'unknown'}:${f.id}`,
    name: doc?.kind === 'clinical_record' ? doc.name : doc?.name ?? 'Unknown document',
    date: documentDateLabel(doc),
    findingId: doc?.kind === 'clinical_record' ? null : f.id,
  };
};

export const documentTypeLabel = (doc: SourceDocument) =>
  doc.kind === 'clinical_record' ? 'Doctor visit' : DOCUMENT_TYPE_LABELS[doc.documentType] ?? 'Document';

/** "Metformin · 500 mg twice daily" style one-liner, values exactly as written. */
export const findingLine = (f: Finding) => {
  const detail = findingDetail(f);
  return detail ? `${f.name} · ${detail}` : f.name;
};

/** All findings by id, including corrected versions a flag still refers to. */
export const findingIndex = (records: PatientRecords) =>
  new Map([...(records.referencedFindings ?? []), ...records.findings].map((f) => [f.id, f]));

export const openFlags = (records: PatientRecords, types?: RecordFlag['type'][]) =>
  records.flags.filter((flag) => flag.status === 'open' && (!types || types.includes(flag.type)));

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (iso: string) => `${MONTH[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const isoOfIndex = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

/**
 * The patient's records in the data shape of the Emergency Brief report
 * (src/data/emergencyBrief.mock.js), so real patients get the same bento report.
 */
export const toBriefData = (records: PatientRecords) => {
  const findings = records.findings.filter(isShownFinding);
  const byId = findingIndex(records);
  const builtMonth = records.builtAt.slice(0, 7);
  const docs = records.documents.filter((d) => d.status === 'ready');
  const sourceForClaim = (claimId: string | null | undefined) => {
    const f = claimId ? byId.get(claimId) : undefined;
    return f ? sourceOf(records, f) : null;
  };

  // Medication History: one ribbon per drug from reconciliation, the latest episode.
  const medications = records.medicationHistories
    .filter((h) => h.episodes.length)
    .map((history) => {
      const episode = history.episodes[history.episodes.length - 1];
      const source = sourceForClaim(history.status.source?.claimId);
      const claim = history.status.source?.claimId ? byId.get(history.status.source.claimId) : undefined;
      const segments = episode.segments.map((s, i) => ({
        dose: s.dose ?? 'dose not documented',
        fromIso: i === 0 && !episode.start ? null : s.from.date.slice(0, 7),
        fromLabel: i === 0 && !episode.start ? 'start not documented' : formatRecordDate(s.from.date),
        source: sourceForClaim(s.from.claimId) ?? source,
      }));
      const stopped = history.status.state === 'stopped' && episode.end;
      const dateLabel = formatRecordDate(history.status.date ?? null);
      return {
        id: history.drug,
        name: history.drug.charAt(0).toUpperCase() + history.drug.slice(1),
        provenance: claim ? provenanceKind(claim) : 'ai',
        segments,
        ...(stopped
          ? { stopped: { iso: episode.end!.date, label: dateLabel, source } }
          : { lastRecord: { iso: (history.status.date ?? records.builtAt).slice(0, 7), label: dateLabel, source } }),
        statusText: stopped
          ? `Stopped on ${dateLabel}`
          : `Active as of last record, ${dateLabel}${history.status.possiblyOutdated ? ' · may be outdated' : ''}`,
      };
    });

  const medDates = medications.flatMap((m) => [...m.segments.map((s) => s.fromIso), 'stopped' in m ? m.stopped?.iso : m.lastRecord?.iso]).filter(Boolean) as string[];
  const firstYear = Math.min(Number(records.builtAt.slice(0, 4)) - 1, ...medDates.map((d) => Number(d.slice(0, 4))));
  const lastYear = Number(records.builtAt.slice(0, 4));
  const axis = { from: `${firstYear}-01`, to: builtMonth, years: Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i) };

  // Allergies.
  const conflictIds = new Set(openFlags(records, ['contradiction']).flatMap((f) => f.findingIds));
  const allergyFindings = findings.filter((f) => f.category === 'allergy');
  const allergies = {
    documented: allergyFindings
      .filter((f) => f.assertion === 'present' || f.assertion === 'possible')
      .map((f) => ({ id: f.id, substance: f.name, reaction: f.quote ?? findingDetail(f) ?? '', asWritten: f.quote, provenance: provenanceKind(f), source: sourceOf(records, f), conflict: conflictIds.has(f.id) })),
    documentedAbsent: allergyFindings
      .filter((f) => f.assertion === 'absent')
      .map((f) => ({ id: f.id, statement: f.quote ?? f.name, provenance: provenanceKind(f), source: sourceOf(records, f), conflict: conflictIds.has(f.id) })),
    patientProvided: [] as unknown[],
  };

  // Recent Investigations: latest result per test.
  const duplicateIds = new Set(openFlags(records, ['duplicate']).flatMap((f) => f.findingIds));
  const latestByTest = new Map<string, Finding>();
  for (const f of findings.filter((x) => x.category === 'investigation' && x.assertion !== 'absent')) {
    const date = findingDate(f, documentOf(records, f)).date ?? '';
    const prev = latestByTest.get(f.nameNormalised);
    if (!prev || date > (findingDate(prev, documentOf(records, prev)).date ?? '')) latestByTest.set(f.nameNormalised, f);
  }
  const investigations = [...latestByTest.values()]
    .map((f) => {
      const date = findingDate(f, documentOf(records, f)).date;
      const tags = [] as { text: string; tone: 'ochre' | 'brick' }[];
      if (date && monthIndex(builtMonth) - monthIndex(date) >= 12) tags.push({ text: 'Older than 12 months', tone: 'ochre' });
      if (!date) tags.push({ text: 'Date unclear', tone: 'ochre' });
      if (duplicateIds.has(f.id)) tags.push({ text: 'Possible duplicate', tone: 'ochre' });
      return { id: f.id, test: f.name, value: f.value ?? '—', unit: f.unit ?? '', range: f.refRange, date: date ? formatRecordDate(date) : 'Date unclear', sortDate: date ?? '', provenance: provenanceKind(f), source: sourceOf(records, f), tags };
    })
    .sort((a, b) => b.sortDate.localeCompare(a.sortDate));

  // Missing Information: coverage dot matrix, the longest empty stretch, gap flags and empty categories.
  const docMonths = new Map<string, boolean>();
  for (const d of docs) {
    if (!d.documentDate) continue;
    const month = d.documentDate.slice(0, 7);
    const verified = findings.some((f) => f.documentId === d.id && (provenanceKind(f) === 'doctor' || provenanceKind(f) === 'doctor-entered'));
    docMonths.set(month, (docMonths.get(month) ?? false) || verified);
  }
  const months = [...docMonths.keys()].sort();
  const yearsTo = lastYear;
  const yearsFrom = Math.max(yearsTo - 5, months.length ? Number(months[0].slice(0, 4)) : yearsTo - 5);
  const years = Array.from({ length: yearsTo - yearsFrom + 1 }, (_, i) => yearsFrom + i);
  let gapRanges: { fromIso: string; toIso: string }[] = [];
  const gapLines: { id: string; text: string; provenance: 'computed' }[] = [];
  if (months.length) {
    // Longest run of months with no document, from the first record to now, within one year row.
    let best = { start: 0, length: 0 };
    let runStart: number | null = null;
    for (let i = monthIndex(months[0]); i <= monthIndex(builtMonth) + 1; i += 1) {
      const empty = i <= monthIndex(builtMonth) && !docMonths.has(isoOfIndex(i));
      if (empty && runStart === null) runStart = i;
      if (!empty && runStart !== null) {
        if (i - runStart > best.length) best = { start: runStart, length: i - runStart };
        runStart = null;
      }
    }
    if (best.length >= 6) {
      const end = best.start + best.length - 1;
      gapLines.push({ id: 'gap-longest', text: `No records ${monthLabel(isoOfIndex(best.start))} to ${monthLabel(isoOfIndex(end))}`, provenance: 'computed' });
      // The ring is drawn within one year row: use the row holding most of the gap.
      const rowYear = Number(isoOfIndex(best.start + Math.floor(best.length / 2)).slice(0, 4));
      const from = Math.max(best.start, rowYear * 12);
      const to = Math.min(end, rowYear * 12 + 11);
      if (years.includes(rowYear)) gapRanges = [{ fromIso: isoOfIndex(from), toIso: isoOfIndex(to) }];
    }
  }
  for (const flag of openFlags(records, ['missing_field', 'ambiguous_date', 'orphan_reference', 'stale_medication'])) {
    gapLines.push({ id: flag.id, text: flag.message.replace(/\s*Information missing\.?$/, ''), provenance: 'computed' });
  }
  const has = (category: Finding['category']) => findings.some((f) => f.category === category);
  if (docs.length && !has('allergy')) gapLines.push({ id: 'none-allergy', text: 'No allergy information documented', provenance: 'computed' });
  if (docs.length && !has('investigation')) gapLines.push({ id: 'none-tests', text: 'No laboratory results documented', provenance: 'computed' });

  // Unresolved Contradictions: both versions side by side.
  const conflicts = openFlags(records, ['contradiction', 'duplicate', 'active_after_stop']).map((flag) => ({
    id: flag.id,
    kind: flag.type === 'duplicate' ? 'duplicate' : 'contradiction',
    title: flag.message,
    sides: flag.findingIds
      .map((id) => byId.get(id))
      .filter((f): f is Finding => Boolean(f))
      .map((f) => {
        const doc = documentOf(records, f);
        return { label: `${doc?.name ?? 'Unknown document'}, ${documentDateLabel(doc)}`, statement: f.quote ?? findingLine(f), provenance: provenanceKind(f), source: sourceOf(records, f) };
      }),
  }));

  return {
    patient: { publicId: records.patientId, name: records.patientName, age: null, sex: null },
    updated: formatRecordDate(records.builtAt),
    documentCount: docs.length,
    bloodGroup: null,
    axis,
    medications,
    allergies,
    investigations,
    missing: { years, documentMonths: [...docMonths.entries()].map(([iso, verified]) => ({ iso, verified })), coveredUntil: builtMonth, gapRanges, lines: gapLines },
    conflicts,
  };
};
