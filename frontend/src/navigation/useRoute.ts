import { useCallback, useEffect, useState } from 'react';

/**
 * Minimal path routing (no router dependency). Routes:
 *   /                  choose patient or doctor
 *   /patient/login     /patient/signup     /patient   (portal)
 *   /doctor/login      /doctor/signup      /doctor    (portal)
 * The Vite dev server already serves index.html for these paths.
 */
export type Route =
  | { name: 'home' }
  | { name: 'auth'; role: 'patient' | 'doctor'; mode: 'login' | 'signup' }
  | { name: 'portal'; role: 'patient' | 'doctor' };

export const parseRoute = (pathname: string): Route => {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const role = parts[0];
  if (role !== 'patient' && role !== 'doctor') return { name: 'home' };
  if (parts[1] === 'login' || parts[1] === 'signup') return { name: 'auth', role, mode: parts[1] };
  return { name: 'portal', role };
};

export const pathFor = (route: Route): string =>
  route.name === 'home' ? '/' : route.name === 'auth' ? `/${route.role}/${route.mode}` : `/${route.role}`;

export const useRoute = () => {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /** Go to a route; `replace` avoids a history entry (for redirects). */
  const navigate = useCallback((next: Route, { replace = false } = {}) => {
    const path = pathFor(next);
    if (window.location.pathname !== path) {
      if (replace) window.history.replaceState(null, '', path);
      else window.history.pushState(null, '', path);
    }
    setRoute(next);
    window.scrollTo(0, 0);
  }, []);

  return { route, navigate };
};
