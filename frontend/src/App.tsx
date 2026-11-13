import { useCallback, useEffect, useState } from 'react';
import type { PortalType, PatientContext } from './types/navigation';
import { PATIENT_NAV_ITEMS, DOCTOR_NAV_ITEMS } from './types/navigation';
import { AppLayout } from './components/layout/AppLayout';
import { PatientPortalLayout } from './components/layout/PatientPortalLayout';
import { DoctorPortalLayout } from './components/layout/DoctorPortalLayout';
import { PatientAuth } from './pages/patient/PatientAuth';
import { DoctorAuth } from './pages/doctor/DoctorLogin';
import { Landing } from './pages/Landing';
import { AdminLogin } from './pages/admin/AdminLogin';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { BackendStatusIndicator } from './components/ui/BackendStatusIndicator';
import { clearAuthToken, getAuthToken, saveAuthToken, type PatientAccount } from './auth/patientStorage';
import { getDoctorToken } from './auth/doctorSession';
import { clearAdminSession, getAdminProfile, getAdminToken, type AdminProfile } from './auth/adminSession';
import { ADMIN_SIGNED_OUT_EVENT } from './api/adminApi.js';
import { getPatientProfile, loginPatient, registerPatient } from './api/queries.js';
import { pathFor, useRoute, type Route } from './navigation/useRoute';

/**
 * Where the visitor actually ends up: a portal needs the matching login, so
 * without one the visitor sees that role's login form. Login and sign-up
 * pages always show their form, even with a saved session; signing in there
 * replaces the earlier session.
 */
const resolveRoute = (
  route: Route,
  session: { patientSignedIn: boolean; patientChecking: boolean; doctorSignedIn: boolean; adminSignedIn: boolean },
): Route => {
  if (route.name === 'portal' && route.role === 'patient' && !session.patientSignedIn && !session.patientChecking) {
    return { name: 'auth', role: 'patient', mode: 'login' };
  }
  if (route.name === 'portal' && route.role === 'doctor' && !session.doctorSignedIn) return { name: 'auth', role: 'doctor', mode: 'login' };
  if (route.name === 'portal' && route.role === 'admin' && !session.adminSignedIn) return { name: 'auth', role: 'admin', mode: 'login' };
  return route;
};

export function App() {
  const { route, navigate } = useRoute();
  const [patientItemId, setPatientItemId] = useState('dashboard');
  const [doctorItemId, setDoctorItemId] = useState('patient-records');
  const [currentPatient, setCurrentPatient] = useState<PatientContext | null>(null);
  const [patientAccount, setPatientAccount] = useState<PatientAccount | null>(null);
  const [authReady, setAuthReady] = useState(() => !getAuthToken());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [doctorSignedIn, setDoctorSignedIn] = useState(() => Boolean(getDoctorToken()));
  const [doctorNotice, setDoctorNotice] = useState('');
  const [admin, setAdmin] = useState<AdminProfile | null>(() => (getAdminToken() ? getAdminProfile() : null));
  const [adminNotice, setAdminNotice] = useState('');

  // The server rejected the saved admin login (expired or removed): back to the admin login.
  useEffect(() => {
    const onExpired = () => {
      setAdmin(null);
      setAdminNotice('Your session has ended. Please sign in again.');
    };
    window.addEventListener(ADMIN_SIGNED_OUT_EVENT, onExpired);
    return () => window.removeEventListener(ADMIN_SIGNED_OUT_EVENT, onExpired);
  }, []);

  // Restore a saved patient login.
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return undefined;

    let active = true;
    getPatientProfile(token)
      .then(({ data }) => {
        if (active) setPatientAccount(data.patient);
      })
      .catch(() => {
        if (active) {
          clearAuthToken();
          setPatientAccount(null);
        }
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const view = resolveRoute(route, {
    patientSignedIn: Boolean(patientAccount),
    patientChecking: !authReady,
    doctorSignedIn,
    adminSignedIn: Boolean(admin),
  });

  // Keep the address bar in step with a redirect (no new history entry).
  const viewPath = pathFor(view);
  useEffect(() => {
    if (window.location.pathname !== viewPath) window.history.replaceState(null, '', viewPath);
  }, [viewPath]);

  const handlePatientAuth = async (
    action: () => Promise<{ data: { token: string; patient: PatientAccount } }>,
  ) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      setAuthError('');
      const { data } = await action();
      saveAuthToken(data.token);
      setPatientAccount(data.patient);
      setPatientItemId('dashboard');
      navigate({ name: 'portal', role: 'patient' }, { replace: true });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to authenticate. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const exitDoctorPatient = useCallback(() => {
    setCurrentPatient(null);
    setDoctorItemId('patient-records');
  }, []);

  const handleDoctorSignedOut = useCallback((notice?: string) => {
    setDoctorSignedIn(false);
    setDoctorNotice(notice ?? '');
    setCurrentPatient(null);
    setDoctorItemId('patient-records');
    navigate({ name: 'auth', role: 'doctor', mode: 'login' }, { replace: true });
  }, [navigate]);

  const goToAuth = (role: 'patient' | 'doctor', mode: 'login' | 'signup' = 'login') => {
    setAuthError('');
    navigate({ name: 'auth', role, mode });
  };

  if (view.name === 'home') {
    return (
      <>
        <BackendStatusIndicator />
        <Landing onChoose={goToAuth} onOpenAdmin={() => navigate({ name: 'auth', role: 'admin', mode: 'login' })} />
      </>
    );
  }

  if (view.name === 'auth' && view.role === 'admin') {
    return (
      <>
        <BackendStatusIndicator />
        <AdminLogin
          notice={adminNotice}
          onBack={() => navigate({ name: 'home' })}
          onLoggedIn={(profile) => {
            setAdminNotice('');
            setAdmin(profile);
            navigate({ name: 'portal', role: 'admin' }, { replace: true });
          }}
        />
      </>
    );
  }

  if (view.name === 'portal' && view.role === 'admin' && admin) {
    return (
      <>
        <BackendStatusIndicator />
        <AdminDashboard
          admin={admin}
          onSignOut={() => {
            clearAdminSession();
            setAdmin(null);
            navigate({ name: 'home' });
          }}
        />
      </>
    );
  }

  if (view.name === 'portal' && view.role === 'patient' && !authReady) {
    return (
      <>
        <BackendStatusIndicator />
        <main className="min-h-screen flex items-center justify-center bg-osco-bg text-sm text-text-secondary">
          Checking your patient session…
        </main>
      </>
    );
  }

  if (view.name === 'auth' && view.role === 'patient') {
    return (
      <>
        <BackendStatusIndicator />
        <PatientAuth
          mode={view.mode}
          onSwitchMode={(mode) => goToAuth('patient', mode)}
          onBack={() => navigate({ name: 'home' })}
          onRegister={(name, email, password) =>
            handlePatientAuth(() => registerPatient({ name, email, password }))
          }
          onLogin={(email, password) => handlePatientAuth(() => loginPatient({ email, password }))}
          onOpenDoctorPortal={() => goToAuth('doctor')}
          error={authError}
          isSubmitting={isSubmitting}
        />
      </>
    );
  }

  if (view.name === 'auth' && view.role === 'doctor') {
    return (
      <>
        <BackendStatusIndicator />
        <DoctorAuth
          key={view.mode}
          mode={view.mode}
          notice={doctorNotice}
          onSwitchMode={(mode) => goToAuth('doctor', mode)}
          onBack={() => navigate({ name: 'home' })}
          onOpenPatient={() => goToAuth('patient')}
          onLoggedIn={() => {
            setDoctorNotice('');
            setDoctorSignedIn(true);
            setCurrentPatient(null);
            setDoctorItemId('patient-records');
            navigate({ name: 'portal', role: 'doctor' }, { replace: true });
          }}
        />
      </>
    );
  }

  // Admin pages are handled above (a signed-out admin is sent to the admin login).
  if (view.role === 'admin') return null;
  const portal: PortalType = view.role;
  const activeItemId = portal === 'patient' ? patientItemId : doctorItemId;
  const setActiveItemId = portal === 'patient' ? setPatientItemId : setDoctorItemId;

  const currentNavItems = portal === 'patient' ? PATIENT_NAV_ITEMS : DOCTOR_NAV_ITEMS;
  const activeNavObj = currentNavItems.find((item) => item.id === activeItemId);
  const activeSectionTitle = activeNavObj?.label || 'Workspace';

  return (
    <>
      <BackendStatusIndicator />
      <AppLayout
        portal={portal}
        activeItemId={activeItemId}
        onNavigate={(id) => {
          setActiveItemId(id);
        }}
        activeSectionTitle={activeSectionTitle}
        currentPatient={
          portal === 'patient' && patientAccount
            ? {
                id: patientAccount.id,
                name: patientAccount.name,
                age: 0,
                gender: '',
                mrn: '',
                dob: '',
                primaryCondition: '',
                status: 'needs_review',
                confidence: 0,
                lastUpdated: patientAccount.createdAt,
              }
            : portal === 'doctor'
              ? currentPatient
              : null
        }
        onPatientLogout={() => {
          clearAuthToken();
          setPatientAccount(null);
          setCurrentPatient(null);
          setPatientItemId('dashboard');
          navigate({ name: 'home' });
        }}
      >
        {portal === 'patient' && patientAccount ? (
          <PatientPortalLayout
            activeItemId={activeItemId}
            onNavigate={(id) => setPatientItemId(id)}
            key={patientAccount.id}
            patient={{ id: patientAccount.id, name: patientAccount.name, publicId: patientAccount.publicId }}
          />
        ) : (
          <DoctorPortalLayout
            key={currentPatient?.id ?? 'identify'}
            currentPatient={currentPatient}
            onSelectPatient={(pt) => {
              setCurrentPatient(pt);
              setDoctorItemId('emergency-brief');
            }}
            onExitPatient={exitDoctorPatient}
            onSignedOut={handleDoctorSignedOut}
            activeNavItemId={activeItemId}
            onNavigate={(id) => setDoctorItemId(id)}
          />
        )}
      </AppLayout>
    </>
  );
}

export default App;
