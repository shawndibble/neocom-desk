import { describe, it, expect } from 'vitest';
import {
  newCorps,
  parseMoonsHiddenCorps,
  withHidden,
  withoutHidden,
  withSeen,
} from './moonsHiddenCorps';

const c = (n: number) => ({ corporationId: n });

describe('newCorps', () => {
  it('is empty before the baseline exists, so the first open flags nothing', () => {
    expect(newCorps([c(1), c(2)], { hidden: [], seen: [] })).toEqual([]);
  });

  it('flags a corp that arrived after the baseline', () => {
    expect(newCorps([c(1), c(2)], { hidden: [], seen: [1] })).toEqual([c(2)]);
  });

  it('skips hidden and already connected corps', () => {
    expect(newCorps([c(1), c(2), c(3), c(4)], { hidden: [2], seen: [1], connected: [3] })).toEqual([
      c(4),
    ]);
  });
});

describe('updates', () => {
  it('hide and unhide are idempotent', () => {
    const s = { hidden: [], seen: [] };
    const h = withHidden(s, 5);
    expect(h.hidden).toEqual([5]);
    expect(withHidden(h, 5)).toBe(h);
    expect(withoutHidden(h, 5).hidden).toEqual([]);
    expect(withoutHidden(s, 5)).toBe(s);
  });

  it('markSeen adds only unseen ids', () => {
    const s = withSeen({ hidden: [], seen: [1] }, [1, 2, 2]);
    expect(s.seen).toEqual([1, 2]);
    expect(withSeen(s, [1])).toBe(s);
  });
});

describe('parseMoonsHiddenCorps', () => {
  it('drops bad entries and tolerates junk', () => {
    expect(parseMoonsHiddenCorps({ hidden: [1, 'x', -2, 1], seen: [3] })).toEqual({
      hidden: [1],
      seen: [3],
    });
    expect(parseMoonsHiddenCorps('nope')).toEqual({ hidden: [], seen: [] });
  });
});
