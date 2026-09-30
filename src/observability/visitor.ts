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
 * Reads (and on a first visit, writes) the stamp. Never throws: `storage` is a
 * getter because merely touching `localStorage` throws where it is blocked.
 */
export function visitorTags(storage: () => Storage, now: number): VisitorTags {
  try {
    const store = storage();
    const stamp = store.getItem(FIRST_SEEN_KEY);
    if (stamp !== null) return { visitor: 'returning', 'visitor.age_days': ageBucket(stamp, now) };
    const signedInBefore = store.getItem(SIGNED_IN_SHELL_HINT_KEY) === '1';
    store.setItem(FIRST_SEEN_KEY, signedInBefore ? `${LEGACY_PREFIX}${now}` : String(now));
    return signedInBefore
      ? { visitor: 'returning', 'visitor.age_days': 'unknown' }
      : { visitor: 'new', 'visitor.age_days': '0' };
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
