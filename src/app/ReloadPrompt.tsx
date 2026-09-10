import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
// A tab must stay hidden this long before a waiting update applies — a
// short grace period so a quick tab-peek mid-edit doesn't get its unsaved
// state wiped the instant the tab is switched away from.
const HIDDEN_APPLY_GRACE_MS = 30 * 1000;
// Fallback for a tab that's visible but genuinely untouched for a long
// while (e.g. a dashboard left open) — long enough that "no input" can't
// plausibly mean "reading/thinking mid-edit."
const VISIBLE_IDLE_APPLY_THRESHOLD_MS = 30 * 60 * 1000;
// Coarse cadence for checking the two thresholds above — not itself a
// threshold.
const APPLY_CHECK_POLL_MS = 15 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

// React StrictMode double-invokes the useState lazy initializer that
// registerSW runs on, so onRegisteredSW can fire twice on first mount in
// dev — guard per registration so only one polling interval ever runs for it.
const pollingRegistrations = new WeakSet<ServiceWorkerRegistration>();

async function checkForUpdate(swUrl: string, registration: ServiceWorkerRegistration) {
  try {
    if (registration.installing || !navigator.onLine) return;
    // Bypass HTTP cache so a stale sw.js (cached by the browser or a proxy)
    // doesn't mask a real update — same pattern vite-plugin-pwa docs
    // recommend for robust periodic checks.
    const resp = await fetch(swUrl, {
      cache: 'no-store',
      headers: { cache: 'no-store', 'cache-control': 'no-cache' },
    });
    if (resp.ok) await registration.update();
  } catch {
    // Offline/flaky network mid-check — next interval tick retries.
  }
}

/**
 * No UI. Polls the registration for updates, then applies a waiting update
 * silently instead of prompting: once the tab has been hidden for a short
 * grace period, or — for a tab that stays visible but goes untouched a long
 * while — once it's been idle that long. A tab that's visible and in recent
 * use is never reloaded, so it can't interrupt in-progress work.
 */
export function ReloadPrompt() {
  const lastActivityRef = useRef(0);
  const hiddenSinceRef = useRef(0);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration || pollingRegistrations.has(registration)) return;
      pollingRegistrations.add(registration);
      setInterval(() => void checkForUpdate(swUrl, registration), UPDATE_CHECK_INTERVAL_MS);
    },
  });

  // Tracks user activity and tab visibility — independent of whether an
  // update is waiting, so the idle/hidden clocks are already running by the
  // time one shows up.
  useEffect(() => {
    const markActive = () => {
      lastActivityRef.current = Date.now();
    };
    const trackVisibility = () => {
      hiddenSinceRef.current = document.hidden ? Date.now() : 0;
    };
    markActive();
    trackVisibility();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, markActive, { passive: true }));
    document.addEventListener('visibilitychange', trackVisibility);
    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActive));
      document.removeEventListener('visibilitychange', trackVisibility);
    };
  }, []);

  useEffect(() => {
    if (!needRefresh) return;

    // Re-checked every tick rather than latched — if a prior call didn't
    // actually trigger a reload (SKIP_WAITING lost, controllerchange never
    // fired), the next tick just tries again.
    const tick = () => {
      const hiddenSince = hiddenSinceRef.current;
      const since = hiddenSince || lastActivityRef.current;
      const threshold = hiddenSince ? HIDDEN_APPLY_GRACE_MS : VISIBLE_IDLE_APPLY_THRESHOLD_MS;
      if (Date.now() - since >= threshold) void updateServiceWorker(true);
    };

    const id = window.setInterval(tick, APPLY_CHECK_POLL_MS);
    return () => window.clearInterval(id);
  }, [needRefresh, updateServiceWorker]);

  return null;
}
