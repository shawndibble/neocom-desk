import { describe, it, expect } from 'vitest';
import { SIGNED_IN_SHELL_HINT_KEY } from '@/app/signedInShellHint';
import { FIRST_SEEN_KEY, FIRST_SESSION_KEY, visitorTags } from './visitor';

const DAY = 86_400_000;
const NOW = 100 * DAY;

function memoryStorage(entries: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

const noSession = (): Storage => memoryStorage();

describe('visitorTags', () => {
  it('tags a browser with no trace of the app as new, and stamps it', () => {
    const storage = memoryStorage();

    expect(visitorTags(() => storage, noSession, NOW)).toEqual({
      visitor: 'new',
      'visitor.age_days': '0',
    });
    expect(storage.getItem(FIRST_SEEN_KEY)).toBe(String(NOW));
  });

  // The EVE SSO redirect back to /callback is a second page load in the same
  // tab — the one a first sign-in fans out from — and must still read new.
  it('keeps tagging new for the rest of the first session', () => {
    const storage = memoryStorage();
    const session = memoryStorage();
    visitorTags(
      () => storage,
      () => session,
      NOW
    );

    expect(session.getItem(FIRST_SESSION_KEY)).toBe('1');
    expect(
      visitorTags(
        () => storage,
        () => session,
        NOW + 60_000
      )
    ).toEqual({
      visitor: 'new',
      'visitor.age_days': '0',
    });
    // A later session (a new tab) is a return visit.
    expect(visitorTags(() => storage, noSession, NOW + 2 * DAY)).toEqual({
      visitor: 'returning',
      'visitor.age_days': '1-7',
    });
  });

  it('tags a stamped browser as returning, bucketed by age', () => {
    expect(
      visitorTags(() => memoryStorage({ [FIRST_SEEN_KEY]: String(NOW) }), noSession, NOW)
    ).toEqual({
      visitor: 'returning',
      'visitor.age_days': '0',
    });
    expect(
      visitorTags(() => memoryStorage({ [FIRST_SEEN_KEY]: String(NOW - 3 * DAY) }), noSession, NOW)
    ).toEqual({
      visitor: 'returning',
      'visitor.age_days': '1-7',
    });
    expect(
      visitorTags(() => memoryStorage({ [FIRST_SEEN_KEY]: String(NOW - 20 * DAY) }), noSession, NOW)
    ).toEqual({
      visitor: 'returning',
      'visitor.age_days': '8-30',
    });
    expect(
      visitorTags(() => memoryStorage({ [FIRST_SEEN_KEY]: String(NOW - 90 * DAY) }), noSession, NOW)
    ).toEqual({
      visitor: 'returning',
      'visitor.age_days': '30+',
    });
  });

  // The stamp ships after people already use the app: a browser that has
  // signed in before but carries no stamp predates it, not a new install.
  it('tags an unstamped browser that already holds a Character as returning, age unknown', () => {
    const storage = memoryStorage({ [SIGNED_IN_SHELL_HINT_KEY]: '1' });

    expect(visitorTags(() => storage, noSession, NOW)).toEqual({
      visitor: 'returning',
      'visitor.age_days': 'unknown',
    });
    expect(storage.getItem(FIRST_SEEN_KEY)).toBe(`legacy:${NOW}`);
    // Later loads keep saying "unknown" rather than counting from the stamp.
    expect(visitorTags(() => storage, noSession, NOW + 40 * DAY)).toEqual({
      visitor: 'returning',
      'visitor.age_days': 'unknown',
    });
  });

  it('treats an unreadable stamp as unknown age', () => {
    expect(
      visitorTags(() => memoryStorage({ [FIRST_SEEN_KEY]: 'garbage' }), noSession, NOW)
    ).toEqual({
      visitor: 'returning',
      'visitor.age_days': 'unknown',
    });
  });

  it('reports unknown when storage is blocked', () => {
    const blocked = (): Storage => {
      throw new Error('SecurityError');
    };

    expect(visitorTags(blocked, noSession, NOW)).toEqual({
      visitor: 'unknown',
      'visitor.age_days': 'unknown',
    });
  });
});
