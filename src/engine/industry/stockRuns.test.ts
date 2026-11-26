import { describe, expect, it } from 'vitest';
import { effectiveMaterials } from './materials';
import { takeEveryOffer } from './ownedStockOffer';
import { maxRunsFromStock } from './stockRuns';
import {
  FACILITY_PRESETS,
  MAX_JOB_RUNS,
  type FacilityContext,
  type IndustryBlueprint,
} from './types';

const TRITANIUM = 34;
const PYERITE = 35;

const ctx = {
  facility: FACILITY_PRESETS.npcStation,
  rigFit: ['none', 'none', 'none'],
  security: 'highsec',
} satisfies FacilityContext;

function blueprint(materials: Record<number, number>): IndustryBlueprint {
  return {
    name: 'Test',
    time: 100,
    materials: Object.entries(materials).map(([typeID, quantity]) => ({
      typeID: Number(typeID),
      quantity,
    })),
    products: [{ typeID: 1, quantity: 1 }],
  };
}

function rowsFor(bp: IndustryBlueprint, me: number) {
  return (runs: number) => effectiveMaterials(bp, runs, me, ctx);
}

function stockOf(entries: Record<number, number>) {
  return (typeID: number): number => entries[typeID] ?? 0;
}

describe('maxRunsFromStock', () => {
  const bp = blueprint({ [TRITANIUM]: 100, [PYERITE]: 10 });

  it('finds the exact fit and names the material one unit short at the next run', () => {
    const exact = maxRunsFromStock({
      rowsAt: rowsFor(bp, 0),
      availableFor: stockOf({ [TRITANIUM]: 500, [PYERITE]: 1000 }),
    });
    expect(exact).toEqual({ runs: 5, limiting: TRITANIUM });

    const oneShort = maxRunsFromStock({
      rowsAt: rowsFor(bp, 0),
      availableFor: stockOf({ [TRITANIUM]: 599, [PYERITE]: 1000 }),
    });
    expect(oneShort).toEqual({ runs: 5, limiting: TRITANIUM });
  });

  it('names the row that runs out first', () => {
    expect(
      maxRunsFromStock({
        rowsAt: rowsFor(bp, 0),
        availableFor: stockOf({ [TRITANIUM]: 10_000, [PYERITE]: 35 }),
      })
    ).toEqual({ runs: 3, limiting: PYERITE });
  });

  it('follows the rounded need, which is not linear in runs', () => {
    const rounding = blueprint({ [TRITANIUM]: 11 });
    const rows = rowsFor(rounding, 10);
    expect(rows(1)[0].quantity).toBe(10);
    expect(rows(10)[0].quantity).toBe(99);
    expect(maxRunsFromStock({ rowsAt: rows, availableFor: stockOf({ [TRITANIUM]: 99 }) })).toEqual({
      runs: 10,
      limiting: TRITANIUM,
    });
    expect(
      maxRunsFromStock({ rowsAt: rows, availableFor: stockOf({ [TRITANIUM]: 98 }) }).runs
    ).toBe(9);
  });

  it('gives 0 and names the material when one has none owned', () => {
    expect(
      maxRunsFromStock({
        rowsAt: rowsFor(bp, 0),
        availableFor: stockOf({ [TRITANIUM]: 10_000 }),
      })
    ).toEqual({ runs: 0, limiting: PYERITE });
  });

  it('gives 0 when stock falls short of a single run', () => {
    expect(
      maxRunsFromStock({
        rowsAt: rowsFor(bp, 0),
        availableFor: stockOf({ [TRITANIUM]: 99, [PYERITE]: 10 }),
      })
    ).toEqual({ runs: 0, limiting: TRITANIUM });
  });

  it('reads less stock when a group claim holds some of it', () => {
    const stock = { [TRITANIUM]: 1000, [PYERITE]: 1000 };
    const free = (claimed: number) => (typeID: number) =>
      Math.max(0, stockOf(stock)(typeID) - (typeID === TRITANIUM ? claimed : 0));
    expect(maxRunsFromStock({ rowsAt: rowsFor(bp, 0), availableFor: free(0) }).runs).toBe(10);
    expect(maxRunsFromStock({ rowsAt: rowsFor(bp, 0), availableFor: free(500) }).runs).toBe(5);
  });

  it('stops at the maximum job runs and names nothing', () => {
    const cheap = blueprint({ [TRITANIUM]: 1 });
    expect(
      maxRunsFromStock({
        rowsAt: rowsFor(cheap, 0),
        availableFor: stockOf({ [TRITANIUM]: MAX_JOB_RUNS * 5 }),
      })
    ).toEqual({ runs: MAX_JOB_RUNS, limiting: null });
  });

  it('honours a smaller cap', () => {
    expect(
      maxRunsFromStock({
        rowsAt: rowsFor(bp, 0),
        availableFor: stockOf({ [TRITANIUM]: 10_000, [PYERITE]: 10_000 }),
        maxRuns: 7,
      })
    ).toEqual({ runs: 7, limiting: null });
  });

  it('has nothing to cover without material rows', () => {
    expect(maxRunsFromStock({ rowsAt: () => [], availableFor: () => 0 })).toEqual({
      runs: 0,
      limiting: null,
    });
  });

  it('leaves nothing short once every Owned-Stock Offer is taken at that run count', () => {
    const stock = { [TRITANIUM]: 777, [PYERITE]: 130 };
    const { runs } = maxRunsFromStock({ rowsAt: rowsFor(bp, 4), availableFor: stockOf(stock) });
    const rows = rowsFor(bp, 4)(runs);
    const offers = takeEveryOffer(rows, () => undefined, stockOf(stock));
    for (const row of rows) {
      expect(offers.find((o) => o.typeID === row.typeID)?.to).toBe(row.quantity);
    }
  });
});
