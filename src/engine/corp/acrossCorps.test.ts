import { describe, expect, it } from 'vitest';
import { killTotalsAcross, mergeByCorporation, walletBalancesAcross } from './acrossCorps';

describe('mergeByCorporation', () => {
  it('sorts two corporations’ extractions together, soonest first, each carrying its corporation', () => {
    const merged = mergeByCorporation(
      [
        {
          corporationId: 10,
          items: [
            { id: 'a', at: 300 },
            { id: 'b', at: 100 },
          ],
        },
        { corporationId: 20, items: [{ id: 'c', at: 200 }] },
      ],
      (x, y) => x.at - y.at
    );
    expect(merged).toEqual([
      { id: 'b', at: 100, corporationId: 10 },
      { id: 'c', at: 200, corporationId: 20 },
      { id: 'a', at: 300, corporationId: 10 },
    ]);
  });

  it('sorts two corporations’ jobs finished first, then running, each by end', () => {
    type Job = { id: number; done: boolean; end: number };
    const byDoneThenEnd = (a: Job, b: Job) => Number(b.done) - Number(a.done) || a.end - b.end;
    const merged = mergeByCorporation<Job>(
      [
        {
          corporationId: 10,
          items: [
            { id: 1, done: false, end: 50 },
            { id: 2, done: true, end: 40 },
          ],
        },
        {
          corporationId: 20,
          items: [
            { id: 3, done: true, end: 10 },
            { id: 4, done: false, end: 20 },
          ],
        },
      ],
      byDoneThenEnd
    );
    expect(merged.map((job) => [job.id, job.corporationId])).toEqual([
      [3, 20],
      [2, 10],
      [4, 20],
      [1, 10],
    ]);
  });

  it('keeps input order on a tie', () => {
    const merged = mergeByCorporation(
      [
        { corporationId: 2, items: [{ at: 1 }] },
        { corporationId: 1, items: [{ at: 1 }] },
      ],
      (x, y) => x.at - y.at
    );
    expect(merged.map((row) => row.corporationId)).toEqual([2, 1]);
  });
});

describe('walletBalancesAcross', () => {
  it('totals each corporation’s divisions and every corporation, largest first', () => {
    const { rows, total } = walletBalancesAcross([
      {
        corporationId: 10,
        masterDivision: 1,
        divisions: [
          { division: 1, balance: 100 },
          { division: 2, balance: 50 },
        ],
      },
      {
        corporationId: 20,
        masterDivision: 1,
        divisions: [
          { division: 1, balance: 400 },
          { division: 3, balance: -25 },
        ],
      },
    ]);
    expect(rows).toEqual([
      { corporationId: 20, master: 400, total: 375 },
      { corporationId: 10, master: 100, total: 150 },
    ]);
    expect(total).toBe(525);
  });

  it('reads a missing master division as 0, never dropping the corporation', () => {
    const { rows, total } = walletBalancesAcross([
      { corporationId: 10, masterDivision: 1, divisions: [{ division: 2, balance: 70 }] },
    ]);
    expect(rows).toEqual([{ corporationId: 10, master: 0, total: 70 }]);
    expect(total).toBe(70);
  });
});

describe('killTotalsAcross', () => {
  it('adds kills and losses, and weighs efficiency by ISK, not by corporation', () => {
    expect(
      killTotalsAcross([
        { kills: 10, losses: 2, iskDestroyed: 900, iskLost: 100 },
        { kills: 1, losses: 5, iskDestroyed: 0, iskLost: 1000 },
      ])
    ).toEqual({ kills: 11, losses: 7, iskEfficiency: 900 / 2000 });
  });

  it('has no efficiency when no ISK moved', () => {
    expect(killTotalsAcross([]).iskEfficiency).toBeNull();
  });
});
