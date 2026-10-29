import { describe, expect, it } from 'vitest';
import type { ImproveOption } from './improve';
import { groupByModule } from './improveRows';

function option(
  toTypeId: number,
  score: number,
  iskDelta: number | null,
  slotIndex = 0,
  fromTypeId: number | null = 1
): ImproveOption {
  return {
    candidate: { fromTypeId, toTypeId, at: [{ slot: 'low', slotIndex }] },
    score,
    iskDelta,
  } as ImproveOption;
}

const ids = (groups: ReturnType<typeof groupByModule>) =>
  groups.map((g) => [g.best.candidate.toTypeId, ...g.others.map((o) => o.candidate.toTypeId)]);

describe('groupByModule', () => {
  it('makes one group per fitted module, its best option first', () => {
    const groups = groupByModule(
      [option(10, 0.1, 100), option(11, 0.3, 500), option(12, 0.2, 50, 1, 2)],
      'gain'
    );
    expect(ids(groups)).toEqual([[11, 10], [12]]);
  });

  it('groups every empty-slot fill of one slot together', () => {
    const groups = groupByModule(
      [option(10, 0.1, 1, 3, null), option(11, 0.2, 1, 3, null)],
      'gain'
    );
    expect(ids(groups)).toEqual([[11, 10]]);
  });

  it('groups the conversion variants of one side into one row', () => {
    const conversion = (toTypeId: number, score: number, removedTypeId: number): ImproveOption =>
      ({
        candidate: {
          fromTypeId: null,
          toTypeId,
          at: [{ slot: 'low', slotIndex: 0 }],
          conversion: {
            side: 'armor',
            removes: [{ typeId: removedTypeId, at: [{ slot: 'medium', slotIndex: 0 }] }],
            freed: { high: 0, medium: 1, low: 0 },
          },
        },
        score,
        iskDelta: 1,
      }) as ImproveOption;
    const groups = groupByModule([conversion(10, 0.1, 5), conversion(11, 0.3, 6)], 'gain');
    expect(ids(groups)).toEqual([[11, 10]]);
  });

  it('sorts by value: gain per ISK, free before priced, unpriced last', () => {
    const groups = groupByModule(
      [
        option(10, 0.1, 10_000_000, 0, 1),
        option(11, 0.1, 1_000_000, 1, 2),
        option(12, 0.05, null, 2, 3),
        option(13, 0.01, -5, 3, 4),
      ],
      'value'
    );
    expect(ids(groups).map((g) => g[0])).toEqual([13, 11, 10, 12]);
  });

  it('ranks a free option with no gain below a priced one that gains', () => {
    const groups = groupByModule(
      [option(10, 0, 0, 0, 1), option(11, 0.3, 5_000_000, 1, 2)],
      'value'
    );
    expect(ids(groups).map((g) => g[0])).toEqual([11, 10]);
  });

  it('sorts cheapest first, unpriced last', () => {
    const groups = groupByModule(
      [option(10, 0.9, 900, 0, 1), option(11, 0.1, null, 1, 2), option(12, 0.1, 100, 2, 3)],
      'cheapest'
    );
    expect(ids(groups).map((g) => g[0])).toEqual([12, 10, 11]);
  });

  it('picks the group best by the chosen sort', () => {
    const rows = [option(10, 0.5, 5_000_000), option(11, 0.1, 100_000)];
    expect(ids(groupByModule(rows, 'gain'))).toEqual([[10, 11]]);
    expect(ids(groupByModule(rows, 'value'))).toEqual([[11, 10]]);
    expect(ids(groupByModule(rows, 'cheapest'))).toEqual([[11, 10]]);
  });
});
