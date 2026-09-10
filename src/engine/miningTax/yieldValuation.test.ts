import { describe, it, expect } from 'vitest';
import { valueMiningYield, type YieldReprocessingEntry } from './yieldValuation';
import type { OreLine } from './types';
import type { ReprocessingSkills } from '@/engine/industry/reprocessing';

const VELDSPAR = 1230;
const ICE = 16262;
const UNREPROCESSABLE = 99;

const NO_SKILLS: ReprocessingSkills = {
  reprocessingLevel: 0,
  reprocessingEfficiencyLevel: 0,
  specialisationLevel: 0,
};

describe('valueMiningYield', () => {
  it('values every line at its mined-date raw price and sums to the entry total', () => {
    const lines: OreLine[] = [
      { typeId: VELDSPAR, quantity: 1000 },
      { typeId: ICE, quantity: 100 },
    ];
    const rawPrices = new Map([
      [VELDSPAR, 5],
      [ICE, 40],
    ]);

    const result = valueMiningYield(lines, rawPrices, new Map(), NO_SKILLS, {});

    // 1000*5 + 100*40 = 9000
    expect(result.rawValue).toBe(9000);
    expect(result.lines.map((l) => l.rawValue)).toEqual([5000, 4000]);
  });

  it('computes refine-then-sell value from reprocessing yield and material prices', () => {
    const lines: OreLine[] = [{ typeId: VELDSPAR, quantity: 200 }];
    const reprocessing = new Map<number, YieldReprocessingEntry | undefined>([
      [VELDSPAR, { portionSize: 100, materials: [{ typeId: 34, quantity: 400 }] }],
    ]);

    const result = valueMiningYield(lines, new Map([[VELDSPAR, 5]]), reprocessing, NO_SKILLS, {
      34: 3,
    });

    // 200 units / 100 portion = 2 batches; 2*400*0.5 (base station rate) = 400 units of material 34
    expect(result.refineValue).toBe(400 * 3);
    expect(result.pricedAll).toBe(true);
  });

  it('marks the entry Partial when a line has no mined-date raw price', () => {
    const lines: OreLine[] = [{ typeId: VELDSPAR, quantity: 100 }];
    const result = valueMiningYield(lines, new Map(), new Map(), NO_SKILLS, {});
    expect(result.pricedAll).toBe(false);
    expect(result.lines[0].rawValue).toBe(0);
  });

  it('marks the entry Partial when a line has no reprocessing data at all', () => {
    const lines: OreLine[] = [{ typeId: UNREPROCESSABLE, quantity: 100 }];
    const result = valueMiningYield(
      lines,
      new Map([[UNREPROCESSABLE, 5]]),
      new Map(),
      NO_SKILLS,
      {}
    );
    expect(result.pricedAll).toBe(false);
    expect(result.lines[0].refineValue).toBe(0);
  });

  it('marks the entry Partial when a refine output material has no price', () => {
    const lines: OreLine[] = [{ typeId: VELDSPAR, quantity: 200 }];
    const reprocessing = new Map<number, YieldReprocessingEntry | undefined>([
      [VELDSPAR, { portionSize: 100, materials: [{ typeId: 34, quantity: 400 }] }],
    ]);

    const result = valueMiningYield(lines, new Map([[VELDSPAR, 5]]), reprocessing, NO_SKILLS, {});

    expect(result.pricedAll).toBe(false);
    expect(result.refineValue).toBe(0);
  });

  it('returns zero totals for an empty ore-line list', () => {
    const result = valueMiningYield([], new Map(), new Map(), NO_SKILLS, {});
    expect(result).toEqual({ rawValue: 0, refineValue: 0, pricedAll: true, lines: [] });
  });
});
