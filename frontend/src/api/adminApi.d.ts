import type { AdminProfile } from '../auth/adminSession';

export type DoctorStatus = 'pending' | 'verified' | 'rejected' | 'revoked';

export interface AdminDoctor {
  id: string;
  name: string;
  email: string;
  licenseNumber: string | null;
  status: DoctorStatus;
  registeredAt: string;
  verifiedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  note: string | null;
}

export const ADMIN_SIGNED_OUT_EVENT: string;
export function loginAdmin(input: { email: string; password: string }): Promise<{ data: { token: string; admin: AdminProfile } }>;
export function listDoctors(status: DoctorStatus | 'all'): Promise<{ data: { doctors: AdminDoctor[]; counts: Record<DoctorStatus, number> } }>;
export function setDoctorStatus(doctorId: string, status: 'verified' | 'rejected' | 'revoked', note?: string): Promise<{ data: { doctor: AdminDoctor } }>;
