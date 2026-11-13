import type { DoctorProfile } from '../auth/doctorSession';
import type { PatientRecords } from '../types/records';
import type { ReviewApi } from '../components/patient/reviewApi';

export interface DoctorAccessRequest {
  id: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'ended';
  purpose: string;
  requestedAccess: 'read' | 'edit';
  approvedAccess: 'read' | 'edit' | null;
  requestedAt: string;
  decidedAt: string | null;
  patient: { publicId: string; name: string };
  session: { accessLevel: 'read' | 'edit'; startedAt: string; expiresAt: string; active: boolean } | null;
}

export function loginDoctor(input: { email: string; password: string }): Promise<{ data: { token: string; doctor: DoctorProfile } }>;
export function lookupPatient(patientId: string): Promise<{ data: { patient: { publicId: string; name: string } } }>;
export function createAccessRequest(input: { patientId: string; purpose: string; access: 'read' | 'edit' }): Promise<{ data: { request: DoctorAccessRequest } }>;
export function getAccessRequestStatus(requestId: string): Promise<{ data: { request: DoctorAccessRequest } }>;
export function getPatientRecords(publicId: string): Promise<{
  data: PatientRecords & { access: { level: 'read' | 'edit'; expiresAt: string } };
}>;
export function doctorReviewApi(publicId: string): ReviewApi;
export function doctorAuthHeader(): Record<string, string>;

export interface ClinicalRecordInput {
  consultationDate: string;
  facility?: string;
  diagnoses?: { name: string; status: 'present' | 'absent' | 'possible' | 'historical' }[];
  prescriptions?: { name: string; dose?: string; frequency?: string; action: 'start' | 'continue' | 'change' | 'stop' }[];
  investigations?: { name: string; value?: string; unit?: string; refRange?: string }[];
  observations?: string;
}

export function verifyFinding(publicId: string, findingId: string): Promise<unknown>;
export function resolveFlag(publicId: string, flagId: string, note: string): Promise<unknown>;
export function addClinicalRecord(publicId: string, record: ClinicalRecordInput): Promise<{ data: { record: { id: string; findings: unknown[] } } }>;
export function listAccessRequests(): Promise<{ data: { requests: DoctorAccessRequest[] } }>;
export const DOCTOR_SIGNED_OUT_EVENT: string;
export function getDoctorMe(): Promise<{ data: { doctor: { id: string; name: string; verificationStatus: string } } }>;

export function askDoctorAssistant(
  publicId: string,
  question: string,
  signal?: AbortSignal,
): Promise<{ data: import('./queries.js').AssistantAnswer }>;

export function registerDoctor(input: { name: string; email: string; password: string; licenseNumber: string }): Promise<{ data: { token: string; doctor: DoctorProfile } }>;
