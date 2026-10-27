import { describe, expect, it } from 'vitest';
import { filterMultiSelectGroups, type MultiSelectGroup } from './multiSelectSearch';

const GROUPS: readonly MultiSelectGroup<number>[] = [
  {
    label: 'Alpha',
    options: [
      { id: 1, label: 'Alice' },
      { id: 2, label: 'Bob' },
    ],
  },
  {
    label: 'Beta',
    options: [{ id: 3, label: 'Carol' }],
  },
];

describe('filterMultiSelectGroups', () => {
  it('returns every group unchanged for an empty query', () => {
    expect(filterMultiSelectGroups(GROUPS, '')).toEqual(GROUPS);
  });

  it('returns every group unchanged for a whitespace-only query', () => {
    expect(filterMultiSelectGroups(GROUPS, '   ')).toEqual(GROUPS);
  });

  it('narrows options within a group by a case-insensitive substring match', () => {
    expect(filterMultiSelectGroups(GROUPS, 'ali')).toEqual([
      { label: 'Alpha', options: [{ id: 1, label: 'Alice' }] },
    ]);
  });

  it('drops a group entirely once it has zero matching options, rather than keeping it empty', () => {
    const result = filterMultiSelectGroups(GROUPS, 'carol');
    expect(result).toEqual([{ label: 'Beta', options: [{ id: 3, label: 'Carol' }] }]);
    expect(result.some((g) => g.label === 'Alpha')).toBe(false);
  });

  it('returns no groups when nothing matches', () => {
    expect(filterMultiSelectGroups(GROUPS, 'zzz')).toEqual([]);
  });
});
