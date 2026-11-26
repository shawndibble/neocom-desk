import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

export const LANDING_SHELL_ID = 'landing-shell';

export const LANDING_SHELL_ATTR = 'data-landing-shell';

export const LANDING_SHELL_SHOWN_ATTR = 'data-landing-shell-shown';

export const LANDING_SHELL_BACKSTOP_MS = 10_000;

const LANDING_PATHS = new Set(['/', '/login']);

export function releaseLandingShell(): void {
  document.documentElement.removeAttribute(LANDING_SHELL_ATTR);
  document.getElementById(LANDING_SHELL_ID)?.remove();
}

export function LandingShellOffLandingRelease(): null {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    if (!LANDING_PATHS.has(pathname)) releaseLandingShell();
  }, [pathname]);
  return null;
}
