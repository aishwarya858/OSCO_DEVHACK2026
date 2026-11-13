import React, { useEffect, useState } from 'react';
import { FileText, LoaderCircle, X } from 'lucide-react';
import type { UploadedDocument } from '../../types/patient';
import { apiUrl } from '../../api/queries.js';
import { getAuthToken } from '../../auth/patientStorage';
import { getDoctorToken } from '../../auth/doctorSession';

export interface DocumentViewerModalProps {
  document: UploadedDocument | null;
  onClose: () => void;
}

type FileState = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; url: string; type: string };

/**
 * Loads the original file with the viewer's own login (patient token, or the
 * doctor's token for /api/doctor/ paths, where the server checks consent).
 * Originals are never served from a public URL, so the file is fetched and
 * shown from a temporary in-browser copy.
 */
const useOriginalFile = (fileUrl: string | undefined): FileState => {
  // The result is kept with the URL it belongs to; anything else is still loading.
  const [state, setState] = useState<{ url: string; result: FileState } | null>(null);
  useEffect(() => {
    if (!fileUrl) return undefined;
    let objectUrl: string | null = null;
    let active = true;
    const token = fileUrl.startsWith('/api/doctor/') ? getDoctorToken() : getAuthToken();
    fetch(apiUrl(fileUrl), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error?.message || 'The original file could not be loaded.');
        }
        const blob = await response.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: fileUrl, result: { status: 'ready', url: objectUrl, type: blob.type } });
      })
      .catch((error: Error) => {
        if (active) setState({ url: fileUrl, result: { status: 'error', message: error.message || 'The original file could not be loaded.' } });
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileUrl]);
  if (!fileUrl) return { status: 'idle' };
  return state?.url === fileUrl ? state.result : { status: 'loading' };
};

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({ document, onClose }) => {
  const file = useOriginalFile(document?.fileUrl);
  if (!document) return null;
  const hasFile = Boolean(document.fileUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-detail-title"
        className={`flex max-h-[92vh] w-full flex-col rounded-2xl bg-white p-5 shadow-xl ${hasFile ? 'max-w-4xl' : 'max-w-md'}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <FileText size={20} className="shrink-0 text-forest" />
            <div className="min-w-0">
              <h2 id="document-detail-title" className="truncate font-heading text-base font-semibold text-forest">
                {document.name}
              </h2>
              <p className="mt-1 text-xs text-text-secondary">{[document.fileFormat, document.size].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close document details" className="rounded-md p-1.5 text-text-secondary hover:bg-osco-bg">
            <X size={17} />
          </button>
        </header>

        {hasFile && (
          <div className="mt-4 min-h-[320px] flex-1 overflow-hidden rounded-xl border border-border-subtle bg-osco-bg">
            {file.status === 'ready' ? (
              file.type.startsWith('image/') ? (
                <div className="flex h-[65vh] items-center justify-center overflow-auto p-3">
                  <img src={file.url} alt={`Original of ${document.name}`} className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <iframe src={file.url} title={`Original of ${document.name}`} className="h-[65vh] w-full" />
              )
            ) : file.status === 'error' ? (
              <p role="alert" className="p-6 text-center text-sm text-warning">{file.message}</p>
            ) : (
              <p className="flex h-[320px] items-center justify-center gap-2 text-sm text-text-secondary">
                <LoaderCircle size={16} className="animate-spin" /> Loading the original document…
              </p>
            )}
          </div>
        )}

        <dl className={`mt-5 border-y border-border-subtle py-4 text-sm ${hasFile ? 'grid grid-cols-2 gap-3 sm:grid-cols-4' : 'space-y-3'}`}>
          <div className={hasFile ? '' : 'flex justify-between gap-4'}>
            <dt className="text-text-secondary">Type</dt>
            <dd className={hasFile ? 'text-text-main' : 'text-right text-text-main'}>{document.type}</dd>
          </div>
          {document.uploadDate && (
            <div className={hasFile ? '' : 'flex justify-between gap-4'}>
              <dt className="text-text-secondary">Added</dt>
              <dd className={hasFile ? 'text-text-main' : 'text-right text-text-main'}>{document.uploadDate}</dd>
            </div>
          )}
          <div className={hasFile ? '' : 'flex justify-between gap-4'}>
            <dt className="text-text-secondary">Status</dt>
            <dd className={hasFile ? 'text-text-main' : 'text-right text-text-main'}>{document.status === 'Completed' ? 'Ready' : document.status}</dd>
          </div>
          {document.relevantDate && (
            <div className={hasFile ? '' : 'flex justify-between gap-4'}>
              <dt className="text-text-secondary">Document date</dt>
              <dd className={hasFile ? 'text-text-main' : 'text-right text-text-main'}>{document.relevantDate}</dd>
            </div>
          )}
          {document.facility && (
            <div className={hasFile ? '' : 'flex justify-between gap-4'}>
              <dt className="text-text-secondary">Findings</dt>
              <dd className={hasFile ? 'text-text-main' : 'text-right text-text-main'}>{document.facility}</dd>
            </div>
          )}
        </dl>
        {!hasFile && (
          <p className="mt-4 text-xs leading-5 text-text-secondary">
            The original file is stored securely and kept unchanged. Open Upload Documents to see the findings read from it.
          </p>
        )}
        <button type="button" onClick={onClose} className="mt-5 w-full rounded-lg bg-forest px-4 py-2.5 text-sm font-semibold text-white hover:bg-forest-dark">
          Close
        </button>
      </section>
    </div>
  );
};
