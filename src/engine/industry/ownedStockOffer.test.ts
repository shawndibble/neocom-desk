import { describe, expect, it } from 'vitest';
import type { DetectedOwnedStockMap } from './ownedStock';
import {
  ownedStockOffer,
  undoOwnedStockChanges,
  takeEveryOffer,
  clearEveryOwned,
} from './ownedStockOffer';

const TRITANIUM = 34;
const PYERITE = 35;
const ISOGEN = 37;
const BLUEPRINT = 999;

function stockOf(entries: Record<number, number>): DetectedOwnedStockMap {
  return new Map(
    Object.entries(entries).map(([typeID, quantity]) => [
      Number(typeID),
      { quantity, placements: [] },
    ])
  );
}

function ownedFrom(owned: Record<number, number>) {
  return (typeID: number): number | undefined => owned[typeID];
}

describe('ownedStockOffer', () => {
  const row = { typeID: TRITANIUM, quantity: 1000 };

  it('offers the scoped stock, capped at what the row needs', () => {
    expect(ownedStockOffer(row, 9000, undefined)).toBe(1000);
    expect(ownedStockOffer(row, 400, undefined)).toBe(400);
  });

  it('offers to refresh a zeroed or stale row', () => {
    expect(ownedStockOffer(row, 400, 0)).toBe(400);
    expect(ownedStockOffer(row, 400, 12)).toBe(400);
  });

  it('offers nothing once the row already holds what it would write', () => {
    expect(ownedStockOffer(row, 9000, 1000)).toBeNull();
  });

  it('offers nothing when there is no scoped stock to write', () => {
    expect(ownedStockOffer(row, 0, undefined)).toBeNull();
    expect(ownedStockOffer(row, 0, 500)).toBeNull();
  });

  // Blueprint Acquisition (issue #838): a blueprint row's ownership comes from
  // the Character's real BPO/BPC, never a typed Have, so it has no offer even
  // when a packaged blueprint sits in a hangar.
  it('offers nothing on a blueprint row', () => {
    expect(
      ownedStockOffer({ typeID: BLUEPRINT, quantity: 1, acquisitionTier: { me: 0, te: 0 } }, 1, 0)
    ).toBeNull();
  });
});

describe('takeEveryOffer', () => {
  const ROWS = [
    { typeID: TRITANIUM, quantity: 1000 },
    { typeID: PYERITE, quantity: 200 },
    { typeID: ISOGEN, quantity: 50 },
  ];

  it('fills every row with detected stock and nothing typed in it', () => {
    expect(
      takeEveryOffer(ROWS, ownedFrom({}), stockOf({ [TRITANIUM]: 9000, [PYERITE]: 30 }))
    ).toEqual([
      { typeID: TRITANIUM, from: undefined, to: 1000 },
      { typeID: PYERITE, from: undefined, to: 30 },
    ]);
  });

  // "Use all" is every row's own "Use assets" at once: the rows the per-row
  // offer would fill, and no others. It used to skip any row with a number
  // in it, a 0 included — so after "Use none" (which writes 0s) the button
  // did nothing at all while every row beside it still offered its stock.
  it('fills a zeroed row and refreshes a stale count, the same rows the per-row offer would', () => {
    expect(
      takeEveryOffer(
        ROWS,
        ownedFrom({ [TRITANIUM]: 0, [PYERITE]: 12 }),
        stockOf({ [TRITANIUM]: 9000, [PYERITE]: 30, [ISOGEN]: 4 })
      )
    ).toEqual([
      { typeID: TRITANIUM, from: 0, to: 1000 },
      { typeID: PYERITE, from: 12, to: 30 },
      { typeID: ISOGEN, from: undefined, to: 4 },
    ]);
  });

  it('skips a row that already holds what it would write', () => {
    expect(
      takeEveryOffer(
        ROWS,
        ownedFrom({ [TRITANIUM]: 1000, [PYERITE]: 30 }),
        stockOf({ [TRITANIUM]: 9000, [PYERITE]: 30 })
      )
    ).toEqual([]);
  });

  it('never writes a 0 over a typed count when the scoped stock is empty', () => {
    expect(
      takeEveryOffer(ROWS, ownedFrom({ [TRITANIUM]: 500 }), stockOf({ [TRITANIUM]: 0 }))
    ).toEqual([]);
  });

  it('changes nothing for a material with no detected stock', () => {
    expect(takeEveryOffer(ROWS, ownedFrom({}), stockOf({}))).toEqual([]);
  });

  // Issue #2538: the per-row offer never showed on a blueprint row, but bulk
  // used to fill it anyway.
  it('leaves a blueprint row alone, as its own offer does', () => {
    expect(
      takeEveryOffer(
        [{ typeID: BLUEPRINT, quantity: 1, acquisitionTier: { me: 0, te: 0 } }],
        ownedFrom({}),
        stockOf({ [BLUEPRINT]: 1 })
      )
    ).toEqual([]);
  });
});

describe('clearEveryOwned', () => {
  const ROWS = [{ typeID: TRITANIUM }, { typeID: PYERITE }, { typeID: ISOGEN }];

  it('zeroes every row that currently carries a non-zero owned quantity', () => {
    expect(clearEveryOwned(ROWS, ownedFrom({ [TRITANIUM]: 500, [PYERITE]: 12 }))).toEqual([
      { typeID: TRITANIUM, from: 500, to: 0 },
      { typeID: PYERITE, from: 12, to: 0 },
    ]);
  });

  it('leaves a row already at 0, or with nothing stored, out of the change', () => {
    expect(clearEveryOwned(ROWS, ownedFrom({ [TRITANIUM]: 0, [PYERITE]: 40 }))).toEqual([
      { typeID: PYERITE, from: 40, to: 0 },
    ]);
    expect(clearEveryOwned(ROWS, ownedFrom({}))).toEqual([]);
  });

  // Deliberately wider than the offer: "Use none" clears whatever the row
  // holds, so a stray value the offer would never write still has a way out.
  it('clears a blueprint row too', () => {
    const blueprintRow = { typeID: BLUEPRINT, quantity: 1, acquisitionTier: { me: 0, te: 0 } };
    expect(clearEveryOwned([blueprintRow], ownedFrom({ [BLUEPRINT]: 1 }))).toEqual([
      { typeID: BLUEPRINT, from: 1, to: 0 },
    ]);
  });
});

describe('undoOwnedStockChanges', () => {
  it('puts every row back to what it held, an empty row included', () => {
    expect(
      undoOwnedStockChanges([
        { typeID: TRITANIUM, from: undefined, to: 1000 },
        { typeID: PYERITE, from: 12, to: 0 },
      ])
    ).toEqual([
      { typeID: TRITANIUM, from: 1000, to: undefined },
      { typeID: PYERITE, from: 0, to: 12 },
    ]);
  });
});
