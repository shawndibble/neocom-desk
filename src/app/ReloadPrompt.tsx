import { MINUTE_MS } from '@/lib/age';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { getServiceWorkerRegistration } from '@/lib/serviceWorker';
import { pollForUpdate, watchRegistration } from './updateAvailable';
import { isPublicRoute } from './routerPath';

const UPDATE_CHECK_INTERVAL_MS = 5 * MINUTE_MS;
const RESUME_CHECK_MIN_GAP_MS = MINUTE_MS;

const pollingRegistrations = new WeakSet<ServiceWorkerRegistration>();

async function checkForUpdate(registration: ServiceWorkerRegistration) {
  try {
    if (registration.installing || !navigator.onLine) return;
    await pollForUpdate(registration);
  } catch {}
}

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

export function ReloadPrompt() {
  const onPublicRoute = isPublicRoute(useLocation().pathname);
  const [registerNow, setRegisterNow] = useState(false);
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
