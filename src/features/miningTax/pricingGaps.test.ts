import { describe, expect, it } from 'vitest';
import type { DisplayRow } from './groupRows';
import { findPricingGaps } from './pricingGaps';

const A = 1;
const B = 2;

function displayRow(key: string, date: string, status: DisplayRow['status'] = 'unassigned') {
  return {
    key,
    status,
    assignment: null,
    row: {
      entry: {
        characterId: 1,
        date,
        solarSystemId: 1,
        oreLines: [
          { typeId: A, quantity: 5 },
          { typeId: B, quantity: 5 },
        ],
      },
    },
  } as unknown as DisplayRow;
}

const lookups = {
  hubIdOf: () => undefined,
  pricesAt: (_hub: string | undefined, date: string) =>
    new Map([
      [A, date === '2026-09-01' ? 0 : 10],
      [B, 4],
    ]),
  sellFallbackAt: (_hub: string | undefined, date: string) =>
    new Set(date === '2026-09-02' ? [B] : []),
};

describe('findPricingGaps', () => {
  it('reports the entries with an unpriced or sell-priced ore, and only those', () => {
    const rows = [
      displayRow('r1', '2026-09-01'),
      displayRow('r2', '2026-09-02'),
      displayRow('r3', '2026-09-03'),
    ];
    const gaps = findPricingGaps(rows, lookups);
    expect(gaps.map((g) => g.row.key)).toEqual(['r1', 'r2']);
    expect(gaps[0]).toMatchObject({ unpriced: [A], sellFallback: [] });
    expect(gaps[1]).toMatchObject({ unpriced: [], sellFallback: [B] });
  });

  it('skips dismissed rows — they owe nothing', () => {
    expect(findPricingGaps([displayRow('r1', '2026-09-01', 'dismissed')], lookups)).toEqual([]);
  });

  it('reads each row at its own hub and date', () => {
    const seen: [string | undefined, string][] = [];
    findPricingGaps([displayRow('r1', '2026-09-03')], {
      hubIdOf: () => 'hek',
      pricesAt: (hub, date) => {
        seen.push([hub, date]);
        return new Map([
          [A, 1],
          [B, 1],
        ]);
      },
      sellFallbackAt: () => new Set(),
    });
    expect(seen).toEqual([['hek', '2026-09-03']]);
  });
});
