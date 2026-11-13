import { describe, expect, it } from 'vitest';
import { closestFit, listFits, sourceCounts, type ListedFit } from './popularFitList';

const fit = (key: string, over: Partial<ListedFit> = {}): ListedFit => ({
  key,
  source: 'loss',
  newest: null,
  seen: 0,
  isk: null,
  ...over,
});

const A = fit('a', { source: 'loss', newest: 300, seen: 1, isk: 2e9 });
const B = fit('b', { source: 'loss', newest: 100, seen: 4, isk: 1e9 });
const C = fit('c', { source: 'guide', newest: 200, seen: 0, isk: null });
const D = fit('d', { source: 'guide', newest: null, seen: 2, isk: 5e8 });
const ALL = [A, B, C, D];

const keys = (fits: readonly ListedFit[]) => fits.map((f) => f.key);

describe('sourceCounts', () => {
  it('counts each source and the whole', () => {
    expect(sourceCounts(ALL)).toEqual({ all: 4, loss: 2, guide: 2 });
  });
});

describe('listFits', () => {
  const none = { canFly: () => undefined, seconds: () => undefined };

  it('sorts newest first, a fit with no date last', () => {
    expect(keys(listFits(ALL, { source: 'all', flyOnly: false, sort: 'newest' }, none))).toEqual([
      'a',
      'c',
      'b',
      'd',
    ]);
  });

  it('narrows to one source', () => {
    expect(keys(listFits(ALL, { source: 'guide', flyOnly: false, sort: 'newest' }, none))).toEqual([
      'c',
      'd',
    ]);
  });

  it('sorts most seen first, ties newest first', () => {
    expect(keys(listFits(ALL, { source: 'all', flyOnly: false, sort: 'seen' }, none))).toEqual([
      'b',
      'd',
      'a',
      'c',
    ]);
  });

  it('sorts cheapest first, an unpriced fit last', () => {
    expect(keys(listFits(ALL, { source: 'all', flyOnly: false, sort: 'cheapest' }, none))).toEqual([
      'd',
      'b',
      'a',
      'c',
    ]);
  });

  it('sorts least training first: flyable, then by time, then unknown', () => {
    const seconds = new Map([
      ['a', 500],
      ['b', 0],
      ['c', 100],
    ]);
    const verdicts = {
      canFly: (key: string) => key === 'b',
      seconds: (key: string) => seconds.get(key),
    };
    expect(
      keys(listFits(ALL, { source: 'all', flyOnly: false, sort: 'training' }, verdicts))
    ).toEqual(['b', 'c', 'a', 'd']);
  });

  it('keeps only fits the Character can fly', () => {
    const verdicts = { canFly: (key: string) => key === 'c' || key === 'a', seconds: () => 0 };
    expect(keys(listFits(ALL, { source: 'all', flyOnly: true, sort: 'newest' }, verdicts))).toEqual(
      ['a', 'c']
    );
  });
});

describe('closestFit', () => {
  it('is the fit with the least training left', () => {
    const seconds = new Map([
      ['a', 500],
      ['c', 100],
    ]);
    expect(closestFit(ALL, (key) => seconds.get(key))?.key).toBe('c');
  });

  it('is undefined with no timed fit', () => {
    expect(closestFit(ALL, () => undefined)).toBeUndefined();
  });
});
