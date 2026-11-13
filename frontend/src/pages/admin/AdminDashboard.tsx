import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Building2, Check, LoaderCircle, LogOut, RefreshCw, ShieldOff, UserRound, X } from 'lucide-react';
import { listDoctors, setDoctorStatus, type AdminDoctor, type DoctorStatus } from '../../api/adminApi.js';
import type { AdminProfile } from '../../auth/adminSession';

export interface AdminDashboardProps {
  admin: AdminProfile;
  onSignOut: () => void;
}

type Tab = DoctorStatus | 'all';

const TABS: { id: Tab; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'verified', label: 'Verified' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'revoked', label: 'Revoked' },
  { id: 'all', label: 'All' },
];

const STATUS_STYLE: Record<DoctorStatus, string> = {
  pending: 'bg-ochre-soft text-[#7A5A16]',
  verified: 'bg-emerald-50 text-emerald-800',
  rejected: 'bg-brick-soft text-brick',
  revoked: 'bg-brick-soft text-brick',
};

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '';

type Decision = { doctorId: string; status: 'rejected' | 'revoked' };

/** Hospital admin: review doctor registrations and verify, reject or revoke them (MVP 5.3). */
export const AdminDashboard: React.FC<AdminDashboardProps> = ({ admin, onSignOut }) => {
  const [tab, setTab] = useState<Tab>('pending');
  const [doctors, setDoctors] = useState<AdminDoctor[]>([]);
  const [counts, setCounts] = useState<Record<DoctorStatus, number>>({ pending: 0, verified: 0, rejected: 0, revoked: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    listDoctors(tab)
      .then(({ data }) => {
        if (!active) return;
        setDoctors(data.doctors);
        setCounts(data.counts);
        setError('');
      })
      .catch((loadError: Error) => {
        if (active) setError(loadError.message || 'Could not load doctors.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const changeTab = (next: Tab) => {
    if (next === tab) return;
    setDecision(null);
    setMessage('');
    setLoading(true);
    setTab(next);
  };

  const apply = async (doctor: AdminDoctor, status: 'verified' | 'rejected' | 'revoked', note?: string) => {
    setBusyId(doctor.id);
    setError('');
    setMessage('');
    try {
      await setDoctorStatus(doctor.id, status, note);
      setDecision(null);
      setReason('');
      setMessage(
        status === 'verified'
          ? `${doctor.name} is verified and can now look up patients (with each patient’s approval).`
          : status === 'rejected'
            ? `${doctor.name}’s registration was rejected.`
            : `${doctor.name}’s verification was revoked. Their active patient access has ended.`,
      );
      reload();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not update the doctor.');
    } finally {
      setBusyId(null);
    }
  };

  const total = counts.pending + counts.verified + counts.rejected + counts.revoked;

  return (
    <main className="min-h-screen bg-bone font-inter text-aubergine">
      <header className="border-b border-hairline bg-chalk">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-aubergine text-white">
              <Building2 size={18} />
            </span>
            <div>
              <p className="font-jetbrains text-[10px] uppercase tracking-[0.16em] text-ink-muted">OSCO · Hospital admin</p>
              <p className="text-sm font-semibold">{admin.name}</p>
            </div>
          </div>
          <button type="button" onClick={onSignOut} className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline cursor-pointer">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </header>

      <div className="brief-fade-in mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-fraunces text-[36px] font-medium leading-tight tracking-tight">Doctor verification</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Check each doctor’s medical licence before verifying. Only verified doctors can request access to patient records.
            </p>
          </div>
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3.5 py-2 text-sm font-medium hover:border-aubergine cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Doctor status">
          {TABS.map((t) => {
            const n = t.id === 'all' ? total : counts[t.id];
            const selected = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => changeTab(t.id)}
                className={`rounded-full px-4 py-2 text-sm font-medium cursor-pointer ${
                  selected ? 'bg-aubergine text-white' : 'border border-hairline bg-white hover:border-aubergine'
                }`}
              >
                {t.label}
                <span className={`ml-2 rounded-full px-1.5 py-0.5 font-jetbrains text-[11px] ${selected ? 'bg-white/15' : 'bg-bone'}`}>{n}</span>
              </button>
            );
          })}
        </div>

        {message && (
          <p role="status" className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-5 rounded-2xl bg-brick-soft px-4 py-3 text-sm text-brick">
            {error}
          </p>
        )}

        <section className="mt-5 space-y-3" aria-live="polite">
          {loading && !doctors.length ? (
            <p className="flex items-center gap-2 py-10 text-sm text-ink-muted">
              <LoaderCircle size={16} className="animate-spin" /> Loading doctors…
            </p>
          ) : !doctors.length ? (
            <div className="rounded-3xl bg-chalk px-6 py-12 text-center">
              <BadgeCheck size={26} className="mx-auto text-ink-muted" />
              <p className="mt-3 text-sm font-semibold">{tab === 'pending' ? 'No doctors waiting for verification' : 'No doctors here'}</p>
              <p className="mt-1 text-xs text-ink-muted">New doctor sign-ups appear in Pending.</p>
            </div>
          ) : (
            doctors.map((doctor) => {
              const busy = busyId === doctor.id;
              const deciding = decision?.doctorId === doctor.id ? decision : null;
              return (
                <article key={doctor.id} className="rounded-3xl bg-chalk p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bone">
                        <UserRound size={18} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-semibold">{doctor.name}</h2>
                          <span className={`rounded-full px-2 py-0.5 font-jetbrains text-[10px] uppercase tracking-wider ${STATUS_STYLE[doctor.status]}`}>
                            {doctor.status}
                          </span>
                        </div>
                        <p className="mt-0.5 break-all text-sm text-ink-muted">{doctor.email}</p>
                        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                          <div>
                            <dt className="inline text-ink-muted">Licence no.: </dt>
                            <dd className="inline font-jetbrains font-semibold">{doctor.licenseNumber ?? 'Not given'}</dd>
                          </div>
                          <div>
                            <dt className="inline text-ink-muted">Registered: </dt>
                            <dd className="inline">{formatDate(doctor.registeredAt)}</dd>
                          </div>
                          {doctor.reviewedAt && (
                            <div className="sm:col-span-2">
                              <dt className="inline text-ink-muted">Last reviewed: </dt>
                              <dd className="inline">
                                {formatDate(doctor.reviewedAt)}
                                {doctor.reviewedBy ? ` by ${doctor.reviewedBy}` : ''}
                              </dd>
                            </div>
                          )}
                          {doctor.note && (
                            <div className="sm:col-span-2">
                              <dt className="inline text-ink-muted">Reason: </dt>
                              <dd className="inline">{doctor.note}</dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    </div>

                    {!deciding && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {doctor.status !== 'verified' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => apply(doctor, 'verified')}
                            className="inline-flex items-center gap-1.5 rounded-full bg-aubergine px-4 py-2 text-sm font-semibold text-white hover:bg-aubergine-raised disabled:opacity-60 cursor-pointer"
                          >
                            {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} Verify
                          </button>
                        )}
                        {doctor.status === 'pending' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setReason('');
                              setDecision({ doctorId: doctor.id, status: 'rejected' });
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-4 py-2 text-sm font-semibold text-brick hover:border-brick disabled:opacity-60 cursor-pointer"
                          >
                            <X size={14} /> Reject
                          </button>
                        )}
                        {doctor.status === 'verified' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setReason('');
                              setDecision({ doctorId: doctor.id, status: 'revoked' });
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-4 py-2 text-sm font-semibold text-brick hover:border-brick disabled:opacity-60 cursor-pointer"
                          >
                            <ShieldOff size={14} /> Revoke
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {deciding && (
                    <form
                      className="mt-4 rounded-2xl border border-hairline bg-white p-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (reason.trim()) void apply(doctor, deciding.status, reason.trim());
                      }}
                    >
                      <label htmlFor={`reason-${doctor.id}`} className="block text-sm font-semibold">
                        {deciding.status === 'rejected' ? 'Why is this registration rejected?' : 'Why is this verification revoked?'}
                      </label>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        The doctor sees this reason.{deciding.status === 'revoked' ? ' Their active patient access ends immediately.' : ''}
                      </p>
                      <textarea
                        id={`reason-${doctor.id}`}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        maxLength={500}
                        rows={2}
                        autoFocus
                        className="mt-2 w-full rounded-xl border border-hairline px-3 py-2 text-sm outline-none focus:border-aubergine"
                        placeholder={deciding.status === 'rejected' ? 'e.g. Licence number could not be confirmed with the medical council.' : 'e.g. No longer practising at this hospital.'}
                      />
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => setDecision(null)} className="rounded-full px-4 py-2 text-sm font-medium hover:underline cursor-pointer">
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={busy || !reason.trim()}
                          className="inline-flex items-center gap-1.5 rounded-full bg-brick px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 cursor-pointer"
                        >
                          {busy && <LoaderCircle size={14} className="animate-spin" />}
                          {deciding.status === 'rejected' ? 'Reject registration' : 'Revoke verification'}
                        </button>
                      </div>
                    </form>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
};
