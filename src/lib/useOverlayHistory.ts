import { useEffect, useRef } from 'react';

/** The `history.state` key that marks an entry as an open overlay's own. */
const OVERLAY_KEY = '__neocomOverlay';

let nextId = 0;

function ownerOf(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null) return undefined;
  const value = (state as Record<string, unknown>)[OVERLAY_KEY];
  return typeof value === 'string' ? value : undefined;
}

let activeOverlays = 0;
let restorePushState: (() => void) | null = null;
let pushingOwnEntry = false;

/** Whether a pushState target is a different pathname from the current page. */
function leavesPage(url: string | URL | null | undefined): boolean {
  if (url === null || url === undefined) return false;
  try {
    return new URL(String(url), window.location.href).pathname !== window.location.pathname;
  } catch {
    return false;
  }
}

function pushOwnEntry(id: string): void {
  const base: unknown = window.history.state;
  const carried = typeof base === 'object' && base !== null ? base : {};
  pushingOwnEntry = true;
  try {
    window.history.pushState({ ...carried, [OVERLAY_KEY]: id }, '');
  } finally {
    pushingOwnEntry = false;
  }
}

/**
 * While any overlay is open, a navigation that starts from inside it (the
 * router's `pushState`, from a `Link` or `navigate()`) *replaces* the
 * overlay's entry instead of stacking on top of it. Back from the new page
 * then goes to the page that was under the overlay, as people expect, and no
 * dead same-URL step is left behind. Only a push that changes the *pathname*
 * (the user is leaving the page) while an overlay's entry is current is
 * converted. A search-param or hash push (an entity link's `?info=`, a modal
 * writing its own param) stays a real push, so Back closes just that layer and
 * the overlay's entry survives beneath it.
 */
function trackOverlay(): () => void {
  activeOverlays += 1;
  if (activeOverlays === 1) {
    const original = window.history.pushState;
    window.history.pushState = function (this: History, ...args: Parameters<History['pushState']>) {
      if (!pushingOwnEntry && ownerOf(window.history.state) !== undefined && leavesPage(args[2])) {
        return window.history.replaceState(...args);
      }
      return original.apply(this, args);
    };
    restorePushState = () => {
      window.history.pushState = original;
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeOverlays -= 1;
    if (activeOverlays === 0) {
      restorePushState?.();
      restorePushState = null;
    }
  };
}

/**
 * Back closes the top overlay (docs/DESIGN.md §6c, "Touch and hold").
 *
 * While `open`, one history entry marked with this overlay's id sits on the
 * stack, at the same URL as the page. Back pops it, and `onClose` runs. Any
 * other close (✕, Escape, scrim, a parent unmounting it) removes the entry
 * again with `history.back()`, so closing never leaves a dud entry to press
 * Back through. Stacked overlays each own an entry, so Back peels them one at
 * a time. If `onClose` declines (the overlay is still open a tick later), the
 * entry is pushed again so the next Back still lands on it.
 *
 * Talks to `window.history` directly rather than through the router, so a
 * `Modal` still works under a test that renders it without one. The existing
 * state is copied into the new entry, which keeps React Router's own
 * `key`/`idx` bookkeeping intact when Back lands on the entry beneath.
 *
 * Navigating from inside the overlay (a link in the More sheet, a palette
 * result) replaces its entry rather than pushing past it (`trackOverlay`), so
 * the page change adds no history step and Back returns to the page the
 * overlay was opened over.
 *
 * `enabled: false` opts out, for an overlay that is already backed by a URL
 * (`PublicInfoModal` and `SkillDetailModal` use the `info` search param), so
 * Back would otherwise be pushed twice.
 */
export function useOverlayHistory(open: boolean, onClose: () => void, enabled = true): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // Survives React StrictMode's mount/unmount/mount, which would otherwise
  // push, pop and push again.
  const idRef = useRef<string | null>(null);
  const liveRef = useRef(false);

  const active = open && enabled;
  useEffect(() => {
    if (!active) return;
    const id = (idRef.current ??= `overlay-${(nextId += 1)}`);
    liveRef.current = true;
    if (ownerOf(window.history.state) !== id) {
      pushOwnEntry(id);
    }
    const release = trackOverlay();

    let popped = false;
    const onPop = () => {
      // Our entry is gone from under the user: they pressed Back.
      if (ownerOf(window.history.state) === id) return;
      popped = true;
      onCloseRef.current();
      // `onClose` may decline (a sheet asking "discard changes?" stays open).
      // Then the user is still looking at the overlay with its entry gone, so
      // put it back — unless another overlay has pushed its own on top.
      setTimeout(() => {
        if (!liveRef.current || ownerOf(window.history.state) !== undefined) return;
        popped = false;
        pushOwnEntry(id);
      }, 0);
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      release();
      liveRef.current = false;
      // Deferred a tick so a StrictMode remount (which re-runs this effect
      // straight away and finds our entry still on top) cancels the removal.
      setTimeout(() => {
        if (liveRef.current) return;
        const stale = idRef.current;
        idRef.current = null;
        if (!popped && stale !== null && ownerOf(window.history.state) === stale) {
          window.history.back();
        }
      }, 0);
    };
  }, [active]);
}
