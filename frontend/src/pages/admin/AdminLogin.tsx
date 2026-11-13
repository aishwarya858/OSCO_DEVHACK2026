import React, { useId, useState } from 'react';
import { ArrowLeft, Building2, LoaderCircle } from 'lucide-react';
import { loginAdmin } from '../../api/adminApi.js';
import { saveAdminSession, type AdminProfile } from '../../auth/adminSession';
import { PasswordInput } from '../../components/ui/PasswordInput';

export interface AdminLoginProps {
  onLoggedIn: (profile: AdminProfile) => void;
  onBack: () => void;
  notice?: string;
}

/** Hospital admin sign-in. Admin accounts are created by the hospital, so there is no sign-up. */
export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoggedIn, onBack, notice }) => {
  const id = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await loginAdmin({ email, password });
      saveAdminSession(data.token, data.admin);
      onLoggedIn(data.admin);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Could not sign in. Try again.');
    } finally {
      setBusy(false);
    }
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
            <Building2 size={20} />
          </span>
          <p className="font-jetbrains text-[11px] uppercase tracking-[0.16em] text-ink-muted">Hospital admin</p>
        </div>
        <h1 className="mt-4 font-fraunces text-[40px] font-medium leading-tight tracking-tight">Admin sign in</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">Review doctor registrations and verify their medical licences.</p>
        {notice && (
          <p role="status" className="mt-6 rounded-2xl bg-ochre-soft px-4 py-3 text-sm text-[#7A5A16]">
            {notice}
          </p>
        )}
        <form onSubmit={submit} className="mt-8 space-y-4 rounded-3xl bg-chalk p-5 sm:p-6" noValidate>
          <div>
            <label htmlFor={`${id}-email`} className="mb-2 block text-sm font-semibold">Email</label>
            <input id={`${id}-email`} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor={`${id}-password`} className="mb-2 block text-sm font-semibold">Password</label>
            <PasswordInput id={`${id}-password`} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          </div>
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
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-ink-muted">Admin accounts are created by your hospital’s OSCO operator.</p>
      </div>
    </main>
  );
};
