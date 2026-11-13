import { apiRequest } from './client.js';
import { clearDoctorSession, getDoctorToken } from '../auth/doctorSession';

/** Fired when the server rejects the saved doctor login, so the portal can show sign-in again. */
export const DOCTOR_SIGNED_OUT_EVENT = 'osco:doctor-signed-out';

/**
 * apiRequest for doctor routes. A 401 means the saved login is no longer valid
 * (expired after 1 hour, or the account no longer exists): sign the doctor out
 * instead of leaving the portal showing errors.
 */
const doctorRequest = (path, options) =>
	apiRequest(path, options).catch((error) => {
		if (error?.status === 401 && getDoctorToken()) {
			clearDoctorSession();
			window.dispatchEvent(new Event(DOCTOR_SIGNED_OUT_EVENT));
		}
		throw error;
	});

/**
 * Doctor API (MVP document 8.9). Every call sends the doctor's token; the
 * server re-checks verification and the patient's consent on each request.
 */

const auth = () => {
	const token = getDoctorToken();
	return token ? { Authorization: `Bearer ${token}` } : {};
};

/** @param {{ email: string, password: string }} input */
export const loginDoctor = (input) => apiRequest('/api/auth/doctor/login', { method: 'POST', body: JSON.stringify(input) });

/** Limited identification for a Patient ID (name only, no medical data). @param {string} patientId */
export const lookupPatient = (patientId) =>
	doctorRequest('/api/doctor/lookup', { method: 'POST', body: JSON.stringify({ patientId }), headers: auth() });

/** @param {{ patientId: string, purpose: string, access: 'read' | 'edit' }} input */
export const createAccessRequest = (input) =>
	doctorRequest('/api/doctor/access-requests', { method: 'POST', body: JSON.stringify(input), headers: auth() });

/** @param {string} requestId */
export const getAccessRequestStatus = (requestId) =>
	doctorRequest(`/api/doctor/access-requests/${encodeURIComponent(requestId)}`, { headers: auth() });

const patientPath = (publicId) => `/api/doctor/patients/${encodeURIComponent(publicId)}`;

/** The patient's medical history (confirmed findings), plus this doctor's current access. @param {string} publicId */
export const getPatientRecords = (publicId) => doctorRequest(`${patientPath(publicId)}/records`, { headers: auth() });

/**
 * The same review operations the patient dashboard uses, scoped to one patient
 * and acting as the doctor. Shape matches FindingsReview's `api` prop.
 * @param {string} publicId
 */
export const doctorReviewApi = (publicId) => {
	const finding = (documentId, findingId) =>
		`${patientPath(publicId)}/documents/${encodeURIComponent(documentId)}/findings/${encodeURIComponent(findingId)}`;
	return {
		load: (documentId) => doctorRequest(`${patientPath(publicId)}/documents/${encodeURIComponent(documentId)}`, { headers: auth() }),
		edit: (documentId, findingId, changes) =>
			doctorRequest(finding(documentId, findingId), { method: 'PATCH', body: JSON.stringify(changes), headers: auth() }),
		dismiss: (documentId, findingId) => doctorRequest(`${finding(documentId, findingId)}/dismiss`, { method: 'POST', headers: auth() }),
		restore: (documentId, findingId) => doctorRequest(`${finding(documentId, findingId)}/restore`, { method: 'POST', headers: auth() }),
		confirm: null, // adding findings to the history is the patient's decision
	};
};

/** The Authorization header for clients that fetch on their own (pdf.js in the Source Viewer). */
export const doctorAuthHeader = auth;

/** Mark a finding Doctor-verified (no other change). */
export const verifyFinding = (publicId, findingId) =>
	doctorRequest(`${patientPath(publicId)}/findings/${encodeURIComponent(findingId)}/verify`, { method: 'POST', headers: auth() });

/** Mark a review flag resolved, with a note saying how it was reviewed. */
export const resolveFlag = (publicId, flagId, note) =>
	doctorRequest(`${patientPath(publicId)}/flags/${encodeURIComponent(flagId)}/resolve`, { method: 'POST', body: JSON.stringify({ note }), headers: auth() });

/** Add a clinical record: { consultationDate, facility, diagnoses, prescriptions, investigations, observations }. */
export const addClinicalRecord = (publicId, record) =>
	doctorRequest(`${patientPath(publicId)}/clinical-records`, { method: 'POST', body: JSON.stringify(record), headers: auth() });

/** This doctor's requests from the last 24 hours (pending and approved), newest first. */
export const listAccessRequests = () => doctorRequest('/api/doctor/access-requests', { headers: auth() });

/** The signed-in doctor as the server sees them now (verification is re-checked on every request). */
export const getDoctorMe = () => doctorRequest('/api/doctor/me', { headers: auth() });

/**
 * Ask the records assistant about the patient this doctor has active consent for.
 * The server checks the doctor's verification and the consent on every question.
 * @param {string} publicId @param {string} question @param {AbortSignal} [signal]
 */
export const askDoctorAssistant = (publicId, question, signal) =>
	doctorRequest(`${patientPath(publicId)}/chat`, { method: 'POST', body: JSON.stringify({ question }), headers: auth(), signal });

/**
 * Create a doctor account. It starts 'pending' until the doctor's hospital verifies it.
 * @param {{ name: string, email: string, password: string, licenseNumber: string }} input
 */
export const registerDoctor = (input) => apiRequest('/api/auth/doctor/register', { method: 'POST', body: JSON.stringify(input) });
