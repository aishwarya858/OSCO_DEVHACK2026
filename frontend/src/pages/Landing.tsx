import React from 'react';
import { ArrowRight, HeartPulse, Stethoscope, UserRound } from 'lucide-react';

export interface LandingProps {
  onChoose: (role: 'patient' | 'doctor', mode: 'login' | 'signup') => void;
}

const ROLES = [
  {
    role: 'patient' as const,
    title: 'Patient',
    icon: UserRound,
    text: 'Upload your medical documents, review what was found, and keep your medical history in one place.',
    card: 'bg-forest text-white',
    iconBox: 'bg-white/10 text-citron',
    muted: 'text-white/70',
    primary: 'bg-citron text-forest hover:brightness-95',
    secondary: 'border border-white/30 text-white hover:bg-white/10',
  },
  {
    role: 'doctor' as const,
    title: 'Doctor',
    icon: Stethoscope,
    text: 'With a patient’s approval, see their verified history, emergency brief and source documents.',
    card: 'bg-aubergine text-white',
    iconBox: 'bg-white/10 text-white',
    muted: 'text-white/70',
    primary: 'bg-white text-aubergine hover:bg-bone',
    secondary: 'border border-white/30 text-white hover:bg-white/10',
  },
];

/** Home page: choose whether to continue as a patient or a doctor. */
export const Landing: React.FC<LandingProps> = ({ onChoose }) => (
  <main className="min-h-screen bg-osco-bg flex items-center justify-center px-4 py-12">
    <div className="w-full max-w-4xl">
      <div className="flex items-center justify-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-forest flex items-center justify-center text-citron">
          <HeartPulse size={22} />
        </span>
        <span className="font-heading text-xl font-bold tracking-tight text-forest">OSCO</span>
      </div>
      <h1 className="mt-8 text-center font-heading text-3xl sm:text-4xl font-semibold text-forest">
        Are you logging in as a patient or a doctor?
      </h1>
      <p className="mt-3 text-center text-sm text-text-secondary">Choose your account type to log in or create an account.</p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {ROLES.map(({ role, title, icon: Icon, text, card, iconBox, muted, primary, secondary }) => (
          <section key={role} className={`rounded-2xl p-7 sm:p-8 flex flex-col shadow-sm ${card}`} aria-labelledby={`${role}-heading`}>
            <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${iconBox}`}>
              <Icon size={22} />
            </span>
            <h2 id={`${role}-heading`} className="mt-5 font-heading text-2xl font-semibold text-white">
              I’m a {title.toLowerCase()}
            </h2>
            <p className={`mt-2 text-sm leading-6 flex-1 ${muted}`}>{text}</p>
            <div className="mt-7 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onChoose(role, 'login')}
                className={`rounded-lg px-4 py-3 text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer ${primary}`}
              >
                {title} login <ArrowRight size={15} />
              </button>
              <button
                type="button"
                onClick={() => onChoose(role, 'signup')}
                className={`rounded-lg px-4 py-3 text-sm font-semibold cursor-pointer ${secondary}`}
              >
                {title} sign up
              </button>
            </div>
          </section>
        ))}
      </div>
    </div>
  </main>
);
