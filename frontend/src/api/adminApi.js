import { apiRequest } from './client.js';
import { clearAdminSession, getAdminToken } from '../auth/adminSession';

/** Fired when the server rejects the saved admin login, so the app can show the admin login again. */
export const ADMIN_SIGNED_OUT_EVENT = 'osco:admin-signed-out';

const auth = () => {
	const token = getAdminToken();
	return token ? { Authorization: `Bearer ${token}` } : {};
};

/** apiRequest for admin routes; a 401 (expired or removed account) signs the admin out. */
const adminRequest = (path, options = {}) =>
	apiRequest(path, { ...options, headers: { ...auth(), ...options.headers } }).catch((error) => {
		if (error?.status === 401 && getAdminToken()) {
			clearAdminSession();
			window.dispatchEvent(new Event(ADMIN_SIGNED_OUT_EVENT));
		}
		throw error;
	});

/** @param {{ email: string, password: string }} input */
export const loginAdmin = (input) => apiRequest('/api/auth/admin/login', { method: 'POST', body: JSON.stringify(input) });

/** @param {'pending' | 'verified' | 'rejected' | 'revoked' | 'all'} status */
export const listDoctors = (status) => adminRequest(`/api/admin/doctors?status=${encodeURIComponent(status)}`);

/**
 * Verify, reject or revoke a doctor. A reason is required to reject or revoke; the doctor sees it.
 * @param {string} doctorId @param {'verified' | 'rejected' | 'revoked'} status @param {string} [note]
 */
export const setDoctorStatus = (doctorId, status, note) =>
	adminRequest(`/api/admin/doctors/${encodeURIComponent(doctorId)}/status`, { method: 'POST', body: JSON.stringify({ status, note }) });
