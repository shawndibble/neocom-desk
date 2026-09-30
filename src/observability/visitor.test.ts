import { describe, it, expect } from 'vitest';
import { SIGNED_IN_SHELL_HINT_KEY } from '@/app/signedInShellHint';
import { FIRST_SEEN_KEY, visitorTags } from './visitor';

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

describe('visitorTags', () => {
  it('tags a browser with no trace of the app as new, and stamps it', () => {
    const storage = memoryStorage();

    expect(visitorTags(() => storage, NOW)).toEqual({ visitor: 'new', 'visitor.age_days': '0' });
    expect(storage.getItem(FIRST_SEEN_KEY)).toBe(String(NOW));
  });

  it('tags a stamped browser as returning, bucketed by age', () => {
    expect(visitorTags(() => memoryStorage({ [FIRST_SEEN_KEY]: String(NOW) }), NOW)).toEqual({
      visitor: 'returning',
      'visitor.age_days': '0',
    });
    expect(
      visitorTags(() => memoryStorage({ [FIRST_SEEN_KEY]: String(NOW - 3 * DAY) }), NOW)
    ).toEqual({
      visitor: 'returning',
      'visitor.age_days': '1-7',
    });
    expect(
      visitorTags(() => memoryStorage({ [FIRST_SEEN_KEY]: String(NOW - 20 * DAY) }), NOW)
    ).toEqual({
      visitor: 'returning',
      'visitor.age_days': '8-30',
    });
    expect(
      visitorTags(() => memoryStorage({ [FIRST_SEEN_KEY]: String(NOW - 90 * DAY) }), NOW)
    ).toEqual({
      visitor: 'returning',
      'visitor.age_days': '30+',
    });
  });

  // The stamp ships after people already use the app: a browser that has
  // signed in before but carries no stamp predates it, not a new install.
  it('tags an unstamped browser that already holds a Character as returning, age unknown', () => {
    const storage = memoryStorage({ [SIGNED_IN_SHELL_HINT_KEY]: '1' });

    expect(visitorTags(() => storage, NOW)).toEqual({
      visitor: 'returning',
      'visitor.age_days': 'unknown',
    });
    expect(storage.getItem(FIRST_SEEN_KEY)).toBe(`legacy:${NOW}`);
    // Later loads keep saying "unknown" rather than counting from the stamp.
    expect(visitorTags(() => storage, NOW + 40 * DAY)).toEqual({
      visitor: 'returning',
      'visitor.age_days': 'unknown',
    });
  });

  it('treats an unreadable stamp as unknown age', () => {
    expect(visitorTags(() => memoryStorage({ [FIRST_SEEN_KEY]: 'garbage' }), NOW)).toEqual({
      visitor: 'returning',
      'visitor.age_days': 'unknown',
    });
  });

  it('reports unknown when storage is blocked', () => {
    const blocked = (): Storage => {
      throw new Error('SecurityError');
    };

    expect(visitorTags(blocked, NOW)).toEqual({
      visitor: 'unknown',
      'visitor.age_days': 'unknown',
    });
  });
});
