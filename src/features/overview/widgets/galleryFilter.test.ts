import { describe, expect, it } from 'vitest';
import { OVERVIEW_BOARD } from './board';
import {
  categoryCounts,
  featuredKinds,
  groupByCategory,
  kindInstanceCounts,
  matchKinds,
  notOnBoard,
} from './galleryFilter';
import { getKind, type WidgetKindDef } from './kinds';

const kinds = ['wallet', 'training', 'mail'].map((id) => getKind(id) as WidgetKindDef);

describe('matchKinds', () => {
  const text = (kind: WidgetKindDef) => kind.id;
  it('returns everything for a blank query', () => {
    expect(matchKinds(kinds, '  ', text)).toEqual(kinds);
  });
  it('matches case-insensitively on the resolved text', () => {
    expect(matchKinds(kinds, 'MAI', text).map((k) => k.id)).toEqual(['mail']);
  });
});

describe('kindInstanceCounts', () => {
  it('counts widgets per kind', () => {
    const counts = kindInstanceCounts([{ kind: 'a' }, { kind: 'b' }, { kind: 'a' }]);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(1);
    expect(counts.get('c')).toBeUndefined();
  });
});

describe('notOnBoard', () => {
  it('drops kinds with at least one instance', () => {
    const counts = new Map([['wallet', 1]]);
    expect(notOnBoard(kinds, counts).map((k) => k.id)).toEqual(['training', 'mail']);
  });
});

describe('categoryCounts / groupByCategory', () => {
  it('counts per board category and in total', () => {
    const counts = categoryCounts(kinds, OVERVIEW_BOARD);
    expect(counts.all).toBe(3);
    const sum = OVERVIEW_BOARD.categories.reduce((n, c) => n + counts[c], 0);
    expect(sum).toBe(3);
  });
  it('groups in board category order and skips empty groups', () => {
    const groups = groupByCategory(kinds, OVERVIEW_BOARD);
    expect(groups.every((g) => g.kinds.length > 0)).toBe(true);
    const order = groups.map((g) => OVERVIEW_BOARD.categories.indexOf(g.category));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(groups.flatMap((g) => g.kinds)).toHaveLength(3);
  });
});

describe('featuredKinds', () => {
  it("is the board's default layout kinds, de-duplicated, addable and drawable", () => {
    const featured = featuredKinds(OVERVIEW_BOARD, OVERVIEW_BOARD.kinds);
    expect(featured.length).toBeGreaterThan(0);
    expect(new Set(featured.map((k) => k.id)).size).toBe(featured.length);
    expect(featured.every((k) => k.availability !== 'comingSoon')).toBe(true);
  });
  it('only offers kinds in the given list', () => {
    const only = [kinds[0]];
    const featured = featuredKinds(OVERVIEW_BOARD, only);
    expect(featured.every((k) => k.id === 'wallet')).toBe(true);
  });
});
