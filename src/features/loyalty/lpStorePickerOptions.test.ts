import { describe, expect, it } from 'vitest';
import { lpStorePickerOptions } from './lpStorePickerOptions';
import type { LpCorporationEntry } from '@/sde/marketTypes';

const CORPS: LpCorporationEntry[] = [
  { id: 1, name: 'Federation Navy', factionId: 500004 },
  { id: 2, name: 'Sisters of EVE' },
  { id: 3, name: 'CONCORD' },
  { id: 4, name: 'Federal Intelligence Office', factionId: 500004 },
  { id: 5, name: "Mordu's Legion" },
];

describe('lpStorePickerOptions', () => {
  it('lists corps with LP first, highest balance first, then every other store alphabetically', () => {
    const options = lpStorePickerOptions(
      CORPS,
      [
        { corporation_id: 2, loyalty_points: 500 },
        { corporation_id: 5, loyalty_points: 9_000 },
      ],
      ''
    );
    expect(options.map((o) => [o.corporationId, o.lp])).toEqual([
      [5, 9_000],
      [2, 500],
      [3, null],
      [4, null],
      [1, null],
    ]);
  });

  it('filters by name as you type, keeping held corps pinned above the rest', () => {
    const options = lpStorePickerOptions(CORPS, [{ corporation_id: 4, loyalty_points: 10 }], 'fed');
    expect(options.map((o) => o.name)).toEqual(['Federal Intelligence Office', 'Federation Navy']);
    expect(options[0].lp).toBe(10);
  });

  it('matches a substring, not just a prefix', () => {
    expect(lpStorePickerOptions(CORPS, [], 'navy').map((o) => o.corporationId)).toEqual([1]);
  });

  it('ignores a zero balance, so the corp ranks with the rest', () => {
    const options = lpStorePickerOptions(CORPS, [{ corporation_id: 5, loyalty_points: 0 }], '');
    expect(options.find((o) => o.corporationId === 5)?.lp).toBeNull();
    expect(options[0].corporationId).toBe(3);
  });

  it('leaves out a held corp that runs no LP store (e.g. Paragon EverMarks)', () => {
    const options = lpStorePickerOptions(
      CORPS,
      [{ corporation_id: 1000419, loyalty_points: 1_000 }],
      ''
    );
    expect(options.some((o) => o.corporationId === 1000419)).toBe(false);
    expect(options).toHaveLength(CORPS.length);
  });

  it('returns nothing when no store matches', () => {
    expect(lpStorePickerOptions(CORPS, [], 'zzz')).toEqual([]);
  });
});
