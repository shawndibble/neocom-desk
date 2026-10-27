import { describe, expect, it } from 'vitest';
import { baseFittingStats } from './__fixtures__/fittingStats';
import type { ImproveOption } from './improve';
import { summariseSelection } from './improveSelection';

const before = baseFittingStats();
const opt = (iskDelta: number | null): ImproveOption =>
  ({ candidate: { fromTypeId: 1, toTypeId: 2, at: [] }, iskDelta }) as unknown as ImproveOption;

const base = { before, after: before, mode: 'buy' as const, spendCap: null, fitTotal: null };

describe('summariseSelection', () => {
  it('sums the priced costs and counts the unpriced', () => {
    const s = summariseSelection({ ...base, options: [opt(100), opt(-30), opt(null)] });
    expect(s).toMatchObject({ count: 3, isk: 70, unpriced: 1, problems: [] });
  });

  it('reports the before and after EHP of the combined set', () => {
    const after = { ...before, ehp: before.ehp + 500 };
    const s = summariseSelection({ ...base, after, options: [opt(1)] });
    expect(s.ehp).toEqual({ before: before.ehp, after: before.ehp + 500 });
  });

  it('names every budget the combined set overruns', () => {
    const after = {
      ...before,
      cpuUsed: before.cpuTotal + 5,
      calibrationUsed: before.calibrationTotal + 1,
    };
    const s = summariseSelection({ ...base, after, options: [opt(1)] });
    expect(s.problems).toEqual([
      { kind: 'over', resource: 'cpu' },
      { kind: 'over', resource: 'calibration' },
    ]);
  });

  it('flags a cap that was stable and no longer is', () => {
    const stable = { ...before, capacitor: { stable: true as const, stablePercentage: 60 } };
    const after = { ...stable, capacitor: { stable: false as const, depletesInSeconds: 90 } };
    const s = summariseSelection({ ...base, before: stable, after, options: [opt(1)] });
    expect(s.problems).toEqual([{ kind: 'capStable' }]);
  });

  it('checks the whole fit price against the budget when planning', () => {
    const s = summariseSelection({
      ...base,
      options: [opt(30), opt(30)],
      spendCap: 100,
      fitTotal: 50,
    });
    expect(s.total).toBe(110);
    expect(s.problems).toEqual([{ kind: 'spend' }]);
  });

  it('checks only the net extra spend when refitting', () => {
    const refit = { ...base, mode: 'refit' as const, spendCap: 100 };
    const ok = summariseSelection({ ...refit, options: [opt(30), opt(30)] });
    expect(ok.total).toBeNull();
    expect(ok.problems).toEqual([]);
    expect(summariseSelection({ ...refit, options: [opt(60), opt(60)] }).problems).toEqual([
      { kind: 'spend' },
    ]);
  });
});

describe('summariseSelection with owned stock', () => {
  const swap = (fromTypeId: number, toTypeId: number): ImproveOption =>
    ({
      candidate: { fromTypeId, toTypeId, at: [{ slot: 'low', slotIndex: 0 }] },
      iskDelta: 0,
    }) as unknown as ImproveOption;
  const priceOf = (typeId: number) => ({ 1: 10, 2: 100, 3: 100 })[typeId] ?? null;

  it('spends one owned unit once across two rows that need it', () => {
    const stock = { owned: new Map([[2, 1]]), fitCounts: new Map([[1, 2]]) };
    const s = summariseSelection({
      ...base,
      mode: 'buy',
      fitTotal: 20,
      stock,
      priceOf,
      options: [swap(1, 2), swap(1, 2)],
    });
    // Row 1 uses the owned unit (-10); row 2 buys a full one (100 - 10).
    expect(s.isk).toBe(80);
    expect(s.total).toBe(100);
  });
});
