export type EventCategory =
  | 'Diagnosis'
  | 'Consultation'
  | 'Prescription'
  | 'Medication Change'
  | 'Lab Investigation'
  | 'Imaging Report'
  | 'Hospital Admission'
  | 'Discharge';

export type MedicationStatus = 'Started' | 'Dosage changed' | 'Discontinued';

export interface MedicationDetail {
  name: string;
  dosage: string;
  status: MedicationStatus;
  previousDosage?: string;
  reason?: string;
  isCurrentlyActive: boolean;
  prescribingDoctor?: string;
}

export interface ExtractedDetail {
  label: string;
  value: string;
  code?: string;
}

export interface TimelineEvent {
  id: string;
  date: string;
  category: EventCategory;
  title: string;
  description: string;
  facility: string;
  doctor: string;
  sourceDoc: string;
  sourcePage: number;
  confidence: number;
  aiSummary: string;
  extractedDetails: ExtractedDetail[];
  medicationDetails?: MedicationDetail;
}

export interface UploadedDocument {
  id: string;
  name: string;
  type: string;
  fileFormat: string;
  size: string;
  uploadDate: string;
  relevantDate: string;
  status: 'Uploaded' | 'Processing' | 'Completed' | 'Failed';
  facility: string;
  pageCount?: number;
  /** Where the original file is served to this viewer (patient or doctor route) */
  fileUrl?: string;
}

export interface PersonalHealthInfo {
  bloodGroup: string;
  height: string;
  weight: string;
  allergies: string[];
  conditions: string[];
  otherNotes: string;
  lastUpdated: string;
}

export interface SourceReference {
  docName: string;
  page: number;
  date: string;
  excerpt: string;
  /** Opens the Source Viewer on the cited page (records assistant answers) */
  target?: import('./records').SourceTarget | null;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  sources?: SourceReference[];
  /** Records assistant: how the answer relates to the records, or a failed request */
  status?: 'documented' | 'documented_absent' | 'not_documented' | 'refused' | 'error';
  /** For failed requests: the question to send again */
  retryQuestion?: string;
}
