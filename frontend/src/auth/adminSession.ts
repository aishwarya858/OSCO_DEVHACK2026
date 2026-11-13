/**
 * The hospital admin's login, kept for this browser tab only (like the doctor's).
 * The server checks the account on every admin request.
 */
const TOKEN_KEY = 'osco.adminToken';
const PROFILE_KEY = 'osco.adminProfile';

export interface AdminProfile {
  id: string;
  name: string;
  email: string;
}

export const getAdminToken = (): string | null => {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const getAdminProfile = (): AdminProfile | null => {
  try {
    const raw = sessionStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as AdminProfile) : null;
  } catch {
    return null;
  }
};

export const saveAdminSession = (token: string, profile: AdminProfile): void => {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Storage unavailable: the session lasts for this page only.
  }
};

export const clearAdminSession = (): void => {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(PROFILE_KEY);
  } catch {
    // Nothing stored.
  }
};
