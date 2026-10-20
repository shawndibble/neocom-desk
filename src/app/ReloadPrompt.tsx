import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { getServiceWorkerRegistration } from '@/lib/serviceWorker';
import { watchRegistration } from './updateAvailable';
import { isPublicRoute } from './routerPath';

// Checking is cheap, so check often: a build found here is applied by the next
// cold start or browser reload (see bootUpdate.ts), never by this component.
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
// A tab coming back to the foreground checks at once (timers freeze while a
// mobile PWA is backgrounded), but not more often than this, so going back and
// forth between apps doesn't fire a request each time.
const RESUME_CHECK_MIN_GAP_MS = 60 * 1000;

// React StrictMode double-invokes the useState lazy initializer that
// registerSW runs on, so onRegisteredSW can fire twice on first mount in
// dev — guard per registration so only one polling interval ever runs for it.
const pollingRegistrations = new WeakSet<ServiceWorkerRegistration>();

async function checkForUpdate(registration: ServiceWorkerRegistration) {
  try {
    if (registration.installing || !navigator.onLine) return;
    // No `fetch(swUrl, { cache: 'no-store' })` first, as vite-plugin-pwa's
    // docs sample does: `update()` already fetches sw.js past the HTTP cache
    // (the registration's default `updateViaCache: 'imports'` only lets
    // imported scripts use it, and nothing here overrides that), so the
    // pre-fetch only downloaded sw.js twice per check. Its other job — not
    // calling `update()` offline — is `navigator.onLine` above plus this
    // try/catch, which swallows the rejection `update()` gives offline.
    await registration.update();
  } catch {
    // Offline/flaky network mid-check — next interval tick retries.
  }
}

/**
 * No UI. Registers the service worker and only looks for updates: on a timer
 * and when a hidden tab comes back to the foreground. It never applies one —
 * a waiting build is swapped in on a cold start or browser reload, behind the
 * boot screen (see bootUpdate.ts), so a running tab is never reloaded and a
 * route change never triggers an update.
 */
function RegisteredReloadPrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      registrationRef.current = registration;
      watchRegistration(registration);
      if (pollingRegistrations.has(registration)) return;
      pollingRegistrations.add(registration);
      setInterval(() => void checkForUpdate(registration), UPDATE_CHECK_INTERVAL_MS);
    },
  });

  // Coming back to the tab looks for an update, since a frozen mobile PWA's
  // interval never ran.
  useEffect(() => {
    let lastCheck = Date.now();
    const onVisibilityChange = () => {
      const registration = registrationRef.current;
      if (document.hidden || !registration) return;
      if (Date.now() - lastCheck < RESUME_CHECK_MIN_GAP_MS) return;
      lastCheck = Date.now();
      void checkForUpdate(registration);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  return null;
}

/**
 * Registers the worker everywhere except a public link route (`/s/<id>`, …) the
 * visitor has not left and where no worker exists yet: registering there starts
 * a precache of the whole app, competing with the one small read the page is
 * waiting on, for someone who may never come back. Going on into the app (or
 * a worker already being there) registers it, and it stays registered after.
 */
export function ReloadPrompt() {
  const onPublicRoute = isPublicRoute(useLocation().pathname);
  const [registerNow, setRegisterNow] = useState(false);
  // Latched in render: once the visitor has been in the app, a return to a public route keeps the worker.
  if (!onPublicRoute && !registerNow) setRegisterNow(true);

  useEffect(() => {
    if (!onPublicRoute) return;
    let live = true;
    void getServiceWorkerRegistration().then((existing) => {
      if (live && existing) setRegisterNow(true);
    });
    return () => {
      live = false;
    };
  }, [onPublicRoute]);

  return registerNow || !onPublicRoute ? <RegisteredReloadPrompt /> : null;
}
