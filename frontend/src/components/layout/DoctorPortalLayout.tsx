import React, { useEffect, useState } from 'react';
import type { PatientContext } from '../../types/navigation';
import type { UploadedDocument } from '../../types/patient';
import FindPatient, { type ApprovedAccessRequest } from '../../pages/doctor/FindPatient';
import PatientRecord, { RECORD_SECTIONS } from '../../pages/doctor/PatientRecord';
import { DoctorDocuments } from '../../pages/doctor/DoctorDocuments';
import { DoctorAssistantChat } from '../../pages/doctor/DoctorAssistantChat';
import { DocumentViewerModal } from '../patient/DocumentViewerModal';
import { DoctorStatusNotice } from '../../pages/doctor/DoctorLogin';
import { clearDoctorSession, getDoctorProfile, getDoctorToken, saveDoctorSession, type DoctorProfile } from '../../auth/doctorSession';
import { DOCTOR_SIGNED_OUT_EVENT, getDoctorMe } from '../../api/doctorApi.js';
import { useDoctorRecords } from '../../pages/doctor/useDoctorRecords';
import { DOCUMENT_TYPE_LABELS, formatRecordDate } from '../../records/format';
import type { SourceDocument } from '../../types/records';

export interface DoctorPortalLayoutProps {
  currentPatient: PatientContext | null;
  onSelectPatient: (patient: PatientContext) => void;
  /** Leave the patient (access ended or expired) and return to Find Patient */
  onExitPatient: () => void;
  activeNavItemId: string;
  onNavigate: (section: string) => void;
  /** No valid doctor login (signed out, or the session expired): the app shows the doctor login page. */
  onSignedOut: (notice?: string) => void;
}

const RECORD_NAV_IDS = new Set<string>(RECORD_SECTIONS.map((section) => section.navId));

const STATUS: Record<SourceDocument['status'], UploadedDocument['status']> = {
  uploaded: 'Uploaded',
  processing: 'Processing',
  ready: 'Completed',
  failed: 'Failed',
};

/** A patient's uploaded document, as the Documents list shows it; the file is served under the doctor's consent. */
const toDoctorDocument = (doc: SourceDocument, publicId: string): UploadedDocument => ({
  id: doc.id,
  name: doc.name,
  type: DOCUMENT_TYPE_LABELS[doc.documentType] ?? 'Document',
  fileFormat: (doc.name.split('.').pop() ?? '').toUpperCase(),
  size: '',
  uploadDate: '',
  relevantDate: doc.documentDate ? formatRecordDate(doc.documentDate) : '',
  status: STATUS[doc.status] ?? 'Uploaded',
  facility: '',
  pageCount: doc.pageCount || undefined,
  fileUrl: `/api/doctor/patients/${encodeURIComponent(publicId)}/documents/${encodeURIComponent(doc.id)}/file`,
});

/** Documents tab: the patient's uploads, loaded with the doctor's consent (same records call as the other tabs). */
const DoctorDocumentsTab: React.FC<{ publicId: string; onAccessLost: () => void; onOpenDocument: (doc: UploadedDocument) => void }> = ({
  publicId,
  onAccessLost,
  onOpenDocument,
}) => {
  const { state } = useDoctorRecords(publicId, onAccessLost);
  if (state.status === 'loading') return <p className="py-10 text-center text-sm text-text-secondary">Loading the patient’s documents…</p>;
  if (state.status === 'error') return <p role="alert" className="py-10 text-center text-sm text-warning">{state.message}</p>;
  const documents = state.records.documents.filter((doc) => doc.kind !== 'clinical_record').map((doc) => toDoctorDocument(doc, publicId));
  return <DoctorDocuments documents={documents} onOpenDocument={onOpenDocument} />;
};

/** The limited identification from an approved request, as the app's PatientContext. */
const toPatientContext = (request: ApprovedAccessRequest): PatientContext => ({
  id: request.patientId,
  name: request.patient.name,
  age: request.patient.age ?? 0,
  gender: request.patient.sex ?? '',
  mrn: '',
  dob: '',
  primaryCondition: '',
  status: 'needs_review',
  confidence: 0,
  lastUpdated: request.decidedAt,
});

/**
 * Doctor portal (MVP document 6.2). The doctor signs in first; unverified
 * doctors only see their status. Without an approved patient the doctor
 * sees Find Patient; after approval, the patient record with its four
 * sections. The existing sidebar items for those sections drive the same view.
 */
export const DoctorPortalLayout: React.FC<DoctorPortalLayoutProps> = ({
  currentPatient,
  onSelectPatient,
  onExitPatient,
  activeNavItemId,
  onNavigate,
  onSignedOut,
}) => {
  const [selectedDocument, setSelectedDocument] = useState<UploadedDocument | null>(null);
  const [doctor, setDoctor] = useState<DoctorProfile | null>(() => (getDoctorToken() ? getDoctorProfile() : null));
  const signedIn = Boolean(doctor);

  // The server rejected the saved login (expired, or the account no longer exists): show sign-in again.
  useEffect(() => {
    const handleExpired = () => {
      setDoctor(null);
      onExitPatient();
      onSignedOut('Your session has ended. Please sign in again.');
    };
    window.addEventListener(DOCTOR_SIGNED_OUT_EVENT, handleExpired);
    return () => window.removeEventListener(DOCTOR_SIGNED_OUT_EVENT, handleExpired);
  }, [onExitPatient, onSignedOut]);

  // Check a saved login when the portal opens, and pick up a changed verification status.
  useEffect(() => {
    if (!signedIn) return undefined;
    let active = true;
    getDoctorMe()
      .then(() => {
        // Valid and verified. A doctor who was pending and has since been verified moves on to the portal.
        const token = getDoctorToken();
        const profile = getDoctorProfile();
        if (active && token && profile && profile.verificationStatus !== 'verified') {
          const updated: DoctorProfile = { ...profile, verificationStatus: 'verified', statusMessage: null };
          saveDoctorSession(token, updated);
          setDoctor(updated);
        }
      })
      .catch((error: { status?: number; body?: unknown; message?: string }) => {
        if (!active || error.status !== 403) return; // 401 is handled by the sign-out event
        const token = getDoctorToken();
        const profile = getDoctorProfile();
        const status = /revoked/i.test(error.message ?? '') ? 'revoked' : /rejected/i.test(error.message ?? '') ? 'rejected' : 'pending';
        if (token && profile) {
          const updated = { ...profile, verificationStatus: status, statusMessage: error.message ?? null } as DoctorProfile;
          saveDoctorSession(token, updated);
          setDoctor(updated);
        }
      });
    return () => {
      active = false;
    };
  }, [signedIn]);

  const signOut = () => {
    clearDoctorSession();
    setDoctor(null);
    onExitPatient();
    onSignedOut();
  };


  // The app only opens the portal with a saved login; after signing out it shows the login page.
  if (!doctor) return null;
  if (doctor.verificationStatus !== 'verified') return <DoctorStatusNotice profile={doctor} onLogout={signOut} />;

  if (!currentPatient) {
    return (
      <div className="space-y-3">
        <p className="text-right font-inter text-xs text-ink-muted">
          Signed in as <span className="font-medium text-aubergine">{doctor.name}</span> ·{' '}
          <button type="button" onClick={signOut} className="font-medium text-aubergine hover:underline">
            Sign out
          </button>
        </p>
        <FindPatient onApproved={(request) => onSelectPatient(toPatientContext(request))} />
      </div>
    );
  }

  // Sidebar items outside the four record sections keep their existing pages.
  if (activeNavItemId === 'documents') {
    return (
      <>
        <DoctorDocumentsTab publicId={currentPatient.id} onAccessLost={onExitPatient} onOpenDocument={setSelectedDocument} />
        <DocumentViewerModal document={selectedDocument} onClose={() => setSelectedDocument(null)} />
      </>
    );
  }
  if (activeNavItemId === 'health-assistant') {
    return <DoctorAssistantChat key={currentPatient.id} patientName={currentPatient.name} patientPublicId={currentPatient.id} />;
  }

  return (
    <PatientRecord
      patient={currentPatient}
      activeNavId={RECORD_NAV_IDS.has(activeNavItemId) ? activeNavItemId : 'emergency-brief'}
      onNavigate={onNavigate}
      onAccessEnded={onExitPatient}
    />
  );
};
