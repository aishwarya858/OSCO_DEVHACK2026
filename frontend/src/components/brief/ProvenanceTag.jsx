/**
 * Small pill with a dot saying where an item came from (MVP document 6.2.4, 6.1.3).
 * kind: 'patient' | 'ai' | 'doctor' | 'doctor-entered' | 'patient-edited' | 'computed'
 */
const KINDS = {
  patient: { label: 'Patient-provided', dot: 'bg-prov-patient', light: 'bg-prov-patient/12 text-[#4A6280]', dark: 'bg-prov-patient/20 text-[#B9C8DA]' },
  ai: { label: 'AI-extracted', dot: 'bg-prov-ai', light: 'bg-prov-ai/14 text-[#5E4E97]', dark: 'bg-prov-ai/22 text-[#CFC4EC]' },
  doctor: { label: 'Doctor-verified', dot: 'bg-prov-doctor', light: 'bg-prov-doctor/14 text-[#356340]', dark: 'bg-prov-doctor/25 text-[#B8D8BE]' },
  'doctor-entered': { label: 'Doctor-entered', dot: 'bg-prov-doctor', light: 'bg-prov-doctor/14 text-[#356340]', dark: 'bg-prov-doctor/25 text-[#B8D8BE]' },
  'patient-edited': { label: 'Edited by patient', dot: 'bg-prov-patient', light: 'bg-prov-patient/12 text-[#4A6280]', dark: 'bg-prov-patient/20 text-[#B9C8DA]' },
  computed: { label: 'Computed from records', dot: 'bg-ink-muted', light: 'bg-aubergine/6 text-ink-muted', dark: 'bg-white/10 text-white/70' },
};

export function ProvenanceTag({ kind, onDark = false, className = '' }) {
  // AI-extracted is the default for document findings, so it is not labelled.
  if (kind === 'ai') return null;
  const style = KINDS[kind] ?? KINDS.computed;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 font-inter text-[10.5px] font-medium leading-4 ${onDark ? style.dark : style.light} ${className}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
      {style.label}
    </span>
  );
}
