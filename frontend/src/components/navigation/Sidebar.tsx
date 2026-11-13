import React from 'react';
import {
  Activity,
  Bot,
  ChevronLeft,
  ChevronRight,
  FileText,
  Files,
  History,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UploadCloud,
  User,
  X,
} from 'lucide-react';
import type { PortalType, PatientContext } from '../../types/navigation';
import { DOCTOR_NAV_ITEMS, PATIENT_NAV_ITEMS } from '../../types/navigation';

export interface SidebarProps {
  portal: PortalType;
  activeItemId: string;
  onNavigate: (itemId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  currentPatient?: PatientContext | null;
  onPatientLogout?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Activity,
  Bot,
  FileText,
  Files,
  History,
  LayoutDashboard,
  PlusCircle,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  User,
};

export const Sidebar: React.FC<SidebarProps> = ({
  portal,
  activeItemId,
  onNavigate,
  isCollapsed,
  onToggleCollapse,
  currentPatient,
  onPatientLogout,
  mobileOpen = false,
  onMobileClose,
}) => {
  const navItems = portal === 'patient' ? PATIENT_NAV_ITEMS : DOCTOR_NAV_ITEMS;
  const patientInitials =
    currentPatient?.name
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'PT';

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[#244f4d] bg-forest text-white transition-all duration-200 ${
          isCollapsed ? 'w-20' : portal === 'doctor' ? 'w-60' : 'w-72'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="h-[4.5rem] border-b border-[#244f4d] px-5 flex items-center justify-between">
          {!isCollapsed ? (
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/20 bg-forest-dark">
                <span className="font-heading text-sm font-black tracking-tighter text-citron">O·S</span>
              </div>
              <div>
                <span className="font-heading text-lg font-bold tracking-tight">OSCO</span>
                {portal === 'patient' && (
                  <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-citron">
                    AI·MED
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex w-full justify-center">
              <div className="flex h-9 w-9 items-center justify-center rounded border border-white/20 bg-forest-dark">
                <span className="font-heading text-base font-black text-citron">O</span>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onMobileClose}
            className="rounded p-1 text-[#8EA6A2] hover:text-white lg:hidden"
            aria-label="Close navigation menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Which portal this is. Patients and doctors sign in separately, so there is no switch. */}
        <div className="border-b border-[#244f4d] px-4 py-3">
          {!isCollapsed ? (
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#122F2E] px-3 py-2">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-white text-forest">
                {portal === 'patient' ? <User size={13} /> : <Stethoscope size={13} />}
              </span>
              <span className="text-xs font-semibold text-white">{portal === 'patient' ? 'Patient' : 'Doctor'}</span>
              <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-citron">Portal</span>
            </div>
          ) : (
            <div
              className="flex justify-center py-1 text-citron"
              title={portal === 'patient' ? 'Patient portal' : 'Doctor portal'}
              aria-label={portal === 'patient' ? 'Patient portal' : 'Doctor portal'}
            >
              {portal === 'patient' ? <User size={16} /> : <Stethoscope size={16} />}
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Portal navigation">
          {navItems.map((item) => {
            const Icon = ICON_MAP[item.iconName] || Activity;
            const isActive = activeItemId === item.id;
            const isDisabled = portal === 'doctor' && item.isPatientContextOnly && !currentPatient;

            return (
              <button
                key={item.id}
                type="button"
                disabled={isDisabled}
                onClick={() => onNavigate(item.id)}
                className={`group flex w-full items-center gap-3 rounded px-3 py-2.5 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-[#224E4C] font-semibold text-white'
                    : isDisabled
                      ? 'cursor-not-allowed text-[#597874] opacity-60'
                      : 'text-[#C1D4D1] hover:bg-white/5 hover:text-white'
                }`}
                title={isCollapsed ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon
                  size={18}
                  className={`shrink-0 ${isActive ? 'text-citron' : 'text-[#8EA6A2] group-hover:text-white'}`}
                />
                {!isCollapsed && <span className="truncate tracking-tight">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center justify-between border-t border-[#244f4d] p-3">
          {portal === 'patient' && (
            <>
              {!isCollapsed && (
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-eucalyptus/30 font-mono text-xs font-semibold">
                    {patientInitials}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-heading text-xs font-semibold">
                      {currentPatient?.name || 'Patient'}
                    </span>
                    <span className="truncate font-mono text-[10px] text-[#8EA6A2]">
                      {currentPatient?.id || ''}
                    </span>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={onPatientLogout}
                className="rounded p-1.5 text-[#8EA6A2] hover:bg-white/10 hover:text-white"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={15} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden rounded p-1.5 text-[#8EA6A2] hover:bg-white/10 hover:text-white lg:flex"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </aside>
    </>
  );
};
