import React, { useId, useState } from 'react';
import { ArrowLeft, LoaderCircle, LogOut, ShieldAlert, Stethoscope } from 'lucide-react';
import { loginDoctor, registerDoctor } from '../../api/doctorApi.js';
import { saveDoctorSession, type DoctorProfile } from '../../auth/doctorSession';
import { PasswordInput } from '../../components/ui/PasswordInput';

export interface DoctorAuthProps {
  mode: 'login' | 'signup';
  onSwitchMode: (mode: 'login' | 'signup') => void;
  onLoggedIn: (profile: DoctorProfile) => void;
  onBack: () => void;
  onOpenPatient: () => void;
  notice?: string;
}

/** Doctor sign-in and sign-up (MVP document 5.3, 6.2.1). New accounts wait for hospital verification. */
export const DoctorAuth: React.FC<DoctorAuthProps> = ({ mode, onSwitchMode, onLoggedIn, onBack, onOpenPatient, notice }) => {
  const id = useId();
  const [name, setName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (signup) {
      if (!name.trim() || !licenseNumber.trim()) return setError('Enter your full name and medical licence number.');
      if (password.length < 8) return setError('Password must be at least 8 characters.');
      if (password !== confirmPassword) return setError('Passwords do not match.');
    }
    setBusy(true);
    try {
      const { data } = signup
        ? await registerDoctor({ name, email, password, licenseNumber })
        : await loginDoctor({ email, password });
      saveDoctorSession(data.token, data.doctor);
      onLoggedIn(data.doctor);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not sign in. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (next: 'login' | 'signup') => {
    setError('');
    onSwitchMode(next);
  };

  const field = 'w-full rounded-2xl border border-hairline bg-white px-3 py-3 text-sm outline-none focus:border-aubergine';
  return (
    <main className="min-h-screen bg-bone px-4 py-10 font-inter text-aubergine sm:py-16">
      <div className="brief-fade-in mx-auto max-w-md">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-aubergine cursor-pointer">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="mt-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-aubergine text-white">
            <Stethoscope size={20} />
          </span>
          <p className="font-jetbrains text-[11px] uppercase tracking-[0.16em] text-ink-muted">Doctor portal</p>
        </div>
        <h1 className="mt-4 font-fraunces text-[40px] font-medium leading-tight tracking-tight">
          {signup ? 'Create a doctor account' : 'Doctor sign in'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          {signup
            ? 'Your account is checked by your hospital before you can look up patients. You can sign in and see your status meanwhile.'
            : 'Only doctors verified by their hospital can look up patients, and only with each patient’s approval.'}
        </p>
        {notice && (
          <p role="status" className="mt-6 rounded-2xl bg-ochre-soft px-4 py-3 text-sm text-[#7A5A16]">
            {notice}
          </p>
        )}
        <form onSubmit={submit} className="mt-8 space-y-4 rounded-3xl bg-chalk p-5 sm:p-6" noValidate>
          {signup && (
            <>
              <div>
                <label htmlFor={`${id}-name`} className="mb-2 block text-sm font-semibold">Full name</label>
                <input id={`${id}-name`} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Dr. Your Name" />
              </div>
              <div>
                <label htmlFor={`${id}-licence`} className="mb-2 block text-sm font-semibold">Medical licence / registration number</label>
                <input id={`${id}-licence`} value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} className={field} placeholder="e.g. MCI-12345" />
              </div>
            </>
          )}
          <div>
            <label htmlFor={`${id}-email`} className="mb-2 block text-sm font-semibold">Email</label>
            <input id={`${id}-email`} type="email" autoComplete={signup ? 'email' : 'username'} value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor={`${id}-password`} className="mb-2 block text-sm font-semibold">Password</label>
            <PasswordInput
              id={`${id}-password`}
              autoComplete={signup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
              placeholder={signup ? 'At least 8 characters' : undefined}
            />
          </div>
          {signup && (
            <div>
              <label htmlFor={`${id}-confirm`} className="mb-2 block text-sm font-semibold">Confirm password</label>
              <PasswordInput id={`${id}-confirm`} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={field} />
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-xl bg-brick-soft px-3 py-2 text-sm text-brick">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !email || !password}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-aubergine px-5 py-3 text-sm font-semibold text-white hover:bg-aubergine-raised disabled:opacity-60"
          >
            {busy && <LoaderCircle size={16} className="animate-spin" />}
            {signup ? (busy ? 'Creating account…' : 'Create account') : busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-ink-muted">
          {signup ? 'Already have a doctor account?' : 'New to OSCO?'}{' '}
          <button type="button" onClick={() => switchTo(signup ? 'login' : 'signup')} className="font-semibold text-aubergine hover:underline cursor-pointer">
            {signup ? 'Sign in' : 'Create a doctor account'}
          </button>
        </p>
        <p className="mt-6 text-center text-xs text-ink-muted">
          Are you a patient?{' '}
          <button type="button" onClick={onOpenPatient} className="font-medium text-aubergine hover:underline cursor-pointer">
            Go to patient login
          </button>
        </p>
      </div>
    </main>
  );
};

/** Shown to pending, rejected or revoked doctors: they can sign in but not look up patients (5.3). */
export const DoctorStatusNotice: React.FC<{ profile: DoctorProfile; onLogout: () => void }> = ({ profile, onLogout }) => (
  <div className="rounded-[28px] bg-bone p-8 font-inter text-aubergine sm:p-12">
    <div className="mx-auto max-w-md">
      <ShieldAlert size={28} className="text-ochre" aria-hidden="true" />
      <h1 className="mt-3 font-fraunces text-[32px] font-medium leading-tight">Account {profile.verificationStatus}</h1>
      <p className="mt-2 text-sm leading-6 text-ink-muted">{profile.statusMessage ?? 'Your account is not verified.'} Patient lookup is not available.</p>
      <button type="button" onClick={onLogout} className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-aubergine hover:underline">
        <LogOut size={15} /> Sign out
      </button>
    </div>
  </div>
);
