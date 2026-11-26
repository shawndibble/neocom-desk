import { SIGNED_IN_SHELL_HINT_KEY } from '@/app/signedInShellHint';
import { DAY_MS } from '@/lib/age';

export const FIRST_SEEN_KEY = 'neocom:first-seen';

export const FIRST_SESSION_KEY = 'neocom:first-session';

const LEGACY_PREFIX = 'legacy:';

export interface VisitorTags {
  visitor: 'new' | 'returning' | 'unknown';
  'visitor.age_days': '0' | '1-7' | '8-30' | '30+' | 'unknown';
}

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
  } catch {}
}
