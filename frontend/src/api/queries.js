import { API_BASE_URL, apiRequest } from './client.js';

/** Absolute URL for an API path (for clients like pdf.js that fetch on their own). @param {string} path */
export const apiUrl = (path) => `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

/** @typedef {{ status: string, timestamp?: string }} HealthResponse */
/** @typedef {{ id: string, name: string, email: string, createdAt: string }} PatientProfile */
/** @typedef {{ token: string, patient: PatientProfile }} PatientAuthResponse */

/** Check the backend's public health endpoint. */
export const getBackendHealth = () => apiRequest('/health');

/** @param {{ name: string, email: string, password: string }} input */
export const registerPatient = (input) =>
	apiRequest('/api/auth/patient/register', { method: 'POST', body: JSON.stringify(input) });

/** @param {{ email: string, password: string }} input */
export const loginPatient = (input) =>
	apiRequest('/api/auth/patient/login', { method: 'POST', body: JSON.stringify(input) });

/** @param {string} token */
export const getPatientProfile = (token) =>
	apiRequest('/api/patients/me', { headers: { Authorization: `Bearer ${token}` } });

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

/**
 * Upload PDFs or images for processing (POST /api/documents).
 * @param {string} token
 * @param {File[]} files
 */
export const uploadDocuments = (token, files) => {
	const body = new FormData();
	for (const file of files) body.append('files', file, file.name);
	return apiRequest('/api/documents', { method: 'POST', body, headers: authHeader(token) });
};

/** @param {string} token */
export const listDocuments = (token) => apiRequest('/api/documents', { headers: authHeader(token) });

/** One document with its verified findings. @param {string} token @param {string} documentId */
export const getDocumentFindings = (token, documentId) =>
	apiRequest(`/api/documents/${encodeURIComponent(documentId)}`, { headers: authHeader(token) });

/** Queue a failed or never-queued document again. @param {string} token @param {string} documentId */
export const retryDocument = (token, documentId) =>
	apiRequest(`/api/documents/${encodeURIComponent(documentId)}/retry`, { method: 'POST', headers: authHeader(token) });

/** The patient's medical history: confirmed findings only (GET /api/me/records). @param {string} token */
export const getMyRecords = (token) => apiRequest('/api/me/records', { headers: authHeader(token) });

const findingPath = (documentId, findingId) =>
	`/api/documents/${encodeURIComponent(documentId)}/findings/${encodeURIComponent(findingId)}`;

/** Remove a wrong finding (kept, never shown). */
export const dismissFinding = (token, documentId, findingId) =>
	apiRequest(`${findingPath(documentId, findingId)}/dismiss`, { method: 'POST', headers: authHeader(token) });

/** Bring a removed finding back for review. */
export const restoreFinding = (token, documentId, findingId) =>
	apiRequest(`${findingPath(documentId, findingId)}/restore`, { method: 'POST', headers: authHeader(token) });

/** Add a document's reviewed findings to the medical history. */
export const confirmDocumentFindings = (token, documentId) =>
	apiRequest(`/api/documents/${encodeURIComponent(documentId)}/confirm`, { method: 'POST', headers: authHeader(token) });

/** The patient's access requests and access history (GET /api/access). @param {string} token */
export const listAccessRequests = (token) => apiRequest('/api/access', { headers: authHeader(token) });

/**
 * Approve a doctor's request. access: grant what was asked, or 'read' for view only.
 * @param {string} token @param {string} requestId @param {'read' | 'edit'} [access]
 */
export const approveAccessRequest = (token, requestId, access) =>
	apiRequest(`/api/access/${encodeURIComponent(requestId)}/approve`, {
		method: 'POST',
		body: JSON.stringify(access ? { access } : {}),
		headers: authHeader(token),
	});

/** @param {string} token @param {string} requestId */
export const denyAccessRequest = (token, requestId) =>
	apiRequest(`/api/access/${encodeURIComponent(requestId)}/deny`, { method: 'POST', headers: authHeader(token) });

/** End an active access early. @param {string} token @param {string} sessionId */
export const endAccessSession = (token, sessionId) =>
	apiRequest(`/api/access/sessions/${encodeURIComponent(sessionId)}/end`, { method: 'POST', headers: authHeader(token) });

/**
 * Ask the records assistant about the logged-in patient's own records (POST /api/me/chat).
 * The patient is identified by the token only.
 * @param {string} token @param {string} question @param {AbortSignal} [signal]
 */
export const askHealthAssistant = (token, question, signal) =>
	apiRequest('/api/me/chat', { method: 'POST', body: JSON.stringify({ question }), headers: authHeader(token), signal });
