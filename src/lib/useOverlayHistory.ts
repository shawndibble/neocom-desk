import { useEffect, useRef } from 'react';

const OVERLAY_KEY = '__neocomOverlay';

let nextId = 0;

const openStack: string[] = [];

function ownerOf(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null) return undefined;
  const value = (state as Record<string, unknown>)[OVERLAY_KEY];
  return typeof value === 'string' ? value : undefined;
}

let activeOverlays = 0;
let restorePushState: (() => void) | null = null;
let pushingOwnEntry = false;

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

function trackOverlay(): () => void {
  activeOverlays += 1;
  if (activeOverlays === 1) {
    const original = window.history.pushState;
    window.history.pushState = function (this: History, ...args: Parameters<History['pushState']>) {
      if (!pushingOwnEntry && ownerOf(window.history.state) !== undefined && leavesPage(args[2])) {
        const idx = (window.history.state as { idx?: unknown } | null)?.idx;
        const next: unknown = args[0];
        const state =
          typeof idx === 'number' && typeof next === 'object' && next !== null
            ? { ...next, idx }
            : next;
        return window.history.replaceState(state, args[1], args[2]);
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

export function useOverlayHistory(open: boolean, onClose: () => void, enabled = true): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const idRef = useRef<string | null>(null);
  const liveRef = useRef(false);

  const active = open && enabled;
  useEffect(() => {
    if (!active) return;
    const id = (idRef.current ??= `overlay-${(nextId += 1)}`);
    liveRef.current = true;
    openStack.push(id);
    if (ownerOf(window.history.state) !== id) {
      pushOwnEntry(id);
    }
    const release = trackOverlay();

    let popped = false;
    const onPop = () => {
      if (openStack[openStack.length - 1] !== id) return;
      if (ownerOf(window.history.state) === id) return;
      popped = true;
      onCloseRef.current();
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
      const at = openStack.lastIndexOf(id);
      if (at !== -1) openStack.splice(at, 1);
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
