import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { currentRouterPathname, isOnRoute } from './routerPath';

// Checking is cheap and applying is not, so check often — a build is already
// waiting by the time the user next changes page — and apply only on that page
// change (see the route effect below).
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
// A tab coming back to the foreground checks at once (timers freeze while a
// mobile PWA is backgrounded), but not more often than this, so going back and
// forth between apps doesn't fire a request each time.
const RESUME_CHECK_MIN_GAP_MS = 60 * 1000;
// sw.js is checked on every load, so an update found this soon after load is
// a reload or cold start finding a fresh build: apply it at once. Kept short
// so a slow check never wipes input the user has already started typing.
const BOOT_APPLY_WINDOW_MS = 15 * 1000;

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
 * No UI. Applies an update found right after load (see BOOT_APPLY_WINDOW_MS)
 * at once. Also polls the registration for updates, then applies a waiting
 * update silently instead of prompting: the next time the user navigates to a
 * different in-app route, and only then. A tab is never reloaded while it sits
 * on one page — idle, hidden, or switched away to another app and back — so a
 * page that polls for data (the Survey) stays put; the reload rides along with
 * a transition the user already expects. Whenever a reload does fire, it goes through
 * coverViewportAndReload rather than the library's default instant reload,
 * so it reads as a solid-color swap instead of a flicker. A manual reload
 * by the user is also treated as consent to apply immediately (see the
 * beforeunload handler below).
 */
export function ReloadPrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const isFirstRouteRef = useRef(true);
  const { pathname } = useLocation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      registrationRef.current = registration;
      if (pollingRegistrations.has(registration)) return;
      pollingRegistrations.add(registration);
      setInterval(() => void checkForUpdate(registration), UPDATE_CHECK_INTERVAL_MS);
    },
    onNeedReload: coverViewportAndReload,
    // Fires on the false-to-true flip, including an update already waiting at load.
    onNeedRefresh() {
      // Not on /callback: a reload there replays the OAuth code, already spent.
      if (isOnRoute(currentRouterPathname(), '/callback')) return;
      if (performance.now() < BOOT_APPLY_WINDOW_MS) void updateServiceWorkerRef.current();
    },
  });

  // The latest values for the mount-once effects below.
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

  // Coming back to the tab looks for an update (it only looks — applying waits
  // for a page change), since a frozen mobile PWA's interval never ran.
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

  // The only place a running tab reloads for an update: the next in-app route
  // change, never an idle or hidden timeout while the page is still in use.
  // Skips the first render (mounting isn't "navigating to another page").
  useEffect(() => {
    if (isFirstRouteRef.current) {
      isFirstRouteRef.current = false;
      return;
    }
    if (needRefreshRef.current) void updateServiceWorkerRef.current();
  }, [pathname]);

  return null;
}
