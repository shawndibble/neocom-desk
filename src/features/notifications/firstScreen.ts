/**
 * Whether the player has moved past the very first screen of this device's
 * very first-ever session (issue #1788) — the notification explainer's
 * eligibility must wait for this, so it never competes with the first thing a
 * new player looks at.
 *
 * Two different facts, kept apart the same way `permission.ts` keeps "has
 * this device been offered the explainer" apart from "what did the browser
 * answer":
 *
 * - **The first pathname this session** lives in `sessionStorage` — it must
 *   survive a reload within the same tab (so refreshing the first screen
 *   doesn't count as "leaving" it), but does not need to survive a new
 *   tab/session, since a route change is only one of the two ways past the
 *   gate below.
 * - **Whether this device has ever completed a session before** is the
 *   permanent, device-local half. Read once via a plain `db.settings` row
 *   rather than `useLocalSetting`'s shared store: any consumer of that shared
 *   store would see the flag flip to `true` moments after the write below
 *   resolves, which would let the very first session unblock itself the
 *   instant the write landed — defeating the point of the gate for a player
 *   who never navigates anywhere. Reading it into local, one-shot component
 *   state avoids that feedback loop.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { db } from '@/db';

export const FIRST_SCREEN_PATHNAME_KEY = 'notifications.firstScreenPathname';
export const HAS_COMPLETED_A_SESSION_KEY = 'notifications.hasCompletedASession';

export function hasLeftFirstScreen(firstPathname: string | null, pathname: string): boolean {
  return firstPathname !== null && firstPathname !== pathname;
}

/** Best-effort, matching `src/auth/session.ts`: storage can be full or blocked outright. */
function readSessionPathname(): string | null {
  try {
    return sessionStorage.getItem(FIRST_SCREEN_PATHNAME_KEY);
  } catch {
    return null;
  }
}

function writeSessionPathname(pathname: string): void {
  try {
    sessionStorage.setItem(FIRST_SCREEN_PATHNAME_KEY, pathname);
  } catch {
    // Worst case this session's guard never recorded a first pathname, so
    // every pathname reads as "already left" — the gate fails open, not
    // stuck closed, which is the safer direction for an onboarding banner.
  }
}

/** Idempotent: the first call this session wins, every later call is a no-op read. */
export function recordFirstScreenPathname(pathname: string): string {
  return readSessionPathname() ?? (writeSessionPathname(pathname), pathname);
}

export function useHasLeftFirstScreen(): boolean {
  const { pathname } = useLocation();
  const [firstPathname] = useState(() => recordFirstScreenPathname(pathname));
  const leftThisSession = hasLeftFirstScreen(firstPathname, pathname);

  const [hasCompletedASessionBefore, setHasCompletedASessionBefore] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const row = await db.settings.get(HAS_COMPLETED_A_SESSION_KEY);
      const wasCompletedBefore = row?.value === true;
      if (!cancelled) setHasCompletedASessionBefore(wasCompletedBefore);
      if (!wasCompletedBefore) {
        await db.settings.put({ key: HAS_COMPLETED_A_SESSION_KEY, value: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return hasCompletedASessionBefore || leftThisSession;
}
