/**
 * Document-derived records, shaped like the backend `claims` table (MVP
 * document section 7.3) and the worker's reconciliation output (section 8.6).
 */

export type FindingCategory = 'condition' | 'medication' | 'allergy' | 'investigation' | 'event';
export type Assertion = 'present' | 'absent' | 'possible' | 'historical';
export type Subject = 'patient' | 'family' | 'other';
export type MedicationAction = 'start' | 'continue' | 'change' | 'stop' | 'none';
export type DocumentType =
  | 'prescription'
  | 'lab_report'
  | 'discharge_summary'
  | 'imaging_report'
  | 'clinical_note'
  | 'other';

export interface Finding {
  id: string;
  documentId: string;
  category: FindingCategory;
  name: string;
  nameNormalised: string;
  subject: Subject;
  subjectRelation: string | null;
  assertion: Assertion;
  action: MedicationAction | null;
  dose: string | null;
  frequency: string | null;
  value: string | null;
  unit: string | null;
  refRange: string | null;
  dateText: string | null;
  /** ISO date, or YYYY-MM / YYYY for month or year precision */
  eventDate: string | null;
  datePrecision: 'day' | 'month' | 'year' | null;
  dateAlternatives: string[] | null;
  /** Verified quote, exactly as it appears in the page text (null for doctor-entered findings) */
  quote: string;
  page: number;
  /** Offsets into the stored page text, from the Quote Verifier */
  quoteStart: number;
  quoteEnd: number;
  matchType: 'exact' | 'approximate';
  /** patient_corrected: a patient's edit, which supersedes the finding it corrects */
  sourceType: 'ai_extracted' | 'doctor_entered' | 'patient_corrected' | 'doctor_corrected';
  /** Set for doctor-entered findings: the clinical record they belong to (also their documentId) */
  clinicalRecordId?: string | null;
  editedBy?: { type: 'patient' | 'doctor'; name: string | null; at: string } | null;
  reviewedBy?: { type: 'patient' | 'doctor'; name: string | null; at: string | null } | null;
  verificationStatus: 'unverified' | 'doctor_verified' | 'corrected' | 'rejected';
  /** Set when a correction replaced this finding */
  supersededBy?: string | null;
  /** The finding this one corrects (patient edits) */
  supersedesId?: string | null;
  reviewStatus?: 'pending' | 'confirmed' | 'dismissed';
}

export interface SourcePage {
  pageNumber: number;
  text: string;
}

export interface SourceDocument {
  id: string;
  /** 'clinical_record': a record a doctor entered (no file; the record itself is the source) */
  kind?: 'document' | 'clinical_record';
  clinicalRecord?: { doctorName: string; facility: string | null; observations: string | null; createdAt: string };
  name: string;
  /** Absolute URL, or an /api/... path served to the logged-in patient only */
  fileUrl: string | null;
  documentType: DocumentType;
  /** ISO date when the document's own date is unambiguous */
  documentDate: string | null;
  documentDateText: string | null;
  dateAlternatives: string[] | null;
  status: 'uploaded' | 'processing' | 'ready' | 'failed';
  pageCount: number;
  /** Stored page text, used by the Source Viewer's text fallback */
  pages: SourcePage[];
}

export interface MedicationEvidence {
  claimId: string | null;
  date: string;
  datePrecision: string | null;
  dateSource: 'event' | 'document' | null;
  action: MedicationAction;
  dose: string | null;
  frequency: string | null;
}

export interface MedicationSegment {
  dose: string | null;
  frequency: string | null;
  from: MedicationEvidence;
  to: MedicationEvidence | null;
}

export interface MedicationEpisode {
  start: MedicationEvidence | null;
  firstEvidence: MedicationEvidence;
  end: MedicationEvidence | null;
  segments: MedicationSegment[];
  evidence: MedicationEvidence[];
}

export interface MedicationHistory {
  drug: string;
  episodes: MedicationEpisode[];
  status: {
    state: 'stopped' | 'last_documented_active' | 'undated_only';
    label: string;
    date?: string;
    source?: MedicationEvidence;
    ageMonths?: number;
    possiblyOutdated?: boolean;
  };
  flags: { type: string; message: string; claimIds: (string | null)[] }[];
}

export type FlagType =
  | 'contradiction'
  | 'duplicate'
  | 'missing_field'
  | 'ambiguous_date'
  | 'orphan_reference'
  | 'stale_medication'
  | 'active_after_stop'
  | 'inconsistent_detail'
  | 'needs_verification'
  | 'unverified_finding';

/** A page-level source for a flag read from page text (patient details, duplicated documents). */
export interface FlagEvidence {
  documentId: string;
  page: number;
  quoteStart: number;
  quoteEnd: number;
  quote: string;
  label?: string;
}

export interface RecordFlag {
  id: string;
  type: FlagType;
  message: string;
  /** Why it needs attention */
  reason?: string | null;
  evidence?: FlagEvidence[];
  findingIds: string[];
  documentIds: string[];
  status: 'open' | 'resolved';
  createdAt?: string;
  /** Set when a doctor marked the flag resolved */
  resolution?: { note: string; by: string | null; at: string } | null;
}

export interface ExtractionStats {
  returned: number;
  accepted: number;
  rejected: number;
  rejectedByReason: Record<string, number>;
  pageCorrections: number;
}

export interface PatientRecords {
  patientId: string;
  patientName: string;
  builtAt: string;
  extractionStats: ExtractionStats;
  documents: SourceDocument[];
  findings: Finding[];
  medicationHistories: MedicationHistory[];
  flags: RecordFlag[];
  /** Findings a flag refers to that have since been corrected (shown as the version the flag was about) */
  referencedFindings?: Finding[];
}

/** What the Source Viewer opens: one finding's evidence in one document. */
export interface SourceTarget {
  document: SourceDocument;
  page: number;
  quoteStart: number;
  quoteEnd: number;
  quote: string;
}
