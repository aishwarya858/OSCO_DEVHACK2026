export function apiUrl(path: string): string;

export interface HealthResponse {
  status: string;
  timestamp?: string;
}

export interface PatientProfile {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  /** Public Patient ID (OSCO-XXXXXXXX) a patient gives a doctor */
  publicId: string;
}

export interface PatientAuthResponse {
  data: {
    token: string;
    patient: PatientProfile;
  };
}

export interface PatientProfileResponse {
  data: {
    patient: PatientProfile;
  };
}

export function getBackendHealth(): Promise<HealthResponse>;
export function registerPatient(input: { name: string; email: string; password: string }): Promise<PatientAuthResponse>;
export function loginPatient(input: { email: string; password: string }): Promise<PatientAuthResponse>;
export function getPatientProfile(token: string): Promise<PatientProfileResponse>;

export type ProcessingStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export interface ProcessedDocument {
  id: string;
  name: string;
  mimeType: string;
  byteSize: number;
  status: ProcessingStatus;
  documentType: string | null;
  pageCount: number | null;
  uploadedAt: string;
  processedAt: string | null;
  error: string | null;
  findingsCount: number;
  review: { pending: number; confirmed: number; dismissed: number };
  documentDate: string | null;
  documentDateText: string | null;
  documentDatePrecision: 'day' | 'month' | 'year' | null;
  documentDateAlternatives: string[] | null;
  stats: {
    returned: number;
    accepted: number;
    rejected: number;
    rejectedByReason: Record<string, number>;
    pageCorrections: number;
  } | null;
}

export interface ExtractedFinding {
  id: string;
  category: 'condition' | 'medication' | 'allergy' | 'investigation' | 'event';
  name: string;
  nameNormalised: string;
  subject: 'patient' | 'family' | 'other';
  subjectRelation: string | null;
  assertion: 'present' | 'absent' | 'possible' | 'historical';
  action: string | null;
  dose: string | null;
  frequency: string | null;
  value: string | null;
  unit: string | null;
  refRange: string | null;
  dateText: string | null;
  eventDate: string | null;
  datePrecision: string | null;
  quote: string;
  page: number;
  quoteStart: number;
  quoteEnd: number;
  sourceType: 'ai_extracted' | 'doctor_entered' | 'patient_corrected' | 'doctor_corrected';
  verificationStatus: string;
  reviewStatus: 'pending' | 'confirmed' | 'dismissed';
  supersedesId: string | null;
  previousReviewStatus: 'pending' | 'confirmed' | null;
  /** Who made this version (corrections only) */
  editedBy: { type: 'patient' | 'doctor'; name: string | null; at: string } | null;
  /** Who last removed, restored or confirmed it */
  reviewedBy: { type: 'patient' | 'doctor'; name: string | null; at: string | null } | null;
}

export interface UploadResult {
  fileName: string;
  error?: string;
  duplicate?: boolean;
  queued?: boolean;
  queueError?: string | null;
  document?: ProcessedDocument;
}

export function uploadDocuments(token: string, files: File[]): Promise<{ data: { results: UploadResult[] } }>;
export function listDocuments(token: string): Promise<{ data: { documents: ProcessedDocument[] } }>;
export function getDocumentFindings(token: string, documentId: string): Promise<{ data: { document: ProcessedDocument; findings: ExtractedFinding[] } }>;
export function retryDocument(token: string, documentId: string): Promise<{ data: { document: ProcessedDocument } }>;

export interface FindingEdit {
  name?: string;
  dose?: string | null;
  frequency?: string | null;
  value?: string | null;
  unit?: string | null;
  refRange?: string | null;
  assertion?: 'present' | 'absent' | 'possible' | 'historical';
  /** YYYY-MM-DD, or null to clear */
  date?: string | null;
}

export interface ReviewResponse {
  data: { document: ProcessedDocument; findings: ExtractedFinding[]; finding?: ExtractedFinding };
}

export function getMyRecords(token: string): Promise<{
  data: import('../types/records').PatientRecords & { pendingReview: { documents: number; findings: number } };
}>;
export function dismissFinding(token: string, documentId: string, findingId: string): Promise<ReviewResponse>;
export function restoreFinding(token: string, documentId: string, findingId: string): Promise<ReviewResponse>;
export function confirmDocumentFindings(token: string, documentId: string): Promise<ReviewResponse>;

export interface PatientAccessRequest {
  id: string;
  status: 'pending' | 'active' | 'denied' | 'expired' | 'ended';
  purpose: string;
  requestedAccess: 'read' | 'edit';
  approvedAccess: 'read' | 'edit' | null;
  requestedAt: string;
  decidedAt: string | null;
  doctor: { name: string; verified: boolean };
  session: { id: string; accessLevel: 'read' | 'edit'; expiresAt: string; endedAt: string | null; active: boolean } | null;
}

export function listAccessRequests(token: string): Promise<{ data: { requests: PatientAccessRequest[] } }>;
export function approveAccessRequest(token: string, requestId: string, access?: 'read' | 'edit'): Promise<unknown>;
export function denyAccessRequest(token: string, requestId: string): Promise<unknown>;
export function endAccessSession(token: string, sessionId: string): Promise<unknown>;

export type AssistantStatus = 'documented' | 'documented_absent' | 'not_documented' | 'refused';

export interface AssistantCitation {
  id: string;
  kind: 'finding' | 'page' | 'note';
  documentId: string;
  documentName: string;
  documentType: string | null;
  documentDate: string | null;
  page: number | null;
  /** Text copied from the source document (checked on the server) */
  quote: string;
  quoteMatchedModel: boolean;
  findingId: string | null;
  /** Opens the Source Viewer on the cited page; null for doctor-entered notes */
  source: import('../types/records').SourceTarget | null;
}

export interface AssistantAnswer {
  status: AssistantStatus;
  answer: string;
  citations: AssistantCitation[];
  evidenceAvailable: boolean;
  checked: { documents: number; findings: number } | null;
  reason?: string;
}

export function askHealthAssistant(token: string, question: string, signal?: AbortSignal): Promise<{ data: AssistantAnswer }>;
