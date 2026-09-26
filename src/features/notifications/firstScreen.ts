/**
 * Whether the player has moved past the very first screen of this browser
 * session (issue #1788) — the notification explainer's eligibility must wait
 * for this, so it never competes with the first thing a new player looks at.
 *
 * The first pathname seen is kept in `sessionStorage` rather than the
 * device-local settings store: it needs to survive a reload within the same
 * tab (so refreshing the first screen doesn't count as "leaving" it) but
 * deliberately does *not* survive a new tab/session — that gives a returning
 * player a fresh, unblocked first screen too, rather than being stuck forever
 * on whatever pathname happened to load first the very first time.
 */
import { useState } from 'react';
import { useLocation } from 'react-router-dom';

export const FIRST_SCREEN_PATHNAME_KEY = 'notifications.firstScreenPathname';

export function hasLeftFirstScreen(firstPathname: string | null, pathname: string): boolean {
  return firstPathname !== null && firstPathname !== pathname;
}

/** Idempotent: the first call this session wins, every later call is a no-op read. */
export function recordFirstScreenPathname(pathname: string): string {
  if (typeof sessionStorage === 'undefined') return pathname;
  const existing = sessionStorage.getItem(FIRST_SCREEN_PATHNAME_KEY);
  if (existing !== null) return existing;
  sessionStorage.setItem(FIRST_SCREEN_PATHNAME_KEY, pathname);
  return pathname;
}

export function useHasLeftFirstScreen(): boolean {
  const { pathname } = useLocation();
  const [firstPathname] = useState(() => recordFirstScreenPathname(pathname));
  return hasLeftFirstScreen(firstPathname, pathname);
}
