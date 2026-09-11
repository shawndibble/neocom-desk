import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
// A tab must stay hidden this long before a waiting update applies — a
// short grace period so a quick tab-peek mid-edit doesn't get its unsaved
// state wiped the instant the tab is switched away from.
const HIDDEN_APPLY_GRACE_MS = 30 * 1000;
// Coarse cadence for re-checking the hidden threshold above — not itself a
// threshold.
const APPLY_CHECK_POLL_MS = 15 * 1000;

// Long enough for the opacity transition below to visibly finish before
// navigating away; short enough that it doesn't feel like a delay.
const COVER_FADE_MS = 150;

// React StrictMode double-invokes the useState lazy initializer that
// registerSW runs on, so onRegisteredSW can fire twice on first mount in
// dev — guard per registration so only one polling interval ever runs for it.
const pollingRegistrations = new WeakSet<ServiceWorkerRegistration>();

// vite-plugin-pwa's default reload (no onNeedReload override) is an
// immediate window.location.reload() the instant the new SW takes control —
// that yanks the rendered app away mid-frame. This is the fallback for
// browsers without cross-document View Transitions support (see the
// `@view-transition` rule in src/styles/index.css, which lets supporting
// browsers cross-fade the whole reload natively and makes this overlay a
// no-op there — the browser paints its own transition over it). Here, a
// fade to the app's own background — rather than an instant cut — turns the
// reload into a soft dissolve instead of a flicker.
function coverViewportAndReload() {
  const overlay = document.createElement('div');
  overlay.setAttribute('data-pwa-update-overlay', '');
  // bg-bg (Tailwind's generated utility for --color-bg, src/styles/index.css)
  // rather than a hardcoded hex — ties the cover color to the design token
  // directly instead of a JS literal that could silently drift from it.
  overlay.className = 'bg-bg';
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    opacity: prefersReducedMotion ? '1' : '0',
    transition: `opacity ${COVER_FADE_MS}ms ease-out`,
  });
  document.body.appendChild(overlay);
  if (prefersReducedMotion) {
    window.location.reload();
    return;
  }
  // Two frames: the first commits the initial opacity:0 so the browser has
  // something to transition *from*; flipping to 1 in the same frame it was
  // added would let the browser coalesce both styles and skip the fade.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
  });
  setTimeout(() => window.location.reload(), COVER_FADE_MS);
}

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
 * grace period, or — for a tab that stays visible — the next time the user
 * navigates to a different in-app route. A tab that's visible and on the
 * same route is never reloaded mid-use, however long it sits idle; the
 * reload rides along with a transition the user already expects, rather
 * than firing at an arbitrary idle timeout while they're reading the
 * current page. Whenever a reload does fire, it goes through
 * coverViewportAndReload rather than the library's default instant reload,
 * so it reads as a solid-color swap instead of a flicker. A manual reload
 * by the user is also treated as consent to apply immediately (see the
 * beforeunload handler below).
 */
export function ReloadPrompt() {
  const hiddenSinceRef = useRef(0);
  const isFirstRouteRef = useRef(true);
  const { pathname } = useLocation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration || pollingRegistrations.has(registration)) return;
      pollingRegistrations.add(registration);
      setInterval(() => void checkForUpdate(swUrl, registration), UPDATE_CHECK_INTERVAL_MS);
    },
    onNeedReload: coverViewportAndReload,
  });

  // Mobile OSes freeze a backgrounded PWA's timers entirely, so the polling
  // tick below never runs while the tab is hidden — it only resumes once the
  // tab is visible again. Mirrored in refs so the resume check (mount-once
  // effect, below) always reads the latest values.
  const needRefreshRef = useRef(needRefresh);
  const updateServiceWorkerRef = useRef(updateServiceWorker);
  useEffect(() => {
    needRefreshRef.current = needRefresh;
    updateServiceWorkerRef.current = updateServiceWorker;
  }, [needRefresh, updateServiceWorker]);

  // A manual reload is the user's own navigation, not one we trigger — so it
  // can never flicker on our account. Treat it as consent: fire skip-waiting
  // best-effort so the in-flight reload has a chance to pick up the new SW
  // instead of re-serving the stale cached bundle it would otherwise. Not
  // guaranteed to win the race with the browser's own re-fetch, but it costs
  // nothing to try and needs no extra reload of its own.
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (needRefreshRef.current) void updateServiceWorkerRef.current();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Tracks tab visibility — independent of whether an update is waiting, so
  // the hidden clock is already running by the time one shows up.
  useEffect(() => {
    const trackVisibility = () => {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
        return;
      }
      // Coming back visible: judge the grace period by wall-clock time right
      // here, rather than waiting for the polling tick to notice — on a
      // frozen-while-backgrounded tab that tick may not run again until well
      // after resume, and by then trackVisibility will already have cleared
      // hiddenSinceRef below, silently skipping the hidden-apply path.
      const hiddenSince = hiddenSinceRef.current;
      hiddenSinceRef.current = 0;
      if (
        hiddenSince &&
        needRefreshRef.current &&
        Date.now() - hiddenSince >= HIDDEN_APPLY_GRACE_MS
      ) {
        void updateServiceWorkerRef.current();
      }
    };
    trackVisibility();
    document.addEventListener('visibilitychange', trackVisibility);
    return () => document.removeEventListener('visibilitychange', trackVisibility);
  }, []);

  useEffect(() => {
    if (!needRefresh) return;

    // Re-checked every tick rather than latched — if a prior call didn't
    // actually trigger a reload (SKIP_WAITING lost, controllerchange never
    // fired), the next tick just tries again. Hidden-tab apply only: a
    // visible tab instead waits for the route-change effect below, so it's
    // never reloaded out from under someone mid-page.
    const tick = () => {
      const hiddenSince = hiddenSinceRef.current;
      if (hiddenSince && Date.now() - hiddenSince >= HIDDEN_APPLY_GRACE_MS) {
        void updateServiceWorker();
      }
    };

    const id = window.setInterval(tick, APPLY_CHECK_POLL_MS);
    return () => window.clearInterval(id);
  }, [needRefresh, updateServiceWorker]);

  // A visible tab only ever reloads here: on the next in-app route change,
  // never at an arbitrary idle timeout while the current page is still
  // being read. Skips the first render (mounting isn't "navigating to
  // another page") and, technically, could double-fire with the hidden-tab
  // path if a route change lands right as the grace period elapses — a
  // second, no-op updateServiceWorker call in that case, not a second
  // reload.
  useEffect(() => {
    if (isFirstRouteRef.current) {
      isFirstRouteRef.current = false;
      return;
    }
    if (needRefreshRef.current) void updateServiceWorkerRef.current();
  }, [pathname]);

  return null;
}
