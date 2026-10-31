import { describe, it, expect } from 'vitest';
import { GROUP_LIMIT, type PaletteProvider, type PaletteResult } from './types';
import type { PaletteGroup } from './usePaletteSearch';
import {
  COLLAPSED_ROWS,
  groupCountLabel,
  matchTier,
  rankGroups,
  visibleRowCounts,
} from './rowBudget';

function result(label: string): PaletteResult {
  return { id: label, label, run: () => {} };
}
function group(
  id: string,
  order: number,
  labels: string[],
  status: PaletteGroup['status'] = 'ready'
): PaletteGroup {
  const provider = { id, order, labelKey: id } as unknown as PaletteProvider;
  return { provider, status, results: labels.map(result) };
}
const ids = (groups: readonly PaletteGroup[]) => groups.map((g) => g.provider.id);

describe('matchTier', () => {
  it('ranks exact, prefix or word start, substring, then anything else', () => {
    expect(matchTier('Caldari', 'caldari')).toBe(0);
    expect(matchTier('Caldari Navy Hornet', 'caldari')).toBe(1);
    expect(matchTier('0EK-NJ 5 - Caldari Navy Anchorage', 'caldari')).toBe(1);
    expect(matchTier('Nocaldarix', 'caldari')).toBe(2);
    expect(matchTier('Settings', 'caldari')).toBe(3);
  });
});

describe('rankGroups', () => {
  it('puts word-start hits above substring-only hits, ties by provider order', () => {
    const places = group('places', 4, ['0EK-NJ 5 - Caldari Navy Anchorage']);
    const assets = group('assets', 3, ['Caldari Navy Hornet']);
    const lp = group('lp', 5, ['Caldari Navy']);
    const pages = group('pages', 0, ['Mocaldarix']);
    expect(ids(rankGroups([pages, assets, places, lp], 'caldari'))).toEqual([
      'assets',
      'places',
      'lp',
      'pages',
    ]);
  });

  it('ranks a page whose breadcrumb word starts with the query level with a name prefix', () => {
    const pages = group('pages', 0, ['Industry › Opportunities']);
    const market = group('market', 8, ['Opportunity Chip']);
    expect(ids(rankGroups([market, pages], 'opp'))).toEqual(['pages', 'market']);
  });

  it('uses the best result in a group', () => {
    const a = group('a', 0, ['xx caldari', 'Caldari']);
    const b = group('b', 1, ['Caldari Navy']);
    expect(ids(rankGroups([a, b], 'caldari'))).toEqual(['a', 'b']);
  });

  it('leaves loading and error groups in their own slots', () => {
    const slow = group('slow', 1, [], 'loading');
    const weak = group('weak', 0, ['xcaldari']);
    const strong = group('strong', 2, ['Caldari']);
    expect(ids(rankGroups([weak, slow, strong], 'caldari'))).toEqual(['strong', 'slow', 'weak']);
  });
});

describe('visibleRowCounts', () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('shows a sole matching group in full', () => {
    const counts = visibleRowCounts([group('a', 0, six), group('b', 1, [])], new Set());
    expect(counts.get('a')).toBe(6);
  });

  it('collapses every group to three rows when several match', () => {
    const counts = visibleRowCounts([group('a', 0, six), group('b', 1, ['x', 'y'])], new Set());
    expect(counts.get('a')).toBe(COLLAPSED_ROWS);
    expect(counts.get('b')).toBe(2);
  });

  it('shows an expanded group in full', () => {
    const counts = visibleRowCounts([group('a', 0, six), group('b', 1, six)], new Set(['b']));
    expect(counts.get('a')).toBe(COLLAPSED_ROWS);
    expect(counts.get('b')).toBe(6);
  });

  it('does not count loading groups as a match', () => {
    const counts = visibleRowCounts([group('a', 0, six), group('b', 1, [], 'loading')], new Set());
    expect(counts.get('a')).toBe(6);
  });
});

describe('groupCountLabel', () => {
  it('adds a plus once the provider hit its cap', () => {
    expect(groupCountLabel(4)).toBe('4');
    expect(groupCountLabel(GROUP_LIMIT)).toBe(`${GROUP_LIMIT}+`);
  });
});
