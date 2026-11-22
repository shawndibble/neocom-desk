import { describe, expect, it } from 'vitest';
import { moonLoss } from './moonLoss';

const chunk = [
  { typeId: 1, quantity: 200 },
  { typeId: 2, quantity: 100 },
];

describe('moonLoss', () => {
  it('has no figure without a chunk source', () => {
    expect(moonLoss([], [{ typeId: 1, quantity: 5 }], true)).toBeNull();
    expect(moonLoss([], [], false)).toBeNull();
  });

  it('is the combined loss until flagged, per ore and in total', () => {
    const loss = moonLoss(chunk, [{ typeId: 1, quantity: 150 }], false);
    expect(loss?.kind).toBe('combined');
    expect(loss?.rows).toEqual([
      { typeId: 1, chunk: 200, mined: 150, lost: 50, pct: 25 },
      { typeId: 2, chunk: 100, mined: 0, lost: 100, pct: 100 },
    ]);
    expect(loss?.totalPct).toBe(50);
  });

  it('is residue once flagged, with the same arithmetic', () => {
    const loss = moonLoss(
      chunk,
      [
        { typeId: 1, quantity: 190 },
        { typeId: 2, quantity: 95 },
      ],
      true
    );
    expect(loss?.kind).toBe('residue');
    expect(loss?.rows.map((r) => r.pct)).toEqual([5, 5]);
    expect(loss?.totalPct).toBe(5);
  });

  it('never goes negative when the ledger exceeds the chunk, and ignores ore outside it', () => {
    const loss = moonLoss(
      chunk,
      [
        { typeId: 1, quantity: 250 },
        { typeId: 9, quantity: 40 },
      ],
      true
    );
    expect(loss?.rows[0]).toMatchObject({ mined: 250, lost: 0, pct: 0 });
    expect(loss?.rows).toHaveLength(2);
  });

  it('sums a type the ledger lists on several lines', () => {
    const loss = moonLoss(
      chunk,
      [
        { typeId: 1, quantity: 100 },
        { typeId: 1, quantity: 50 },
      ],
      false
    );
    expect(loss?.rows[0]?.mined).toBe(150);
  });
});

describe('moonLoss with moon ore variants', () => {
  it('splits a notified base ore into the variants mined, each losing its share', () => {
    const BITUMENS = 45492;
    const BRIMFUL_BITUMENS = 46284;
    const loss = moonLoss(
      [{ typeId: BITUMENS, quantity: 1000 }],
      [
        { typeId: BITUMENS, quantity: 480 },
        { typeId: BRIMFUL_BITUMENS, quantity: 320 },
      ],
      true
    );
    expect(loss?.rows).toEqual([
      { typeId: BITUMENS, chunk: 600, mined: 480, lost: 120, pct: 20 },
      { typeId: BRIMFUL_BITUMENS, chunk: 400, mined: 320, lost: 80, pct: 20 },
    ]);
    expect(loss?.totalPct).toBe(20);
  });
});
