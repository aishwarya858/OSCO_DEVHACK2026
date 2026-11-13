import React, { useState } from 'react';
import type { PortalType, PatientContext } from '../../types/navigation';
import { Sidebar } from '../navigation/Sidebar';
import { Topbar } from '../navigation/Topbar';

export interface AppLayoutProps {
  portal: PortalType;
  activeItemId: string;
  onNavigate: (itemId: string) => void;
  activeSectionTitle: string;
  currentPatient?: PatientContext | null;
  onPatientLogout?: () => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  portal,
  activeItemId,
  onNavigate,
  activeSectionTitle,
  currentPatient,
  onPatientLogout,
  children,
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-osco-bg text-text-main flex flex-col antialiased">
      {/* Sidebar */}
      <Sidebar
        portal={portal}
        activeItemId={activeItemId}
        onNavigate={(id) => {
          onNavigate(id);
          setIsMobileSidebarOpen(false);
        }}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        currentPatient={currentPatient}
        onPatientLogout={onPatientLogout}
        mobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-200 ease-in-out ${
          isSidebarCollapsed ? 'lg:pl-20' : portal === 'doctor' ? 'lg:pl-60' : 'lg:pl-72'
        }`}
      >
        {/* Topbar */}
        <Topbar
          portal={portal}
          activeSectionTitle={activeSectionTitle}
          onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
        />

        {/* Content Body with Generous & Controlled Whitespace */}
        <main
          className={`flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 ${
            portal === 'doctor' ? 'doctor-interface bg-[#F3F1EA]' : ''
          }`}
        >
          {portal === 'doctor' && currentPatient?.id.startsWith('pt-') && (
            <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.16em] text-warning">
              Fictional demo record
            </p>
          )}
          {children}
        </main>

        {/* Minimal Editorial Footer */}
        {portal === 'patient' && (
          <footer className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 border-t border-border-subtle/80 flex items-center justify-between text-xs text-text-secondary gap-2">
            <div className="flex items-center gap-2">
              <span className="font-heading font-semibold text-text-main">OSCO</span>
              <span className="text-[11px] text-text-muted">Patient portal demo</span>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
};
