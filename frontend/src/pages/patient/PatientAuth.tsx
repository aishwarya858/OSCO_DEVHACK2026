import { useState } from 'react';
import { ArrowLeft, ArrowRight, HeartPulse } from 'lucide-react';
import { PasswordInput } from '../../components/ui/PasswordInput';

export interface PatientAuthProps {
  onRegister: (name: string, email: string, password: string) => Promise<void>;
  onLogin: (email: string, password: string) => Promise<void>;
  /** Login or sign-up, chosen by the page address (/patient/login or /patient/signup) */
  mode: 'login' | 'signup';
  onSwitchMode: (mode: 'login' | 'signup') => void;
  onBack: () => void;
  onOpenDoctorPortal: () => void;
  error?: string;
  isSubmitting: boolean;
}

export const PatientAuth: React.FC<PatientAuthProps> = ({
  onRegister,
  onLogin,
  mode,
  onSwitchMode,
  onBack,
  onOpenDoctorPortal,
  error,
  isSubmitting,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (isSubmitting) return;
    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setFormError('Passwords do not match.');
        return;
      }
      await onRegister(name, email, password);
    } else {
      await onLogin(email, password);
    }
  };

  return (
    <main className="min-h-screen bg-osco-bg flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-5xl min-h-[560px] grid lg:grid-cols-[1.05fr_0.95fr] bg-white rounded-2xl overflow-hidden shadow-sm border border-border-subtle">
        <section className="bg-forest text-white p-8 sm:p-12 flex flex-col justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-citron">
              <HeartPulse size={22} />
            </span>
            <span className="font-heading text-xl font-bold tracking-tight">OSCO</span>
          </div>
          <div className="max-w-md py-12 lg:py-0">
            <p className="text-xs uppercase tracking-[0.18em] text-citron mb-4">Your health, in view</p>
            <h1 className="font-heading text-3xl sm:text-4xl font-semibold leading-tight text-white">
              A clearer picture of your health history.
            </h1>
            <p className="mt-4 text-sm leading-6 text-white/70">
              Keep your documents and patient-provided details together, ready when you need them.
            </p>
          </div>
          <p className="text-xs text-white/55">Patient accounts are authenticated by OSCO.</p>
        </section>

        <section className="p-8 sm:p-12 flex flex-col justify-center">
          <div className="max-w-sm w-full mx-auto">
            <button
              type="button"
              onClick={onBack}
              className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-forest cursor-pointer"
            >
              <ArrowLeft size={15} /> Back
            </button>
            <p className="text-sm text-text-secondary mb-2">{mode === 'signup' ? 'Get started' : 'Welcome back'}</p>
            <h2 className="font-heading text-2xl font-semibold text-forest">
              {mode === 'signup' ? 'Create your patient account' : 'Log in to OSCO'}
            </h2>
            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              {mode === 'signup' && (
                <label className="block text-sm font-medium text-text-main">
                  Full name
                  <input
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-border-subtle px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest"
                    placeholder="Your name"
                  />
                </label>
              )}
              <label className="block text-sm font-medium text-text-main">
                Email
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border-subtle px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest"
                  placeholder="you@example.com"
                />
              </label>
              <label className="block text-sm font-medium text-text-main">
                Password
                <PasswordInput
                  required
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={mode === 'signup' ? 8 : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  wrapperClassName="mt-1.5"
                  className="w-full rounded-lg border border-border-subtle px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest"
                  placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                />
              </label>
              {mode === 'signup' && (
                <label className="block text-sm font-medium text-text-main">
                  Confirm password
                  <PasswordInput
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    wrapperClassName="mt-1.5"
                    className="w-full rounded-lg border border-border-subtle px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest/20 focus:border-forest"
                    placeholder="Enter your password again"
                  />
                </label>
              )}
              {(formError || error) && (
                <p role="alert" className="text-sm text-warning">{formError || error}</p>
              )}
              {mode === 'signup' && (
                <p className="text-xs leading-5 text-text-muted">
                  Your password is used only to authenticate and is never stored in this browser.
                </p>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-forest text-white px-4 py-3 text-sm font-semibold hover:bg-forest-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest flex items-center justify-center gap-2"
              >
                {isSubmitting
                  ? mode === 'signup' ? 'Creating account…' : 'Signing in…'
                  : mode === 'signup' ? 'Create account' : 'Log in'}
                {!isSubmitting && <ArrowRight size={16} />}
              </button>
            </form>
            <p className="mt-5 text-sm text-text-secondary text-center">
              {mode === 'signup' ? 'Already have an account?' : 'New to OSCO?'}{' '}
              <button
                type="button"
                onClick={() => {
                  onSwitchMode(mode === 'signup' ? 'login' : 'signup');
                  setFormError('');
                }}
                className="font-semibold text-forest hover:underline"
              >
                {mode === 'signup' ? 'Log in' : 'Create an account'}
              </button>
            </p>
            <p className="mt-8 text-center text-xs text-text-muted">
              Are you a doctor?{' '}
              <button type="button" onClick={onOpenDoctorPortal} className="font-medium text-forest hover:underline cursor-pointer">
                Go to doctor login
              </button>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
};