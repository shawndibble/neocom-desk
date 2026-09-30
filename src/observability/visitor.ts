import { SIGNED_IN_SHELL_HINT_KEY } from '@/app/signedInShellHint';

/**
 * Whether this browser has opened the app before, for Sentry tags — so a
 * flagged trace (an "N+1 API Call" fan-out on an empty cache, say) can be read
 * as a first visit or a returning one.
 *
 * Device-local and anonymous: a timestamp in localStorage, never a Character
 * or account. Reported only as a coarse age bucket.
 */
export const FIRST_SEEN_KEY = 'neocom:first-seen';

/**
 * Set in sessionStorage alongside a fresh stamp, so the rest of that first
 * session still reads `new` — the EVE SSO round trip lands back on `/callback`
 * as a second page load, and that is exactly the load a first sign-in fans
 * out from. sessionStorage survives same-tab navigation and ends with the tab.
 */
export const FIRST_SESSION_KEY = 'neocom:first-session';

/**
 * Prefix for a stamp written on a browser that was already signed in when the
 * stamp shipped: its real first visit is unknown, and must stay so.
 */
const LEGACY_PREFIX = 'legacy:';

const DAY_MS = 86_400_000;

export interface VisitorTags {
  visitor: 'new' | 'returning' | 'unknown';
  'visitor.age_days': '0' | '1-7' | '8-30' | '30+' | 'unknown';
}

/**
 * Reads (and on a first visit, writes) the stamp. Never throws: the stores are
 * getters because merely touching web storage throws where it is blocked.
 *
 * An existing user who is signed out when this first runs has no Character
 * hint to go on, and is counted `new`.
 */
export function visitorTags(
  local: () => Storage,
  session: () => Storage,
  now: number
): VisitorTags {
  try {
    const store = local();
    const stamp = store.getItem(FIRST_SEEN_KEY);
    if (stamp !== null) {
      const visitor = inFirstSession(session) ? 'new' : 'returning';
      return { visitor, 'visitor.age_days': ageBucket(stamp, now) };
    }
    const signedInBefore = store.getItem(SIGNED_IN_SHELL_HINT_KEY) === '1';
    store.setItem(FIRST_SEEN_KEY, signedInBefore ? `${LEGACY_PREFIX}${now}` : String(now));
    if (signedInBefore) return { visitor: 'returning', 'visitor.age_days': 'unknown' };
    markFirstSession(session);
    return { visitor: 'new', 'visitor.age_days': '0' };
  } catch {
    return { visitor: 'unknown', 'visitor.age_days': 'unknown' };
  }
}

function ageBucket(stamp: string, now: number): VisitorTags['visitor.age_days'] {
  const firstSeen = Number(stamp);
  if (!Number.isFinite(firstSeen)) return 'unknown';
  const days = Math.floor((now - firstSeen) / DAY_MS);
  if (days < 1) return '0';
  if (days <= 7) return '1-7';
  if (days <= 30) return '8-30';
  return '30+';
}

function inFirstSession(session: () => Storage): boolean {
  try {
    return session().getItem(FIRST_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markFirstSession(session: () => Storage): void {
  try {
    session().setItem(FIRST_SESSION_KEY, '1');
  } catch {
    // Blocked: later loads in this session read `returning`, age `0`.
  }
}
