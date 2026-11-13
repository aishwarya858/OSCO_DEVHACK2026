import { getAuthToken } from '../../auth/patientStorage';
import {
  confirmDocumentFindings,
  dismissFinding,
  getDocumentFindings,
  restoreFinding,
  type FindingEdit,
  type ReviewResponse,
} from '../../api/queries.js';

/**
 * The operations a review screen needs. The patient and doctor dashboards pass
 * different implementations (their own endpoints and tokens); the server
 * enforces who may do what.
 */
export interface ReviewApi {
  load: (documentId: string) => Promise<ReviewResponse>;
  /** Correct a finding; null where the viewer may only view (patients) */
  edit: ((documentId: string, findingId: string, changes: FindingEdit) => Promise<ReviewResponse>) | null;
  dismiss: (documentId: string, findingId: string) => Promise<ReviewResponse>;
  restore: (documentId: string, findingId: string) => Promise<ReviewResponse>;
  /** Add pending findings to the history; null where the viewer may not (doctors) */
  confirm: ((documentId: string) => Promise<ReviewResponse>) | null;
}

const withPatientToken = <T,>(call: (token: string) => Promise<T>): Promise<T> => {
  const token = getAuthToken();
  if (!token) return Promise.reject(new Error('Your session has ended. Log in again.'));
  return call(token);
};

/** The logged-in patient's own review endpoints. */
export const patientReviewApi: ReviewApi = {
  load: (documentId) => withPatientToken((t) => getDocumentFindings(t, documentId) as Promise<ReviewResponse>),
  // Patients view findings only; corrections are made by a doctor with edit access.
  edit: null,
  dismiss: (documentId, findingId) => withPatientToken((t) => dismissFinding(t, documentId, findingId)),
  restore: (documentId, findingId) => withPatientToken((t) => restoreFinding(t, documentId, findingId)),
  confirm: (documentId) => withPatientToken((t) => confirmDocumentFindings(t, documentId)),
};
